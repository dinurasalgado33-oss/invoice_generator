import { formatDate, fmt } from "./utils.js";
import { BRANCH_INFO } from "./data/branches.js";
import { invoiceRemark } from "./data/charges.js";
import { CINZEL_REGULAR_B64 } from "./data/font-cinzel.js";

// The invoice as a file.
//
// Until now an invoice could be printed (the browser's own dialog) or
// saved as a PNG. Neither gives the app a *file* it can hand to anything
// else, which is why the guest's copy could not be attached to an e-mail.
//
// One builder, used by the download button and by the e-mail. That is the
// point rather than a convenience: "the same invoice the guest was handed"
// is only true if it is literally the same bytes from the same code, and
// a second renderer on the server would be the printed menu and the app
// menu all over again.
//
// Values come from the stored record and are never recomputed here — the
// figures are what the guest paid. The letterhead comes from current
// branch config, matching renderInvoicePreview(): if the hotel's phone
// number changes, a reprint should carry the number that works today.

const MARGIN = 16;
const PAGE_W = 210;
const PAGE_H = 297;
const RIGHT = PAGE_W - MARGIN;
const MAROON = [74, 14, 28];
const GOLD = [160, 138, 82];
const INK = [43, 24, 16];
const MUTED = [125, 106, 92];
const RULE = [230, 220, 200];

function available() {
  return typeof window !== "undefined" && window.jspdf && typeof window.jspdf.jsPDF === "function";
}

// Cinzel for the hotel's name and the headings, matching the menus and the
// printed stationery. jsPDF subsets it, so embedding costs about 9KB
// rather than the 125KB the whole face would.
function withFonts(pdf) {
  pdf.addFileToVFS("Cinzel-Regular.ttf", CINZEL_REGULAR_B64);
  pdf.addFont("Cinzel-Regular.ttf", "Cinzel", "normal");
  return pdf;
}

function setFont(pdf, family, style, size, colour) {
  pdf.setFont(family, style);
  pdf.setFontSize(size);
  if (colour) pdf.setTextColor(colour[0], colour[1], colour[2]);
}

function rule(pdf, y, colour = RULE, width = 0.4) {
  pdf.setDrawColor(colour[0], colour[1], colour[2]);
  pdf.setLineWidth(width);
  pdf.line(MARGIN, y, RIGHT, y);
}

// A label on the left and its value on the right, the shape the guest
// block uses on the printed page.
function pair(pdf, y, label, value) {
  setFont(pdf, "helvetica", "normal", 9, MUTED);
  pdf.text(String(label), MARGIN, y);
  setFont(pdf, "helvetica", "bold", 9.5, INK);
  pdf.text(String(value == null || value === "" ? "-" : value), MARGIN + 42, y);
}

function money(pdf, y, label, value, opts = {}) {
  setFont(pdf, "helvetica", opts.bold ? "bold" : "normal", opts.bold ? 10.5 : 9.5, opts.bold ? MAROON : INK);
  pdf.text(String(label), RIGHT - 62, y);
  pdf.text(String(value), RIGHT, y, { align: "right" });
}

export function invoiceFileName(r) {
  // The document number, with the slash a financial year carries turned
  // into a dash — a filename cannot hold a path separator either.
  const no = String(r.id || "invoice").replace(/[/\\]+/g, "-");
  return `LeopardInn-${no}.pdf`;
}

// Builds the document and hands back the jsPDF instance.
export function buildInvoicePdf(r) {
  if (!available()) throw new Error("PDF library not loaded");
  const { jsPDF } = window.jspdf;
  const pdf = withFonts(new jsPDF({ unit: "mm", format: "a4", compress: true }));
  const branchInfo = BRANCH_INFO[r.branch] || {};
  const currency = r.currency || "LKR";

  // ---- Letterhead ----
  let y = 24;
  setFont(pdf, "Cinzel", "normal", 19, MAROON);
  pdf.text(branchInfo.hotelName || r.branch || "Leopard Inn", PAGE_W / 2, y, { align: "center" });

  y += 6;
  setFont(pdf, "helvetica", "normal", 8.5, MUTED);
  if (branchInfo.address) {
    pdf.text(String(branchInfo.address), PAGE_W / 2, y, { align: "center" });
    y += 4.5;
  }
  const contact = [
    branchInfo.phone ? `Tel ${branchInfo.phone}` : "",
    branchInfo.email ? `Email: ${branchInfo.email}` : "",
  ].filter(Boolean).join("   •   ");
  if (contact) {
    pdf.text(contact, PAGE_W / 2, y, { align: "center" });
    y += 4.5;
  }

  y += 2;
  rule(pdf, y, GOLD, 0.6);
  y += 9;

  // ---- A void invoice says so before anything else ----
  // The figures stay readable — the record has to remain readable — but
  // the document must not reprint as though it were still owed.
  if (r.status === "Void") {
    pdf.setFillColor(179, 65, 58);
    pdf.rect(MARGIN, y - 5.5, RIGHT - MARGIN, 9, "F");
    setFont(pdf, "helvetica", "bold", 11, [255, 255, 255]);
    pdf.text("VOID", MARGIN + 3, y + 0.6);
    const detail = [r.voidReason, r.voidedBy ? "voided by " + r.voidedBy : ""].filter(Boolean).join(" · ");
    if (detail) {
      setFont(pdf, "helvetica", "normal", 7.5, [255, 255, 255]);
      pdf.text(pdf.splitTextToSize(detail, RIGHT - MARGIN - 26)[0], MARGIN + 18, y + 0.6);
    }
    y += 10;
  }

  // ---- Number and date ----
  setFont(pdf, "helvetica", "bold", 11, MAROON);
  pdf.text(`INVOICE  ${r.id || ""}`, MARGIN, y);
  setFont(pdf, "helvetica", "normal", 9, MUTED);
  pdf.text(formatDate(r.date), RIGHT, y, { align: "right" });
  y += 8;

  // ---- Guest ----
  pair(pdf, y, "Guest Name", r.guest); y += 5.6;
  pair(pdf, y, "No of Guest", Number(r.guestCount) > 0 ? r.guestCount : "-"); y += 5.6;
  pair(pdf, y, "Contact No", r.guestPhone); y += 5.6;
  pair(pdf, y, "Reservation No", r.regCardNo || "N/A"); y += 5.6;
  pair(pdf, y, "Voucher No", r.voucherNo || "N/A"); y += 5.6;
  pair(pdf, y, "Check in Date", formatDate(r.checkinDate)); y += 5.6;
  pair(pdf, y, "Check out Date", formatDate(r.checkoutDate)); y += 9;

  // ---- Charges ----
  setFont(pdf, "Cinzel", "normal", 11, MAROON);
  pdf.text("List of Information", MARGIN, y);
  y += 5;

  const cols = [MARGIN, MARGIN + 12, MARGIN + 104, MARGIN + 126, RIGHT];
  pdf.setFillColor(248, 243, 234);
  pdf.rect(MARGIN, y - 4, RIGHT - MARGIN, 7, "F");
  setFont(pdf, "helvetica", "bold", 8.5, MAROON);
  pdf.text("#", cols[0] + 1.5, y);
  pdf.text("Description", cols[1], y);
  pdf.text("Qty", cols[2], y);
  pdf.text("Rate", cols[3] + 16, y, { align: "right" });
  pdf.text("Value", cols[4], y, { align: "right" });
  y += 6;

  const cash = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  setFont(pdf, "helvetica", "normal", 9, INK);
  (r.items || []).forEach(it => {
    // A long description wraps rather than running under the Qty column.
    const lines = pdf.splitTextToSize(String(it.desc || ""), 88);
    // A page break mid-invoice keeps the column headings with the rows
    // that follow, otherwise page two is five unlabelled numbers.
    if (y > PAGE_H - 70) {
      pdf.addPage();
      y = 24;
      setFont(pdf, "helvetica", "bold", 8.5, MAROON);
      pdf.text("Description", cols[1], y);
      pdf.text("Value", cols[4], y, { align: "right" });
      y += 6;
      setFont(pdf, "helvetica", "normal", 9, INK);
    }
    pdf.text(String(it.no ?? ""), cols[0] + 1.5, y);
    pdf.text(lines, cols[1], y);
    pdf.text(String(it.qty ?? ""), cols[2], y);
    pdf.text(it.rate ? cash(it.rate) : "", cols[3] + 16, y, { align: "right" });
    pdf.text(it.value ? cash(it.value) : "-", cols[4], y, { align: "right" });
    y += Math.max(5.4, lines.length * 4.6);
  });

  y += 2;
  rule(pdf, y);
  y += 7;

  // ---- Totals ----
  const totalsTop = y;
  money(pdf, y, `Bill Total (${currency})`, fmt(r.billTotal, currency)); y += 5.6;
  money(pdf, y, "Service Charge", fmt(r.serviceCharge, currency)); y += 5.6;
  money(pdf, y, "Gross Amount", fmt(r.grossAmount, currency)); y += 5.6;
  if (r.discount) {
    money(pdf, y, r.discountPercent ? `Discount (${r.discountPercent}%)` : "Discount", "-" + fmt(r.discount, currency));
    y += 5.6;
  }
  money(pdf, y, "Net Amount", fmt(r.total, currency)); y += 5.6;
  // A rate of zero means the hotel is not registered for VAT — printing
  // "VAT 0.00" would imply it is.
  if (Number(r.vatRate) > 0) {
    money(pdf, y, `VAT (${r.vatRate}%)`, fmt(r.vatAmount || 0, currency));
    y += 5.6;
  }
  money(pdf, y, "Advance Paid", r.advance ? fmt(r.advance, currency) : "-"); y += 7;
  rule(pdf, y - 4, GOLD, 0.5);
  money(pdf, y, "TOTAL", fmt(r.grandTotal, currency), { bold: true });

  // ---- Remark, beside the totals ----
  const remark = invoiceRemark(r.branch);
  if (remark) {
    setFont(pdf, "helvetica", "bold", 8, MUTED);
    pdf.text("Remark:", MARGIN, totalsTop);
    setFont(pdf, "helvetica", "normal", 8, MUTED);
    pdf.text(pdf.splitTextToSize(remark, 78), MARGIN, totalsTop + 4.5);
  }

  // ---- Signatures ----
  y = Math.max(y + 22, PAGE_H - 42);
  pdf.setDrawColor(RULE[0], RULE[1], RULE[2]);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, y, MARGIN + 58, y);
  pdf.line(RIGHT - 58, y, RIGHT, y);
  setFont(pdf, "helvetica", "normal", 8, MUTED);
  pdf.text("Guest Signature", MARGIN, y + 4.5);
  pdf.text("For " + (branchInfo.hotelName || "Leopard Inn"), RIGHT, y + 4.5, { align: "right" });
  if (r.staffName) pdf.text(String(r.staffName), RIGHT, y + 9, { align: "right" });

  return pdf;
}

// The bytes, for anything that has to carry the file somewhere.
export function invoicePdfBase64(r) {
  // `datauristring` prefixes the payload; the caller wants the payload.
  return buildInvoicePdf(r).output("datauristring").split(",")[1];
}

export function downloadInvoicePdf(r) {
  buildInvoicePdf(r).save(invoiceFileName(r));
}

export function isPdfAvailable() {
  return available();
}
