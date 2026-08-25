// Everything a guest has run up during a stay and not yet been billed for
// — food sent to the villa, a safari, a transfer.
//
// These used to be a `pendingCharges` array hanging off the villa, and that
// was the one place in the app where last-write-wins genuinely loses money:
// with two phones offline, reception adding a drink and the kitchen adding
// a curry each hold a whole copy of the list, and whichever syncs last
// replaces the other. One charge disappears and nobody finds out until the
// guest queries the bill.
//
// As separate records neither can overwrite the other. See
// [[backend-decisions]].
//
// They also belong to the *stay*, not the room. A party in two villas has
// one tab, and releasing one of their villas part-way through no longer
// needs the charges carried across by hand — they were never on the room
// to begin with.

import { add, update, COLLECTIONS } from "./store.js";
import { DEFAULT_CHARGE_CATEGORY, isChargeCategory } from "./charges.js";

export const CHARGE_STATUS = {
  OPEN: "open",         // on the tab, not yet on any invoice
  BILLED: "billed",     // an invoice carries it
  WRITTEN_OFF: "written-off", // the stay was cancelled; never billed to anyone
};

export const GUEST_CHARGES = [];

let nextChargeId = 1;
export function allocateChargeId() {
  return nextChargeId++;
}

// A charge is never edited in place beyond its status — the description,
// quantity and value it was created with are what the guest agreed to.
export function addGuestCharge({ bookingId, roomId, branch, desc, qty, rate, category }) {
  const quantity = Number(qty) || 0;
  const unit = Number(rate) || 0;
  return add(COLLECTIONS.GUEST_CHARGES, GUEST_CHARGES, {
    id: allocateChargeId(),
    bookingId: bookingId ?? null,
    roomId: roomId ?? null,
    branch: branch || "",
    desc,
    qty: String(qty),
    rate: unit,
    value: quantity * unit,
    category: isChargeCategory(category) ? category : DEFAULT_CHARGE_CATEGORY,
    status: CHARGE_STATUS.OPEN,
    at: new Date().toISOString(),
    invoiceId: null,
  });
}

// The tab for a stay. A booking that has not started yet, or a walk-in with
// no booking at all, has nothing here — a walk-in is billed at the counter
// and never runs a tab.
export function openChargesFor(bookingId) {
  if (bookingId === null || bookingId === undefined) return [];
  return GUEST_CHARGES.filter(c => c.bookingId === bookingId && c.status === CHARGE_STATUS.OPEN);
}

export function chargesFor(bookingId) {
  if (bookingId === null || bookingId === undefined) return [];
  return GUEST_CHARGES.filter(c => c.bookingId === bookingId);
}

export function tabTotal(bookingId) {
  return openChargesFor(bookingId).reduce((sum, c) => sum + c.value, 0);
}

// Marked rather than deleted, so the bill can always be traced back to the
// individual charges that made it up.
export function markCharged(charges, invoiceId) {
  (charges || []).forEach(c => {
    update(COLLECTIONS.GUEST_CHARGES, c, {
      status: CHARGE_STATUS.BILLED,
      invoiceId: invoiceId ?? null,
      billedAt: new Date().toISOString(),
    });
  });
  return charges;
}

// A cancelled check-in writes off whatever was on the tab. Marked, not
// removed: the food was still cooked and the stock still went, so the
// record has to survive even though no invoice will ever carry it.
export function writeOffCharges(bookingId, reason) {
  const open = openChargesFor(bookingId);
  open.forEach(c => {
    update(COLLECTIONS.GUEST_CHARGES, c, {
      status: CHARGE_STATUS.WRITTEN_OFF,
      writeOffReason: reason || "",
      writtenOffAt: new Date().toISOString(),
    });
  });
  return open;
}
