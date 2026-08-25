// Every billable line — on a room's running tab and on the invoice itself —
// carries one of these categories. It exists because the manager's own
// bookkeeping buckets charges exactly this way (the staff spreadsheet has a
// separate money column per category, totalled monthly), and because two
// other rules depend on knowing what kind of charge a line is:
//
//   1. Service charge is 10% of FOOD ONLY — not villa, not safari. Without
//      a category on the line there's no way to compute that base.
//   2. Safari/transport are sold on behalf of third parties, so only part
//      of what the guest pays is the hotel's. See `hotelIncome` in
//      data/activities.js.
//
// `villa` is assigned automatically at checkout, `food` by the Orders
// screen, and safari/transport/ticket come from the activity's own
// category. Staff can override any line's category on the invoice form.
export const CHARGE_CATEGORIES = ["villa", "food", "safari", "transport", "ticket", "other"];

export const CHARGE_CATEGORY_LABELS = {
  villa: "Villa",
  food: "Food & Beverage",
  safari: "Safari",
  transport: "Transport",
  ticket: "Entrance Ticket",
  other: "Other",
};

// Anything not in this list is sold by the hotel itself, so the whole
// amount is the hotel's income and no payout is involved.
export const THIRD_PARTY_CATEGORIES = ["safari", "transport", "ticket"];

export const DEFAULT_CHARGE_CATEGORY = "other";

export function isChargeCategory(value) {
  return CHARGE_CATEGORIES.includes(value);
}

export function chargeCategoryLabel(value) {
  return CHARGE_CATEGORY_LABELS[value] || CHARGE_CATEGORY_LABELS[DEFAULT_CHARGE_CATEGORY];
}

// Service charge is levied on food only — see note above. Kept here rather
// than hardcoded in invoice.js so Configure can expose it later without
// hunting through the form code.
export const SERVICE_CHARGE_RATE = 0.1;

// Fixed policy notice printed in the Remark box on every invoice. Not a
// per-invoice field: it states a standing charging policy, so it has to
// read identically on every bill a guest is handed. Deliberately not
// editable from the UI — a notice that can be reworded per invoice stops
// being a policy.
//
// Lives next to SERVICE_CHARGE_RATE on purpose: if the rate ever changes,
// this sentence is wrong, and having them adjacent makes that obvious.
export const INVOICE_REMARK =
  "Please note that a 10% service charge will be added to all BB (Bed & Breakfast), " +
  "HB (Half Board) and FB (Full Board) Bookings.";

export function foodSubtotal(items) {
  return items.reduce((sum, it) => (it.category === "food" ? sum + it.value : sum), 0);
}

export function serviceChargeFor(items) {
  return Math.round(foodSubtotal(items) * SERVICE_CHARGE_RATE * 100) / 100;
}

// Totals per category, used by the invoice record and the dashboard split
// so revenue can be attributed without inferring it by subtraction.
export function categoryTotals(items) {
  const totals = {};
  CHARGE_CATEGORIES.forEach(c => { totals[c] = 0; });
  items.forEach(it => {
    const key = isChargeCategory(it.category) ? it.category : DEFAULT_CHARGE_CATEGORY;
    totals[key] += it.value;
  });
  return totals;
}

// How a stay was booked. Direct guests cost no commission; Booking.com
// takes a cut, which is why the manager tracks the split by hand today.
export const BOOKING_SOURCES = ["Direct", "Booking.com", "Walk-in", "Agent"];
export const DEFAULT_BOOKING_SOURCE = "Direct";

// Currencies any guest-facing bill can be raised in. Lives here rather
// than beside the reservation code because both the checkout invoice and
// the travel agent invoice print it, and the two must not drift apart.
// No conversion happens anywhere in the app: amounts are entered in
// whichever currency was agreed, and the agent invoice says payment
// settles at the Central Bank rate on the day.
export const CURRENCIES = ["LKR", "USD", "EUR", "GBP"];
export const DEFAULT_CURRENCY = "LKR";

// VAT, set per property by a manager. Zero until the hotel registers, so
// nothing prints until there is something to print — but the field exists
// on every invoice from the start, which means turning it on later is a
// setting rather than a migration of bills already raised.
//
// The rate that applied when a bill was raised is stored on that bill.
// Reading today's rate to re-total an old invoice would silently restate
// last year's takings every time the rate changed.
export const VAT_RATES = {
  "Wilpattu": 0,
  "Arugam Bay": 0,
};

export function vatRateFor(branch) {
  return Number(VAT_RATES[branch]) || 0;
}

export function setVatRate(branch, rate) {
  const clean = Math.max(0, Math.min(100, Number(rate) || 0));
  VAT_RATES[branch] = clean;
  return clean;
}
