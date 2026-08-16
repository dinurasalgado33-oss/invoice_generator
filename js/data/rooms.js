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
    { name: "Zenith Villa", type: "Pool Villa", rate: 11500, status: "occupied", guest: "Kasun Perera", phone: "077 221 8511", checkin: "2026-08-10", checkout: "2026-08-13" },
    { name: "Swell Villa", type: "Pool Villa", rate: 11500, status: "available" },
    { name: "Tide Villa", type: "Garden Villa", rate: 8500, status: "occupied", guest: "Mr. & Mrs. Silva", phone: "070 333 2211", checkin: "2026-08-09", checkout: "2026-08-12" },
    { name: "Barrel Villa", type: "Garden Villa", rate: 8500, status: "available" },
    { name: "Flow Villa", type: "Beachfront Villa", rate: 15000, status: "occupied", guest: "Nadeesha Fernando", phone: "076 812 4499", checkin: "2026-08-10", checkout: "2026-08-15" },
    { name: "Break Villa", type: "Beachfront Villa", rate: 15000, status: "available" },
  ],
  "Wilpattu": [
    { name: "Balcony Villa", type: "Forest Chalet", rate: 9500, status: "occupied", guest: "Ruwan Jayasuriya", phone: "077 654 3210", checkin: "2026-08-10", checkout: "2026-08-12" },
    { name: "Pool Villa 1", type: "Forest Chalet", rate: 9500, status: "available" },
    { name: "Pool Villa 2", type: "Safari Chalet", rate: 10500, status: "occupied", guest: "Mr. & Mrs. Bandara", phone: "070 222 4455", checkin: "2026-08-11", checkout: "2026-08-13" },
    { name: "A Type Villa", type: "Riverside Chalet", rate: 12000, status: "occupied", guest: "Ishara Wickramasinghe", phone: "076 345 6789", checkin: "2026-08-10", checkout: "2026-08-15" },
  ],
};

export const ROOM_STATUS_LABELS = { available: "Available", occupied: "Occupied" };

// Every check-in and check-out appends here — a manager-facing audit trail
// of guest movement, separate from the live ROOMS_BY_BRANCH snapshot above.
let nextRoomActivityId = 100;
export const ROOM_ACTIVITY_LOG = [
  { id: 1, branch: "Wilpattu", villa: "Pool Villa 1", guest: "Sanduni Rathnayake", action: "Check In", datetime: "2026-06-25T13:40:00" },
  { id: 2, branch: "Wilpattu", villa: "Pool Villa 1", guest: "Sanduni Rathnayake", action: "Check Out", datetime: "2026-06-28T11:15:00" },
  { id: 3, branch: "Arugam Bay", villa: "Break Villa", guest: "Robert Johnson", action: "Check In", datetime: "2026-07-01T14:05:00" },
  { id: 4, branch: "Arugam Bay", villa: "Break Villa", guest: "Robert Johnson", action: "Check Out", datetime: "2026-07-05T10:50:00" },
  { id: 5, branch: "Arugam Bay", villa: "Swell Villa", guest: "Emma Watson", action: "Check In", datetime: "2026-07-08T13:20:00" },
  { id: 6, branch: "Arugam Bay", villa: "Swell Villa", guest: "Emma Watson", action: "Check Out", datetime: "2026-07-12T11:30:00" },
  { id: 7, branch: "Arugam Bay", villa: "Zenith Villa", guest: "Kasun Perera", action: "Check In", datetime: "2026-08-10T14:15:00" },
  { id: 8, branch: "Arugam Bay", villa: "Tide Villa", guest: "Mr. & Mrs. Silva", action: "Check In", datetime: "2026-08-09T15:05:00" },
  { id: 9, branch: "Arugam Bay", villa: "Flow Villa", guest: "Nadeesha Fernando", action: "Check In", datetime: "2026-08-10T13:50:00" },
  { id: 10, branch: "Wilpattu", villa: "Balcony Villa", guest: "Ruwan Jayasuriya", action: "Check In", datetime: "2026-08-10T14:30:00" },
  { id: 11, branch: "Wilpattu", villa: "A Type Villa", guest: "Ishara Wickramasinghe", action: "Check In", datetime: "2026-08-10T12:45:00" },
  { id: 12, branch: "Wilpattu", villa: "Pool Villa 2", guest: "Mr. & Mrs. Bandara", action: "Check In", datetime: "2026-08-11T14:00:00" },
];
export function logRoomActivity(branch, villa, guest, action) {
  ROOM_ACTIVITY_LOG.push({ id: nextRoomActivityId++, branch, villa, guest, action, datetime: new Date().toISOString() });
}
