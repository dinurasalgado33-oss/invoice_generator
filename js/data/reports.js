import { newId } from "./ids.js";
import { update, COLLECTIONS } from "./store.js";
// Historical mock records for the Reports & Export screen. These are a
// separate, independent dataset from the "live" state in rooms.js/
// inventory.js — those hold current snapshots (today's room status,
// today's stock levels); reports need a spread of records *over time*,
// which the live mock state doesn't track. Swap for real records from a
// backend later; the filtering/aggregation logic in reports.js doesn't
// care where the rows came from.

export const INVOICES = [];

// Real checkouts append here (js/invoice.js submit handler) — `total` is
// the net amount actually billed for the stay (gross minus discount,
// before advance is subtracted — advance is just an early payment, not
// a reduction in revenue). `discount`/`serviceCharge`/`advance` are kept
// alongside for transparency. `id` is the same "Reservation No" printed on
// the document (appState.invoiceCounter, starting at 1) — not a separate
// internal counter — so a printed invoice can always be found here by the
// number on it.

// One row per dish sold. `dishId` is the join key; `dish` is the dish name
// at the time of sale, kept so an old sale still reads correctly after the
// dish is renamed. Same id-to-join / name-to-display split used by
// BOOKINGS, RESTOCK_LOG and ROOM_ACTIVITY_LOG.
export const FOOD_ORDER_RECORDS = [];

// Every completed order (from the Orders screen) appends a row per dish
// here — that's what makes it count as a sale in the Food Orders report.
// A UUID, not a counter. Two devices offline would both have handed out
// the same number, and every lookup joining on it would then match two
// different records — one guest's bill quietly containing another's
// charges. See [[backend-decisions]].
export function allocateFoodOrderRecordId() {
  return newId();
}

// Every activity charge (Room Map > villa > Activities) appends a row
// here, same pattern as FOOD_ORDER_RECORDS — otherwise activity revenue
// rides along on the invoice total with no way to attribute it to
// "activities" instead of "room" in the Dashboard's revenue split.
export const ACTIVITY_RECORDS = [];
export function allocateActivityRecordId() {
  return newId();
}

// `roomId` is the join key; `villa` is the villa name at booking time.
// Each booking also carries its own `id` so check-out can close the exact
// row it opened, instead of re-finding it by matching guest+villa+dates.
export function allocateBookingId() {
  return newId();
}

export const BOOKINGS = [];

// A stay's food and activity records are written the moment the charge is
// made, not when it is billed. That is right for the kitchen and for stock,
// but it means a stay that never produces an invoice leaves its revenue on
// the books forever — the Food Orders report counting money the hotel never
// billed and never took, while the Invoices report and the dashboard show
// nothing. Marking the records keeps them visible as a record of what was
// actually made and served, while taking them out of every revenue total.
export function writeOffStayRecords(bookingId, reason) {
  if (bookingId === null || bookingId === undefined) return 0;
  const at = new Date().toISOString();
  let touched = 0;
  // Paired with its collection, because a write-off has to reach the
  // database. Mutating in place was enough when everything lived in
  // memory; with a backend it meant the money came off this device's
  // reports and stayed on every other one — and came back here on the
  // next reload, since hydration overwrites from the server.
  [[FOOD_ORDER_RECORDS, COLLECTIONS.FOOD_ORDERS],
   [ACTIVITY_RECORDS, COLLECTIONS.ACTIVITY_CHARGES]].forEach(([set, collection]) => {
    set.forEach(r => {
      if (r.bookingId === bookingId && !r.writtenOff) {
        update(collection, r, {
          writtenOff: true,
          writeOffReason: reason || "",
          writtenOffAt: at,
        });
        touched++;
      }
    });
  });
  return touched;
}

// The single definition of "this money counted". Every revenue figure in
// the app reads through it so the reports cannot drift apart again.
export function countsAsRevenue(record) {
  return !record.writtenOff;
}

// What an invoice is worth in LKR — the single figure every revenue total
// reads, so a bill raised in USD can never be counted as though the number
// on it were rupees. A foreign bill carries the rate that was used when it
// was raised; converting at today's rate would quietly restate last month's
// takings every time the rupee moved.
export function invoiceLKR(inv) {
  if (!inv) return 0;
  const amount = inv.total || 0;
  if (!inv.currency || inv.currency === "LKR") return amount;
  const rate = Number(inv.exchangeRate) || 0;
  return amount * rate;
}
