// Persisting the things a manager configures.
//
// This was the largest hole in the backend and it hid in plain sight: the
// sync work traced *records* — bookings, invoices, charges — and never
// checked config, on the unexamined assumption that config is not
// financial. A villa's nightly rate and a VAT percentage are exactly as
// financial as an invoice. They are simply financial before the bill
// rather than after it.
//
// So every configure screen wrote `room.rate = rate` and stopped. It
// worked for the session, reverted on reload, and never reached the other
// property's tablet — a manager could raise a rate on Monday and bill
// Monday's rate all week on one device and last month's on another.
//
// Shape is deliberately different from records. Records are flat arrays of
// independent documents; config is a small branch-keyed list that is
// almost always read whole and edited rarely. So one document per branch
// per kind, holding the list — rather than a document per villa. Fewer
// moving parts, and an edit cannot half-apply.
//
// Last-write-wins on the whole list, consistent with the rest of the app.
// Two managers editing villa rates in the same minute is not a real
// scenario at ten villas; two devices disagreeing about the rate for a
// week very much was.

import { connect, getDb, fsApi } from "./firebase.js";
import { COLLECTIONS } from "./store.js";
import { logError } from "./error-log.js";

// Every configurable thing, and where it lives in memory. Keeping the
// mapping in one place is what stops the next kind of config being added
// to a screen and forgotten here — which is precisely how this gap
// happened in the first place.
export const CONFIG_KINDS = {
  VILLAS: "villas",
  ACTIVITIES: "activities",
  BRANCH_INFO: "branchInfo",
  CONDITIONS: "conditions",
  CANCELLATION: "cancellation",
  NOTICES: "notices",
  INVENTORY: "inventory",
  VAT: "vat",
  SERVICE_CHARGE: "serviceCharge",
  TIMES: "times",
  LIABILITY: "liability",
  ROOM_TYPES: "roomTypes",
  MEAL_PLANS: "mealPlans",
  MENU_CATEGORIES: "menuCategories",
  INVENTORY_CATEGORIES: "inventoryCategories",
  USAGE_REASONS: "usageReasons",
  // Shared, like currencies — a kilogram is a kilogram at both hotels.
  INVENTORY_UNITS: "inventoryUnits",
  BOOKING_SOURCES: "bookingSources",
  // Shared across properties rather than per-branch, so its document id
  // drops the branch prefix — see saveShared/loadShared below.
  CURRENCIES: "currencies",
  // Learned rather than configured: the guides, agents and countries staff
  // have actually typed. Shared so the phone and the tablet stop keeping
  // separate lists of the same people — see data/suggestions.js.
  SUGGESTIONS: "suggestions",
  // The Wilpattu full/half-board sheet. Stored per property because only
  // Wilpattu has one, and stored at all so the welcome e-mail can read it
  // — it is the guest's answer to "what does my board rate include".
  BOARD_MENU: "boardMenu",
  // Which department each inventory category belongs to, as
  // { category: department }. The department names themselves are their
  // own list; this is only the assignment.
  INVENTORY_DEPARTMENTS: "inventoryDepartments",
  CATEGORY_DEPARTMENTS: "categoryDepartments",
};

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out;
  }
  return value;
}

function docId(branch, kind) {
  // Firestore treats "/" as a path separator and a branch name has a
  // space in it; both go through here rather than being trusted raw.
  return `${branch}__${kind}`.replace(/[/\s]+/g, "-");
}

// Writes one kind of config for one property. Fire-and-forget, like every
// other write in this app: the value is already applied in memory, and a
// failed write must never take a manager's screen down mid-edit.
// Config that is not a property's to decide. A euro is a euro at both
// hotels, so these live under one document with no branch in the key —
// otherwise a manager adding a currency at one property would be baffled
// to find the other still unable to bill in it.
export function saveShared(kind, value) {
  return saveConfig("shared", kind, value);
}

export function loadShared(kind) {
  return loadConfig("shared", kind);
}

export function saveConfig(branch, kind, value) {
  if (!branch || !kind) return;
  (async () => {
    try {
      await connect();
      const fs = fsApi();
      await fs.setDoc(fs.doc(getDb(), COLLECTIONS.CONFIG, docId(branch, kind)), {
        branch,
        kind,
        // Firestore rejects undefined outright, and a single undefined
        // anywhere in the payload fails the whole write — so it is
        // stripped here rather than trusted not to appear.
        // Wrapped rather than spread, because some of these are arrays and
        // some are plain values (the VAT rate is a number). One field name
        // keeps hydration from having to know which is which.
        value: stripUndefined(value),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      // Offline is the normal case this app is built around, and the write
      // is queued by Firestore anyway. A refusal is not normal.
      if (err && err.code !== "unavailable") {
        logError(`Could not save ${kind} for ${branch}: ${err.code || err.message}`, { source: "config" });
      }
    }
  })();
}

// Reads one kind back. Returns undefined when nothing is stored, which is
// meaningfully different from an empty list: it means "never seeded", and
// the caller must keep what it already has rather than blanking itself.
export async function loadConfig(branch, kind) {
  await connect();
  const fs = fsApi();
  const snap = await fs.getDoc(fs.doc(getDb(), COLLECTIONS.CONFIG, docId(branch, kind)));
  return snap.exists() ? snap.data().value : undefined;
}

// Replaces the contents of an array in place. The screens hold references
// to these arrays from module load, so reassigning would leave them
// rendering the old contents forever — the same reason hydrate() splices.
// A villa's *configuration* — what a manager sets — as distinct from its
// live state. Occupancy is derived from bookings (see occupancy.js) and
// must never be written here: storing "is this villa occupied" in config
// would put that fact in two places again, which is the whole thing 1.2
// removed. Only what a manager typed goes to the database.
export function villaConfig(rooms) {
  return (rooms || []).map(r => ({ id: r.id, name: r.name, rate: r.rate }));
}

// Config fields are merged onto the existing villas rather than replacing
// them, for the same reason: replacing would discard the occupancy the
// app just derived, and a villa would read free with a guest in it.
export function applyVillaConfig(target, incoming) {
  if (!Array.isArray(incoming) || !Array.isArray(target)) return false;
  incoming.forEach(cfg => {
    const room = target.find(r => r.id === cfg.id);
    if (!room) return;
    if (cfg.name != null) room.name = cfg.name;
    if (cfg.rate != null) room.rate = cfg.rate;
  });
  return true;
}

export function applyArray(target, incoming) {
  if (!Array.isArray(incoming) || !Array.isArray(target)) return false;
  target.splice(0, target.length, ...incoming);
  return true;
}


// Pulls every stored config value back into the in-memory objects the
// screens already read from.
//
// Absent means "never saved", not "empty" — so a value that has never
// been configured keeps whatever the code ships with, rather than the app
// blanking its own villa rates on first run. Same reasoning as the menu's
// keepLocalIfEmpty, and the same trap avoided.
export async function hydrateConfig(branches) {
  const { ROOMS_BY_BRANCH } = await import("./rooms.js");
  const { ACTIVITIES_BY_BRANCH } = await import("./activities.js");
  const { BRANCH_INFO, RESERVATION_CONDITIONS, CANCELLATION_POLICY, PROFORMA_NOTICES } = await import("./branches.js");
  const { setServiceChargeRate, setVatRate, setBookingSources, setCurrencies } = await import("./charges.js");
  const { setStandardTimes, setLiabilityNotice } = await import("./grc.js");
  const { INVENTORY_BY_BRANCH, applyInventoryConfig, INVENTORY_CATEGORIES, INVENTORY_UNITS, USAGE_REASONS,
          INVENTORY_DEPARTMENTS, applyCategoryDepartments } = await import("./inventory.js");
  const { ROOM_TYPES, MEAL_PLANS } = await import("./grc.js");
  const { MENU_CATEGORIES, BOARD_MENU } = await import("./menu.js");

  const loaded = [];
  for (const branch of branches) {
    const [villas, activities, info, conditions, cancellation, notices, inventory, serviceCharge, vat, times, sources, liability, boardMenu] =
      await Promise.all([
        loadConfig(branch, CONFIG_KINDS.VILLAS).catch(() => undefined),
        loadConfig(branch, CONFIG_KINDS.ACTIVITIES).catch(() => undefined),
        loadConfig(branch, CONFIG_KINDS.BRANCH_INFO).catch(() => undefined),
        loadConfig(branch, CONFIG_KINDS.CONDITIONS).catch(() => undefined),
        loadConfig(branch, CONFIG_KINDS.CANCELLATION).catch(() => undefined),
        loadConfig(branch, CONFIG_KINDS.NOTICES).catch(() => undefined),
        loadConfig(branch, CONFIG_KINDS.INVENTORY).catch(() => undefined),
        loadConfig(branch, CONFIG_KINDS.SERVICE_CHARGE).catch(() => undefined),
        loadConfig(branch, CONFIG_KINDS.VAT).catch(() => undefined),
        loadConfig(branch, CONFIG_KINDS.TIMES).catch(() => undefined),
        loadConfig(branch, CONFIG_KINDS.BOOKING_SOURCES).catch(() => undefined),
        loadConfig(branch, CONFIG_KINDS.LIABILITY).catch(() => undefined),
        loadConfig(branch, CONFIG_KINDS.BOARD_MENU).catch(() => undefined),
      ]);

    if (applyVillaConfig(ROOMS_BY_BRANCH[branch], villas)) loaded.push(branch + ":villas");
    if (applyArray(ACTIVITIES_BY_BRANCH[branch], activities)) loaded.push(branch + ":activities");
    if (applyArray(RESERVATION_CONDITIONS[branch], conditions)) loaded.push(branch + ":conditions");
    if (applyArray(CANCELLATION_POLICY[branch], cancellation)) loaded.push(branch + ":cancellation");
    if (applyArray(PROFORMA_NOTICES[branch], notices)) loaded.push(branch + ":notices");
    if (applyInventoryConfig(INVENTORY_BY_BRANCH[branch], inventory)) loaded.push(branch + ":inventory");

    // Objects rather than arrays: merged in place for the same reason the
    // arrays are spliced — the screens hold the reference from module load.
    if (info && typeof info === "object") {
      Object.assign(BRANCH_INFO[branch] || (BRANCH_INFO[branch] = {}), info);
      loaded.push(branch + ":branchInfo");
    }
    if (serviceCharge !== undefined) { setServiceChargeRate(branch, serviceCharge); loaded.push(branch + ":serviceCharge"); }
    if (vat !== undefined) { setVatRate(branch, vat); loaded.push(branch + ":vat"); }
    if (times && times.checkin) { setStandardTimes(branch, times.checkin, times.checkout); loaded.push(branch + ":times"); }
    if (Array.isArray(sources) && sources.length) { setBookingSources(branch, sources); loaded.push(branch + ":sources"); }
    if (typeof liability === "string" && liability) { setLiabilityNotice(branch, liability); loaded.push(branch + ":liability"); }

    // Only Wilpattu has a board sheet today, so a property without one
    // stored is the normal case rather than a failure.
    if (Array.isArray(boardMenu) && applyArray(BOARD_MENU, boardMenu)) loaded.push(branch + ":boardMenu");

  }

  // The short dropdown lists, loaded once rather than once per property.
  // They are single shared arrays, so loading them inside the loop above
  // applied one property's copy and then overwrote it with the other's —
  // whichever came last won, and a manager's edit disappeared on reload.
  //
  // Non-empty only: an empty stored list would mean somebody removed every
  // option, and blanking a dropdown the app depends on is worse than
  // keeping the shipped defaults.
  const SHARED_LISTS = [
    [ROOM_TYPES, CONFIG_KINDS.ROOM_TYPES, "roomTypes"],
    [MEAL_PLANS, CONFIG_KINDS.MEAL_PLANS, "mealPlans"],
    [MENU_CATEGORIES, CONFIG_KINDS.MENU_CATEGORIES, "menuCategories"],
    [INVENTORY_CATEGORIES, CONFIG_KINDS.INVENTORY_CATEGORIES, "invCategories"],
    [USAGE_REASONS, CONFIG_KINDS.USAGE_REASONS, "usageReasons"],
    [INVENTORY_DEPARTMENTS, CONFIG_KINDS.INVENTORY_DEPARTMENTS, "invDepartments"],
  ];
  for (const [target, kind, label] of SHARED_LISTS) {
    const stored = await loadShared(kind).catch(() => undefined);
    if (Array.isArray(stored) && stored.length && applyArray(target, stored)) {
      loaded.push("shared:" + label);
    }
  }
  // Shared config, loaded once rather than per property.
  try {
    const currencies = await loadShared(CONFIG_KINDS.CURRENCIES);
    if (Array.isArray(currencies) && currencies.length) { setCurrencies(currencies); loaded.push("shared:currencies"); }
    const units = await loadShared(CONFIG_KINDS.INVENTORY_UNITS);
    if (Array.isArray(units) && units.length) { applyArray(INVENTORY_UNITS, units); loaded.push("shared:units"); }

    // The category-to-department map. An empty object is meaningful here
    // in a way an empty list is not — it means a manager deliberately
    // assigned nothing, and everything should gather under "Other" — so
    // this checks for a stored object rather than for a non-empty one.
    const deptMap = await loadShared(CONFIG_KINDS.CATEGORY_DEPARTMENTS);
    if (deptMap && typeof deptMap === "object" && applyCategoryDepartments(deptMap)) {
      loaded.push("shared:categoryDepartments");
    }
  } catch { /* falls back to the shipped list */ }

  // Learned values, not configured ones — kept apart from the block above
  // so a failure to reach them cannot cost a manager their actual
  // configuration. A missing suggestion is a mild inconvenience; a missing
  // villa rate is a wrong bill.
  try {
    const { hydrateSuggestions } = await import("./suggestions.js");
    if (await hydrateSuggestions()) loaded.push("shared:suggestions");
  } catch { /* the device keeps whatever it learned on its own */ }

  return loaded;
}
