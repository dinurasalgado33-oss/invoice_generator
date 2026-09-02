import { newId } from "./ids.js";
import { add, COLLECTIONS } from "./store.js";
// The welcome e-mail a guest gets when they check in — the menus for the
// property they are staying at, plus the few things they ask reception in
// the first hour anyway.
//
// Nothing here sends anything. A browser cannot send e-mail, and it must
// not try: any API key it held would be readable by anyone who opened the
// page, and mail would go out as the hotel. So check-in *queues* the send
// and a server drains the queue.
//
// Queuing rather than sending also happens to be what offline-first needs:
// a guest checked in with no signal has their welcome waiting, and it goes
// when the phone reconnects. See [[backend-decisions]].

export const EMAIL_STATUS = {
  QUEUED: "Queued",
  SENT: "Sent",
  FAILED: "Failed",
  SKIPPED: "No e-mail",
};

// One row per welcome e-mail owed. The server marks each one sent or
// failed; nothing is ever removed, so a bounce is still visible weeks
// later when the guest says they never got it.
export const GUEST_EMAIL_QUEUE = [];

// A UUID, not a counter. Two devices offline would both have handed out
// the same number, and every lookup joining on it would then match two
// different records — one guest's bill quietly containing another's
// charges. See [[backend-decisions]].
export function allocateGuestEmailId() {
  return newId();
}

// The wording of the e-mail lives in `functions/index.js`, next to the
// code that sends it — not here.
//
// There used to be a composeWelcome() in this file whose comment claimed
// the opposite: that the wording lived with the app "so the manager can
// see it", and the server only filled in the links. Nothing called it.
// Editing it changed no e-mail anybody ever received, and the real text
// sat on the server all along. Two homes for one message, and the one
// that looked authoritative was the dead one.
//
// The list of menu PDFs that used to be stamped on each row is gone for
// the same reason. The e-mail now carries the property's menu itself,
// read from Firestore at the moment of sending, so there is nothing to
// name and nothing to keep in step.

// Called at check-in. Returns the queued row, or a skipped one when the
// guest genuinely has no address — a skip is recorded rather than left
// blank, so "why did this guest get nothing" always has an answer.
export function queueWelcomeEmail({ bookingId, grcNo, branch, guestName, email, noEmail }) {
  const row = {
    id: allocateGuestEmailId(),
    bookingId,
    grcNo,
    branch,
    guestName,
    email: (email || "").trim(),
    status: noEmail || !email ? EMAIL_STATUS.SKIPPED : EMAIL_STATUS.QUEUED,
    queuedAt: new Date().toISOString(),
    sentAt: null,
    error: "",
  };
  add(COLLECTIONS.GUEST_EMAILS, GUEST_EMAIL_QUEUE, row);
  return row;
}

export function emailForBooking(bookingId) {
  // Latest first: a re-send would add a row rather than overwrite one.
  for (let i = GUEST_EMAIL_QUEUE.length - 1; i >= 0; i--) {
    if (GUEST_EMAIL_QUEUE[i].bookingId === bookingId) return GUEST_EMAIL_QUEUE[i];
  }
  return null;
}
