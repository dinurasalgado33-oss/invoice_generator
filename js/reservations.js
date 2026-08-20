import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, formatDate, fmtLKR, setLogoSrc, showToast, orDash } from "./utils.js";
import { RESERVATIONS, proformasForReservation } from "./data/reservations.js";
import { openReservationForm } from "./reservation.js";
import { openProformaForm } from "./proforma.js";

// Reservations screen — the home for pre-arrival paperwork. Making a
// reservation used to jump straight to a form and leave nothing behind;
// now the reservation is a record, and this list is what lets staff come
// back to one later to raise the travel agent's invoice against it.

let searchQuery = "";

function branchReservations() {
  return RESERVATIONS
    .filter(r => r.branch === appState.selectedBranch)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function matches(r) {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return true;
  return String(r.no).includes(q) || (r.guestName || "").toLowerCase().includes(q);
}

function renderReservationsList() {
  const list = document.getElementById("reservations-list");
  const all = branchReservations();
  const rows = all.filter(matches);

  if (!all.length) {
    list.innerHTML = `
      <div class="list-empty">
        <p class="list-empty-title">No reservations yet.</p>
        <p class="list-empty-hint">Confirmed bookings appear here, ready to invoice a travel agent against.</p>
        <button type="button" class="secondary-btn" id="reservations-empty-make">Make a Reservation</button>
      </div>`;
    document.getElementById("reservations-empty-make")
      .addEventListener("click", () => openReservationForm());
    return;
  }

  if (!rows.length) {
    list.innerHTML = `
      <div class="list-empty">
        <p class="list-empty-title">No reservations match “${escapeHtml(searchQuery)}”.</p>
        <button type="button" class="secondary-btn" id="reservations-empty-clear">Clear search</button>
      </div>`;
    document.getElementById("reservations-empty-clear").addEventListener("click", () => {
      searchQuery = "";
      document.getElementById("reservations-search").value = "";
      renderReservationsList();
    });
    return;
  }

  list.innerHTML = rows.map(r => {
    const issued = proformasForReservation(r.id);
    // Re-invoicing is legitimate (an amended stay, a corrected agent rate),
    // so the button stays available — but staff need to see that one has
    // already gone out, or they'll issue a duplicate without knowing.
    const issuedTag = issued.length
      ? `<span class="reservation-issued">${issued.length} agent invoice${issued.length === 1 ? "" : "s"} issued</span>`
      : "";
    const villas = (r.villas || []).map(v => v.name).filter(Boolean).join(", ");
    return `
      <div class="reservation-card">
        <div class="reservation-card-top">
          <div class="reservation-card-id">
            <span class="reservation-no">RES-${escapeHtml(String(r.no))}</span>
            ${issuedTag}
          </div>
          <span class="reservation-card-date">${formatDate(r.createdAt.slice(0, 10))}</span>
        </div>
        <p class="reservation-card-guest">${escapeHtml(orDash(r.guestName))}</p>
        <p class="reservation-card-meta">
          ${formatDate(r.checkinDate)} &rarr; ${formatDate(r.checkoutDate)}
          · ${r.nights} night${r.nights === 1 ? "" : "s"}
          · ${r.guestTotal} guest${r.guestTotal === 1 ? "" : "s"}
        </p>
        ${villas ? `<p class="reservation-card-villas">${escapeHtml(villas)}</p>` : ""}
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
}

export function openReservationsScreen() {
  document.getElementById("reservations-branch-label").textContent = appState.selectedBranchLabel;
  setLogoSrc("reservations-logo", appState.selectedBranchLogo);
  searchQuery = "";
  document.getElementById("reservations-search").value = "";
  renderReservationsList();
  showScreen("screen-reservations");
}

// Exported so the reservation form can refresh the list behind it after
// saving, without this module having to watch the data for changes.
export function refreshReservationsList() {
  renderReservationsList();
}

document.getElementById("reservations-search").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderReservationsList();
});

document.getElementById("make-reservation-btn").addEventListener("click", () => openReservationForm());

// The home screen's Reservation quick action now lands here rather than
// jumping straight into a blank form.
document.getElementById("qa-reservation-btn").addEventListener("click", openReservationsScreen);
