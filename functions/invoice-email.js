const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");

// The guest's bill, with the invoice PDF attached.
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

  // An interim bill is a running total mid-stay. Saying "thank you for
  // staying with us" against one would read as a goodbye to somebody who
  // has not left.
  const closing = row.interim
    ? "This is a running total for your stay so far — nothing is due yet."
    : "Thank you for staying with us. We hope to welcome you back.";

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#faf7f2;font-family:Georgia,'Times New Roman',serif;color:#2b2b2b">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <h1 style="margin:0 0 4px;font-size:22px;color:#4a0e1c">${escapeHtml(label)}</h1>
    <p style="margin:0 0 20px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#a08a52">${row.interim ? "Your bill so far" : "Your invoice"}</p>
    <p style="margin:0 0 12px">Dear ${escapeHtml(first)},</p>
    <p style="margin:0 0 12px">${row.interim ? "Here is your bill as it stands" : "Please find your invoice attached"}, ${escapeHtml(row.invoiceNo || "")}.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:18px 0">
      <tr>
        <td style="padding:10px 0;border-top:1px solid #e8dfc9;border-bottom:1px solid #e8dfc9;font-size:15px">Total</td>
        <td style="padding:10px 0;border-top:1px solid #e8dfc9;border-bottom:1px solid #e8dfc9;font-size:15px;text-align:right;color:#4a0e1c"><strong>${escapeHtml(money(row.grandTotal, row.currency))}</strong></td>
      </tr>
    </table>
    <p style="margin:0 0 12px;font-size:14px;color:#555">The full breakdown is in the attached PDF.</p>
    <p style="margin:16px 0 0">${escapeHtml(closing)}</p>
    ${phone ? `<p style="margin:16px 0 0;font-size:14px;color:#555">Any question about this bill, just call reception on ${escapeHtml(phone)}.</p>` : ""}
  </div>
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
