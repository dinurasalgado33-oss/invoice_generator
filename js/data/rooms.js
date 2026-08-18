// Room map — mock data for now; the launch card only lights up for
// branches with data wired in. Swap ROOMS_BY_BRANCH for a real data
// source later without touching the rendering/UI code.
//
// `id` is the villa's stable identity and is unique across ALL branches
// (not per-branch), so these rows can live in one flat backend collection
// without colliding. Everything that needs to point at a villa stores this
// id — never the villa's name (managers can rename villas in Configure)
// and never its array position (a backend returns no guaranteed order).
//
// status: "available" (free) | "occupied" (guest checked in) — that's the
// whole state machine. There's no separate "reserved but not arrived yet"
// status; a room stays available until someone is actually checked into
// it. rate = LKR per night, used to auto-calculate the room charge at
// checkout.
export const ROOMS_BY_BRANCH = {
  "Arugam Bay": [
    { id: 1, name: "Zenith Villa", rate: 11500, status: "occupied", bookingId: 1, guest: "Kasun Perera", phone: "077 221 8511", checkin: "2026-08-10", checkout: "2026-08-13" },
    { id: 2, name: "Swell Villa", rate: 11500, status: "available" },
    { id: 3, name: "Tide Villa", rate: 8500, status: "occupied", bookingId: 3, guest: "Mr. & Mrs. Silva", phone: "070 333 2211", checkin: "2026-08-09", checkout: "2026-08-12" },
    { id: 4, name: "Barrel Villa", rate: 8500, status: "available" },
    { id: 5, name: "Flow Villa", rate: 15000, status: "occupied", bookingId: 5, guest: "Nadeesha Fernando", phone: "076 812 4499", checkin: "2026-08-10", checkout: "2026-08-15" },
    { id: 6, name: "Break Villa", rate: 15000, status: "available" },
  ],
  "Wilpattu": [
    { id: 7, name: "Balcony Villa", rate: 9500, status: "occupied", bookingId: 9, guest: "Ruwan Jayasuriya", phone: "077 654 3210", checkin: "2026-08-10", checkout: "2026-08-12" },
    { id: 8, name: "Pool Villa 1", rate: 9500, status: "available" },
    { id: 9, name: "Pool Villa 2", rate: 10500, status: "occupied", bookingId: 11, guest: "Mr. & Mrs. Bandara", phone: "070 222 4455", checkin: "2026-08-11", checkout: "2026-08-13" },
    { id: 10, name: "A Type Villa", rate: 12000, status: "occupied", bookingId: 13, guest: "Ishara Wickramasinghe", phone: "076 345 6789", checkin: "2026-08-10", checkout: "2026-08-15" },
  ],
};

export const ROOM_STATUS_LABELS = { available: "Available", occupied: "Occupied" };

// Look a villa up by its stable id, across every branch.
export function findRoomById(roomId) {
  for (const [branch, rooms] of Object.entries(ROOMS_BY_BRANCH)) {
    const room = rooms.find(r => r.id === roomId);
    if (room) return { room, branch };
  }
  return null;
}

// Every check-in and check-out appends here — a manager-facing audit trail
// of guest movement, separate from the live ROOMS_BY_BRANCH snapshot above.
//
// `roomId` is the join key; `villa` is the villa's name *at the time of the
// event*, kept deliberately so a historical log entry still reads correctly
// after the villa is renamed. Same pattern for every historical record in
// this app (bookings, food sales, restocks): id to join on, name to display.
let nextRoomActivityId = 100;
export const ROOM_ACTIVITY_LOG = [
  { id: 1, roomId: 8, branch: "Wilpattu", villa: "Pool Villa 1", guest: "Sanduni Rathnayake", action: "Check In", datetime: "2026-06-25T13:40:00" },
  { id: 2, roomId: 8, branch: "Wilpattu", villa: "Pool Villa 1", guest: "Sanduni Rathnayake", action: "Check Out", datetime: "2026-06-28T11:15:00" },
  { id: 3, roomId: 6, branch: "Arugam Bay", villa: "Break Villa", guest: "Robert Johnson", action: "Check In", datetime: "2026-07-01T14:05:00" },
  { id: 4, roomId: 6, branch: "Arugam Bay", villa: "Break Villa", guest: "Robert Johnson", action: "Check Out", datetime: "2026-07-05T10:50:00" },
  { id: 5, roomId: 2, branch: "Arugam Bay", villa: "Swell Villa", guest: "Emma Watson", action: "Check In", datetime: "2026-07-08T13:20:00" },
  { id: 6, roomId: 2, branch: "Arugam Bay", villa: "Swell Villa", guest: "Emma Watson", action: "Check Out", datetime: "2026-07-12T11:30:00" },
  { id: 7, roomId: 1, branch: "Arugam Bay", villa: "Zenith Villa", guest: "Kasun Perera", action: "Check In", datetime: "2026-08-10T14:15:00" },
  { id: 8, roomId: 3, branch: "Arugam Bay", villa: "Tide Villa", guest: "Mr. & Mrs. Silva", action: "Check In", datetime: "2026-08-09T15:05:00" },
  { id: 9, roomId: 5, branch: "Arugam Bay", villa: "Flow Villa", guest: "Nadeesha Fernando", action: "Check In", datetime: "2026-08-10T13:50:00" },
  { id: 10, roomId: 7, branch: "Wilpattu", villa: "Balcony Villa", guest: "Ruwan Jayasuriya", action: "Check In", datetime: "2026-08-10T14:30:00" },
  { id: 11, roomId: 10, branch: "Wilpattu", villa: "A Type Villa", guest: "Ishara Wickramasinghe", action: "Check In", datetime: "2026-08-10T12:45:00" },
  { id: 12, roomId: 9, branch: "Wilpattu", villa: "Pool Villa 2", guest: "Mr. & Mrs. Bandara", action: "Check In", datetime: "2026-08-11T14:00:00" },
];
export function logRoomActivity(branch, room, guest, action) {
  ROOM_ACTIVITY_LOG.push({ id: nextRoomActivityId++, roomId: room.id, branch, villa: room.name, guest, action, datetime: new Date().toISOString() });
}
