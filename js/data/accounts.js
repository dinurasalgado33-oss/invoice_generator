import { add, COLLECTIONS } from "./store.js";
// Staff login accounts — client-side gate only (no backend), just keeps
// casual visitors out. Credentials live in this file, in plain view, so
// treat it as a light deterrent, not real security.
// displayName is what gets printed when the app signs a document on this
// person's behalf — "staffw" is a login, not a name a guest should see on
// their invoice.
export const ACCOUNTS = [
  { username: "ashen", password: "1234", role: "manager", branch: null, displayName: "Ashen" },
  { username: "staffw", password: "1234", role: "staff", branch: "Wilpattu", displayName: "Wilpattu Reception" },
  { username: "staffa", password: "1234", role: "staff", branch: "Arugam Bay", displayName: "Arugam Bay Reception" },
];

// Every successful login appends here — a manager-facing audit trail of
// who signed in, in what role, and when. branch is null for managers
// (they aren't locked to one) and shows as "All Branches" in the UI.
let nextLoginLogId = 1;
export const LOGIN_LOG = [];
export function logLogin(username, role, branch) {
  add(COLLECTIONS.LOGINS, LOGIN_LOG, { id: nextLoginLogId++, username, role, branch: branch || null, datetime: new Date().toISOString() });
}
