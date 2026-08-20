import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, formatDate, setLogoSrc, showToast, orDash, todayISO } from "./utils.js";
import {
  RESERVATIONS, proformasForReservation, findReservationById, RESERVATION_STATUS,
} from "./data/reservations.js";
import { openReservationForm, reprintReservation } from "./reservation.js";
import { openProformaForm } from "./proforma.js";
import { confirmAction } from "./confirm.js";

// Reservations screen — the home for pre-arrival paperwork. Making a
// reservation used to jump straight to a form and leave nothing behind;
// now the reservation is a record, and this list is what lets staff come
// back to one later to raise the travel agent's invoice, or call it off.

let searchQuery = "";
let statusFilter = "upcoming";

const FILTERS = {
  upcoming: r => r.status === RESERVATION_STATUS.CONFIRMED,
  checkedin: r => r.status === RESERVATION_STATUS.CHECKED_IN,
  cancelled: r => r.status === RESERVATION_STATUS.CANCELLED,
  all: () => true,
};

const EMPTY_COPY = {
  upcoming: ["No upcoming reservations.", "Confirmed bookings appear here until the guest checks in."],
  checkedin: ["No reservations checked in yet.", "A reservation moves here once the guest arrives and their card is completed."],
  cancelled: ["No cancelled reservations.", "Cancelled bookings are kept here rather than deleted, so the record survives."],
  all: ["No reservations yet.", "Confirmed bookings appear here, ready to invoice a travel agent against."],
};

function branchReservations() {
  return RESERVATIONS
    .filter(r => r.branch === appState.selectedBranch)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function matchesSearch(r) {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return true;
  return String(r.no).includes(q) || (r.guestName || "").toLowerCase().includes(q);
}

function statusBadge(r) {
  if (r.status === RESERVATION_STATUS.CANCELLED) {
    return `<span class="resv-status cancelled">Cancelled</span>`;
  }
  if (r.status === RESERVATION_STATUS.CHECKED_IN) {
    return `<span class="resv-status checkedin">Checked In</span>`;
  }
  // A confirmed reservation whose arrival date has passed without anyone
  // checking the guest in is the state most likely to be an oversight, so
  // it's called out rather than sitting in the list looking normal.
  if (r.checkinDate && r.checkinDate < todayISO()) {
    return `<span class="resv-status overdue">Arrival passed</span>`;
  }
  return `<span class="resv-status confirmed">Confirmed</span>`;
}

function renderReservationsList() {
  const list = document.getElementById("reservations-list");
  const inBranch = branchReservations();
  const rows = inBranch.filter(FILTERS[statusFilter]).filter(matchesSearch);

  if (!rows.length) {
    const searching = Boolean(searchQuery.trim());
    const [title, hint] = EMPTY_COPY[statusFilter];
    list.innerHTML = `
      <div class="list-empty">
        <p class="list-empty-title">${searching ? `No reservations match “${escapeHtml(searchQuery)}”.` : escapeHtml(title)}</p>
        ${searching ? "" : `<p class="list-empty-hint">${escapeHtml(hint)}</p>`}
        <button type="button" class="secondary-btn" id="reservations-empty-action">
          ${searching ? "Clear search" : "Make a Reservation"}
        </button>
      </div>`;
    document.getElementById("reservations-empty-action").addEventListener("click", () => {
      if (searching) {
        searchQuery = "";
        document.getElementById("reservations-search").value = "";
        renderReservationsList();
      } else {
        openReservationForm();
      }
    });
    return;
  }

  list.innerHTML = rows.map(r => {
    const issued = proformasForReservation(r.id);
    // Re-invoicing is legitimate (an amended stay, a corrected agent rate),
    // so this isn't a blocker — staff just need to see one already went
    // out, or they'll issue a duplicate without knowing.
    const issuedTag = issued.length
      ? `<span class="reservation-issued">${issued.length} agent invoice${issued.length === 1 ? "" : "s"}</span>`
      : "";
    const villas = (r.villas || []).map(v => v.name).filter(Boolean).join(", ");
    // Only a standing reservation can be cancelled. Cancelling an already
    // cancelled or already fulfilled one is meaningless, so the control
    // isn't offered rather than being offered and refused.
    const isOpen = r.status === RESERVATION_STATUS.CONFIRMED;
    return `
      <div class="reservation-card ${r.status === RESERVATION_STATUS.CANCELLED ? "is-cancelled" : ""}">
        <div class="reservation-card-top">
          <div class="reservation-card-id">
            <span class="reservation-no">RES-${escapeHtml(String(r.no))}</span>
            ${statusBadge(r)}
            ${issuedTag}
          </div>
          <div class="reservation-card-tools">
            <span class="reservation-card-date">${formatDate(r.createdAt.slice(0, 10))}</span>
            <button type="button" class="reservation-icon-btn reservation-print-btn" data-reservation-id="${r.id}" aria-label="Print confirmation for RES-${r.no}" title="Print confirmation">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
            </button>
            ${isOpen ? `
            <button type="button" class="reservation-icon-btn danger reservation-cancel-btn" data-reservation-id="${r.id}" aria-label="Cancel RES-${r.no}" title="Cancel reservation">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" /></svg>
            </button>` : ""}
          </div>
        </div>
        <p class="reservation-card-guest">${escapeHtml(orDash(r.guestName))}</p>
        <p class="reservation-card-meta">
          ${formatDate(r.checkinDate)} &rarr; ${formatDate(r.checkoutDate)}
          · ${r.nights} night${r.nights === 1 ? "" : "s"}
          · ${r.guestTotal} guest${r.guestTotal === 1 ? "" : "s"}
        </p>
        ${villas ? `<p class="reservation-card-villas">${escapeHtml(villas)}</p>` : ""}
        ${r.cancelReason ? `<p class="reservation-card-reason">Cancelled: ${escapeHtml(r.cancelReason)}</p>` : ""}
        <div class="reservation-card-actions">
          <button type="button" class="secondary-btn reservation-invoice-btn" data-reservation-id="${r.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8" /></svg>
            Generate Invoice for Guide
          </button>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll(".reservation-invoice-btn").forEach(btn => {
    btn.addEventListener("click", () => openProformaForm(Number(btn.dataset.reservationId)));
  });
  list.querySelectorAll(".reservation-print-btn").forEach(btn => {
    btn.addEventListener("click", () => reprintReservation(Number(btn.dataset.reservationId)));
  });
  list.querySelectorAll(".reservation-cancel-btn").forEach(btn => {
    btn.addEventListener("click", () => cancelReservation(Number(btn.dataset.reservationId)));
  });
}

// Cancelling keeps the record and marks it, the same way voiding an
// invoice does — a booking that vanishes leaves no answer to "what
// happened to RES-104", and the villa's dates need to be freed for
// someone else in a way that's traceable.
async function cancelReservation(id) {
  const r = findReservationById(id);
  if (!r || r.status !== RESERVATION_STATUS.CONFIRMED) return;

  const issued = proformasForReservation(id);
  const agentWarning = issued.length
    ? ` ${issued.length} agent invoice${issued.length === 1 ? " has" : "s have"} already been raised against it — the cancellation policy on that invoice may still apply.`
    : "";

  const ok = await confirmAction({
    title: "Cancel this reservation?",
    message: `RES-${r.no} for ${r.guestName} (${formatDate(r.checkinDate)} → ${formatDate(r.checkoutDate)}) will be cancelled and the villa freed for those nights.${agentWarning}`,
    confirmLabel: "Cancel Reservation",
    tone: "danger",
  });
  if (!ok) return;

  const reason = await promptCancelReason();
  if (reason === null) return;

  r.status = RESERVATION_STATUS.CANCELLED;
  r.cancelledAt = new Date().toISOString();
  r.cancelReason = reason;
  renderReservationsList();
  showToast(`RES-${r.no} cancelled`);
}

// Deliberately a second step rather than a field inside the confirm sheet:
// the reason is what makes the cancelled record useful later, and burying
// it in a dialog people dismiss reflexively would lose it.
function promptCancelReason() {
  return new Promise(resolve => {
    const overlay = document.getElementById("resv-cancel-sheet-overlay");
    const input = document.getElementById("resv-cancel-reason");
    const form = document.getElementById("resv-cancel-form");
    input.value = "";
    overlay.classList.add("open");
    input.focus();

    const finish = (value) => {
      overlay.classList.remove("open");
      form.removeEventListener("submit", onSubmit);
      closeBtn.removeEventListener("click", onClose);
      overlay.removeEventListener("click", onBackdrop);
      resolve(value);
    };
    function onSubmit(e) { e.preventDefault(); finish(input.value.trim()); }
    function onClose() { finish(null); }
    function onBackdrop(e) { if (e.target === overlay) finish(null); }

    const closeBtn = document.getElementById("resv-cancel-sheet-close");
    form.addEventListener("submit", onSubmit);
    closeBtn.addEventListener("click", onClose);
    overlay.addEventListener("click", onBackdrop);
  });
}

export function openReservationsScreen() {
  document.getElementById("reservations-branch-label").textContent = appState.selectedBranchLabel;
  setLogoSrc("reservations-logo", appState.selectedBranchLogo);
  searchQuery = "";
  document.getElementById("reservations-search").value = "";
  renderReservationsList();
  showScreen("screen-reservations");
}

// Exported so the reservation form and the GRC can refresh the list behind
// them after changing a record, without those modules watching the data.
export function refreshReservationsList() {
  renderReservationsList();
}

document.getElementById("reservations-search").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderReservationsList();
});

document.querySelectorAll("#reservations-tabs .report-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#reservations-tabs .report-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    statusFilter = tab.dataset.resvFilter;
    renderReservationsList();
  });
});

document.getElementById("make-reservation-btn").addEventListener("click", () => openReservationForm());

// The home screen's Reservation quick action now lands here rather than
// jumping straight into a blank form.
document.getElementById("qa-reservation-btn").addEventListener("click", openReservationsScreen);
