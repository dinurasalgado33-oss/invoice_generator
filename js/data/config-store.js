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
};

function docId(branch, kind) {
  // Firestore treats "/" as a path separator and a branch name has a
  // space in it; both go through here rather than being trusted raw.
  return `${branch}__${kind}`.replace(/[/\s]+/g, "-");
}

// Writes one kind of config for one property. Fire-and-forget, like every
// other write in this app: the value is already applied in memory, and a
// failed write must never take a manager's screen down mid-edit.
export function saveConfig(branch, kind, value) {
  if (!branch || !kind) return;
  (async () => {
    try {
      await connect();
      const fs = fsApi();
      await fs.setDoc(fs.doc(getDb(), COLLECTIONS.CONFIG, docId(branch, kind)), {
        branch,
        kind,
        // Wrapped rather than spread, because some of these are arrays and
        // some are plain values (the VAT rate is a number). One field name
        // keeps hydration from having to know which is which.
        value,
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
  const { setServiceChargeRate, setVatRate } = await import("./charges.js");
  const { INVENTORY_BY_BRANCH } = await import("./inventory.js");

  const loaded = [];
  for (const branch of branches) {
    const [villas, activities, info, conditions, cancellation, notices, inventory, serviceCharge, vat] =
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
      ]);

    if (applyArray(ROOMS_BY_BRANCH[branch], villas)) loaded.push(branch + ":villas");
    if (applyArray(ACTIVITIES_BY_BRANCH[branch], activities)) loaded.push(branch + ":activities");
    if (applyArray(RESERVATION_CONDITIONS[branch], conditions)) loaded.push(branch + ":conditions");
    if (applyArray(CANCELLATION_POLICY[branch], cancellation)) loaded.push(branch + ":cancellation");
    if (applyArray(PROFORMA_NOTICES[branch], notices)) loaded.push(branch + ":notices");
    if (applyArray(INVENTORY_BY_BRANCH[branch], inventory)) loaded.push(branch + ":inventory");

    // Objects rather than arrays: merged in place for the same reason the
    // arrays are spliced — the screens hold the reference from module load.
    if (info && typeof info === "object") {
      Object.assign(BRANCH_INFO[branch] || (BRANCH_INFO[branch] = {}), info);
      loaded.push(branch + ":branchInfo");
    }
    if (serviceCharge !== undefined) { setServiceChargeRate(branch, serviceCharge); loaded.push(branch + ":serviceCharge"); }
    if (vat !== undefined) { setVatRate(branch, vat); loaded.push(branch + ":vat"); }
  }
  return loaded;
}
