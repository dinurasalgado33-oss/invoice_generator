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

// Which menus a guest at this property should be given. Keyed to the
// documents menu-pdf.js builds, so adding a menu there adds it here.
const MENUS_BY_BRANCH = {
  "Arugam Bay": ["ab-main", "ab-cocktail"],
  "Wilpattu": ["wp-main", "wp-board"],
};

export function menusForBranch(branch) {
  return MENUS_BY_BRANCH[branch] || [];
}

// The message itself, composed here rather than on the server so the
// wording lives with the app the manager can see. The server fills in the
// menu links, which only it knows, and sends it.
export function composeWelcome({ guestName, branchLabel, checkoutDate, checkoutTime, phone, menus }) {
  const first = (guestName || "").trim().split(/\s+/)[0] || "there";
  return {
    subject: `Welcome to ${branchLabel}`,
    greeting: `Dear ${first},`,
    body: [
      `Thank you for choosing ${branchLabel}. We hope you have a comfortable stay.`,
      "Our menu is below — you're welcome to order to your villa at any time.",
    ],
    menus,
    footer: [
      checkoutDate ? `Check-out is at ${checkoutTime || "11.00am"} on ${checkoutDate}.` : "",
      phone ? `Anything at all, just call reception on ${phone}.` : "",
    ].filter(Boolean),
  };
}

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
    menus: menusForBranch(branch),
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
