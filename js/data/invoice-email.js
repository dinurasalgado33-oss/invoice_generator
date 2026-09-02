import { newId } from "./ids.js";
import { add, COLLECTIONS } from "./store.js";
import { EMAIL_STATUS, emailForBooking } from "./guest-email.js";

// The guest's bill, e-mailed when they check out, with the invoice PDF
// attached.
//
// The PDF is built on the device and carried on the row, which is the
// opposite of how the welcome e-mail works — that one is composed on the
// server from live data. The difference is deliberate. A welcome should
// carry today's menu; an invoice must carry the figures the guest was
// handed at the desk, and nothing else. Re-rendering it on the server
// later, from config that may have moved, would be a second version of a
// financial document.
//
// So the bytes travel with the row. About 17KB of base64 for a one-page
// bill — jsPDF subsets the font — against Firestore's 1MB document limit,
// which is 60x more room than this needs. Carrying them in Firestore
// rather than Storage also means the whole thing inherits offline-first
// for free: a checkout with no signal queues the row, PDF included, and
// it sends when the phone reconnects. See [[backend-decisions]].

export const INVOICE_EMAIL_QUEUE = [];

// The status vocabulary is shared with the welcome e-mail so Guest History
// can show both with one set of pills, and so "Failed" means the same
// thing in both places.
export { EMAIL_STATUS };

// Where to send the bill: the address reception typed on the registration
// card at check-in, reached through the welcome-e-mail row for the same
// booking.
//
// Deliberately not a second address field on the checkout form. One guest
// has one address, and asking for it twice is how a guest ends up with a
// welcome at one and a bill at another — with nothing to say which is
// right. If they ticked "no e-mail" at check-in, that answer stands here
// too.
export function addressForBooking(bookingId) {
  const welcome = bookingId ? emailForBooking(bookingId) : null;
  return welcome && welcome.email ? welcome.email : "";
}

// Called after an invoice is raised. Returns the queued row, or a skipped
// one when there is no address — a skip is recorded rather than left
// blank, so "why did this guest get no bill" always has an answer.
export function queueInvoiceEmail({ invoice, pdfBase64, bookingId }) {
  const email = addressForBooking(bookingId);
  const row = {
    id: newId(),
    invoiceId: invoice.id,
    invoiceNo: invoice.id,
    bookingId: bookingId || null,
    branch: invoice.branch,
    guestName: invoice.guest || "",
    email,
    currency: invoice.currency || "LKR",
    grandTotal: invoice.grandTotal,
    // An interim bill is a running total mid-stay, not the final word, so
    // it is marked — the guest should not read it as "you are done".
    interim: Boolean(invoice.interim),
    status: email && pdfBase64 ? EMAIL_STATUS.QUEUED : EMAIL_STATUS.SKIPPED,
    pdf: pdfBase64 || "",
    queuedAt: new Date().toISOString(),
    sentAt: null,
    error: "",
  };
  add(COLLECTIONS.INVOICE_EMAILS, INVOICE_EMAIL_QUEUE, row);
  return row;
}

export function invoiceEmailFor(invoiceId) {
  // Latest first: a re-send adds a row rather than overwriting one, so the
  // history of what was sent stays intact.
  for (let i = INVOICE_EMAIL_QUEUE.length - 1; i >= 0; i--) {
    if (INVOICE_EMAIL_QUEUE[i].invoiceId === invoiceId) return INVOICE_EMAIL_QUEUE[i];
  }
  return null;
}
