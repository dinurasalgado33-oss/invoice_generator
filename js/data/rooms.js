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
    { id: 1, name: "Zenith Villa", rate: 11500, status: "available" },
    { id: 2, name: "Swell Villa", rate: 11500, status: "available" },
    { id: 3, name: "Tide Villa", rate: 8500, status: "available" },
    { id: 4, name: "Barrel Villa", rate: 8500, status: "available" },
    { id: 5, name: "Flow Villa", rate: 15000, status: "available" },
    { id: 6, name: "Break Villa", rate: 15000, status: "available" },
  ],
  "Wilpattu": [
    { id: 7, name: "Balcony Villa", rate: 9500, status: "available" },
    { id: 8, name: "Pool Villa 1", rate: 9500, status: "available" },
    { id: 9, name: "Pool Villa 2", rate: 10500, status: "available" },
    { id: 10, name: "A Type Villa", rate: 12000, status: "available" },
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
let nextRoomActivityId = 1;
export const ROOM_ACTIVITY_LOG = [];
export function logRoomActivity(branch, room, guest, action) {
  ROOM_ACTIVITY_LOG.push({ id: nextRoomActivityId++, roomId: room.id, branch, villa: room.name, guest, action, datetime: new Date().toISOString() });
}
