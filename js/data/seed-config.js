// Getting config into the database the first time.
//
// Dishes and villas are written in the source, not entered by anybody —
// they came off the printed menus. Records (bookings, invoices) start
// empty and fill up; config starts *full* and has to get from the code
// into Firestore once, or the collection stays empty forever and
// hydration would wipe the menu it was supposed to load.
//
// That is the trap this exists to avoid: hydrate() splices the array to
// whatever the server returned, so wiring menuItems into the sync list
// without seeding first would replace 161 dishes with nothing, on the
// first load, silently.
//
// Deliberately keyed by the dish's own id rather than a random document
// id. Two devices signing in at the same moment on a fresh project will
// both seed; with deterministic ids the second simply overwrites the
// first with identical data. With random ids it would double the menu.

import { connect, getDb, fsApi } from "./firebase.js";
import { COLLECTIONS } from "./store.js";
import { MENU_ITEMS } from "./menu.js";
import { logError } from "./error-log.js";

export function menuDocId(dish) {
  return `dish-${dish.id}`;
}

// True when the collection has nothing in it. One cheap read, and it
// decides whether this device is the one that seeds.
async function isEmpty(collection) {
  const fs = fsApi();
  const snap = await fs.getDocs(fs.query(fs.collection(getDb(), collection), fs.limit(1)));
  return snap.empty;
}

// Pushes the whole menu up, in batches, once. Returns how many were
// written, or 0 if the collection already had something in it — which is
// the normal case on every sign-in after the first.
export async function seedMenuIfEmpty() {
  try {
    await connect();
    const fs = fsApi();
    if (!(await isEmpty(COLLECTIONS.MENU))) return 0;

    // Firestore caps a batch at 500 writes; 161 fits comfortably, but the
    // chunking is here so adding dishes later cannot quietly break it.
    const CHUNK = 400;
    let written = 0;
    for (let i = 0; i < MENU_ITEMS.length; i += CHUNK) {
      const batch = fs.writeBatch(getDb());
      MENU_ITEMS.slice(i, i + CHUNK).forEach(dish => {
        batch.set(fs.doc(getDb(), COLLECTIONS.MENU, menuDocId(dish)), { ...dish });
      });
      await batch.commit();
      written += Math.min(CHUNK, MENU_ITEMS.length - i);
    }
    return written;
  } catch (err) {
    // Offline, or a receptionist without permission to write the menu.
    // Neither is fatal: the app falls back to the in-code menu, which is
    // the same data. Logged because a live project whose menu never
    // seeded is worth knowing about.
    if (err && err.code !== "unavailable") {
      logError(`Could not seed the menu: ${err.code || err.message}`, { source: "seed" });
    }
    return 0;
  }
}
