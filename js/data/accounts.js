// Staff login accounts — client-side gate only (no backend), just keeps
// casual visitors out. Credentials live in this file, in plain view, so
// treat it as a light deterrent, not real security.
export const ACCOUNTS = [
  { username: "ashen", password: "1234", role: "manager", branch: null },
  { username: "staff", password: "1234", role: "staff", branch: "Wilpattu" },
  { username: "chamara", password: "1234", role: "staff", branch: "Arugam Bay" },
];

// Every successful login appends here — a manager-facing audit trail of
// who signed in, in what role, and when. branch is null for managers
// (they aren't locked to one) and shows as "All Branches" in the UI.
let nextLoginLogId = 100;
export const LOGIN_LOG = [
  { id: 1, username: "ashen", role: "manager", branch: null, datetime: "2026-08-10T08:12:00" },
  { id: 2, username: "staff", role: "staff", branch: "Wilpattu", datetime: "2026-08-10T09:05:00" },
  { id: 3, username: "chamara", role: "staff", branch: "Arugam Bay", datetime: "2026-08-10T09:20:00" },
  { id: 4, username: "staff", role: "staff", branch: "Wilpattu", datetime: "2026-08-11T08:47:00" },
  { id: 5, username: "ashen", role: "manager", branch: null, datetime: "2026-08-12T07:58:00" },
  { id: 6, username: "chamara", role: "staff", branch: "Arugam Bay", datetime: "2026-08-12T09:10:00" },
  { id: 7, username: "staff", role: "staff", branch: "Wilpattu", datetime: "2026-08-13T09:12:00" },
  { id: 8, username: "ashen", role: "manager", branch: null, datetime: "2026-08-14T08:03:00" },
];
export function logLogin(username, role, branch) {
  LOGIN_LOG.push({ id: nextLoginLogId++, username, role, branch: branch || null, datetime: new Date().toISOString() });
}
