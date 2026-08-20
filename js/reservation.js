import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, fmtLKR, formatDate, setLogoSrc, showToast, todayISO, toDateISO, clampMoney, capNumericInput, MAX_COUNT } from "./utils.js";
import { BRANCH_INFO, RESERVATION_CONDITIONS } from "./data/branches.js";
import { ROOMS_BY_BRANCH } from "./data/rooms.js";
import {
  RESERVATIONS, allocateReservationNo, findConflicts, RESERVATION_STATUS,
} from "./data/reservations.js";
import { refreshReservationsList } from "./reservations.js";

// Guest counts are printed on a document handed to the guest, so a stray
// keystroke turning "2 adults" into 2 million needs to be caught here
// rather than showing up on the confirmation.
function clampCount(value) {
  return Math.floor(clampMoney(value, MAX_COUNT));
}

const villaList = document.getElementById("resv-villa-list");

// Villas are picked from the branch's configured list rather than typed,
// and the nightly rate follows the villa automatically. Free text meant a
// misspelt villa name and a hand-typed rate could both reach a guest's
// confirmation, and neither would match what the manager set in Configure.
function villaOptions() {
  return ROOMS_BY_BRANCH[appState.selectedBranch] || [];
}

function addVillaRow(roomId = null) {
  const villas = villaOptions();
  const row = document.createElement("div");
  row.className = "villa-rate-row";
  row.innerHTML = `
    <select class="villa-name-select" aria-label="Villa">
      <option value="">Select a villa…</option>
      ${villas.map(v => `<option value="${v.id}">${escapeHtml(v.name || "Unnamed villa")}</option>`).join("")}
    </select>
    <input type="number" class="villa-rate-input" placeholder="Rate" min="0" step="0.01" readonly aria-label="Nightly rate" />
    <button type="button" class="remove-ingredient-btn" aria-label="Remove villa">&times;</button>
  `;
  const select = row.querySelector(".villa-name-select");
  const rateInput = row.querySelector(".villa-rate-input");

  function syncRate() {
    const villa = villas.find(v => String(v.id) === select.value);
    rateInput.value = villa ? villa.rate : "";
  }
  select.addEventListener("change", syncRate);
  if (roomId != null) select.value = String(roomId);
  syncRate();

  row.querySelector(".remove-ingredient-btn").addEventListener("click", () => row.remove());
  villaList.appendChild(row);
}

function resetReservationForm() {
  document.getElementById("reservation-form").reset();
  document.getElementById("resv-checkin-date").value = todayISO();
  document.getElementById("resv-checkin-time").value = "14:00";
  document.getElementById("resv-checkout-date").value = toDateISO(new Date(Date.now() + 86400000));
  document.getElementById("resv-checkout-time").value = "11:00";
  villaList.innerHTML = "";
  addVillaRow();
  document.getElementById("resv-guest-name-error").classList.remove("show");
  document.getElementById("resv-guest-name").classList.remove("invalid");
  document.getElementById("resv-checkout-date-error").classList.remove("show");
  document.getElementById("resv-checkout-date").classList.remove("invalid");
  document.getElementById("resv-conflict-error").classList.remove("show");
}

document.getElementById("resv-add-villa-btn").addEventListener("click", () => addVillaRow());

// Opened from the Reservations screen rather than straight off the home
// quick action — that now lands on the list, since a reservation is a
// record staff come back to, not just a document they print once.
export function openReservationForm() {
  document.getElementById("resv-form-branch-label").textContent = appState.selectedBranchLabel;
  setLogoSrc("resv-form-logo", appState.selectedBranchLogo);
  resetReservationForm();
  showScreen("screen-reservation-form");
}

// Distinct from utils.js's nightsBetween(), which returns 1 for a
// same-day range — this one is used purely for a "N nights" display
// where 0 (not booked/invalid) should read as "N/A", not "1 night".
function reservationNights(checkin, checkout) {
  const a = new Date(checkin + "T00:00:00");
  const b = new Date(checkout + "T00:00:00");
  const diff = Math.round((b - a) / 86400000);
  return diff > 0 ? diff : 0;
}

function formatTime12h(value) {
  if (!value) return "N/A";
  const [h, m] = String(value).split(":").map(Number);
  // A malformed time used to print "NaN:NaN PM" onto the guest's
  // confirmation; "N/A" is the same fallback the rest of this document uses.
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "N/A";
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

const resvGuestNameInput = document.getElementById("resv-guest-name");
const resvCheckinDateInput = document.getElementById("resv-checkin-date");
const resvCheckoutDateInput = document.getElementById("resv-checkout-date");

resvGuestNameInput.addEventListener("input", () => {
  document.getElementById("resv-guest-name-error").classList.remove("show");
  resvGuestNameInput.classList.remove("invalid");
});
resvCheckinDateInput.addEventListener("change", () => { resvCheckoutDateInput.min = resvCheckinDateInput.value; });
[resvCheckinDateInput, resvCheckoutDateInput].forEach(input => {
  input.addEventListener("input", () => {
    document.getElementById("resv-checkout-date-error").classList.remove("show");
    resvCheckoutDateInput.classList.remove("invalid");
  });
});

function validateReservationForm() {
  if (!resvGuestNameInput.value.trim()) {
    document.getElementById("resv-guest-name-error").classList.add("show");
    resvGuestNameInput.classList.add("invalid");
    resvGuestNameInput.focus();
    return false;
  }
  if (resvCheckinDateInput.value && resvCheckoutDateInput.value && resvCheckoutDateInput.value <= resvCheckinDateInput.value) {
    document.getElementById("resv-checkout-date-error").classList.add("show");
    resvCheckoutDateInput.classList.add("invalid");
    resvCheckoutDateInput.focus();
    return false;
  }
  return true;
}

// Mirrors the invoice form's guard — and it now matters more than it did:
// a reservation writes a real record, so a double submit would create two
// bookings with two reservation numbers for one guest.
let isGeneratingReservation = false;

document.getElementById("reservation-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (isGeneratingReservation) return;
  if (!validateReservationForm()) return;
  isGeneratingReservation = true;

  const reservationId = allocateReservationNo();
  const branchInfo = BRANCH_INFO[appState.selectedBranch] || {};
  const title = document.getElementById("resv-title").value;
  const guestName = resvGuestNameInput.value.trim();
  const adults = clampCount(document.getElementById("resv-adults").value);
  const children = clampCount(document.getElementById("resv-children").value);
  const checkinDate = resvCheckinDateInput.value;
  const checkoutDate = resvCheckoutDateInput.value;
  const nights = reservationNights(checkinDate, checkoutDate);

  // roomId is stored alongside the name so a later proforma joins on the
  // villa itself, while the name/rate snapshot keeps this reservation
  // reading correctly even after the villa is renamed or repriced.
  const configured = ROOMS_BY_BRANCH[appState.selectedBranch] || [];
  const villas = [...villaList.querySelectorAll(".villa-rate-row")]
    .map(row => {
      const id = row.querySelector(".villa-name-select").value;
      const villa = configured.find(v => String(v.id) === id);
      return villa ? { roomId: villa.id, name: villa.name, rate: clampMoney(villa.rate) } : null;
    })
    .filter(Boolean);

  // Nothing stopped the same villa being promised to two guests over the
  // same nights. Checked here rather than on the villa picker because the
  // dates can change after the villa was chosen.
  const conflicts = findConflicts({
    branch: appState.selectedBranch,
    villas,
    checkinDate,
    checkoutDate,
  });
  if (conflicts.length) {
    const detail = conflicts.map(c =>
      `${c.villas.map(v => v.name).join(", ")} — RES-${c.reservation.no} (${c.reservation.guestName}, ${formatDate(c.reservation.checkinDate)} → ${formatDate(c.reservation.checkoutDate)})`
    ).join("; ");
    const errorEl = document.getElementById("resv-conflict-error");
    errorEl.textContent = `Already reserved: ${detail}`;
    errorEl.classList.add("show");
    errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
    isGeneratingReservation = false;
    return;
  }
  document.getElementById("resv-conflict-error").classList.remove("show");

  // Header
  document.getElementById("resv-prev-hotel-name").textContent = branchInfo.hotelName || appState.selectedBranchLabel;
  document.getElementById("resv-prev-address").textContent = branchInfo.address || "";
  document.getElementById("resv-prev-contact-line").textContent =
    [branchInfo.phone ? `Tel ${branchInfo.phone}` : "", branchInfo.email ? `Email: ${branchInfo.email}` : ""].filter(Boolean).join("  •  ");
  setLogoSrc("resv-prev-logo", appState.selectedBranchLogo);

  // Guest details
  document.getElementById("resv-prev-guest-name").textContent = guestName ? `${title} ${guestName}` : "-";
  document.getElementById("resv-prev-guest-total").textContent = String(adults + children);
  document.getElementById("resv-prev-adults").textContent = String(adults);
  document.getElementById("resv-prev-children").textContent = String(children);
  document.getElementById("resv-prev-contact").textContent = document.getElementById("resv-contact").value.trim() || "N/A";

  // Stay details
  document.getElementById("resv-prev-checkin-date").textContent = checkinDate ? formatDate(checkinDate) : "N/A";
  document.getElementById("resv-prev-checkin-time").textContent = formatTime12h(document.getElementById("resv-checkin-time").value);
  document.getElementById("resv-prev-checkout-date").textContent = checkoutDate ? formatDate(checkoutDate) : "N/A";
  document.getElementById("resv-prev-checkout-time").textContent = formatTime12h(document.getElementById("resv-checkout-time").value);
  document.getElementById("resv-prev-duration").textContent = nights ? `${nights} night${nights === 1 ? "" : "s"}` : "N/A";
  document.getElementById("resv-prev-villa-count").textContent = String(villas.length || 0);
  document.getElementById("resv-prev-booking-type").textContent = document.getElementById("resv-booking-type").value.trim() || "N/A";

  // Pricing
  document.getElementById("resv-prev-pricing-body").innerHTML = villas.map(v => `
    <tr><td>${escapeHtml(v.name) || "-"}</td><td>${v.rate ? fmtLKR(v.rate) : "-"}</td></tr>
  `).join("") || `<tr><td colspan="2" class="room-detail-empty">No villas added.</td></tr>`;

  // Payment details
  document.getElementById("resv-prev-bank-account-name").textContent = branchInfo.bankAccountName || "-";
  document.getElementById("resv-prev-bank-account-no").textContent = branchInfo.bankAccountNumber || "-";
  document.getElementById("resv-prev-bank").textContent = branchInfo.bankName || "-";
  document.getElementById("resv-prev-bank-branch").textContent = branchInfo.bankBranch || "-";

  // Conditions — manager-editable per branch (Configure > Reservation Conditions)
  const conditions = RESERVATION_CONDITIONS[appState.selectedBranch] || [];
  document.getElementById("resv-prev-conditions").innerHTML = conditions
    .map(c => `<p>* ${escapeHtml(c.text)}</p>`).join("") ||
    `<p class="room-detail-empty">No conditions set.</p>`;

  // Save the reservation as a record, not just a printed page — the
  // Reservations list reads from this, and a travel agent invoice is
  // raised against it later using these same details.
  RESERVATIONS.push({
    id: reservationId,
    no: reservationId,
    branch: appState.selectedBranch,
    title,
    guestName,
    adults,
    children,
    guestTotal: adults + children,
    contact: document.getElementById("resv-contact").value.trim(),
    checkinDate,
    checkinTime: document.getElementById("resv-checkin-time").value,
    checkoutDate,
    checkoutTime: document.getElementById("resv-checkout-time").value,
    nights,
    bookingType: document.getElementById("resv-booking-type").value.trim(),
    villas,
    status: RESERVATION_STATUS.CONFIRMED,
    // Set when the guest actually arrives and a GRC turns this into a stay.
    bookingId: null,
    cancelledAt: null,
    cancelReason: "",
    createdAt: new Date().toISOString(),
  });
  refreshReservationsList();

  showToast("Reservation confirmation generated");
  showScreen("screen-reservation-preview");
  // Re-armed on the next task, not inline: requestSubmit() dispatches
  // synchronously, so clearing it here would let a burst of taps through.
  // Deferring also keeps the "← Edit" path working — unlike the invoice
  // form, this screen can legitimately be resubmitted after an edit, so
  // the flag can't stay latched until the next reset.
  setTimeout(() => { isGeneratingReservation = false; }, 0);
});

document.getElementById("resv-new-btn").addEventListener("click", () => {
  resetReservationForm();
  showScreen("screen-reservation-form");
});

document.getElementById("resv-print-btn").addEventListener("click", () => window.print());

document.getElementById("resv-image-btn").addEventListener("click", () => {
  const target = document.getElementById("reservation-preview");
  // See the matching note in invoice.js — a missing CDN script throws
  // synchronously, so .catch() alone leaves the button silently dead.
  if (typeof html2canvas !== "function") {
    showToast("Image export needs a connection — use Print instead");
    return;
  }
  try {
    html2canvas(target, { scale: 2, backgroundColor: "#ffffff" }).then(canvas => {
      const link = document.createElement("a");
      // Cap the filename — a very long guest name produced a path some
      // filesystems reject, and the download then failed with no message.
      const guestName = (document.getElementById("resv-prev-guest-name").textContent || "")
        .replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "reservation";
      link.download = `LeopardInn-Reservation-${guestName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    }).catch(() => showToast("Couldn't generate image"));
  } catch {
    showToast("Couldn't generate image");
  }
});

// Guest counts and villa rates print onto a guest-facing document, so cap
// them as they're typed rather than letting a stray keystroke through.
[["resv-adults", MAX_COUNT], ["resv-children", MAX_COUNT]]
  .forEach(([id, max]) => capNumericInput(document.getElementById(id), max));
