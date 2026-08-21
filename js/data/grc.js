// Guest Registration Card — the form Sri Lankan hotels are legally
// required to complete for every guest at check-in, and which the guest
// signs. It is not optional paperwork bolted onto check-in: it IS the
// check-in. Nothing is booked until it's filled in and printed, which is
// why rooms.js routes the "Check In Guest" button straight here rather
// than to the old four-field form.

export const ROOM_TYPES = ["Single", "Twin", "Double", "Triple", "Guide"];

// R/O room only · B/B bed & breakfast · H/B half board · F/B full board.
// The same plans the invoice remark refers to.
export const MEAL_PLANS = ["R/O", "B/B", "H/B", "F/B"];

// Printed verbatim on the card, above the guest's signature — the guest is
// signing to acknowledge it, so it can't be edited per booking.
export const GRC_LIABILITY_NOTICE =
  "In order to ensure the Safety of your belongings, the Hotel has provided a Safety Locker " +
  "in Manager's Office. Therefore the Hotel does not accept liability for losses or damages " +
  "of any Valuable left in the Hotel Premises.";

// The hotel's standard times, printed as policy on the card. Distinct from
// the guest's own arrival/departure times, which are recorded per stay.
export const STANDARD_CHECKIN_TIME = "02.00pm";
export const STANDARD_CHECKOUT_TIME = "11.00am";

// Defaults for the guest's actual times, matching the policy above.
export const DEFAULT_ARRIVAL_TIME = "14:00";
export const DEFAULT_DEPARTURE_TIME = "11:00";

// One completed card per check-in. `bookingId`/`roomId` join it to the
// stay; the rest is a snapshot of what the guest declared and signed, so
// it stays correct even after the villa is renamed or re-let.
export const GRC_RECORDS = [];

// Sequential and guest-facing, like the invoice number — it's written on a
// signed legal document, so it has the same offline-numbering problem
// (see the README's offline-first section). Starts at 1
// since no cards exist yet.
let nextGrcNo = 1;
export function allocateGrcNo() {
  return nextGrcNo++;
}

export function findGrcByBookingId(bookingId) {
  return GRC_RECORDS.find(g => g.bookingId === bookingId) || null;
}
