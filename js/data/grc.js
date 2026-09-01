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
// Printed on a document the guest signs, so it is legal wording rather
// than decoration — and changing it should not need a deploy.
export const LIABILITY_NOTICES = {
  "Wilpattu": "In order to ensure the Safety of your belongings, the Hotel has provided a Safety Locker " +
    "in Manager's Office. Therefore the Hotel does not accept liability for losses or damages " +
    "of any Valuable left in the Hotel Premises.",
  "Arugam Bay": "In order to ensure the Safety of your belongings, the Hotel has provided a Safety Locker " +
    "in Manager's Office. Therefore the Hotel does not accept liability for losses or damages " +
    "of any Valuable left in the Hotel Premises.",
};

export function liabilityNoticeFor(branch) {
  return LIABILITY_NOTICES[branch] || LIABILITY_NOTICES["Wilpattu"];
}

export function setLiabilityNotice(branch, text) {
  LIABILITY_NOTICES[branch] = String(text || "").trim();
  return LIABILITY_NOTICES[branch];
}

// The hotel's standard times, printed as policy on the card. Distinct from
// the guest's own arrival/departure times, which are recorded per stay.
// Per property and manager-set: these print on every registration card
// and confirmation, and a hotel changing its check-in time by an hour
// should not need a developer.
//
// Two formats for one fact, unavoidably: a 24-hour value is what an
// <input type="time"> reads and writes, and a friendlier form is what
// goes on the printed document. Derived from the same source rather than
// stored twice, so they cannot disagree.
export const STANDARD_TIMES = {
  "Wilpattu": { checkin: "14:00", checkout: "11:00" },
  "Arugam Bay": { checkin: "14:00", checkout: "11:00" },
};

export function standardTimesFor(branch) {
  return STANDARD_TIMES[branch] || { checkin: "14:00", checkout: "11:00" };
}

export function setStandardTimes(branch, checkin, checkout) {
  STANDARD_TIMES[branch] = {
    checkin: checkin || "14:00",
    checkout: checkout || "11:00",
  };
  return STANDARD_TIMES[branch];
}

// "14:00" -> "02.00pm", matching how these already print.
export function displayTime(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h)) return "";
  const suffix = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, "0")}.${String(m || 0).padStart(2, "0")}${suffix}`;
}

// One completed card per check-in. `bookingId`/`roomId` join it to the
// stay; the rest is a snapshot of what the guest declared and signed, so
// it stays correct even after the villa is renamed or re-let.
export const GRC_RECORDS = [];

export function findGrcByBookingId(bookingId) {
  return GRC_RECORDS.find(g => g.bookingId === bookingId) || null;
}
