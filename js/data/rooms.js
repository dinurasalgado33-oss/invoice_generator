// Room map — mock data for now; the launch card only lights up for
// branches with data wired in. Swap ROOMS_BY_BRANCH for a real data
// source later without touching the rendering/UI code.
//
// status: "available" (free) | "occupied" (guest checked in) — that's the
// whole state machine. There's no separate "reserved but not arrived yet"
// status; a room stays available until someone is actually checked into
// it. rate = LKR per night, used to auto-calculate the room charge at
// checkout.
export const ROOMS_BY_BRANCH = {
  "Arugam Bay": [
    { name: "Ocean Pool Villa 01", type: "Pool Villa", rate: 11500, status: "occupied", guest: "Kasun Perera", phone: "077 221 8511", checkin: "2026-08-10", checkout: "2026-08-13" },
    { name: "Ocean Pool Villa 02", type: "Pool Villa", rate: 11500, status: "available" },
    { name: "Ocean Pool Villa 03", type: "Pool Villa", rate: 11500, status: "available" },
    { name: "Garden Villa 04", type: "Garden Villa", rate: 8500, status: "available" },
    { name: "Garden Villa 05", type: "Garden Villa", rate: 8500, status: "occupied", guest: "Mr. & Mrs. Silva", phone: "070 333 2211", checkin: "2026-08-09", checkout: "2026-08-12" },
    { name: "Garden Villa 06", type: "Garden Villa", rate: 8500, status: "available" },
    { name: "Beachfront Villa 07", type: "Beachfront Villa", rate: 15000, status: "occupied", guest: "Nadeesha Fernando", phone: "076 812 4499", checkin: "2026-08-10", checkout: "2026-08-15" },
    { name: "Beachfront Villa 08", type: "Beachfront Villa", rate: 15000, status: "available" },
    { name: "Beachfront Villa 09", type: "Beachfront Villa", rate: 15000, status: "available" },
  ],
  "Wilpattu": [
    { name: "Forest Villa 1", type: "Forest Chalet", rate: 9500, status: "occupied", guest: "Ruwan Jayasuriya", phone: "077 654 3210", checkin: "2026-08-10", checkout: "2026-08-12" },
    { name: "Forest Villa 2", type: "Forest Chalet", rate: 9500, status: "available" },
    { name: "Forest Villa 3", type: "Forest Chalet", rate: 9500, status: "available" },
    { name: "Forest Villa 4", type: "Safari Chalet", rate: 10500, status: "available" },
    { name: "Forest Villa 5", type: "Safari Chalet", rate: 10500, status: "occupied", guest: "Mr. & Mrs. Bandara", phone: "070 222 4455", checkin: "2026-08-11", checkout: "2026-08-13" },
    { name: "Forest Villa 6", type: "Safari Chalet", rate: 10500, status: "available" },
    { name: "Forest Villa 7", type: "Riverside Chalet", rate: 12000, status: "occupied", guest: "Ishara Wickramasinghe", phone: "076 345 6789", checkin: "2026-08-10", checkout: "2026-08-15" },
    { name: "Forest Villa 8", type: "Riverside Chalet", rate: 12000, status: "available" },
    { name: "Forest Villa 9", type: "Riverside Chalet", rate: 12000, status: "available" },
  ],
};

export const ROOM_STATUS_LABELS = { available: "Available", occupied: "Occupied" };

// Every check-in and check-out appends here — a manager-facing audit trail
// of guest movement, separate from the live ROOMS_BY_BRANCH snapshot above.
let nextRoomActivityId = 100;
export const ROOM_ACTIVITY_LOG = [
  { id: 1, branch: "Wilpattu", villa: "Forest Villa 2", guest: "Sanduni Rathnayake", action: "Check In", datetime: "2026-06-25T13:40:00" },
  { id: 2, branch: "Wilpattu", villa: "Forest Villa 2", guest: "Sanduni Rathnayake", action: "Check Out", datetime: "2026-06-28T11:15:00" },
  { id: 3, branch: "Arugam Bay", villa: "Beachfront Villa 08", guest: "Robert Johnson", action: "Check In", datetime: "2026-07-01T14:05:00" },
  { id: 4, branch: "Arugam Bay", villa: "Beachfront Villa 08", guest: "Robert Johnson", action: "Check Out", datetime: "2026-07-05T10:50:00" },
  { id: 5, branch: "Arugam Bay", villa: "Ocean Pool Villa 02", guest: "Emma Watson", action: "Check In", datetime: "2026-07-08T13:20:00" },
  { id: 6, branch: "Arugam Bay", villa: "Ocean Pool Villa 02", guest: "Emma Watson", action: "Check Out", datetime: "2026-07-12T11:30:00" },
  { id: 7, branch: "Arugam Bay", villa: "Ocean Pool Villa 01", guest: "Kasun Perera", action: "Check In", datetime: "2026-08-10T14:15:00" },
  { id: 8, branch: "Arugam Bay", villa: "Garden Villa 05", guest: "Mr. & Mrs. Silva", action: "Check In", datetime: "2026-08-09T15:05:00" },
  { id: 9, branch: "Arugam Bay", villa: "Beachfront Villa 07", guest: "Nadeesha Fernando", action: "Check In", datetime: "2026-08-10T13:50:00" },
  { id: 10, branch: "Wilpattu", villa: "Forest Villa 1", guest: "Ruwan Jayasuriya", action: "Check In", datetime: "2026-08-10T14:30:00" },
  { id: 11, branch: "Wilpattu", villa: "Forest Villa 7", guest: "Ishara Wickramasinghe", action: "Check In", datetime: "2026-08-10T12:45:00" },
  { id: 12, branch: "Wilpattu", villa: "Forest Villa 5", guest: "Mr. & Mrs. Bandara", action: "Check In", datetime: "2026-08-11T14:00:00" },
];
export function logRoomActivity(branch, villa, guest, action) {
  ROOM_ACTIVITY_LOG.push({ id: nextRoomActivityId++, branch, villa, guest, action, datetime: new Date().toISOString() });
}
