// Server-side jobs. This is the only code in the project that holds a
// secret, and the only reason it exists: the app is public, its source is
// readable by anyone, and an e-mail password in it would be a password
// anyone could read.
//
// Runs on Node, not in the browser, and is therefore the one place in this
// repo where the no-build-step rule does not apply — a separate runtime
// with its own package.json, as BACKEND-PLAN.md anticipated.

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// The nightly Google Sheet mirror lives in its own file — a different job
// with a different trigger, sharing only the admin app initialised above.
exports.mirrorToSheet = require("./sheets-mirror").mirrorToSheet;

// Account management, which the app cannot do itself: users/{uid} is
// unwritable by the rules on purpose, so this runs with the Admin SDK.
exports.manageStaff = require("./staff").manageStaff;

// The guest's bill, with the invoice PDF attached. Its own file because it
// is a different trigger on a different collection, sharing only the
// transport and the secret.
exports.sendInvoiceEmail = require("./invoice-email").sendInvoiceEmail;

// Set with:  firebase functions:secrets:set GMAIL_APP_PASSWORD --project live
// Never committed, never printed, never in the client bundle.
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

// Gmail was chosen over a transactional provider deliberately: it sends
// as the hotel's own address without owning a domain. The trade is real —
// Gmail rate-limits automated sending and is likelier to be filtered as
// spam — so failures are recorded on the row rather than swallowed, and
// Guest History shows the status per stay.
const GMAIL_USER = "leopardinnvillas@gmail.com";

const BRANCH_LABELS = {
  "Wilpattu": "Leopard Inn Wilpattu",
  "Arugam Bay": "Leopard Inn Arugam Bay",
};

const BRANCH_PHONES = {
  "Wilpattu": "+94 740 559 024",
  "Arugam Bay": "+94 740 559 024",
};

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}


function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : "";
}

// Where the guest reads the menu.
//
// A link, not the menu itself. The e-mail used to carry every dish inline
// — 30KB of table markup — which worked but is not what a welcome should
// be. A guest wants a greeting and a way in; the menu is a document they
// open when they are hungry, and it lives at one address that is always
// current.
const SITE = "https://leopard-inn.web.app";

function menuLink(branch) {
  return SITE + "/menu.html?branch=" + encodeURIComponent(branch || "");
}

function buildHtml(row) {
  const label = BRANCH_LABELS[row.branch] || "Leopard Inn";
  const phone = BRANCH_PHONES[row.branch] || "";
  const first = String(row.guestName || "").trim().split(/\s+/)[0] || "there";

  return `<!doctype html>
<html><body style="margin:0;padding:24px;font-family:Georgia,'Times New Roman',serif;color:#2b2b2b;line-height:1.5">
  <p>Dear ${escapeHtml(first)},</p>
  <p>Welcome to ${escapeHtml(label)}. We hope you have a comfortable stay.</p>
  <p>Our menu is here, and you are welcome to order to your villa at any time:<br />
    <a href="${menuLink(row.branch)}">View the menu</a></p>
  ${phone ? `<p>Anything at all, just call reception on ${escapeHtml(phone)}.</p>` : ""}
  <p>${escapeHtml(label)}</p>
</body></html>`;
}

exports.sendWelcomeEmail = onDocumentCreated(
  { document: "guestEmails/{id}", secrets: [GMAIL_APP_PASSWORD], region: "asia-south1" },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const row = snap.data();

    // "No e-mail" is a recorded outcome, not a failure — the guest simply
    // did not give an address, and reception ticked the box saying so.
    if (row.status !== "Queued" || !row.email) {
      logger.info("Nothing to send", { id: event.params.id, status: row.status });
      return;
    }

    const transport = nodemailer.createTransport({
      service: "gmail",
      // Every space stripped, not merely trimmed. Google *displays* an
      // App Password as four groups of four ("abcd efgh ijkl mnop") and
      // that is what gets copied; a value set from a file on Windows also
      // carries a trailing CR LF. Either one is sent to Gmail verbatim and
      // comes back as "Username and Password not accepted", which reads
      // like a wrong password and is not. The same shape of bug already
      // cost a session on SHEET_ID — a secret is text somebody pasted,
      // and it must be normalised at the point of use.
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD.value().replace(/\s+/g, "") },
    });

    const label = BRANCH_LABELS[row.branch] || "Leopard Inn";

    try {
      await transport.sendMail({
        from: `"${label}" <${GMAIL_USER}>`,
        to: row.email,
        subject: `Welcome to ${label}`,
        html: buildHtml(row),
      });
      await snap.ref.update({ status: "Sent", sentAt: new Date().toISOString(), error: "" });
      logger.info("Welcome e-mail sent", { id: event.params.id, branch: row.branch });
    } catch (err) {
      // Recorded on the row, never thrown away. A bounce that vanishes is
      // one nobody finds out about until the guest mentions it at the
      // desk — which is exactly what the status pill in Guest History
      // exists to prevent.
      const message = String((err && err.message) || err).slice(0, 300);
      await snap.ref.update({ status: "Failed", error: message });
      logger.error("Welcome e-mail failed", { id: event.params.id, error: message });
    }
  }
);
