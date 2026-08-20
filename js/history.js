import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, formatDate, fmtLKR, setLogoSrc, showToast, orDash } from "./utils.js";
import { BOOKINGS, INVOICES, FOOD_ORDER_RECORDS, ACTIVITY_RECORDS } from "./data/reports.js";
import { findGrcByBookingId } from "./data/grc.js";
import { RESERVATIONS, PROFORMA_INVOICES } from "./data/reservations.js";
import { reprintGrc } from "./grc.js";
import { reprintReservation } from "./reservation.js";
import { reopenInvoice } from "./invoice.js";
import { reprintProforma } from "./proforma.js";

// Guest History — one row per stay, and everything filed against it.
//
// It exists because every document in this app used to be reachable only
// at the moment it was created. Leave the checkout preview and the invoice
// was gone; the same was true of the registration card. A mis-tap lost a
// financial document with no way back. This is the way back — and it
// doubles as the record of what a guest actually did while they were here.

// Ten at a time. A hotel accumulates stays indefinitely and almost every
// lookup is for something recent, so the whole list is never the useful
// default — and on a phone it would be a very long scroll to nothing.
const PAGE = 10;
let shown = PAGE;
let searchQuery = "";

function stays() {
  return BOOKINGS
    .filter(b => b.branch === appState.selectedBranch)
    .sort((a, b) => {
      // Latest first, by arrival. Ties broken by id so the order is stable
      // rather than shuffling between renders.
      if (a.checkin !== b.checkin) return a.checkin < b.checkin ? 1 : -1;
      return b.id - a.id;
    });
}

function matches(b) {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return true;
  return String(b.id).includes(q)
    || (b.guest || "").toLowerCase().includes(q)
    || (b.villa || "").toLowerCase().includes(q);
}

// Everything filed against one stay. Invoices can legitimately be several
// — an interim bill part-way through, then the checkout invoice — so this
// returns them all rather than assuming one.
function documentsFor(booking) {
  const card = findGrcByBookingId(booking.id);
  const reservation = RESERVATIONS.find(r => r.bookingId === booking.id) || null;
  const proformas = reservation
    ? PROFORMA_INVOICES.filter(p => p.reservationId === reservation.id)
    : [];
  const invoices = INVOICES.filter(i => i.bookingId === booking.id);
  return { card, reservation, proformas, invoices };
}

function chargesFor(booking) {
  return {
    food: FOOD_ORDER_RECORDS.filter(f => f.bookingId === booking.id),
    activities: ACTIVITY_RECORDS.filter(a => a.bookingId === booking.id),
  };
}

function docButton({ kind, label, id, available }) {
  // An unavailable document is shown greyed rather than hidden, so the row
  // says what a stay does and doesn't have — "no reservation" is itself
  // information when you're looking for one.
  const title = available ? label : `${label} — none for this stay`;
  return `
    <button type="button" class="doc-btn ${kind} ${available ? "" : "unavailable"}"
            ${available ? `data-doc="${kind}" data-id="${id}"` : "disabled"}
            title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">
      ${docIcon(kind)}<span>${escapeHtml(label)}</span>
    </button>`;
}

function docIcon(kind) {
  const icons = {
    card: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M15 9h3M15 13h3M6 16h6" /></svg>`,
    reservation: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="M9 16l2 2 4-4" /></svg>`,
    proforma: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8" /></svg>`,
    invoice: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2l-3 2-3-2-3 2-3-2Z" /><path d="M8 9h8M8 13h5" /></svg>`,
  };
  return icons[kind] || "";
}

function statusPill(b) {
  const map = {
    "Checked In": "in",
    "Checked Out": "out",
    "Upcoming": "upcoming",
    "Cancelled": "cancelled",
  };
  return `<span class="stay-status ${map[b.status] || "out"}">${escapeHtml(b.status)}</span>`;
}

function renderHistory() {
  const body = document.getElementById("history-body");
  const all = stays();
  const filtered = all.filter(matches);
  const page = filtered.slice(0, shown);

  document.getElementById("history-count").textContent = filtered.length
    ? `Showing ${page.length} of ${filtered.length} stay${filtered.length === 1 ? "" : "s"}`
    : "";

  if (!filtered.length) {
    const searching = Boolean(searchQuery.trim());
    body.innerHTML = `
      <tr><td colspan="7">
        <div class="list-empty">
          <p class="list-empty-title">${searching
            ? `Nothing matches “${escapeHtml(searchQuery)}”.`
            : "No stays recorded yet."}</p>
          <p class="list-empty-hint">${searching
            ? "Search by guest name, villa, or stay number."
            : "Every guest checked in appears here, with their documents and charges."}</p>
          ${searching ? `<button type="button" class="secondary-btn" id="history-clear">Clear search</button>` : ""}
        </div>
      </td></tr>`;
    const clear = document.getElementById("history-clear");
    if (clear) clear.addEventListener("click", () => {
      searchQuery = "";
      document.getElementById("history-search").value = "";
      shown = PAGE;
      renderHistory();
    });
    document.getElementById("history-more-btn").hidden = true;
    return;
  }

  body.innerHTML = page.map(b => {
    const { card, reservation, proformas, invoices } = documentsFor(b);
    const { food, activities } = chargesFor(b);
    const extras = food.length + activities.length;
    return `
      <tr class="stay-row">
        <td class="hc-no" data-label="Stay"><span class="stay-no">#${b.id}</span></td>
        <td class="hc-guest" data-label="Guest">
          <span class="stay-guest">${escapeHtml(orDash(b.guest))}</span>
          ${statusPill(b)}
        </td>
        <td class="hc-villa" data-label="Villa">${escapeHtml(orDash(b.villa))}</td>
        <td class="hc-in" data-label="Check-in">${formatDate(b.checkin)}</td>
        <td class="hc-out" data-label="Check-out">${formatDate(b.checkout)}</td>
        <td class="hc-docs" data-label="Documents">
          <div class="doc-btns">
            ${docButton({ kind: "card", label: "Card", id: b.id, available: Boolean(card) })}
            ${docButton({ kind: "reservation", label: "Reservation", id: reservation ? reservation.id : "", available: Boolean(reservation) })}
            ${docButton({ kind: "proforma", label: "Agent", id: proformas.length ? proformas[proformas.length - 1].id : "", available: proformas.length > 0 })}
            ${docButton({ kind: "invoice", label: invoices.length > 1 ? `Invoice ×${invoices.length}` : "Invoice", id: b.id, available: invoices.length > 0 })}
          </div>
        </td>
        <td class="hc-extra" data-label="Activities &amp; Food">
          <button type="button" class="secondary-btn extras-btn" data-booking-id="${b.id}" ${extras ? "" : "disabled"}>
            ${extras ? `View (${extras})` : "None"}
          </button>
        </td>
      </tr>`;
  }).join("");

  const moreBtn = document.getElementById("history-more-btn");
  const remaining = Math.max(0, filtered.length - shown);
  moreBtn.hidden = remaining === 0;
  // Guarded: computing this unconditionally produced "Show -2 more" once
  // the list was fully shown. Hidden, so invisible — but wrong the moment
  // anything else made it visible.
  if (remaining > 0) moreBtn.textContent = `Show ${Math.min(PAGE, remaining)} more`;

  body.querySelectorAll("[data-doc]").forEach(btn => {
    btn.addEventListener("click", () => openDocument(btn.dataset.doc, btn.dataset.id));
  });
  body.querySelectorAll(".extras-btn").forEach(btn => {
    btn.addEventListener("click", () => openExtras(Number(btn.dataset.bookingId)));
  });
}

function openDocument(kind, id) {
  if (kind === "card") return reprintGrc(Number(id));
  if (kind === "reservation") return reprintReservation(Number(id));
  if (kind === "proforma") return reprintProforma(Number(id));
  if (kind === "invoice") {
    const bookingId = Number(id);
    const invoices = INVOICES.filter(i => i.bookingId === bookingId);
    if (!invoices.length) return;
    // A stay can carry an interim bill and a checkout invoice. The last one
    // raised is the one staff nearly always want; the rest are listed in
    // the charges sheet, where every invoice for the stay is shown.
    reopenInvoice(invoices[invoices.length - 1].id);
  }
}

function openExtras(bookingId) {
  const booking = BOOKINGS.find(b => b.id === bookingId);
  if (!booking) return;
  const { food, activities } = chargesFor(booking);
  const { invoices } = documentsFor(booking);

  const when = (r) => r.at ? new Date(r.at).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }) : formatDate(r.date);

  const foodTotal = food.reduce((s, f) => s + (f.revenue || 0), 0);
  const actTotal = activities.reduce((s, a) => s + (a.revenue || 0), 0);
  const actPayout = activities.reduce((s, a) => s + (a.payout || 0), 0);

  document.getElementById("history-detail-title").textContent =
    `${booking.guest} · ${booking.villa}`;

  const section = (title, rows, total, extra = "") => `
    <div class="extras-section">
      <div class="extras-head">
        <span>${title}</span>
        <strong>${fmtLKR(total)}</strong>
      </div>
      ${rows || `<p class="room-detail-empty">Nothing charged.</p>`}
      ${extra}
    </div>`;

  const foodRows = food.map(f => `
    <div class="extras-row">
      <div>
        <span class="extras-name">${f.qty}× ${escapeHtml(f.dish)}</span>
        <span class="extras-when">${escapeHtml(when(f))}</span>
      </div>
      <span class="extras-value">${fmtLKR(f.revenue)}</span>
    </div>`).join("");

  const actRows = activities.map(a => `
    <div class="extras-row">
      <div>
        <span class="extras-name">${a.qty}× ${escapeHtml(a.name)}</span>
        <span class="extras-when">${escapeHtml(when(a))}${a.guide ? ` · ${escapeHtml(a.guide)}` : ""}</span>
      </div>
      <span class="extras-value">${fmtLKR(a.revenue)}</span>
    </div>`).join("");

  // The payout line only appears when money actually left the hotel —
  // a permanent "LKR 0" on in-house activities would be noise.
  const payoutLine = actPayout > 0
    ? `<p class="extras-payout">Of which ${fmtLKR(actPayout)} is payable to providers.</p>`
    : "";

  const invoiceList = invoices.length > 1 ? `
    <div class="extras-section">
      <div class="extras-head"><span>Invoices for this stay</span><strong>${invoices.length}</strong></div>
      ${invoices.map(i => `
        <div class="extras-row">
          <div>
            <span class="extras-name">Invoice #${escapeHtml(String(i.id))}${i.interim ? " (part-way)" : ""}</span>
            <span class="extras-when">${formatDate(i.date)}${i.status === "Void" ? " · VOID" : ""}</span>
          </div>
          <button type="button" class="secondary-btn extras-invoice-btn" data-invoice-id="${escapeHtml(String(i.id))}">Open</button>
        </div>`).join("")}
    </div>` : "";

  document.getElementById("history-detail-body").innerHTML =
    section("Food &amp; Beverage", foodRows, foodTotal)
    + section("Activities", actRows, actTotal, payoutLine)
    + invoiceList;

  document.querySelectorAll(".extras-invoice-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      closeExtras();
      reopenInvoice(btn.dataset.invoiceId);
    });
  });

  document.getElementById("history-detail-overlay").classList.add("open");
}

function closeExtras() {
  document.getElementById("history-detail-overlay").classList.remove("open");
}

export function openGuestHistory() {
  document.getElementById("history-branch-label").textContent = appState.selectedBranchLabel;
  setLogoSrc("history-logo", appState.selectedBranchLogo);
  searchQuery = "";
  shown = PAGE;
  document.getElementById("history-search").value = "";
  renderHistory();
  showScreen("screen-guest-history");
}

document.getElementById("history-search").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  // A new search starts from the top — carrying a "show 40" state into a
  // three-result search just shows all three under a stale count.
  shown = PAGE;
  renderHistory();
});

document.getElementById("history-more-btn").addEventListener("click", () => {
  shown += PAGE;
  renderHistory();
});

document.getElementById("history-detail-close").addEventListener("click", closeExtras);
document.getElementById("history-detail-overlay").addEventListener("click", (e) => {
  if (e.target.id === "history-detail-overlay") closeExtras();
});

document.getElementById("qa-history-btn").addEventListener("click", openGuestHistory);
