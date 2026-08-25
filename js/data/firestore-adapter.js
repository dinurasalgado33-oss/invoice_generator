// The store's Firestore adapter.
//
// Installed with useAdapter() once someone is signed in, after which every
// add() and update() the app already makes reaches the database too. No
// call site changes — that was the point of routing writes through the
// store first.
//
// Writes are not awaited. Firestore applies them to its local cache
// immediately and syncs when it can, so the array on screen and the cache
// agree at once whether or not there is signal. A failure is logged, never
// thrown: the record is already in the app's working set, and taking a
// check-in down because a report of it failed would be the wrong trade.

import { connect, getDb, fsApi, newDocId } from "./firebase.js";
import { COLLECTIONS } from "./store.js";
import { logError } from "./error-log.js";

// The document id lives on the record so an update knows where to go, and
// so a record can be referenced by whatever it belongs to before the write
// has left the device.
const DOC_ID = "__docId";

function docRef(collection, record) {
  const fs = fsApi();
  if (!record[DOC_ID]) {
    Object.defineProperty(record, DOC_ID, {
      value: newDocId(), enumerable: false, writable: true, configurable: true,
    });
  }
  return fs.doc(getDb(), collection, record[DOC_ID]);
}

// Firestore rejects undefined, and a record built from a form has plenty
// of it — an optional field nobody filled in. Stripped rather than
// converted to null, so the document simply has no such field.
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = clean(v);
    }
    return out;
  }
  return value;
}

async function write(collection, record, merge) {
  await connect();
  const fs = fsApi();
  await fs.setDoc(docRef(collection, record), clean(record), merge ? { merge: true } : undefined);
}

function report(what, collection, err) {
  // permission-denied is the one worth shouting about: it means the rules
  // and the app disagree, and records the user believes are saved are not.
  const code = err && err.code ? err.code : "";
  logError(`Firestore ${what} failed on ${collection}${code ? " (" + code + ")" : ""}`, {
    source: "firestore",
    stack: err && err.stack,
  });
}

export const firestoreAdapter = {
  name: "firestore",
  ready: true,
  add(collection, record) {
    return write(collection, record, false).catch(err => report("add", collection, err));
  },
  update(collection, record) {
    return write(collection, record, true).catch(err => report("update", collection, err));
  },
  remove(collection, record) {
    return connect()
      .then(() => fsApi().deleteDoc(docRef(collection, record)))
      .catch(err => report("remove", collection, err));
  },
};

// ---------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------
// Fills the app's existing arrays from the database and keeps them in step.
//
// The arrays are spliced in place rather than reassigned: every screen
// holds a reference to the same array object it imported at load, so
// swapping in a new one would leave them rendering the old contents
// forever.

const watching = new Map();

export async function hydrate(collection, array, { branch = null } = {}) {
  await connect();
  const fs = fsApi();

  if (watching.has(collection)) watching.get(collection)();

  // Staff may only read their own property, so asking for everything would
  // be denied outright rather than filtered. Managers ask for everything.
  const base = fs.collection(getDb(), collection);
  const q = branch ? fs.query(base, fs.where("branch", "==", branch)) : base;

  return new Promise((resolve, reject) => {
    let settled = false;
    const stop = fs.onSnapshot(q, (snap) => {
      const rows = [];
      snap.forEach(d => {
        const row = d.data();
        Object.defineProperty(row, DOC_ID, {
          value: d.id, enumerable: false, writable: true, configurable: true,
        });
        rows.push(row);
      });
      array.splice(0, array.length, ...rows);
      if (!settled) { settled = true; resolve(array); }
    }, (err) => {
      report("watch", collection, err);
      if (!settled) { settled = true; reject(err); }
    });
    watching.set(collection, stop);
  });
}

export function stopWatching() {
  watching.forEach(stop => stop());
  watching.clear();
}

export { COLLECTIONS };
