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

// One row per dish sold. `dishId` is the join key; `dish` is the dish name
// at the time of sale, kept so an old sale still reads correctly after the
// dish is renamed. Same id-to-join / name-to-display split used by
// BOOKINGS, RESTOCK_LOG and ROOM_ACTIVITY_LOG.
export const FOOD_ORDER_RECORDS = [
  { id: 1, dishId: 127, dish: "Chicken Kottu", qty: 2, branch: "Wilpattu", date: "2026-07-15", revenue: 2400 },
  { id: 2, dishId: 19, dish: "Chicken Fried Rice", qty: 3, branch: "Arugam Bay", date: "2026-07-16", revenue: 3450 },
  { id: 3, dishId: 125, dish: "Vegetable Kottu", qty: 4, branch: "Wilpattu", date: "2026-07-18", revenue: 3600 },
  { id: 4, dishId: 29, dish: "Chicken Noodles", qty: 2, branch: "Arugam Bay", date: "2026-07-20", revenue: 2000 },
  { id: 5, dishId: 113, dish: "Egg Fried Rice", qty: 5, branch: "Wilpattu", date: "2026-07-21", revenue: 4750 },
  { id: 6, dishId: 24, dish: "Chicken Kottu", qty: 3, branch: "Arugam Bay", date: "2026-07-23", revenue: 3600 },
  { id: 7, dishId: 125, dish: "Vegetable Kottu", qty: 2, branch: "Wilpattu", date: "2026-07-25", revenue: 1800 },
  { id: 8, dishId: 114, dish: "Chicken Fried Rice", qty: 2, branch: "Wilpattu", date: "2026-07-27", revenue: 2100 },
  { id: 9, dishId: 127, dish: "Chicken Kottu", qty: 4, branch: "Wilpattu", date: "2026-07-29", revenue: 4800 },
  { id: 10, dishId: 29, dish: "Chicken Noodles", qty: 3, branch: "Arugam Bay", date: "2026-07-31", revenue: 3000 },
  { id: 11, dishId: 22, dish: "Vegetable Kottu", qty: 2, branch: "Arugam Bay", date: "2026-08-01", revenue: 1900 },
  { id: 12, dishId: 18, dish: "Egg Fried Rice", qty: 3, branch: "Arugam Bay", date: "2026-08-02", revenue: 3000 },
  { id: 13, dishId: 24, dish: "Chicken Kottu", qty: 2, branch: "Arugam Bay", date: "2026-08-03", revenue: 2400 },
  { id: 14, dishId: 19, dish: "Chicken Fried Rice", qty: 4, branch: "Arugam Bay", date: "2026-08-04", revenue: 4600 },
  { id: 15, dishId: 22, dish: "Vegetable Kottu", qty: 3, branch: "Arugam Bay", date: "2026-08-05", revenue: 2850 },
  { id: 16, dishId: 127, dish: "Chicken Kottu", qty: 2, branch: "Wilpattu", date: "2026-08-06", revenue: 2400 },
  { id: 17, dishId: 130, dish: "Chicken Noodles", qty: 1, branch: "Wilpattu", date: "2026-08-07", revenue: 990 },
  { id: 18, dishId: 19, dish: "Chicken Fried Rice", qty: 2, branch: "Arugam Bay", date: "2026-08-09", revenue: 2300 },
  { id: 19, dishId: 113, dish: "Egg Fried Rice", qty: 4, branch: "Wilpattu", date: "2026-08-10", revenue: 3800 },
  { id: 20, dishId: 125, dish: "Vegetable Kottu", qty: 3, branch: "Wilpattu", date: "2026-08-11", revenue: 2700 },
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

// `roomId` is the join key; `villa` is the villa name at booking time.
// Each booking also carries its own `id` so check-out can close the exact
// row it opened, instead of re-finding it by matching guest+villa+dates.
let nextBookingId = 17;
export function allocateBookingId() {
  return nextBookingId++;
}

export const BOOKINGS = [
  { id: 1, roomId: 1, guest: "Kasun Perera", villa: "Zenith Villa", branch: "Arugam Bay", checkin: "2026-08-10", checkout: "2026-08-13", status: "Checked In" },
  { id: 2, roomId: 2, guest: "Amanda Lee", villa: "Swell Villa", branch: "Arugam Bay", checkin: "2026-08-14", checkout: "2026-08-17", status: "Upcoming" },
  { id: 3, roomId: 3, guest: "Mr. & Mrs. Silva", villa: "Tide Villa", branch: "Arugam Bay", checkin: "2026-08-09", checkout: "2026-08-12", status: "Checked In" },
  { id: 4, roomId: 4, guest: "Priya Nair", villa: "Barrel Villa", branch: "Arugam Bay", checkin: "2026-08-15", checkout: "2026-08-18", status: "Upcoming" },
  { id: 5, roomId: 5, guest: "Nadeesha Fernando", villa: "Flow Villa", branch: "Arugam Bay", checkin: "2026-08-10", checkout: "2026-08-15", status: "Checked In" },
  { id: 6, roomId: 6, guest: "John Smith", villa: "Break Villa", branch: "Arugam Bay", checkin: "2026-08-12", checkout: "2026-08-13", status: "Upcoming" },
  { id: 7, roomId: 2, guest: "Emma Watson", villa: "Swell Villa", branch: "Arugam Bay", checkin: "2026-07-08", checkout: "2026-07-12", status: "Checked Out" },
  { id: 8, roomId: 6, guest: "Robert Johnson", villa: "Break Villa", branch: "Arugam Bay", checkin: "2026-07-01", checkout: "2026-07-05", status: "Checked Out" },
  { id: 9, roomId: 7, guest: "Ruwan Jayasuriya", villa: "Balcony Villa", branch: "Wilpattu", checkin: "2026-08-10", checkout: "2026-08-12", status: "Checked In" },
  { id: 10, roomId: 8, guest: "Chathurika Fernando", villa: "Pool Villa 1", branch: "Wilpattu", checkin: "2026-08-14", checkout: "2026-08-19", status: "Upcoming" },
  { id: 11, roomId: 9, guest: "Mr. & Mrs. Bandara", villa: "Pool Villa 2", branch: "Wilpattu", checkin: "2026-08-11", checkout: "2026-08-13", status: "Checked In" },
  { id: 12, roomId: 9, guest: "Tharindu Perera", villa: "Pool Villa 2", branch: "Wilpattu", checkin: "2026-08-16", checkout: "2026-08-18", status: "Upcoming" },
  { id: 13, roomId: 10, guest: "Ishara Wickramasinghe", villa: "A Type Villa", branch: "Wilpattu", checkin: "2026-08-10", checkout: "2026-08-15", status: "Checked In" },
  { id: 14, roomId: 10, guest: "David Miller", villa: "A Type Villa", branch: "Wilpattu", checkin: "2026-08-12", checkout: "2026-08-14", status: "Upcoming" },
  { id: 15, roomId: 8, guest: "Sanduni Rathnayake", villa: "Pool Villa 1", branch: "Wilpattu", checkin: "2026-06-25", checkout: "2026-06-28", status: "Checked Out" },
  { id: 16, roomId: 4, guest: "Michael Chen", villa: "Barrel Villa", branch: "Arugam Bay", checkin: "2026-06-30", checkout: "2026-07-02", status: "Cancelled" },
];

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
  [FOOD_ORDER_RECORDS, ACTIVITY_RECORDS].forEach(set => {
    set.forEach(r => {
      if (r.bookingId === bookingId && !r.writtenOff) {
        r.writtenOff = true;
        r.writeOffReason = reason || "";
        r.writtenOffAt = at;
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
