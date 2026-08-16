// Historical mock records for the Reports & Export screen. These are a
// separate, independent dataset from the "live" state in rooms.js/
// inventory.js — those hold current snapshots (today's room status,
// today's stock levels); reports need a spread of records *over time*,
// which the live mock state doesn't track. Swap for real records from a
// backend later; the filtering/aggregation logic in reports.js doesn't
// care where the rows came from.

export const INVOICES = [
  { id: "151", guest: "Sanduni Rathnayake", branch: "Wilpattu", date: "2026-06-22", total: 38500, status: "Active" },
  { id: "152", guest: "Michael Chen", branch: "Arugam Bay", date: "2026-06-24", total: 62000, status: "Active" },
  { id: "153", guest: "Dilani Gunasekara", branch: "Wilpattu", date: "2026-06-28", total: 29800, status: "Active" },
  { id: "154", guest: "Robert Johnson", branch: "Arugam Bay", date: "2026-07-01", total: 71500, status: "Active" },
  { id: "155", guest: "Fathima Rizvi", branch: "Wilpattu", date: "2026-07-03", total: 41200, status: "Void" },
  { id: "156", guest: "Anura Silva", branch: "Wilpattu", date: "2026-07-05", total: 33750, status: "Active" },
  { id: "157", guest: "Emma Watson", branch: "Arugam Bay", date: "2026-07-08", total: 84900, status: "Active" },
  { id: "158", guest: "Kasun Perera", branch: "Arugam Bay", date: "2026-07-10", total: 55300, status: "Active" },
  { id: "159", guest: "Amanda Lee", branch: "Arugam Bay", date: "2026-07-12", total: 47800, status: "Active" },
  { id: "160", guest: "Mr. & Mrs. Silva", branch: "Arugam Bay", date: "2026-07-15", total: 39600, status: "Active" },
  { id: "161", guest: "Ruwan Jayasuriya", branch: "Wilpattu", date: "2026-07-18", total: 26400, status: "Active" },
  { id: "162", guest: "Mrs. Bwanthi", branch: "Wilpattu", date: "2026-07-20", total: 316780, status: "Active" },
  { id: "163", guest: "Chathurika Fernando", branch: "Wilpattu", date: "2026-07-22", total: 31200, status: "Void" },
  { id: "164", guest: "Priya Nair", branch: "Arugam Bay", date: "2026-07-24", total: 48900, status: "Active" },
  { id: "165", guest: "Mr. & Mrs. Bandara", branch: "Wilpattu", date: "2026-07-26", total: 35600, status: "Active" },
  { id: "166", guest: "Nadeesha Fernando", branch: "Arugam Bay", date: "2026-07-28", total: 92400, status: "Active" },
  { id: "167", guest: "Tharindu Perera", branch: "Wilpattu", date: "2026-07-30", total: 28900, status: "Active" },
  { id: "168", guest: "John Smith", branch: "Arugam Bay", date: "2026-08-01", total: 41500, status: "Active" },
  { id: "169", guest: "Ishara Wickramasinghe", branch: "Wilpattu", date: "2026-08-03", total: 63200, status: "Active" },
  { id: "170", guest: "David Miller", branch: "Wilpattu", date: "2026-08-05", total: 37800, status: "Active" },
  { id: "171", guest: "Michael Chen", branch: "Arugam Bay", date: "2026-08-06", total: 58300, status: "Active" },
  { id: "172", guest: "Sanduni Rathnayake", branch: "Arugam Bay", date: "2026-08-08", total: 46700, status: "Active" },
  { id: "173", guest: "Dilani Gunasekara", branch: "Wilpattu", date: "2026-08-09", total: 32100, status: "Active" },
  { id: "174", guest: "Robert Johnson", branch: "Arugam Bay", date: "2026-08-11", total: 67900, status: "Active" },
];

// Real checkouts append here (js/invoice.js submit handler) — `total` is
// the net amount actually billed for the stay (gross minus discount,
// before advance is subtracted — advance is just an early payment, not
// a reduction in revenue). `discount`/`serviceCharge`/`advance` are kept
// alongside for transparency; seeded rows above predate this and simply
// don't have them. `id` is the same "Reservation No" printed on the
// document (appState.invoiceCounter, seeded past 174 in state.js) — not
// a separate internal counter — so a printed invoice can always be found
// here by the number on it.

export const FOOD_ORDER_RECORDS = [
  { id: 1, dish: "Chicken Curry", qty: 2, branch: "Wilpattu", date: "2026-07-15", revenue: 1900 },
  { id: 2, dish: "Fish Curry", qty: 3, branch: "Arugam Bay", date: "2026-07-16", revenue: 3150 },
  { id: 3, dish: "Vegetable Fried Rice", qty: 4, branch: "Wilpattu", date: "2026-07-18", revenue: 2600 },
  { id: 4, dish: "Prawn Curry", qty: 2, branch: "Arugam Bay", date: "2026-07-20", revenue: 2800 },
  { id: 5, dish: "Egg Hoppers (2pc)", qty: 5, branch: "Wilpattu", date: "2026-07-21", revenue: 2000 },
  { id: 6, dish: "Chicken Curry", qty: 3, branch: "Arugam Bay", date: "2026-07-23", revenue: 2850 },
  { id: 7, dish: "Vegetable Curry", qty: 2, branch: "Wilpattu", date: "2026-07-25", revenue: 1100 },
  { id: 8, dish: "Fish Curry", qty: 2, branch: "Wilpattu", date: "2026-07-27", revenue: 2100 },
  { id: 9, dish: "Chicken Curry", qty: 4, branch: "Wilpattu", date: "2026-07-29", revenue: 3800 },
  { id: 10, dish: "Prawn Curry", qty: 3, branch: "Arugam Bay", date: "2026-07-31", revenue: 4200 },
  { id: 11, dish: "Vegetable Fried Rice", qty: 2, branch: "Arugam Bay", date: "2026-08-01", revenue: 1300 },
  { id: 12, dish: "Egg Hoppers (2pc)", qty: 3, branch: "Arugam Bay", date: "2026-08-02", revenue: 1200 },
  { id: 13, dish: "Chicken Curry", qty: 2, branch: "Arugam Bay", date: "2026-08-03", revenue: 1900 },
  { id: 14, dish: "Fish Curry", qty: 4, branch: "Arugam Bay", date: "2026-08-04", revenue: 4200 },
  { id: 15, dish: "Vegetable Curry", qty: 3, branch: "Arugam Bay", date: "2026-08-05", revenue: 1650 },
  { id: 16, dish: "Chicken Curry", qty: 2, branch: "Wilpattu", date: "2026-08-06", revenue: 1900 },
  { id: 17, dish: "Prawn Curry", qty: 1, branch: "Wilpattu", date: "2026-08-07", revenue: 1400 },
  { id: 18, dish: "Fish Curry", qty: 2, branch: "Arugam Bay", date: "2026-08-09", revenue: 2100 },
  { id: 19, dish: "Egg Hoppers (2pc)", qty: 4, branch: "Wilpattu", date: "2026-08-10", revenue: 1600 },
  { id: 20, dish: "Vegetable Fried Rice", qty: 3, branch: "Wilpattu", date: "2026-08-11", revenue: 1950 },
];

// Every completed order (from the Orders screen) appends a row per dish
// here — that's what makes it count as a sale in the Food Orders report.
let nextFoodOrderRecordId = 1000;
export function allocateFoodOrderRecordId() {
  return nextFoodOrderRecordId++;
}

// Every activity charge (Room Map > villa > Activities) appends a row
// here, same pattern as FOOD_ORDER_RECORDS — otherwise activity revenue
// rides along on the invoice total with no way to attribute it to
// "activities" instead of "room" in the Dashboard's revenue split.
export const ACTIVITY_RECORDS = [];
let nextActivityRecordId = 1;
export function allocateActivityRecordId() {
  return nextActivityRecordId++;
}

export const BOOKINGS = [
  { guest: "Kasun Perera", villa: "Zenith Villa", branch: "Arugam Bay", checkin: "2026-08-10", checkout: "2026-08-13", status: "Checked In" },
  { guest: "Amanda Lee", villa: "Swell Villa", branch: "Arugam Bay", checkin: "2026-08-14", checkout: "2026-08-17", status: "Upcoming" },
  { guest: "Mr. & Mrs. Silva", villa: "Tide Villa", branch: "Arugam Bay", checkin: "2026-08-09", checkout: "2026-08-12", status: "Checked In" },
  { guest: "Priya Nair", villa: "Barrel Villa", branch: "Arugam Bay", checkin: "2026-08-15", checkout: "2026-08-18", status: "Upcoming" },
  { guest: "Nadeesha Fernando", villa: "Flow Villa", branch: "Arugam Bay", checkin: "2026-08-10", checkout: "2026-08-15", status: "Checked In" },
  { guest: "John Smith", villa: "Break Villa", branch: "Arugam Bay", checkin: "2026-08-12", checkout: "2026-08-13", status: "Upcoming" },
  { guest: "Emma Watson", villa: "Swell Villa", branch: "Arugam Bay", checkin: "2026-07-08", checkout: "2026-07-12", status: "Checked Out" },
  { guest: "Robert Johnson", villa: "Break Villa", branch: "Arugam Bay", checkin: "2026-07-01", checkout: "2026-07-05", status: "Checked Out" },
  { guest: "Ruwan Jayasuriya", villa: "Balcony Villa", branch: "Wilpattu", checkin: "2026-08-10", checkout: "2026-08-12", status: "Checked In" },
  { guest: "Chathurika Fernando", villa: "Pool Villa 1", branch: "Wilpattu", checkin: "2026-08-14", checkout: "2026-08-19", status: "Upcoming" },
  { guest: "Mr. & Mrs. Bandara", villa: "Pool Villa 2", branch: "Wilpattu", checkin: "2026-08-11", checkout: "2026-08-13", status: "Checked In" },
  { guest: "Tharindu Perera", villa: "Pool Villa 2", branch: "Wilpattu", checkin: "2026-08-16", checkout: "2026-08-18", status: "Upcoming" },
  { guest: "Ishara Wickramasinghe", villa: "A Type Villa", branch: "Wilpattu", checkin: "2026-08-10", checkout: "2026-08-15", status: "Checked In" },
  { guest: "David Miller", villa: "A Type Villa", branch: "Wilpattu", checkin: "2026-08-12", checkout: "2026-08-14", status: "Upcoming" },
  { guest: "Sanduni Rathnayake", villa: "Pool Villa 1", branch: "Wilpattu", checkin: "2026-06-25", checkout: "2026-06-28", status: "Checked Out" },
  { guest: "Michael Chen", villa: "Barrel Villa", branch: "Arugam Bay", checkin: "2026-06-30", checkout: "2026-07-02", status: "Cancelled" },
];
