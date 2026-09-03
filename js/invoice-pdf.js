import { showToast } from "./utils.js";

// The invoice as a PDF — the *same* invoice, not a second drawing of it.
//
// This used to redraw the bill with jsPDF: a hand-built letterhead, hand
// placed columns, hand-positioned totals. It was tidy and it was wrong.
// It had no logo, no watermark, none of the maroon banding, and it drifted
// from the document on screen the moment either changed. Two renderers of
// one financial document is the same mistake as the app menu and the
// printed menu, and it looked it.
//
// So nothing is drawn here. `#invoice-preview` — the element staff read,
// print and hand across the desk — is photographed and placed on an A4
// page. What the guest receives is what reception is looking at, by
// construction rather than by agreement.
//
// The trade is real and worth stating: the page is an image, so its text
// cannot be selected or searched, and the file is about 250KB rather than
// 13KB. For a document whose job is to be an exact record of what was
// charged, being exact matters more than being small or searchable.

// A4 at 96dpi. The capture is forced to this width rather than whatever
// the device happens to be, because a bill photographed on a 375px phone
// and the same bill photographed on a tablet would otherwise be two
// different documents. The invoice is an A4 document; it is captured as
// one, everywhere.
const PRINT_WIDTH_PX = 794;

// Twice the pixels, so the type is sharp when the page is printed rather
// than only when it is read on a screen.
const CAPTURE_SCALE = 2;

const PAGE_MARGIN_MM = 10;

export function isPdfAvailable() {
  return typeof window !== "undefined"
    && window.jspdf && typeof window.jspdf.jsPDF === "function"
    && typeof html2canvas === "function";
}

export function invoiceFileName(r) {
  // A financial year carries a slash and a filename cannot.
  const no = String((r && r.id) || "invoice").replace(/[/\\]+/g, "-");
  return `LeopardInn-${no}.pdf`;
}

// Photographs the invoice at print width and hands back the canvas.
//
// `windowWidth` makes html2canvas lay the clone out in an off-screen frame
// of that width. The visible page is never touched, which matters more
// than it sounds: the first attempt forced the real page to 794px, waited
// for a reflow, captured, and put it back in a `finally`. It hung — a
// 794px reflow inside a narrow window blocked the renderer synchronously,
// so the `finally` never ran and the app was left stretched to twice the
// screen. Rendering into the clone has none of that: nothing to restore,
// nothing to leave broken if it fails, and the guest's phone-sized screen
// still produces an A4-sized document.
async function captureInvoice() {
  const node = document.getElementById("invoice-preview");
  if (!node) throw new Error("The invoice is not on screen");

  // The swipe hint belongs to the screen, not to the document. Hidden on
  // the clone rather than the page, so nothing flickers under reception.
  return html2canvas(node, {
    scale: CAPTURE_SCALE,
    backgroundColor: "#ffffff",
    useCORS: true,
    windowWidth: PRINT_WIDTH_PX,
    windowHeight: 1400,
    onclone: (doc) => {
      const hint = doc.querySelector("#invoice-preview .scroll-hint");
      if (hint) hint.style.visibility = "hidden";
    },
  });
}

// Places the capture on A4, continuing onto further pages if the bill is
// long. A guest with thirty charge lines gets page two rather than a
// squashed page one.
export async function buildInvoicePdf() {
  if (!isPdfAvailable()) throw new Error("PDF tools are not loaded");
  const canvas = await captureInvoice();

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const drawW = pageW - PAGE_MARGIN_MM * 2;
  const drawH = canvas.height * drawW / canvas.width;
  const usableH = pageH - PAGE_MARGIN_MM * 2;

  // PNG, not JPEG. The invoice is text on white, where JPEG's ringing
  // shows around every character — on a document somebody may have to
  // read a figure off.
  const image = canvas.toDataURL("image/png");

  let remaining = drawH;
  let offset = 0;
  while (remaining > 0.5) {
    if (offset > 0) pdf.addPage();
    // The image is placed shifted upward and the page clips it, which is
    // the standard way to paginate a single tall capture.
    pdf.addImage(image, "PNG", PAGE_MARGIN_MM, PAGE_MARGIN_MM - offset, drawW, drawH, undefined, "FAST");
    remaining -= usableH;
    offset += usableH;
  }

  return pdf;
}

// The bytes, for the e-mail. Async now — the capture is.
export async function invoicePdfBase64() {
  const pdf = await buildInvoicePdf();
  return pdf.output("datauristring").split(",")[1];
}

export async function downloadInvoicePdf(record) {
  const pdf = await buildInvoicePdf();
  pdf.save(invoiceFileName(record));
}

// Shared by the button and the e-mail so the failure reads the same way
// in both places. Returns null rather than throwing: a bill that exists
// but could not be turned into a PDF is a small problem; a checkout that
// will not finish is a guest standing at the desk.
export async function tryInvoicePdfBase64() {
  if (!isPdfAvailable()) return null;
  try {
    return await invoicePdfBase64();
  } catch (err) {
    console.error("Invoice PDF failed:", err);
    showToast("Couldn't build the invoice PDF — the bill is saved, use Print");
    return null;
  }
}
