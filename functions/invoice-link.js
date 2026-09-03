const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// The guest's invoice at a link.
//
// Serves the PDF that is already stored on the invoiceEmails row — the
// same bytes that were attached to their e-mail and the same bytes the
// Download PDF button produces. Nothing is rendered here.
//
// That is the whole design. "Identical to the invoice we already have"
// cannot be achieved by a second renderer agreeing with the first; it is
// achieved by there being no second renderer. A guest opening this link
// and a manager pressing Download are looking at one file.
//
// The URL is a capability: whoever holds it may read that invoice, and
// nobody signs in. The token is the row's UUID — 122 bits of randomness,
// which is not guessable and not enumerable. This is the same protection
// a hotel relies on when it e-mails a receipt link, and it is a real
// trade: an invoice carries the guest's name, phone and charges, so a
// forwarded link forwards those too.

const REGION = "asia-south1";

// A token is a UUID and nothing else. Checked before it ever reaches a
// query, so a malformed path cannot become a scan of the collection.
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(res) {
  // Deliberately the same answer for "no such invoice", "bad token" and
  // "row carries no PDF". Distinguishing them would tell someone probing
  // which tokens are real.
  res.status(404).type("text/plain").send("Not found.");
}

exports.invoicePdf = onRequest({ region: REGION, cors: false }, async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.set("Allow", "GET, HEAD");
    return res.status(405).type("text/plain").send("Method not allowed.");
  }

  // Hosting rewrites /i/<token> to here, so the token is the last segment.
  const token = String(req.path || "").split("/").filter(Boolean).pop() || "";
  if (!TOKEN.test(token)) return notFound(res);

  try {
    const snap = await admin.firestore()
      .collection("invoiceEmails")
      .where("id", "==", token)
      .limit(1)
      .get();

    if (snap.empty) return notFound(res);
    const row = snap.docs[0].data();
    if (!row.pdf) return notFound(res);

    const fileName = `LeopardInn-${String(row.invoiceNo || "invoice").replace(/[/\\]+/g, "-")}.pdf`;
    const body = Buffer.from(row.pdf, "base64");

    res.set("Content-Type", "application/pdf");
    // `inline`, so a phone opens it in the browser rather than starting a
    // download the guest then has to find. The filename still applies if
    // they choose to save it.
    res.set("Content-Disposition", `inline; filename="${fileName}"`);
    // Private, not public: a shared or CDN cache holding a guest's invoice
    // is exactly what a capability URL must not allow. An hour is enough
    // for a guest reading it twice.
    res.set("Cache-Control", "private, max-age=3600");
    res.set("X-Content-Type-Options", "nosniff");
    // Nothing here should ever be framed by another site.
    res.set("X-Frame-Options", "DENY");

    logger.info("Invoice served", { invoice: row.invoiceNo, bytes: body.length });
    return res.status(200).send(body);
  } catch (err) {
    logger.error("Could not serve invoice", { error: String(err && err.message) });
    return res.status(500).type("text/plain").send("Sorry — this invoice could not be loaded.");
  }
});
