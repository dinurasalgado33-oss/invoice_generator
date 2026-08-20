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

export const RESERVATIONS = [];

export function findReservationById(id) {
  return RESERVATIONS.find(r => r.id === id) || null;
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
export const PROFORMA_CURRENCIES = ["USD", "EUR", "GBP", "LKR"];
export const DEFAULT_PROFORMA_CURRENCY = "USD";
