// Which villas are occupied, worked out from the bookings.
//
// Occupancy used to live only on the room object — `room.status`,
// `room.guest`, `room.bookingId` — set at check-in and never written
// anywhere. So it survived exactly as long as the tab stayed open. After
// a reload every villa read "available" while the booking record sat in
// Firestore saying Checked In, and a second device never saw the
// occupancy at all. That is a villa double-booked with somebody asleep in
// it, and a guest's open tab unreachable because the room no longer knew
// its bookingId.
//
// The fix is deliberately NOT to start writing room.status to the
// database. That would make "is this villa occupied" a second stored
// fact, free to drift out of step with the bookings that are the real
// record — which is this project's recurring bug, and the reason guest
// charges stopped being an array hanging off the room.
//
// A booking already says everything needed: which villas, which guest,
// which nights, and whether the stay is still running. So occupancy is
// derived from it, once, after hydration. One fact, stored once.

import { ROOMS_BY_BRANCH } from "./rooms.js";
import { BOOKINGS } from "./reports.js";

// A stay that still has somebody in it. "Checked Out" and "Cancelled"
// both free the villa; anything else is treated as not occupying, so an
// unrecognised status can never silently hold a villa hostage.
const OCCUPYING = "Checked In";

// Every villa a booking covers. Older bookings pre-date roomIds and carry
// only roomId, so both are read — a stay that occupied three villas must
// not come back holding one.
function villasFor(booking) {
  const ids = Array.isArray(booking.roomIds) && booking.roomIds.length
    ? booking.roomIds
    : (booking.roomId != null ? [booking.roomId] : []);
  return ids;
}

// Clears the stay fields from a villa. Deliberately deletes rather than
// setting undefined, so a room with no guest has no guest key at all —
// which is what the rest of the app already checks for.
function clearRoom(room) {
  room.status = "available";
  delete room.guest;
  delete room.phone;
  delete room.checkin;
  delete room.checkout;
  delete room.source;
  delete room.bookingId;
}

// Rebuilds occupancy for every villa at every property.
//
// Called after hydration, and safe to call again at any time: it starts
// by clearing every room, so a stay that ended while the app was closed
// cannot leave a villa stuck as occupied.
export function deriveOccupancy() {
  Object.values(ROOMS_BY_BRANCH).forEach(rooms => rooms.forEach(clearRoom));

  let occupied = 0;
  BOOKINGS.forEach(booking => {
    if (booking.status !== OCCUPYING) return;
    const rooms = ROOMS_BY_BRANCH[booking.branch] || [];
    villasFor(booking).forEach(roomId => {
      const room = rooms.find(r => r.id === roomId);
      if (!room) return;   // villa deleted or renumbered since the stay
      // Only fields the booking actually has. Assigning undefined would
      // put an undefined value on the villa, and anything later writing
      // that villa to Firestore is rejected outright — which is how a
      // missing guest phone number stopped a nightly rate from saving.
      room.status = "occupied";
      room.bookingId = booking.id;
      if (booking.guest != null) room.guest = booking.guest;
      if (booking.phone != null) room.phone = booking.phone;
      if (booking.checkin != null) room.checkin = booking.checkin;
      if (booking.checkout != null) room.checkout = booking.checkout;
      if (booking.source != null) room.source = booking.source;
      occupied++;
    });
  });
  return occupied;
}
