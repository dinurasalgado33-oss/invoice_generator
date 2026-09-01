// The nightly mirror to a Google Sheet.
//
// The manager already lives in spreadsheets and an accountant can be given
// a Sheet without being given access to the app. So once a night, whatever
// bears on revenue is appended here.
//
// Two rules make this trustworthy, and both are deliberate:
//
//   * Append-only. A row, once written, is never edited or deleted. A void
//     appends a *reversal* row rather than changing the original — which
//     is how books work, and means a row you read last month still says
//     what it said last month.
//   * One-way. Firestore is the record; the Sheet is a mirror and is never
//     read back from. Two writable copies of the same fact is the exact
//     bug class this project has spent its life killing.
//
// The watermark is invoice.createdAt, not invoice.date: `date` is the
// invoice date reception types and can be back-dated, so it does not only
// move forward and cannot say what has already been exported.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
// Required lazily, inside sheetsClient(), not here. `googleapis` takes
// about eight seconds to load, and the deploy analyser gives the whole
// codebase ten to declare what it exports — so a top-level require of
// it made every deploy of every function a coin flip, including
// functions that have nothing to do with the Sheet. It costs nothing to
// defer: the mirror runs once a night and has minutes, not seconds.

// The Sheet's id, from its URL. Set with:
//   firebase functions:secrets:set SHEET_ID --project live
// A secret rather than a constant only because it is the one piece of
// config that differs between a real deployment and a test one.
const SHEET_ID = defineSecret("SHEET_ID");

const CURSOR = "sheetMirror/cursor";

const HEADERS = [
  "Exported At", "Type", "Document", "Date", "Branch",
  "Guest", "Currency", "Amount (LKR)", "Status", "Note",
];

// The one figure every revenue total reads. A bill raised in USD carries
// the rate used when it was raised — converting at today's rate would
// quietly restate last month's takings every time the rupee moved.
function invoiceLKR(inv) {
  const total = Number(inv.total) || 0;
  if (!inv.currency || inv.currency === "LKR") return total;
  const rate = Number(inv.exchangeRate) || 0;
  return rate > 0 ? total * rate : 0;
}

async function sheetsClient() {
  const { google } = require("googleapis");
  // The function's own service account. The Sheet is shared with it by
  // e-mail, so there is no key file anywhere — nothing to leak, nothing
  // to rotate.
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth: await auth.getClient() });
}

async function ensureHeaders(sheets, spreadsheetId) {
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId, range: "A1:J1",
  });
  if (existing.data.values && existing.data.values.length) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: "A1:J1", valueInputOption: "RAW",
    requestBody: { values: [HEADERS] },
  });
}

exports.mirrorToSheet = onSchedule(
  {
    // Late enough that the day's billing is done, in the hotel's own time
    // rather than UTC — a mirror that runs at "midnight" somewhere else
    // splits a day's takings across two rows of the accountant's sheet.
    schedule: "30 23 * * *",
    timeZone: "Asia/Colombo",
    secrets: [SHEET_ID],
    region: "asia-south1",
  },
  async () => {
    const db = admin.firestore();
    const cursorRef = db.doc(CURSOR);
    const cursorSnap = await cursorRef.get();
    const since = cursorSnap.exists ? (cursorSnap.data().lastExportedAt || "") : "";
    const now = new Date().toISOString();

    const rows = [];

    // New invoices, by when they were raised.
    const invoices = await db.collection("invoices").get();
    invoices.forEach(doc => {
      const inv = doc.data();
      const created = inv.createdAt || "";
      // Invoices raised before createdAt existed have no watermark. Skipped
      // rather than guessed at: exporting them on every run would duplicate
      // them nightly, forever.
      if (!created || created <= since) return;
      rows.push([
        now, "Invoice", inv.id || "", inv.date || "", inv.branch || "",
        inv.guest || "", inv.currency || "LKR", invoiceLKR(inv),
        inv.status || "Active", inv.walkin ? "Walk-in" : "",
      ]);
    });

    // Voids as reversal rows. Keyed on voidedAt, so a void appends the
    // night it happened rather than editing a row written weeks ago.
    invoices.forEach(doc => {
      const inv = doc.data();
      const voidedAt = inv.voidedAt || "";
      if (inv.status !== "Void" || !voidedAt || voidedAt <= since) return;
      rows.push([
        now, "Void (reversal)", inv.id || "", inv.date || "", inv.branch || "",
        inv.guest || "", inv.currency || "LKR", -invoiceLKR(inv),
        "Void", inv.voidReason || "",
      ]);
    });

    if (!rows.length) {
      await cursorRef.set({ lastExportedAt: now, lastRunAt: now, rowsAppended: 0 }, { merge: true });
      logger.info("Mirror ran, nothing new");
      return;
    }

    const sheets = await sheetsClient();
    // Trimmed, because a secret set from a shell pipe arrives with the
    // platform line ending attached. PowerShell contributed two trailing
    // CRLFs here, so Sheets looked for a spreadsheet whose id ended in
    // newlines and correctly reported it did not exist. The error reads
    // "Requested entity was not found", which sounds like a wrong id or a
    // sharing problem and sent this in the wrong direction twice.
    // Whitespace is not the operator's job to get right.
    const spreadsheetId = String(SHEET_ID.value() || "").trim();
    await ensureHeaders(sheets, spreadsheetId);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "A:J",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows },
    });

    // Advanced only after the append succeeded. If the Sheet call throws,
    // the cursor stays where it was and tonight's rows go out tomorrow —
    // a duplicate is recoverable by eye, a silently skipped day is not.
    await cursorRef.set({ lastExportedAt: now, lastRunAt: now, rowsAppended: rows.length }, { merge: true });
    logger.info("Mirror appended rows", { count: rows.length });
  }
);
