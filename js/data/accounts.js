import { add, COLLECTIONS } from "./store.js";
// Sign-in is Firebase Auth, and what someone may do comes from their
// users/{uid} document — so there are no credentials here any more. This
// file keeps only the record of who signed in and when, which is a
// manager-facing audit trail.

// Every successful login appends here — a manager-facing audit trail of
// who signed in, in what role, and when. branch is null for managers
// (they aren't locked to one) and shows as "All Branches" in the UI.
let nextLoginLogId = 1;
export const LOGIN_LOG = [];
export function logLogin(username, role, branch) {
  add(COLLECTIONS.LOGINS, LOGIN_LOG, { id: nextLoginLogId++, username, role, branch: branch || null, datetime: new Date().toISOString() });
}
