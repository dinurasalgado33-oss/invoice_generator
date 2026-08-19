// Ids are unique across ALL branches (Wilpattu 1-5, Arugam Bay 101-105)
// so activity records can live in one flat backend collection.
// Add-on activities a guest can be charged for during their stay — staff
// pick one from here (or add a one-off custom charge) from the Activities
// quick action; the charge rides along to that room's checkout invoice.
//
// `price`      — what the guest is billed.
// `hotelIncome`— what the hotel actually keeps out of that. The remainder
//                is paid out to the jeep driver / boat owner / transport
//                provider. For anything the hotel runs itself, income
//                equals the price and nothing is paid out.
// `category`   — which bucket the charge lands in (see data/charges.js).
//
// The income split is the whole point: the staff's own records show
// safaris sold at 12,000 with only 2,000 kept. Billing 378,000 of safaris
// and reporting all of it as revenue overstates the month by ~85%.
export const ACTIVITIES_BY_BRANCH = {
  // Wilpattu prices come from the staff's own menu sheet; the income
  // figures come from what their bill records actually show being kept
  // (safaris consistently 2,000 a trip, boat rides 3,000). Both are
  // editable in Configure — these are a starting point, not a rule.
  "Wilpattu": [
    { id: 1, name: "Half Day Safari", price: 17000, hotelIncome: 2000, category: "safari" },
    { id: 2, name: "Full Day Safari", price: 33000, hotelIncome: 2000, category: "safari" },
    { id: 3, name: "Night Safari", price: 15000, hotelIncome: 2000, category: "safari" },
    { id: 4, name: "Boat Ride", price: 15000, hotelIncome: 3000, category: "safari" },
    { id: 5, name: "Boat Ride + Night Safari", price: 8000, hotelIncome: 2000, category: "safari" },
    { id: 6, name: "Tuk Tuk Hire", price: 2000, hotelIncome: 500, category: "transport" },
    { id: 7, name: "Park Entrance Ticket", price: 11000, hotelIncome: 0, category: "ticket" },
    { id: 8, name: "Kayak Ride", price: 1500, hotelIncome: 1500, category: "other" },
    { id: 9, name: "Bicycle Ride", price: 1500, hotelIncome: 1500, category: "other" },
    { id: 10, name: "Floating Breakfast", price: 4500, hotelIncome: 4500, category: "food" },
  ],
  "Arugam Bay": [
    { id: 101, name: "Surfing Lesson", price: 5000, hotelIncome: 5000, category: "other" },
    { id: 102, name: "Kayak Ride", price: 3000, hotelIncome: 3000, category: "other" },
    { id: 103, name: "Boat Ride", price: 4500, hotelIncome: 1500, category: "safari" },
    { id: 104, name: "Snorkeling Trip", price: 5500, hotelIncome: 2000, category: "safari" },
    { id: 105, name: "Sunset Beach BBQ", price: 6000, hotelIncome: 6000, category: "food" },
    { id: 106, name: "Tuk Tuk Hire", price: 2000, hotelIncome: 500, category: "transport" },
  ],
};

// Kept clear of every seeded id across both branches, so a newly added
// activity can't collide with an existing one. Seeded from the data
// itself rather than a hardcoded number — same pattern as restock ids.
let nextActivityId = Math.max(0, ...Object.values(ACTIVITIES_BY_BRANCH).flat().map(a => a.id)) + 1;
export function allocateActivityId() {
  return nextActivityId++;
}

// An activity's income can never exceed what the guest paid — a payout
// can't be negative. Clamped here rather than at each call site so the
// Configure form, the charge panel and any future import all agree.
export function clampHotelIncome(price, hotelIncome) {
  const p = Number(price) || 0;
  const i = Number(hotelIncome);
  if (!Number.isFinite(i) || i < 0) return 0;
  return Math.min(i, p);
}

export function payoutFor(activity, qty = 1) {
  const price = Number(activity.price) || 0;
  const income = clampHotelIncome(price, activity.hotelIncome ?? price);
  return (price - income) * qty;
}
