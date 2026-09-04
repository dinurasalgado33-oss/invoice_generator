import { connect, getApp, getDb, fsApi } from "./firebase.js";
import { logError } from "./error-log.js";

// Puts the menu PDF the portal already builds at a public address.
//
// The link serves the *same file* Open PDF and Save produce — same
// builder, same artwork, same prices. There is no second rendering of the
// menu anywhere, which is the whole point: a guest scanning the QR code
// and a manager pressing Save are looking at one document.
//
// Uploaded rather than generated on a server because the PDF is built in
// the browser, with the property's artwork and the embedded font. Porting
// that to Node would be a second renderer, and this project has been bitten
// by second renderings of the same document more than once.

// The same version firebase.js boots with, and that is load-bearing
// rather than tidiness: a different URL is a different copy of the SDK,
// with its own registry, so `getStorage(app)` on an app created by the
// other copy fails with "Service storage is not available". Which is
// exactly what happened.
const SDK = "https://www.gstatic.com/firebasejs/11.0.2";

let storageApi = null;

async function api() {
  if (storageApi) return storageApi;
  storageApi = await import(`${SDK}/firebase-storage.js`);
  return storageApi;
}

// One stable path per menu, overwritten in place. A QR code printed on a
// table card cannot be reissued because a price changed, so the address
// has to outlive every edit — which means writing over the file rather
// than versioning it.
export function menuPath(key) {
  return `menus/${key}.pdf`;
}

// The public address for a menu. Firebase Storage's download URL needs a
// token, so the URL is read back after upload rather than constructed.
export async function publishMenuPdf(key, blob) {
  await connect();
  const s = await api();
  const storage = s.getStorage(getApp());
  const ref = s.ref(storage, menuPath(key));

  await s.uploadBytes(ref, blob, {
    contentType: "application/pdf",
    // Guests re-open the link; managers replace the file. An hour is long
    // enough to save the round trips and short enough that a corrected
    // price is not stuck behind a stale cache for a day.
    cacheControl: "public, max-age=3600",
  });

  const url = await s.getDownloadURL(ref);
  // The address just changed, so the remembered one is wrong.
  urlCache.set(key, Promise.resolve(url));
  return url;
}

// The list the public index page reads, so there is one address for
// everything and it can find whatever is currently published.
//
// Written to Firestore rather than to Storage beside the PDFs. A browser
// cannot fetch a Storage object cross-origin unless CORS is configured on
// the bucket, and that needs gcloud — whereas a Firestore read works from
// any page. The PDFs are unaffected: they are opened by ordinary link
// navigation, which CORS does not apply to.
//
// Written whole every time rather than patched. It is four links, and a
// half-updated list that offers a menu which no longer exists is a worse
// failure than a second of extra write.
export async function publishManifest(entries) {
  await connect();
  const fs = fsApi();
  await fs.setDoc(fs.doc(getDb(), "publicMenus", "index"), {
    updatedAt: new Date().toISOString(),
    menus: entries,
  });
}

// The address a menu is already published at, or null if it never has
// been. Used to show the link without re-uploading.
// Remembered per menu, because the panel that asks for this sits at the top
// of the Menu screen and that screen redraws on every keystroke in the dish
// search.
//
// The cache holds the *promise*, not the answer. Caching the resolved value
// looked right and did nothing: on a bucket without CORS the SDK retries
// internally for several seconds before rejecting, so the next keystroke
// arrived long before there was anything to cache and fired its own request
// anyway. Six characters still cost twenty-two round trips. Storing the
// in-flight promise makes every caller after the first wait on the first
// one instead.
//
// Cleared by publishMenuPdf, which is the only thing that can change the
// answer.
const urlCache = new Map();

export function forgetPublishedUrl(key) {
  if (key) urlCache.delete(key); else urlCache.clear();
}

export function publishedMenuUrl(key) {
  if (urlCache.has(key)) return urlCache.get(key);

  const pending = (async () => {
    try {
      await connect();
      const s = await api();
      return await s.getDownloadURL(s.ref(s.getStorage(getApp()), menuPath(key)));
    } catch (err) {
      // Not published yet is the ordinary case and not an error worth
      // recording; anything else is.
      if (err && err.code !== "storage/object-not-found") {
        logError(`Could not read the menu link: ${err.code || err.message}`, { source: "menu-hosting" });
      }
      // "Not published" is remembered too, and has to be — it is the answer
      // that costs a failed round trip, and an unpublished menu is exactly
      // the one the panel asks about on every redraw.
      return null;
    }
  })();

  urlCache.set(key, pending);
  return pending;
}
