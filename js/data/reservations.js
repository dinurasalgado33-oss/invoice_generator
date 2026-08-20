// Reservations are now records, not just printed documents. The
// Reservations screen lists them, and each one can later produce a
// Proforma Invoice for the travel agent or guide who booked it — which
// needs the original booking details, so they have to survive the print.

// `no` is the guest-facing reservation number printed on both documents.
// Sequential and human-read, so it carries the same offline-allocation
// problem as invoice and GRC numbers — see the README's offline-first note.
let nextReservationNo = 101;
export function allocateReservationNo() {
  return nextReservationNo++;
}

// A reservation is a promise about a future stay, so it needs a state:
// it is either still standing, called off, or fulfilled by the guest
// actually arriving. Without one, a reservation could never be cancelled
// and never closed — every booking ever made sat in the list looking
// pending forever, including last year's.
export const RESERVATION_STATUS = {
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  CHECKED_IN: "Checked In",
};

export const RESERVATIONS = [];

export function findReservationById(id) {
  return RESERVATIONS.find(r => r.id === id) || null;
}

// Reservations still expecting a guest. Cancelled ones are excluded, and
// so are fulfilled ones — the guest already arrived, so the villa is no
// longer promised to anyone.
export function openReservations(branch) {
  return RESERVATIONS.filter(r =>
    r.branch === branch && r.status === RESERVATION_STATUS.CONFIRMED);
}

// Two date ranges overlap unless one ends before the other starts. Check-out
// day is not counted: a guest leaving on the 5th frees the villa for someone
// arriving on the 5th, which is how hotel nights actually work.
function datesOverlap(aIn, aOut, bIn, bOut) {
  return aIn < bOut && bIn < aOut;
}

// Returns the standing reservations that already promise any of these
// villas over the same nights. Nothing prevented this before: the same
// villa could be reserved twice for overlapping dates and both were
// accepted silently, so two guests would arrive expecting one room.
export function findConflicts({ branch, villas, checkinDate, checkoutDate, ignoreId = null }) {
  const wantedRoomIds = new Set((villas || []).map(v => v.roomId));
  if (!wantedRoomIds.size || !checkinDate || !checkoutDate) return [];

  return openReservations(branch)
    .filter(r => r.id !== ignoreId)
    .filter(r => datesOverlap(checkinDate, checkoutDate, r.checkinDate, r.checkoutDate))
    .map(r => {
      const clashing = (r.villas || []).filter(v => wantedRoomIds.has(v.roomId));
      return clashing.length ? { reservation: r, villas: clashing } : null;
    })
    .filter(Boolean);
}

// Proforma invoices issued against a reservation. Kept separate rather
// than as a flag on the reservation, because one booking can legitimately
// be re-invoiced (an amended stay, a corrected agent rate) and each issued
// document needs its own number and its own record of what it said.
let nextProformaSeq = 102;
export function allocateProformaNo() {
  return nextProformaSeq++;
}

export const PROFORMA_INVOICES = [];

export function proformasForReservation(reservationId) {
  return PROFORMA_INVOICES.filter(p => p.reservationId === reservationId);
}

// Agents are billed in their own currency — the hotel converts at the
// Central Bank rate on the day, which is why the document says so rather
// than fixing a rate. No conversion happens in the app: staff enter the
// agreed amounts directly in whichever currency was contracted.
export const PROFORMA_CURRENCIES = ["LKR", "USD", "EUR", "GBP"];
// Defaults to LKR because that is the currency the reservation's villa
// rates are in — the rates carry straight over and stay locked. Choosing
// a foreign currency unlocks them for the contracted agent rate.
export const DEFAULT_PROFORMA_CURRENCY = "LKR";
