import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, fmtLKR, formatDate, setLogoSrc, showToast, todayISO } from "./utils.js";
import { BRANCH_INFO } from "./data/branches.js";

const villaList = document.getElementById("resv-villa-list");

function addVillaRow(name = "", rate = "") {
  const row = document.createElement("div");
  row.className = "villa-rate-row";
  row.innerHTML = `
    <input type="text" class="villa-name-input" placeholder="Villa name" value="${escapeHtml(name)}">
    <input type="number" class="villa-rate-input" placeholder="Rate (LKR)" min="0" step="1" inputmode="decimal" value="${rate}">
    <button type="button" class="remove-ingredient-btn" aria-label="Remove villa">&times;</button>
  `;
  row.querySelector(".remove-ingredient-btn").addEventListener("click", () => row.remove());
  villaList.appendChild(row);
}

function resetReservationForm() {
  document.getElementById("reservation-form").reset();
  document.getElementById("resv-checkin-date").value = todayISO();
  document.getElementById("resv-checkin-time").value = "14:00";
  document.getElementById("resv-checkout-date").value = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  document.getElementById("resv-checkout-time").value = "11:00";
  villaList.innerHTML = "";
  addVillaRow();
  document.getElementById("resv-guest-name-error").classList.remove("show");
  document.getElementById("resv-guest-name").classList.remove("invalid");
  document.getElementById("resv-checkout-date-error").classList.remove("show");
  document.getElementById("resv-checkout-date").classList.remove("invalid");
}

document.getElementById("resv-add-villa-btn").addEventListener("click", () => addVillaRow());

document.getElementById("qa-reservation-btn").addEventListener("click", () => {
  document.getElementById("resv-form-branch-label").textContent = appState.selectedBranchLabel;
  setLogoSrc("resv-form-logo", appState.selectedBranchLogo);
  resetReservationForm();
  showScreen("screen-reservation-form");
});

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
  const [h, m] = value.split(":").map(Number);
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

document.getElementById("reservation-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!validateReservationForm()) return;

  const branchInfo = BRANCH_INFO[appState.selectedBranch] || {};
  const title = document.getElementById("resv-title").value;
  const guestName = resvGuestNameInput.value.trim();
  const adults = parseInt(document.getElementById("resv-adults").value, 10) || 0;
  const children = parseInt(document.getElementById("resv-children").value, 10) || 0;
  const checkinDate = resvCheckinDateInput.value;
  const checkoutDate = resvCheckoutDateInput.value;
  const nights = reservationNights(checkinDate, checkoutDate);

  const villas = [...villaList.querySelectorAll(".villa-rate-row")]
    .map(row => ({
      name: row.querySelector(".villa-name-input").value.trim(),
      rate: parseFloat(row.querySelector(".villa-rate-input").value) || 0,
    }))
    .filter(v => v.name || v.rate);

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

  showToast("Reservation confirmation generated");
  showScreen("screen-reservation-preview");
});

document.getElementById("resv-new-btn").addEventListener("click", () => {
  resetReservationForm();
  showScreen("screen-reservation-form");
});

document.getElementById("resv-print-btn").addEventListener("click", () => window.print());

document.getElementById("resv-image-btn").addEventListener("click", () => {
  const target = document.getElementById("reservation-preview");
  html2canvas(target, { scale: 2, backgroundColor: "#ffffff" }).then(canvas => {
    const link = document.createElement("a");
    const guestName = document.getElementById("resv-prev-guest-name").textContent.replace(/[^a-z0-9]+/gi, "-") || "reservation";
    link.download = `LeopardInn-Reservation-${guestName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }).catch(() => showToast("Couldn't generate image"));
});
