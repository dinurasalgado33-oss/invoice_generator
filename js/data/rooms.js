// Room map — mock data for now; the launch card only lights up for
// branches with data wired in. Swap ROOMS_BY_BRANCH for a real data
// source later without touching the rendering/UI code.
//
// status: "available" (free) | "booked" (upcoming reservation, guest not
// yet on-site) | "occupied" (guest checked in). rate = LKR per night,
// used to auto-calculate the room charge at checkout.
export const ROOMS_BY_BRANCH = {
  "Arugam Bay": [
    { name: "Ocean Pool Villa 01", type: "Pool Villa", rate: 11500, status: "occupied", guest: "Kasun Perera", phone: "077 221 8511", checkin: "2026-08-10", checkout: "2026-08-13" },
    { name: "Ocean Pool Villa 02", type: "Pool Villa", rate: 11500, status: "available" },
    { name: "Ocean Pool Villa 03", type: "Pool Villa", rate: 11500, status: "booked", guest: "Amanda Lee", phone: "071 456 7890", checkin: "2026-08-14", checkout: "2026-08-17" },
    { name: "Garden Villa 04", type: "Garden Villa", rate: 8500, status: "available" },
    { name: "Garden Villa 05", type: "Garden Villa", rate: 8500, status: "occupied", guest: "Mr. & Mrs. Silva", phone: "070 333 2211", checkin: "2026-08-09", checkout: "2026-08-12" },
    { name: "Garden Villa 06", type: "Garden Villa", rate: 8500, status: "booked", guest: "Priya Nair", phone: "072 555 1234", checkin: "2026-08-15", checkout: "2026-08-18" },
    { name: "Beachfront Villa 07", type: "Beachfront Villa", rate: 15000, status: "occupied", guest: "Nadeesha Fernando", phone: "076 812 4499", checkin: "2026-08-10", checkout: "2026-08-15" },
    { name: "Beachfront Villa 08", type: "Beachfront Villa", rate: 15000, status: "available" },
    { name: "Beachfront Villa 09", type: "Beachfront Villa", rate: 15000, status: "booked", guest: "John Smith", phone: "+44 7911 123456", checkin: "2026-08-12", checkout: "2026-08-13" },
  ],
  "Wilpattu": [
    { name: "Forest Villa 1", type: "Forest Chalet", rate: 9500, status: "occupied", guest: "Ruwan Jayasuriya", phone: "077 654 3210", checkin: "2026-08-10", checkout: "2026-08-12" },
    { name: "Forest Villa 2", type: "Forest Chalet", rate: 9500, status: "available" },
    { name: "Forest Villa 3", type: "Forest Chalet", rate: 9500, status: "booked", guest: "Chathurika Fernando", phone: "071 987 6543", checkin: "2026-08-14", checkout: "2026-08-19" },
    { name: "Forest Villa 4", type: "Safari Chalet", rate: 10500, status: "available" },
    { name: "Forest Villa 5", type: "Safari Chalet", rate: 10500, status: "occupied", guest: "Mr. & Mrs. Bandara", phone: "070 222 4455", checkin: "2026-08-11", checkout: "2026-08-13" },
    { name: "Forest Villa 6", type: "Safari Chalet", rate: 10500, status: "booked", guest: "Tharindu Perera", phone: "076 999 8877", checkin: "2026-08-16", checkout: "2026-08-18" },
    { name: "Forest Villa 7", type: "Riverside Chalet", rate: 12000, status: "occupied", guest: "Ishara Wickramasinghe", phone: "076 345 6789", checkin: "2026-08-10", checkout: "2026-08-15" },
    { name: "Forest Villa 8", type: "Riverside Chalet", rate: 12000, status: "available" },
    { name: "Forest Villa 9", type: "Riverside Chalet", rate: 12000, status: "booked", guest: "David Miller", phone: "+1 415 555 0182", checkin: "2026-08-12", checkout: "2026-08-14" },
  ],
};

export const ROOM_STATUS_LABELS = { available: "Available", booked: "Booked", occupied: "Occupied" };
