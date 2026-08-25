// Firebase, loaded straight from Google's CDN as ES modules.
//
// No bundler: this app has never had a build step, and adding one to get
// Firebase would be the tail wagging the dog. The gstatic ESM builds are
// the same code npm ships.
//
// Firestore is started with a persistent local cache, which is the reason
// this app is on Firestore at all: a write made with no signal lands in
// that cache immediately and syncs when the phone reconnects, so a
// receptionist at Wilpattu is never blocked mid-check-in.

import { firebaseConfig, projectId } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/11.0.2";

let app = null;
let db = null;
let auth = null;
let firestoreApi = null;
let authApi = null;
let starting = null;

// Loaded once and shared. Everything that needs Firestore functions asks
// for them here rather than importing the CDN again, so there is one
// instance of the SDK and one connection.
async function boot() {
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
    import(`${SDK}/firebase-auth.js`),
  ]);

  app = initializeApp(firebaseConfig());

  // persistentMultipleTabManager, not the single-tab default: staff open
  // the app in more than one tab, and the single-tab manager silently
  // disables the cache in every tab but the first — which would turn
  // offline-first off exactly when someone had two tabs open.
  db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({
      tabManager: fs.persistentMultipleTabManager(),
    }),
  });

  auth = au.getAuth(app);
  firestoreApi = fs;
  authApi = au;

  return { app, db, auth, fs, au };
}

export function connect() {
  if (!starting) starting = boot();
  return starting;
}

export function getDb() {
  return db;
}

export function getAuthInstance() {
  return auth;
}

export function fsApi() {
  return firestoreApi;
}

export function authApiRef() {
  return authApi;
}

export function currentProject() {
  return projectId();
}

// Every record carries its own document id, generated on the device.
// Firestore's own auto-ids need no coordination either, but generating it
// here means the app knows the id before the write leaves — which is what
// lets a record be referenced immediately, offline, by whatever it belongs
// to. See [[backend-decisions]].
export function newDocId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Older WebViews on cheap Android handsets do not have randomUUID.
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
