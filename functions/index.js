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

// How much rendered menu to put in one e-mail. Gmail clips a message over
// about 102KB behind a "View entire message" link, which is exactly the
// extra tap this change exists to remove, so the budget stays well under
// it and leaves room for the greeting around it.
const MAX_MENU_BYTES = 80 * 1024;

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}


function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : "";
}

// The menu as it stands right now, read at the moment of sending.
//
// Read rather than carried on the queue row on purpose. A row written at
// check-in and sent minutes later would otherwise freeze whatever the
// menu happened to say at check-in, and a row that failed and was chased
// days later would send a menu nobody serves any more. Reading here means
// there is one menu, in one place, and the e-mail cannot disagree with
// the kitchen. Same reason the app derives occupancy instead of storing
// it — see PERSISTENCE-AUDIT.md.
async function readMenu(branch) {
  const db = admin.firestore();

  const snap = await db.collection("menuItems").where("branch", "==", branch).get();

  // Ordered by dish number, exactly as menu-pdf.js does it, and for the
  // reason its own comment gives: the number IS the order the printed menu
  // runs in, and it is per property — whereas MENU_CATEGORIES is one
  // shared list in Arugam Bay's order. Sorting by that shared list is not
  // a near-miss, it is visibly wrong: it opened the Wilpattu e-mail on
  // Side Dishes at number 51, because Wilpattu's fresh juices are 1-9 and
  // sit lower in a list written for the other property.
  //
  // A guest orders by number. Starting at 51 is the kind of thing that
  // gets read out down the phone and gets the wrong dish sent up.
  return snap.docs
    .map(d => d.data())
    .filter(d => d && d.name)
    .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
}

// What a full/half-board rate includes, for the property that has one.
//
// A board guest is not ordering from the à la carte list — they have
// already paid for a set meal — so "what do I actually get" is the
// question the welcome e-mail leaves unanswered without this. Read from
// config rather than held here, so the sheet reception prints and the
// sheet the guest is sent cannot drift apart.
async function readBoardMenu(branch) {
  const db = admin.firestore();
  const id = `${branch}__boardMenu`.replace(/[/\s]+/g, "-");
  const snap = await db.collection("config").doc(id).get();
  const value = snap.exists ? snap.data().value : null;
  return Array.isArray(value) ? value : [];
}

function renderBoardMenu(blocks) {
  if (!blocks.length) return "";

  const body = blocks.map(block => {
    const options = (block.options || [])
      .filter(o => o && o.name)
      .map(o => `<p style="margin:8px 0 0"><span style="font-size:15px">${escapeHtml(o.name)}</span>${
        o.detail ? `<div style="font-size:13px;color:#6b6b6b;margin-top:2px">${escapeHtml(o.detail)}</div>` : ""
      }</p>`).join("");
    if (!options) return "";
    return `<h3 style="margin:22px 0 0;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#4a0e1c">${escapeHtml(block.heading || "")}${
      block.note ? `<span style="font-weight:400;text-transform:none;letter-spacing:0;color:#a08a52;font-size:13px"> — ${escapeHtml(block.note)}</span>` : ""
    }</h3>${options}${
      block.foot ? `<p style="margin:8px 0 0;font-size:12px;color:#8a8a8a">${escapeHtml(block.foot)}</p>` : ""
    }`;
  }).join("");

  if (!body) return "";

  return `<h2 style="margin:34px 0 0;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#a08a52">Included with full and half board</h2>
    <p style="margin:6px 0 0;font-size:13px;color:#6b6b6b">If your rate includes meals, this is what they are. Anything from the menu above can be added to your bill.</p>
    ${body}`;
}

// Category names read "Breakfast - Sri Lankan". Three consecutive
// headings all starting "Breakfast" is how the data is shaped, not how a
// menu should read, so the part before the dash becomes a course heading
// that prints once and the part after becomes the group under it.
function splitCategory(name) {
  const at = String(name).indexOf(" - ");
  return at === -1
    ? { course: String(name), group: "" }
    : { course: String(name).slice(0, at), group: String(name).slice(at + 3) };
}

// Walks the dishes in number order and starts a new heading whenever the
// course or the group changes, so the headings follow the numbering
// instead of the numbering being shuffled to follow the headings.
//
// One table per group rather than per dish. The markup is the bulk of the
// message — the dishes themselves are only about 6KB of actual words — so
// a wrapper repeated 93 times is what decides whether Gmail clips.
function renderCategories(items, withDescriptions) {
  let html = "";
  let lastCourse = null;
  let lastGroup = null;
  let open = false;

  const closeTable = () => { if (open) { html += `</table>`; open = false; } };

  items.forEach(d => {
    const { course, group } = splitCategory(d.category);

    if (course !== lastCourse || group !== lastGroup) {
      closeTable();
      if (course !== lastCourse) {
        html += `<h2 style="margin:26px 0 2px;font-size:15px;letter-spacing:.10em;text-transform:uppercase;color:#4a0e1c;border-bottom:1px solid #e8dfc9;padding-bottom:5px">${escapeHtml(course)}</h2>`;
        lastCourse = course;
      }
      if (group) {
        html += `<p style="margin:12px 0 2px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#a08a52">${escapeHtml(group)}</p>`;
      }
      lastGroup = group;
    }

    if (!open) {
      // Two cells, not a float: e-mail clients that ignore CSS still lay a
      // table out correctly, and the price stays beside its dish.
      html += `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">`;
      open = true;
    }

    const desc = withDescriptions && d.description
      ? `<div style="font-size:13px;color:#6b6b6b;margin-top:2px">${escapeHtml(d.description)}</div>` : "";
    html += `<tr><td style="padding:7px 0;vertical-align:top;font-size:15px">${d.number ? escapeHtml(d.number) + ". " : ""}${escapeHtml(d.name)}${desc}</td>`
      + `<td style="padding:7px 0 7px 14px;vertical-align:top;text-align:right;white-space:nowrap;font-size:15px;color:#4a0e1c">${money(d.price)}</td></tr>`;
  });

  closeTable();
  return html;
}

function renderMenu(items) {
  if (!Array.isArray(items) || !items.length) return "";

  let html = renderCategories(items, true);

  // Gmail clips a message over about 102KB behind a "View entire message"
  // link — exactly the extra tap this change exists to remove. The real
  // menus land around 25KB, so this only bites if the menu grows a long
  // way. Dropping the dish descriptions is the cheapest thing to lose:
  // a guest can still order every dish by name and number.
  if (html.length > MAX_MENU_BYTES) {
    logger.warn("Welcome menu too large with descriptions, dropping them", { bytes: html.length });
    html = renderCategories(items, false);
  }
  // Still too big means something is wrong with the data rather than with
  // the layout. Send the greeting alone rather than a menu that gets cut
  // off mid-course, which would read as a broken e-mail.
  if (html.length > MAX_MENU_BYTES) {
    logger.error("Welcome menu too large to send at all", { bytes: html.length });
    return "";
  }
  if (!html) return "";

  return `<h2 style="margin:30px 0 0;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#a08a52">Our menu</h2>
    <p style="margin:6px 0 0;font-size:13px;color:#6b6b6b">You're welcome to order to your villa at any time. All prices are in Sri Lankan Rupees.</p>
    ${html}`;
}

function buildHtml(row, menuHtml) {
  const label = BRANCH_LABELS[row.branch] || "Leopard Inn";
  const phone = BRANCH_PHONES[row.branch] || "";
  const first = String(row.guestName || "").trim().split(/\s+/)[0] || "there";


  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#faf7f2;font-family:Georgia,'Times New Roman',serif;color:#2b2b2b">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <h1 style="margin:0 0 4px;font-size:22px;color:#4a0e1c">${escapeHtml(label)}</h1>
    <p style="margin:0 0 20px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#a08a52">Welcome</p>
    <p style="margin:0 0 12px">Dear ${escapeHtml(first)},</p>
    <p style="margin:0 0 12px">Thank you for choosing ${escapeHtml(label)}. We hope you have a comfortable stay.</p>
    ${menuHtml || ""}
    ${phone ? `<p style="margin:16px 0 0;font-size:14px;color:#555">Anything at all, just call reception on ${escapeHtml(phone)}.</p>` : ""}
  </div>
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

    // A welcome with no menu is worth far more than no welcome at all, so
    // a menu that cannot be read is dropped rather than allowed to fail
    // the send. The guest still gets the greeting and reception's number.
    let menuHtml = "";
    try {
      const [dishes, board] = await Promise.all([
        readMenu(row.branch),
        readBoardMenu(row.branch).catch(() => []),
      ]);
      menuHtml = renderMenu(dishes) + renderBoardMenu(board);
    } catch (err) {
      logger.error("Could not build the menu for the welcome e-mail", {
        id: event.params.id, branch: row.branch, error: String(err && err.message),
      });
    }

    try {
      await transport.sendMail({
        from: `"${label}" <${GMAIL_USER}>`,
        to: row.email,
        subject: `Welcome to ${label}`,
        html: buildHtml(row, menuHtml),
      });
      await snap.ref.update({ status: "Sent", sentAt: new Date().toISOString(), error: "" });
      logger.info("Welcome e-mail sent", {
        id: event.params.id, branch: row.branch, menuBytes: menuHtml.length,
      });
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
