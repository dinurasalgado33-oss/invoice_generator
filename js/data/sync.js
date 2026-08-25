// Brings the database and the app's in-memory arrays into step, once
// somebody is signed in and the rules know who they are.
//
// Order matters and is deliberate:
//   1. sign in            — the rules will refuse everything before this
//   2. load the profile   — decides which property may be read
//   3. install the adapter — from here every write reaches the database
//   4. hydrate            — fill the arrays the screens already render
//
// Doing 3 before 4 means anything created during the first load is written
// too. Doing 4 before 3 would leave those records in memory only.

import { useAdapter, COLLECTIONS } from "./store.js";
import { firestoreAdapter, hydrate, stopWatching } from "./firestore-adapter.js";
import { scopedBranch, currentProfile } from "./session.js";
import { primeNumbering } from "./numbering.js";
import { logError } from "./error-log.js";

import { INVOICES, BOOKINGS, FOOD_ORDER_RECORDS, ACTIVITY_RECORDS } from "./reports.js";
import { RESERVATIONS, PROFORMA_INVOICES } from "./reservations.js";
import { GRC_RECORDS } from "./grc.js";
import { GUEST_CHARGES } from "./guest-charges.js";
import { GUEST_EMAIL_QUEUE } from "./guest-email.js";
import { RESTOCK_LOG, USAGE_LOG } from "./inventory.js";
import { ROOM_ACTIVITY_LOG } from "./rooms.js";
import { LOGIN_LOG } from "./accounts.js";
import { ERROR_LOG } from "./error-log.js";

// Everything that persists, paired with the array the screens read from.
// `everyone` marks the collections that are not scoped to one property —
// sign-in records and crash reports belong to whoever is looking, and are
// manager-only by rule rather than by branch.
const COLLECTION_MAP = [
  [COLLECTIONS.INVOICES, INVOICES],
  [COLLECTIONS.BOOKINGS, BOOKINGS],
  [COLLECTIONS.FOOD_ORDERS, FOOD_ORDER_RECORDS],
  [COLLECTIONS.ACTIVITY_CHARGES, ACTIVITY_RECORDS],
  [COLLECTIONS.GUEST_CHARGES, GUEST_CHARGES],
  [COLLECTIONS.RESERVATIONS, RESERVATIONS],
  [COLLECTIONS.PROFORMAS, PROFORMA_INVOICES],
  [COLLECTIONS.GRC, GRC_RECORDS],
  [COLLECTIONS.RESTOCKS, RESTOCK_LOG],
  [COLLECTIONS.STOCK_USAGE, USAGE_LOG],
  [COLLECTIONS.GUEST_EMAILS, GUEST_EMAIL_QUEUE],
  [COLLECTIONS.ROOM_ACTIVITY, ROOM_ACTIVITY_LOG],
  [COLLECTIONS.LOGINS, LOGIN_LOG, { everyone: true }],
  [COLLECTIONS.ERRORS, ERROR_LOG, { everyone: true }],
];

let running = false;

export function isSyncing() {
  return running;
}

export async function startSync() {
  const branch = scopedBranch();

  // Installed before hydration, so a record created during the first load
  // is persisted rather than living only in memory.
  useAdapter(firestoreAdapter);
  running = true;

  const results = await Promise.allSettled(
    COLLECTION_MAP.map(([name, array, opts]) =>
      hydrate(name, array, { branch: opts && opts.everyone ? null : branch })
    )
  );

  // One collection failing must not stop the rest — a manager-only
  // collection refused for a staff member is expected, not an outage.
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const name = COLLECTION_MAP[i][0];
      failed.push(name);
      logError(`Could not load ${name}`, { source: "sync", stack: r.reason && r.reason.stack });
    }
  });

  // Reserve a block of document numbers for every property this person
  // works at, now, while there is signal — so a device that goes offline
  // straight afterwards can still issue an invoice. A manager works at
  // both, so both get primed.
  const profile = currentProfile();
  const branches = profile && profile.role === "staff"
    ? [profile.branch].filter(Boolean)
    : ["Wilpattu", "Arugam Bay"];
  await Promise.allSettled(branches.map(b => primeNumbering(b)));

  return { loaded: COLLECTION_MAP.length - failed.length, failed };
}

export function stopSync() {
  stopWatching();
  useAdapter(null);
  running = false;
  // The arrays are deliberately left as they are. Emptying them here would
  // blank every screen mid-render on the way to the login screen; the next
  // sign-in replaces their contents wholesale anyway.
}
