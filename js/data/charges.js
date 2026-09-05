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

// Service charge, levied on food only — see note above. Per property and
// manager-set: their own records show it waived and negotiated, so it was
// never really a constant.
//
// Held as a percentage rather than a fraction, because that is what a
// manager types and what the printed notice says. Ten, not 0.1.
export const SERVICE_CHARGE_RATES = {
  "Wilpattu": 10,
  "Arugam Bay": 10,
};

export function serviceChargeRateFor(branch) {
  const rate = Number(SERVICE_CHARGE_RATES[branch]);
  return Number.isFinite(rate) ? rate : 0;
}

export function setServiceChargeRate(branch, rate) {
  const clean = Math.max(0, Math.min(100, Number(rate) || 0));
  SERVICE_CHARGE_RATES[branch] = clean;
  return clean;
}

// The policy notice printed in the Remark box on every invoice. It states
// a standing charging policy, so it reads identically on every bill and is
// not a per-invoice field — a notice that can be reworded per invoice
// stops being a policy.
//
// Built from the rate rather than written beside it. It used to be a
// fixed sentence saying "10%" sitting next to a separate constant, with a
// comment noting that having them adjacent made a mismatch obvious. That
// was a fair mitigation while both were constants; the moment a manager
// can change the rate it becomes a bill that charges one figure and
// promises another, on the document handed to the guest. One fact, one
// place.
export function invoiceRemark(branch) {
  const rate = serviceChargeRateFor(branch);
  if (!rate) {
    // No charge to announce. Saying "a 0% service charge will be added"
    // would be worse than saying nothing.
    return "";
  }
  return `Please note that a ${rate}% service charge will be added to all BB (Bed & Breakfast), ` +
    "HB (Half Board) and FB (Full Board) Bookings.";
}

export function foodSubtotal(items) {
  return items.reduce((sum, it) => (it.category === "food" ? sum + it.value : sum), 0);
}

export function serviceChargeFor(items, branch) {
  return Math.round(foodSubtotal(items) * (serviceChargeRateFor(branch) / 100) * 100) / 100;
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
// Per property: the OTAs one hotel lists on are not the other's. Feeds
// the revenue-by-source report, so adding one here is what makes that
// report able to see it at all.
export const BOOKING_SOURCES_BY_BRANCH = {
  "Wilpattu": ["Direct", "Booking.com", "Walk-in", "Agent"],
  "Arugam Bay": ["Direct", "Booking.com", "Walk-in", "Agent"],
};

export function bookingSourcesFor(branch) {
  return BOOKING_SOURCES_BY_BRANCH[branch] || BOOKING_SOURCES_BY_BRANCH["Wilpattu"];
}

export function setBookingSources(branch, list) {
  BOOKING_SOURCES_BY_BRANCH[branch] = (list || []).filter(Boolean);
  return BOOKING_SOURCES_BY_BRANCH[branch];
}

// Kept for the handful of places that just want a default list.
export const BOOKING_SOURCES = BOOKING_SOURCES_BY_BRANCH["Wilpattu"];
export const DEFAULT_BOOKING_SOURCE = "Direct";

// Currencies any guest-facing bill can be raised in. Lives here rather
// than beside the reservation code because both the checkout invoice and
// the travel agent invoice print it, and the two must not drift apart.
// No conversion happens anywhere in the app: amounts are entered in
// whichever currency was agreed, and the agent invoice says payment
// settles at the Central Bank rate on the day.
// Shared across both properties, deliberately: a euro is a euro at either
// hotel, and a manager adding one at Wilpattu would be baffled to find
// Arugam Bay still unable to bill in it.
export const CURRENCIES = ["LKR", "USD", "EUR", "GBP"];

export function setCurrencies(list) {
  const clean = (list || []).map(s => String(s).trim().toUpperCase()).filter(Boolean);
  // LKR is what every report totals in; losing it would leave revenue
  // with no base currency to convert into.
  if (!clean.includes("LKR")) clean.unshift("LKR");
  CURRENCIES.splice(0, CURRENCIES.length, ...clean);
  return CURRENCIES;
}
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

// What a booking type costs on top of the villa, per villa per night.
//
// A villa rate buys the villa. Bed & Breakfast, Half Board and Full Board
// each add meals to that, and the hotel charges for them — so the
// supplement is a nightly amount added beside the room line rather than
// folded into it, which keeps the bill legible: the guest can see what the
// villa cost and what the meals cost.
//
// Villa Only is not listed because it is the absence of a supplement, not a
// supplement of zero. mealPlanRateFor() returns 0 for anything it does not
// know, which covers it and every future type somebody adds before setting
// a price.
//
// Per property: the two hotels feed guests differently and one may charge
// for breakfast where the other includes it.
export const BOOKING_TYPES = [
  { key: "Villa Only", label: "Villa Only" },
  { key: "BB", label: "BB (Bed & Breakfast)" },
  { key: "HB", label: "HB (Half Board)" },
  { key: "FB", label: "FB (Full Board)" },
];

// The types that carry a price. Villa Only never does.
export const PAID_BOOKING_TYPES = BOOKING_TYPES.filter(t => t.key !== "Villa Only");

export const MEAL_PLAN_RATES = {
  "Wilpattu":   { BB: 1000, HB: 1000, FB: 1000 },
  "Arugam Bay": { BB: 1000, HB: 1000, FB: 1000 },
};

// The same plan is written two ways in this app: a reservation's booking
// type is "BB", and the registration card's meal plan list — which is
// configurable, so a manager may have typed either — says "B/B". They mean
// one thing and must price the same, so the key is normalised rather than
// the two lists being forcibly merged, which would rewrite cards already
// signed. "Villa Only" and "R/O" both normalise to something with no rate,
// which is correct: they are the villa on its own.
function planKey(bookingType) {
  return String(bookingType || "").replace(/[^a-z]/gi, "").toUpperCase();
}

export function mealPlanRateFor(branch, bookingType) {
  const forBranch = MEAL_PLAN_RATES[branch] || {};
  const wanted = planKey(bookingType);
  if (!wanted) return 0;
  const match = Object.keys(forBranch).find(k => planKey(k) === wanted);
  return match ? (Number(forBranch[match]) || 0) : 0;
}

export function setMealPlanRate(branch, bookingType, amount) {
  if (!MEAL_PLAN_RATES[branch]) MEAL_PLAN_RATES[branch] = {};
  const clean = Math.max(0, Number(amount) || 0);
  MEAL_PLAN_RATES[branch][bookingType] = clean;
  return clean;
}

// The whole supplement for a stay: one villa, one booking type, n nights.
// Kept here rather than at each call site so the reservation, the
// registration card and the invoice cannot arrive at three different
// answers — which is exactly how this codebase has gone wrong before.
export function mealPlanTotal(branch, bookingType, villaCount, nights) {
  const rate = mealPlanRateFor(branch, bookingType);
  if (!rate) return 0;
  return rate * Math.max(0, villaCount || 0) * Math.max(0, nights || 0);
}
export function vatRateFor(branch) {
  return Number(VAT_RATES[branch]) || 0;
}

export function setVatRate(branch, rate) {
  const clean = Math.max(0, Math.min(100, Number(rate) || 0));
  VAT_RATES[branch] = clean;
  return clean;
}
