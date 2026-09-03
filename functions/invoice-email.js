const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");

// The guest's bill, with the invoice PDF attached.
//
// Attached, deliberately, and NOT served at a public link. A link was
// built and withdrawn: an unguessable URL is genuinely unguessable, but
// it is also permanent, forwardable, and carries the guest's name, phone
// and charges to anyone who ends up holding it. An attachment reaches
// exactly the address reception typed and nowhere else. If a link is ever
// wanted, it needs an expiry and a decision about what happens to bills
// already sent — neither of which a token in a URL gives you.
//
// The PDF arrives on the row, built on the device that raised the invoice.
// Nothing is rendered here on purpose: an invoice must be the document the
// guest was handed at the desk, and a second renderer on the server would
// be free to disagree with the first — the same mistake as the app menu
// and the printed menu. This function attaches bytes; it does not compose
// a financial document.

const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");
const GMAIL_USER = "leopardinnvillas@gmail.com";

const BRANCH_LABELS = {
  "Wilpattu": "Leopard Inn Wilpattu",
  "Arugam Bay": "Leopard Inn Arugam Bay",
};

const BRANCH_PHONES = {
  "Wilpattu": "+94 740 559 024",
  "Arugam Bay": "+94 740 559 024",
};

// Gmail refuses a message over 25MB. A one-page bill is about 17KB of
// base64, so this only ever trips on a corrupted or absurd payload — but
// an oversized attachment fails the send with a message about SMTP rather
// than about the invoice, which is a bad hour for whoever has to work out
// why a guest never got their bill.
const MAX_PDF_BASE64 = 8 * 1024 * 1024;

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function money(value, currency) {
  const n = Number(value);
  return `${currency || "LKR"} ${Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}`;
}

function buildHtml(row) {
  const label = BRANCH_LABELS[row.branch] || "Leopard Inn";
  const phone = BRANCH_PHONES[row.branch] || "";
  const first = String(row.guestName || "").trim().split(/\s+/)[0] || "there";

  // An interim bill is a running total mid-stay. Thanking somebody for
  // their stay while they are still in the villa reads as being shown the
  // door.
  const closing = row.interim
    ? "Nothing is due yet — this is just where your bill stands so far."
    : "Thank you for staying with us. We hope to welcome you back.";

  return `<!doctype html>
<html><body style="margin:0;padding:24px;font-family:Georgia,'Times New Roman',serif;color:#2b2b2b;line-height:1.5">
  <p>Dear ${escapeHtml(first)},</p>
  <p>${row.interim ? "Your bill so far" : "Your invoice"} ${escapeHtml(row.invoiceNo || "")} is attached, for ${escapeHtml(money(row.grandTotal, row.currency))}.</p>
  <p>${escapeHtml(closing)}</p>
  ${phone ? `<p>Any question about this bill, just call reception on ${escapeHtml(phone)}.</p>` : ""}
  <p>${escapeHtml(label)}</p>
</body></html>`;
}

exports.sendInvoiceEmail = onDocumentCreated(
  { document: "invoiceEmails/{id}", secrets: [GMAIL_APP_PASSWORD], region: "asia-south1" },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const row = snap.data();

    // "No e-mail" is a recorded outcome, not a failure — the guest gave no
    // address, or reception ticked the box saying so at check-in.
    if (row.status !== "Queued" || !row.email) {
      logger.info("Nothing to send", { id: event.params.id, status: row.status });
      return;
    }

    if (!row.pdf) {
      // Sending a bill that says "the breakdown is attached" with nothing
      // attached is worse than not sending: the guest has to ask for it,
      // and reception has no idea anything went wrong.
      const message = "No PDF on the row — nothing to attach";
      await snap.ref.update({ status: "Failed", error: message });
      logger.error("Invoice e-mail has no attachment", { id: event.params.id });
      return;
    }
    if (row.pdf.length > MAX_PDF_BASE64) {
      const message = `Attachment too large (${Math.round(row.pdf.length / 1024)}KB)`;
      await snap.ref.update({ status: "Failed", error: message });
      logger.error("Invoice PDF too large to send", { id: event.params.id, bytes: row.pdf.length });
      return;
    }

    const transport = nodemailer.createTransport({
      service: "gmail",
      // Every space stripped, for the reason given in index.js — Google
      // displays an App Password in groups of four and that is what gets
      // copied.
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD.value().replace(/\s+/g, "") },
    });

    const label = BRANCH_LABELS[row.branch] || "Leopard Inn";
    // A filename cannot hold the slash a financial year carries, and the
    // guest sees this name in their inbox.
    const fileName = `LeopardInn-${String(row.invoiceNo || "invoice").replace(/[/\\]+/g, "-")}.pdf`;

    try {
      await transport.sendMail({
        from: `"${label}" <${GMAIL_USER}>`,
        to: row.email,
        subject: row.interim
          ? `Your bill so far — ${label}`
          : `Your invoice ${row.invoiceNo || ""} — ${label}`,
        html: buildHtml(row),
        attachments: [{ filename: fileName, content: row.pdf, encoding: "base64", contentType: "application/pdf" }],
      });
      await snap.ref.update({ status: "Sent", sentAt: new Date().toISOString(), error: "" });
      logger.info("Invoice e-mail sent", {
        id: event.params.id, branch: row.branch, invoice: row.invoiceNo, pdfBytes: row.pdf.length,
      });
    } catch (err) {
      // Recorded on the row, never thrown away — a guest who says they
      // never got their bill needs an answer, and "it bounced, here is
      // why" is one.
      const message = String((err && err.message) || err).slice(0, 300);
      await snap.ref.update({ status: "Failed", error: message });
      logger.error("Invoice e-mail failed", { id: event.params.id, error: message });
    }
  }
);
