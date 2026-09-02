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
import { seedMenuIfEmpty } from "./seed-config.js";
import { deriveOccupancy } from "./occupancy.js";
import { deriveStock } from "./inventory.js";
import { hydrateConfig, watchConfig, stopWatchingConfig } from "./config-store.js";
import { logError } from "./error-log.js";

import { INVOICES, BOOKINGS, FOOD_ORDER_RECORDS, ACTIVITY_RECORDS } from "./reports.js";
import { RESERVATIONS, PROFORMA_INVOICES } from "./reservations.js";
import { GRC_RECORDS } from "./grc.js";
import { GUEST_CHARGES } from "./guest-charges.js";
import { GUEST_EMAIL_QUEUE } from "./guest-email.js";
import { INVOICE_EMAIL_QUEUE } from "./invoice-email.js";
import { RESTOCK_LOG, USAGE_LOG } from "./inventory.js";
import { MENU_ITEMS } from "./menu.js";
import { ROOM_ACTIVITY_LOG } from "./rooms.js";
import { LOGIN_LOG } from "./accounts.js";
import { ERROR_LOG } from "./error-log.js";

// Everything that persists, paired with the array the screens read from.
//
// `allBranches` marks the collections that are not scoped to one property.
// It was called `everyone`, which read as "everyone may see this" and is
// not what it meant — sign-in records and crash reports are manager-only
// by rule. A staff device subscribed to them anyway, was refused, and
// logged two permission-denied errors on every single sign-in. The error
// log exists so a genuine fault is visible; two expected failures per
// sign-in is how it stops being read.
//
// `managerOnly` says what the rules say, so the app stops asking for
// what it cannot have. The seeding code below already reasoned this way
// about menuItems; these two subscriptions simply never got the same
// treatment.
const COLLECTION_MAP = [
  [COLLECTIONS.INVOICES, INVOICES],
  // Occupancy is derived from these, so a change from another device has
  // to rebuild it — otherwise reception's tablet shows a villa free that
  // the phone just checked somebody into.
  [COLLECTIONS.BOOKINGS, BOOKINGS, { onChange: deriveOccupancy }],
  [COLLECTIONS.FOOD_ORDERS, FOOD_ORDER_RECORDS],
  [COLLECTIONS.ACTIVITY_CHARGES, ACTIVITY_RECORDS],
  [COLLECTIONS.GUEST_CHARGES, GUEST_CHARGES],
  [COLLECTIONS.RESERVATIONS, RESERVATIONS],
  [COLLECTIONS.PROFORMAS, PROFORMA_INVOICES],
  [COLLECTIONS.GRC, GRC_RECORDS],
  [COLLECTIONS.RESTOCKS, RESTOCK_LOG, { onChange: deriveStock }],
  [COLLECTIONS.STOCK_USAGE, USAGE_LOG, { onChange: deriveStock }],
  [COLLECTIONS.GUEST_EMAILS, GUEST_EMAIL_QUEUE],
  [COLLECTIONS.INVOICE_EMAILS, INVOICE_EMAIL_QUEUE],
  [COLLECTIONS.ROOM_ACTIVITY, ROOM_ACTIVITY_LOG],
  [COLLECTIONS.MENU, MENU_ITEMS, { allBranches: true, keepLocalIfEmpty: true }],
  [COLLECTIONS.LOGINS, LOGIN_LOG, { allBranches: true, managerOnly: true }],
  [COLLECTIONS.ERRORS, ERROR_LOG, { allBranches: true, managerOnly: true }],
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

  // Before hydrating, not after. The menu is the one collection that
  // starts full rather than empty — it lives in the source, not in
  // anybody's typing — and hydrate() splices the array to whatever the
  // server returned. On a fresh project that would replace 161 dishes
  // with nothing. Seeding first means there is something to hydrate.
  //
  // Managers only, because the rules let only a manager write menuItems.
  // Asking a receptionist's device to seed would fail on every sign-in
  // and log an error each time, for something it was never allowed to do.
  // A staff member on a genuinely unseeded project hydrates nothing and
  // falls back to the in-code menu, which holds the same dishes.
  const seeder = currentProfile();
  if (seeder && seeder.role === "manager") {
    await seedMenuIfEmpty();
  }

  // Staff may still WRITE to logins and errors — their sign-ins are
  // recorded and their crashes reported. They simply may not read them
  // back, so there is nothing to subscribe to.
  const isManager = Boolean(seeder && seeder.role === "manager");
  const subscribed = COLLECTION_MAP.filter(([, , opts]) => !(opts && opts.managerOnly) || isManager);

  const results = await Promise.allSettled(
    subscribed.map(([name, array, opts]) =>
      hydrate(name, array, {
        branch: opts && opts.allBranches ? null : branch,
        keepLocalIfEmpty: Boolean(opts && opts.keepLocalIfEmpty),
        onChange: (opts && opts.onChange) || null,
      })
    )
  );

  // One collection failing must not stop the rest — a manager-only
  // collection refused for a staff member is expected, not an outage.
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const name = subscribed[i][0];
      failed.push(name);
      logError(`Could not load ${name}`, { source: "sync", stack: r.reason && r.reason.stack });
    }
  });

  // Which properties this person works at. Used by config hydration,
  // and again by numbering below.
  const profile = currentProfile();
  const branches = profile && profile.role === "staff"
    ? [profile.branch].filter(Boolean)
    : ["Wilpattu", "Arugam Bay"];

  // Config before occupancy: villa rates and names come from here, and
  // deriving occupancy writes onto those same villa objects.
  try {
    await hydrateConfig(branches);
  } catch (err) {
    // The app ships with working defaults, so failing to load a manager's
    // overrides is a degraded state rather than a broken one.
    logError("Could not load configuration", { source: "sync", stack: err && err.stack });
  }

  // And keep it in step from here on. Records have always watched their
  // collection; config only read once, so a rate changed on one device
  // never reached another until that one reloaded.
  try {
    const { refreshCurrentScreen } = await import("../navigation.js");
    await watchConfig(branches, refreshCurrentScreen);
  } catch (err) {
    logError("Could not watch configuration", { source: "sync", stack: err && err.stack });
  }

  // Occupancy is worked out from the bookings that just arrived, rather
  // than stored on the villa. Before this, a reload left every villa
  // reading "available" while Firestore held a booking saying Checked In.
  // Runs after hydration for that reason, and again whenever bookings
  // change — see the watcher installed below.
  deriveOccupancy();
  // Stock is the sum of its movements, so it is rebuilt once the logs are
  // in — and again below whenever either log changes, since a restock
  // entered on the phone has to reach the tablet's shelf figure.
  deriveStock();

  // Reserve a block of document numbers for every property this person
  // works at, now, while there is signal — so a device that goes offline
  // straight afterwards can still issue an invoice. A manager works at
  // both, so both get primed.
  await Promise.allSettled(branches.map(b => primeNumbering(b)));

  return { loaded: subscribed.length - failed.length, failed };
}

export function stopSync() {
  stopWatching();
  // Config is watched separately from the record collections, so it has to
  // be stopped separately too. A listener left running past sign-out keeps
  // reading as the person who just left.
  stopWatchingConfig();
  useAdapter(null);
  running = false;
  // The arrays are deliberately left as they are. Emptying them here would
  // blank every screen mid-render on the way to the login screen; the next
  // sign-in replaces their contents wholesale anyway.
}
