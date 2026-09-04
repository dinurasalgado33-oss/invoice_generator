import { appState } from "./state.js";
import { readPhone, setPhone } from "./phone-field.js";
import { ensureHtml2Canvas } from "./cdn.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, fmtLKR, formatDate, setLogoSrc, showToast, todayISO, toDateISO, clampMoney, capNumericInput, MAX_COUNT, setBranchLabel } from "./utils.js";
import { BRANCH_INFO, RESERVATION_CONDITIONS } from "./data/branches.js";
import { ROOMS_BY_BRANCH } from "./data/rooms.js";
import {
  RESERVATIONS, allocateReservationNo, findConflicts, RESERVATION_STATUS, findReservationById, PROFORMA_INVOICES,
} from "./data/reservations.js";
import { takeNumber, DOC_TYPES } from "./data/numbering.js";
import { add, update, COLLECTIONS } from "./data/store.js";

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

// Which reservation is being corrected, or null when making a new one.
// This is for fixing a reservation that was entered wrongly — it keeps the
// same RES number and overwrites the record, rather than issuing a
// revision, because the case it exists for is a mistake caught before the
// document has gone anywhere.
let editingReservationId = null;

function fillReservationForm(r) {
  document.getElementById("resv-title").value = r.title || "";
  resvGuestNameInput.value = r.guestName || "";
  document.getElementById("resv-adults").value = r.adults ?? "";
  document.getElementById("resv-children").value = r.children ?? "";
  setPhone("resv-country-code", "resv-contact", r.contact);
  resvCheckinDateInput.value = r.checkinDate || "";
  document.getElementById("resv-checkin-time").value = r.checkinTime || "14:00";
  resvCheckoutDateInput.value = r.checkoutDate || "";
  document.getElementById("resv-checkout-time").value = r.checkoutTime || "11:00";
  document.getElementById("resv-booking-type").value = r.bookingType || "";

  villaList.innerHTML = "";
  const villas = (r.villas || []).filter(v => v.roomId != null);
  if (villas.length) villas.forEach(v => addVillaRow(v.roomId));
  else addVillaRow();
}

// Opened from the Reservations screen rather than straight off the home
// quick action — that now lands on the list, since a reservation is a
// record staff come back to, not just a document they print once.
export function openReservationForm(reservationId = null) {
  const existing = reservationId != null ? findReservationById(reservationId) : null;
  editingReservationId = existing ? existing.id : null;

  setBranchLabel("resv-form-branch-label", appState.selectedBranchLabel, appState.selectedBranch);
  setLogoSrc("resv-form-logo", appState.selectedBranchLogo);
  resetReservationForm();
  if (existing) fillReservationForm(existing);

  // The heading and the button have to say which of the two jobs this is,
  // or a correction looks exactly like making a second reservation.
  document.getElementById("resv-form-heading").textContent =
    existing ? `Correct ${existing.no}` : "New Reservation";
  document.getElementById("resv-submit-btn").textContent =
    existing ? "Save Changes" : "Generate Confirmation";

  showScreen("screen-reservation-form");
}

// An agent's invoice and the reservation behind it must never disagree
// about who is coming, when, or which villas. The invoice never let staff
// type those in the first place — it takes them from the reservation — so
// the only way they could drift was a reservation corrected afterwards.
// This pulls the derived fields back into step.
//
// Agreed rates are deliberately left alone: in a foreign currency the rate
// is what the agent contracted, which the reservation never knew. Nights
// and totals recompute around it. A line whose villa was dropped from the
// reservation is removed, since the invoice may not name a villa the guest
// no longer has.
function syncProformasToReservation(r) {
  const affected = PROFORMA_INVOICES.filter(p => p.reservationId === r.id);
  if (!affected.length) return;

  const stillBooked = new Set((r.villas || []).map(v => v.roomId));
  const villaById = new Map((r.villas || []).map(v => [v.roomId, v]));

  affected.forEach(p => {
    const items = (p.items || [])
      .filter(it => stillBooked.has(it.roomId))
      .map((it, i) => {
        const villa = villaById.get(it.roomId);
        const nights = r.nights || it.nights || 1;
        return {
          ...it,
          no: i + 1,
          desc: r.bookingType ? `${villa.name} (${r.bookingType})` : villa.name,
          qty: `${nights} Night${nights === 1 ? "" : "s"}`,
          nights,
          value: clampMoney(it.rate * nights),
        };
      });

    const billTotal = items.reduce((s, it) => s + it.value, 0);
    const discount = Math.min(clampMoney(p.discount), billTotal);
    const net = billTotal - discount;

    // Every changed field goes through this one update(), rather than being
    // assigned in place first. Correcting a reservation rewrites the agent
    // invoice's guest, dates, nights, line items and every total, and the
    // toast says so — "agent invoice updated too". Assigning left all of it
    // in this tab's memory only, so the stored document kept the
    // pre-correction figures under the same TRA number: the copy the agent
    // was sent and the copy the next device reprinted disagreed, with
    // nothing on screen admitting it.
    update(COLLECTIONS.PROFORMAS, p, {
      guestName: r.guestName,
      guestTotal: r.guestTotal,
      contact: r.contact,
      checkinDate: r.checkinDate,
      checkoutDate: r.checkoutDate,
      nights: r.nights,
      items,
      billTotal,
      discount,
      gross: billTotal,
      net,
      grandTotal: net - clampMoney(p.advance),
      correctedAt: new Date().toISOString(),
    });
  });
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
  // A reservation with no villa reserves nothing. It saved happily, and
  // the damage showed up later and somewhere else: the agent invoice
  // builds its lines from the reservation's villas, so it opened with no
  // charges and refused with "Add at least one charge" — which does not
  // mention villas, on a screen that has none to add. Caught here, where
  // the villa list actually is.
  const chosen = [...villaList.querySelectorAll(".villa-rate-row")]
    .filter(row => row.querySelector(".villa-name-select").value);
  if (!chosen.length) {
    const err = document.getElementById("resv-conflict-error");
    err.textContent = "Add at least one villa — a reservation has to reserve something.";
    err.classList.add("show");
    document.getElementById("resv-add-villa-btn").focus();
    return false;
  }
  return true;
}

// Renders the printable confirmation from a stored reservation. Shared by
// "generate" and by reprinting from the Reservations list, so both produce
// an identical document.
//
// The letterhead, bank details and conditions come from current branch
// config rather than being frozen into the record: if the hotel's phone
// number or bank account changes, a reprint should carry the number that
// works today, not the one that was right in March.

// hidePrices produces the guest's copy of an agent booking. The guest paid
// the agent, and what the agent pays the hotel is not their business — a
// confirmation showing the hotel's rate tells them exactly what the agent
// marked up. Villas and dates still confirm, which is the reassurance the
// guest actually wants.
function renderReservationPreview(r, { hidePrices = false } = {}) {
  const branchInfo = BRANCH_INFO[r.branch] || {};

  document.getElementById("resv-prev-pricing-section").hidden = hidePrices;
  // Bank details go too: paying the hotel direct is exactly the confusion
  // this document has to avoid.
  document.getElementById("resv-prev-payment-section").hidden = hidePrices;
  document.getElementById("resv-prev-agent-note-section").hidden = !hidePrices;
  if (hidePrices) {
    document.getElementById("resv-prev-agent-villas").innerHTML =
      (r.villas || []).map(v => `<p>${escapeHtml(v.name || "-")}</p>`).join("") ||
      `<p class="room-detail-empty">No villas added.</p>`;
  }

  document.getElementById("resv-prev-hotel-name").textContent = branchInfo.hotelName || appState.selectedBranchLabel;
  document.getElementById("resv-prev-address").textContent = branchInfo.address || "";
  document.getElementById("resv-prev-contact-line").textContent =
    [branchInfo.phone ? `Tel ${branchInfo.phone}` : "", branchInfo.email ? `Email: ${branchInfo.email}` : ""].filter(Boolean).join("  •  ");
  setLogoSrc("resv-prev-logo", appState.selectedBranchLogo);

  document.getElementById("resv-prev-guest-name").textContent =
    r.guestName ? `${r.title || ""} ${r.guestName}`.trim() : "-";
  document.getElementById("resv-prev-guest-total").textContent = String(r.guestTotal ?? 0);
  document.getElementById("resv-prev-adults").textContent = String(r.adults ?? 0);
  document.getElementById("resv-prev-children").textContent = String(r.children ?? 0);
  document.getElementById("resv-prev-contact").textContent = r.contact || "N/A";

  document.getElementById("resv-prev-checkin-date").textContent = r.checkinDate ? formatDate(r.checkinDate) : "N/A";
  document.getElementById("resv-prev-checkin-time").textContent = formatTime12h(r.checkinTime);
  document.getElementById("resv-prev-checkout-date").textContent = r.checkoutDate ? formatDate(r.checkoutDate) : "N/A";
  document.getElementById("resv-prev-checkout-time").textContent = formatTime12h(r.checkoutTime);
  document.getElementById("resv-prev-duration").textContent =
    r.nights ? `${r.nights} night${r.nights === 1 ? "" : "s"}` : "N/A";
  document.getElementById("resv-prev-villa-count").textContent = String((r.villas || []).length);
  document.getElementById("resv-prev-booking-type").textContent = r.bookingType || "N/A";

  document.getElementById("resv-prev-pricing-body").innerHTML = (r.villas || []).map(v => `
    <tr><td>${escapeHtml(v.name) || "-"}</td><td>${v.rate ? fmtLKR(v.rate) : "-"}</td></tr>
  `).join("") || `<tr><td colspan="2" class="room-detail-empty">No villas added.</td></tr>`;

  document.getElementById("resv-prev-bank-account-name").textContent = branchInfo.bankAccountName || "-";
  document.getElementById("resv-prev-bank-account-no").textContent = branchInfo.bankAccountNumber || "-";
  document.getElementById("resv-prev-bank").textContent = branchInfo.bankName || "-";
  document.getElementById("resv-prev-bank-branch").textContent = branchInfo.bankBranch || "-";

  // A condition ticked "hide from guest copies" is left off the guest's
  // copy of an agent booking. Payment terms are the case that matters: a
  // guest booking through an agent settles with the agent, so a condition
  // asking them to pay the hotel contradicts the note above it. This was a
  // regex hunting for currency in the wording, which guessed at the
  // manager's phrasing; the tick makes it their decision.
  const conditions = (RESERVATION_CONDITIONS[r.branch] || [])
    .filter(c => !(hidePrices && c.hideFromGuest));
  document.getElementById("resv-prev-conditions").innerHTML = conditions
    .map(c => `<p>* ${escapeHtml(c.text)}</p>`).join("") ||
    `<p class="room-detail-empty">No conditions set.</p>`;
}

// Reprint an already-issued confirmation — the guest lost their copy, or
// the agent wants it again. Read-only: it re-renders the stored record and
// changes nothing.
// Reachable from the Reservations list and from Guest History — the
// caller says which, so Back cannot land on a screen nobody came from.
export function reprintReservation(reservationId, returnTo = "screen-reservations", { hidePrices = false } = {}) {
  const r = RESERVATIONS.find(x => x.id === reservationId);
  if (!r) {
    showToast("That reservation is no longer available");
    return;
  }
  renderReservationPreview(r, { hidePrices });
  // Arriving from the list, "Edit" would drop the user on a blank form —
  // the form holds no state for an already-issued reservation. Send them
  // back where they came from instead.
  setPreviewReturn(returnTo, "Back");
  showScreen("screen-reservation-preview");
}

// The preview is reached two ways — straight after generating (where going
// back to the form to amend makes sense) and by reprinting from the list
// (where it does not). The back button follows whichever it was.
function setPreviewReturn(screenId, label) {
  const btn = document.querySelector('#screen-reservation-preview .back-btn');
  if (!btn) return;
  btn.dataset.back = screenId;
  btn.textContent = `← ${label}`;
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

  // A correction keeps its own number. Allocating unconditionally would
  // burn a fresh one on every edit, leaving gaps that look like deleted
  // reservations.
  const existing = editingReservationId != null ? findReservationById(editingReservationId) : null;
  const reservationId = existing ? existing.id : allocateReservationNo();

  // A correction keeps the number it was issued under. Only a new
  // reservation draws one, and if none is available it is refused rather
  // than given a number that might already be on someone else's paper.
  let issued = existing ? null : takeNumber(appState.selectedBranch, DOC_TYPES.RESERVATION);
  if (!existing && !issued) {
    const errorEl = document.getElementById("resv-conflict-error");
    errorEl.textContent = "No reservation numbers left on this device — reconnect and try again.";
    errorEl.classList.add("show");
    errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
    isGeneratingReservation = false;
    return;
  }
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
  // ignoreId keeps a reservation from clashing with itself when it's being
  // corrected — without it, changing a guest's name would be refused
  // because those villas are "already reserved", by this very record.
  const conflicts = findConflicts({
    branch: appState.selectedBranch,
    villas,
    checkinDate,
    checkoutDate,
    ignoreId: editingReservationId,
  });
  if (conflicts.length) {
    const detail = conflicts.map(c =>
      `${c.villas.map(v => v.name).join(", ")} — ${c.reservation.no} (${c.reservation.guestName}, ${formatDate(c.reservation.checkinDate)} → ${formatDate(c.reservation.checkoutDate)})`
    ).join("; ");
    const errorEl = document.getElementById("resv-conflict-error");
    errorEl.textContent = `Already reserved: ${detail}`;
    errorEl.classList.add("show");
    errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
    isGeneratingReservation = false;
    return;
  }
  document.getElementById("resv-conflict-error").classList.remove("show");

  // The record is built first and the document rendered from it, rather
  // than from the form fields — that way reprinting an old reservation
  // runs the exact same code, so a reprint can't quietly differ from what
  // the guest was originally sent.
  const record = {
    id: reservationId,
    // The number printed on the document, issued from this device's
    // reserved block. Held as the formatted string because that is what a
    // guest and an accountant both refer to.
    no: existing ? existing.no : issued.formatted,
    financialYear: existing ? existing.financialYear : issued.fy,
    sequence: existing ? existing.sequence : issued.seq,
    branch: appState.selectedBranch,
    title,
    guestName,
    adults,
    children,
    guestTotal: adults + children,
    contact: readPhone("resv-country-code", "resv-contact"),
    checkinDate,
    checkinTime: document.getElementById("resv-checkin-time").value,
    checkoutDate,
    checkoutTime: document.getElementById("resv-checkout-time").value,
    nights,
    bookingType: document.getElementById("resv-booking-type").value.trim(),
    villas,
    // A correction must not resurrect a cancelled reservation, un-link a
    // stay that has already started, or reset when it was taken.
    status: existing ? existing.status : RESERVATION_STATUS.CONFIRMED,
    // Set when the guest actually arrives and a GRC turns this into a stay.
    bookingId: existing ? existing.bookingId : null,
    cancelledAt: existing ? existing.cancelledAt : null,
    cancelReason: existing ? existing.cancelReason : "",
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    correctedAt: existing ? new Date().toISOString() : null,
  };

  if (existing) {
    // Overwrite in place so every reference to this reservation — the
    // agent's invoice, a linked check-in — keeps pointing at one record.
    update(COLLECTIONS.RESERVATIONS, existing, record);
    syncProformasToReservation(existing);
  } else {
    add(COLLECTIONS.RESERVATIONS, RESERVATIONS, record);
  }
  // Repaint the list behind us. Imported here rather than at the top of the
  // file because the list screen imports *this* one, and a static import
  // both ways is a cycle — which works today only because both sides export
  // hoisted function declarations and nothing calls them while the modules
  // are still evaluating. Neither of those is a property anyone would think
  // to preserve while editing.
  //
  // Not awaited: this runs mid-submit, and yielding here would let the
  // rest of the flow — including the isSubmitting reset — happen out of
  // order. The list is not the screen we are about to show, so it has
  // until the next paint.
  import("./reservations.js").then(m => m.refreshReservationsList());

  renderReservationPreview(record, { hidePrices: false });
  setPreviewReturn("screen-reservation-form", "Edit");
  const syncedInvoices = existing
    ? PROFORMA_INVOICES.filter(p => p.reservationId === existing.id).length
    : 0;
  showToast(existing
    ? `${record.no} updated${syncedInvoices ? ` — agent invoice updated too` : ""}`
    : "Reservation confirmation generated");
  // Cleared here, not in openReservationForm: leaving it set would make the
  // next new reservation silently overwrite the one just corrected.
  editingReservationId = null;
  showScreen("screen-reservation-preview");
  // Re-armed on the next task, not inline: requestSubmit() dispatches
  // synchronously, so clearing it here would let a burst of taps through.
  // Deferring also keeps the "← Edit" path working — unlike the invoice
  // form, this screen can legitimately be resubmitted after an edit, so
  // the flag can't stay latched until the next reset.
  setTimeout(() => { isGeneratingReservation = false; }, 0);
});

// Lands back on the Reservations list, where the reservation just made is
// now a row that can be reprinted, invoiced to an agent, or cancelled.
document.getElementById("resv-new-btn").addEventListener("click", async () => {
  resetReservationForm();
  const { openReservationsScreen } = await import("./reservations.js");
  openReservationsScreen();
});

document.getElementById("resv-print-btn").addEventListener("click", () => window.print());

document.getElementById("resv-image-btn").addEventListener("click", async () => {
  const target = document.getElementById("reservation-preview");
  // See the matching note in invoice.js — the script is fetched on first
  // use now, and a missing one throws synchronously, so .catch() alone
  // leaves the button silently dead.
  if (!await ensureHtml2Canvas()) {
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
