import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import {
  escapeHtml, formatDate, fmtLKR, setLogoSrc, showToast, toDateISO,
  nightsBetween, clampMoney, capNumericInput, MAX_COUNT, MAX_MONEY, orDash,
} from "./utils.js";
import { BRANCH_INFO } from "./data/branches.js";
import { openReservations, findReservationById, RESERVATION_STATUS } from "./data/reservations.js";
import { refreshReservationsList } from "./reservations.js";
import { attachSuggestions, SUGGESTION_KEYS } from "./suggestions.js";
import { BOOKING_SOURCES } from "./data/charges.js";
import {
  GRC_RECORDS, allocateGrcNo, findGrcByBookingId, ROOM_TYPES, MEAL_PLANS, GRC_LIABILITY_NOTICE,
  STANDARD_CHECKIN_TIME, STANDARD_CHECKOUT_TIME,
  DEFAULT_ARRIVAL_TIME, DEFAULT_DEPARTURE_TIME,
} from "./data/grc.js";

// The Guest Registration Card is a legal requirement at check-in, so this
// screen replaces the old four-field check-in form entirely: no booking
// exists until the card is completed. rooms.js hands us the villa and
// gets a completed card back via the onComplete callback.

const TOTAL_STEPS = 4;
const STEP_TITLES = { 1: "Guest", 2: "Stay", 3: "Hotel Use", 4: "Confirm" };
let currentStep = 1;

// The villa this card is being filled in for, plus what to do once it's
// done. Set by openGrcForm(); cleared when the card is completed or
// abandoned, so a stale villa can never be checked into by accident.
let context = null;

// Confirmed reservations for this villa, offered at the top of the card.
let matchingReservations = [];
let linkedReservation = null;

const el = (id) => document.getElementById(id);
const val = (id) => (el(id).value || "").trim();

function setStep(step) {
  currentStep = Math.min(Math.max(step, 1), TOTAL_STEPS);
  document.querySelectorAll("#screen-grc-form .form-step").forEach(s => {
    s.classList.toggle("active", Number(s.dataset.step) === currentStep);
  });
  document.querySelectorAll("#grc-stepper .stepper-item").forEach(item => {
    const n = Number(item.dataset.step);
    item.dataset.state = n < currentStep ? "done" : n === currentStep ? "active" : "upcoming";
    item.classList.toggle("line-filled", currentStep > n);
  });
  el("grc-step-announce").textContent = `Step ${currentStep} of ${TOTAL_STEPS}: ${STEP_TITLES[currentStep]}`;
  el("grc-step-prev").style.display = currentStep === 1 ? "none" : "";
  el("grc-step-next").style.display = currentStep === TOTAL_STEPS ? "none" : "";
  el("grc-submit-btn").style.display = currentStep === TOTAL_STEPS ? "" : "none";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showError(errorId, fieldId) {
  el(errorId).classList.add("show");
  if (fieldId) {
    el(fieldId).classList.add("invalid");
    el(fieldId).focus();
  }
  return false;
}

function validateStep(step) {
  if (step === 1) {
    if (!val("grc-guest-name")) return showError("grc-guest-name-error", "grc-guest-name");
    el("grc-guest-name-error").classList.remove("show");
    el("grc-guest-name").classList.remove("invalid");

    // A registration card with no identity document on it doesn't satisfy
    // the thing it exists for, so one of the two is required — but which
    // one depends on whether the guest is local or foreign, so neither can
    // be required on its own.
    if (!val("grc-passport") && !val("grc-nic")) {
      el("grc-id-error").classList.add("show");
      el("grc-passport").focus();
      return false;
    }
    el("grc-id-error").classList.remove("show");
  }

  if (step === 2) {
    const arrival = val("grc-arrival-date");
    const departure = val("grc-departure-date");
    if (arrival && departure && departure <= arrival) {
      return showError("grc-departure-error", "grc-departure-date");
    }
    el("grc-departure-error").classList.remove("show");
    el("grc-departure-date").classList.remove("invalid");

    const heads = paxTotal();
    if (heads <= 0) {
      el("grc-pax-error").classList.add("show");
      el("grc-adults").focus();
      return false;
    }
    el("grc-pax-error").classList.remove("show");
  }
  return true;
}

function paxCount(id) {
  return Math.floor(clampMoney(el(id).value, MAX_COUNT));
}

function paxTotal() {
  return paxCount("grc-adults") + paxCount("grc-children") + paxCount("grc-kids") + paxCount("grc-guide-pax");
}

// Nights and room number are derived, never typed — they have to agree
// with the booking this card creates.
function syncDerivedFields() {
  const arrival = val("grc-arrival-date");
  const departure = val("grc-departure-date");
  const nights = arrival && departure && departure > arrival ? nightsBetween(arrival, departure) : 0;
  el("grc-nights").value = nights ? String(nights) : "—";
  el("grc-room-no").value = context ? context.room.name : "";
}

export function openGrcForm({ branch, room, onComplete }) {
  context = { branch, room, onComplete };
  linkedReservation = null;

  el("grc-form").reset();
  document.querySelectorAll("#screen-grc-form .field-error").forEach(e => e.classList.remove("show"));
  document.querySelectorAll("#screen-grc-form .invalid").forEach(e => e.classList.remove("invalid"));

  el("grc-form-villa").textContent = room.name || "Villa";
  setLogoSrc("grc-form-logo", appState.selectedBranchLogo);

  // A guest who reserved ahead already told us most of this. Offering the
  // matching reservations closes a real gap: before, a reservation and the
  // check-in that fulfilled it were unrelated records, so the reservation
  // stayed "upcoming" forever and staff retyped details they already had.
  matchingReservations = openReservations(branch).filter(r =>
    (r.villas || []).some(v => v.roomId === room.id));
  const picker = el("grc-reservation-picker");
  picker.hidden = matchingReservations.length === 0;
  if (matchingReservations.length) {
    el("grc-reservation-select").innerHTML =
      `<option value="">Walk-in — no reservation</option>` +
      matchingReservations.map(r =>
        `<option value="${r.id}">RES-${r.no} · ${escapeHtml(r.guestName)} · ${formatDate(r.checkinDate)}</option>`
      ).join("");
  }

  el("grc-room-type").innerHTML = ROOM_TYPES.map(t => `<option value="${t}">${t}</option>`).join("");
  el("grc-meal-plan").innerHTML = MEAL_PLANS.map(m => `<option value="${m}">${m}</option>`).join("");
  el("grc-liability-preview").textContent = GRC_LIABILITY_NOTICE;

  const today = toDateISO();
  el("grc-arrival-date").value = today;
  el("grc-arrival-time").value = DEFAULT_ARRIVAL_TIME;
  el("grc-departure-date").value = toDateISO(new Date(Date.now() + 86400000));
  el("grc-departure-time").value = DEFAULT_DEPARTURE_TIME;
  el("grc-adults").value = "1";
  el("grc-children").value = "0";
  el("grc-kids").value = "0";
  el("grc-guide-pax").value = "0";

  syncDerivedFields();
  setStep(1);
  showScreen("screen-grc-form");
}

// Picking a reservation fills in what the guest already told us when they
// booked. Everything stays editable — the reservation is a starting point,
// not a lock, since details change between booking and arrival.
el("grc-reservation-select").addEventListener("change", (e) => {
  const id = Number(e.target.value);
  linkedReservation = id ? findReservationById(id) : null;
  if (!linkedReservation) return;

  const r = linkedReservation;
  el("grc-guest-name").value = r.guestName || "";
  el("grc-phone").value = r.contact || "";
  el("grc-arrival-date").value = r.checkinDate || "";
  el("grc-arrival-time").value = r.checkinTime || DEFAULT_ARRIVAL_TIME;
  el("grc-departure-date").value = r.checkoutDate || "";
  el("grc-departure-time").value = r.checkoutTime || DEFAULT_DEPARTURE_TIME;
  el("grc-adults").value = String(r.adults ?? 1);
  el("grc-children").value = String(r.children ?? 0);
  el("grc-reservation-by").value = `RES-${r.no}`;
  // The reservation's booking type is the meal plan on the card, when it
  // matches one the card knows about.
  if (MEAL_PLANS.includes(r.bookingType)) el("grc-meal-plan").value = r.bookingType;

  el("grc-guest-name-error").classList.remove("show");
  syncDerivedFields();
  showToast(`Filled in from RES-${r.no}`);
});

el("grc-step-next").addEventListener("click", () => {
  if (!validateStep(currentStep)) return;
  setStep(currentStep + 1);
});
el("grc-step-prev").addEventListener("click", () => setStep(currentStep - 1));

["grc-arrival-date", "grc-departure-date"].forEach(id => {
  el(id).addEventListener("change", syncDerivedFields);
  el(id).addEventListener("input", () => {
    el("grc-departure-error").classList.remove("show");
    el("grc-departure-date").classList.remove("invalid");
  });
});
el("grc-arrival-date").addEventListener("change", () => {
  el("grc-departure-date").min = el("grc-arrival-date").value;
});
el("grc-guest-name").addEventListener("input", () => {
  el("grc-guest-name-error").classList.remove("show");
  el("grc-guest-name").classList.remove("invalid");
});
["grc-passport", "grc-nic"].forEach(id => {
  el(id).addEventListener("input", () => el("grc-id-error").classList.remove("show"));
});
["grc-adults", "grc-children", "grc-kids", "grc-guide-pax"].forEach(id => {
  el(id).addEventListener("input", () => el("grc-pax-error").classList.remove("show"));
  capNumericInput(el(id), MAX_COUNT);
});
capNumericInput(el("grc-total-amount"), MAX_MONEY);

// Enter advances rather than submitting early — the submit button is the
// one that checks the guest in, so it must be pressed deliberately.
el("grc-form").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.target.tagName === "TEXTAREA") return;
  if (currentStep < TOTAL_STEPS) {
    e.preventDefault();
    el("grc-step-next").click();
  }
});

// Blocks a double submit from checking the same guest in twice. Reset only
// when a new card is opened, matching the invoice form's guard.
let isSubmitting = false;

el("grc-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (isSubmitting || !context) return;

  // Re-validate every step, not just the last one — a value can be edited
  // after its step was passed, and this submit is what creates the booking.
  for (let s = 1; s <= TOTAL_STEPS; s++) {
    if (!validateStep(s)) {
      setStep(s);
      return;
    }
  }
  isSubmitting = true;

  const arrival = val("grc-arrival-date");
  const departure = val("grc-departure-date");
  const record = {
    grcNo: allocateGrcNo(),
    branch: context.branch,
    roomId: context.room.id,
    roomName: context.room.name,
    bookingId: null, // set by the caller once the booking exists
    guestName: val("grc-guest-name"),
    address: val("grc-address"),
    country: val("grc-country"),
    nationality: val("grc-nationality"),
    passportNo: val("grc-passport"),
    nicNo: val("grc-nic"),
    phone: val("grc-phone"),
    email: val("grc-email"),
    previousDestination: val("grc-prev-destination"),
    nextDestination: val("grc-next-destination"),
    arrivalDate: arrival,
    arrivalTime: val("grc-arrival-time"),
    departureDate: departure,
    departureTime: val("grc-departure-time"),
    roomType: el("grc-room-type").value,
    mealPlan: el("grc-meal-plan").value,
    adults: paxCount("grc-adults"),
    children: paxCount("grc-children"),
    kids: paxCount("grc-kids"),
    guidePax: paxCount("grc-guide-pax"),
    nights: nightsBetween(arrival, departure),
    reservationMadeBy: val("grc-reservation-by"),
    travelAgent: val("grc-travel-agent"),
    guideChauffeur: val("grc-guide-name"),
    contactNo: val("grc-contact-no"),
    vehicleNo: val("grc-vehicle-no"),
    voucherNo: val("grc-voucher-no"),
    masterBillNo: val("grc-master-bill"),
    totalAmount: clampMoney(el("grc-total-amount").value),
    specialInstructions: val("grc-special"),
    reservationId: linkedReservation ? linkedReservation.id : null,
    reservationNo: linkedReservation ? linkedReservation.no : null,
    createdAt: new Date().toISOString(),
  };

  // The booking only comes into existence here — this is the point the
  // guest is actually checked in.
  const bookingId = context.onComplete(record);
  record.bookingId = bookingId ?? null;
  GRC_RECORDS.push(record);

  // The reservation is fulfilled the moment the guest is checked in — it
  // stops being an outstanding promise, and the villa is no longer
  // reserved for those nights because it is now occupied for them.
  if (linkedReservation) {
    linkedReservation.status = RESERVATION_STATUS.CHECKED_IN;
    linkedReservation.bookingId = record.bookingId;
    refreshReservationsList();
  }

  renderGrcPreview(record);
  setGrcPreviewReturn("screen-rooms", "Done");
  context = null;
  isSubmitting = false;
  showToast(`${record.guestName} checked in — print the card for signing`);
  showScreen("screen-grc-preview");
});

// Reopen the card for a stay already checked in. Once the preview screen
// was left there was no way back to it — the record existed but nothing
// read it — so a card lost before printing, or needed again later, was
// simply gone.
export function reprintGrc(bookingId) {
  const card = findGrcByBookingId(bookingId);
  if (!card) {
    // Stays that predate the card — the seeded bookings, or anything
    // checked in before this screen existed — genuinely have none.
    showToast("No registration card on file for this stay");
    return;
  }
  renderGrcPreview(card);
  setGrcPreviewReturn("screen-rooms", "Back");
  showScreen("screen-grc-preview");
}

// The preview is reached two ways: straight after checking a guest in,
// where "Done" ends the task, and by reopening it later from the villa,
// where the user is mid-flow and expects to return.
function setGrcPreviewReturn(screenId, label) {
  const btn = document.querySelector("#screen-grc-preview .back-btn");
  if (!btn) return;
  btn.dataset.back = screenId;
  btn.textContent = `← ${label}`;
}

function tickRows(options, selected) {
  return options.map(opt => `
    <tr>
      <td>${escapeHtml(opt)}</td>
      <td class="grc-tick">${opt === selected ? "&#10003;" : ""}</td>
    </tr>
  `).join("");
}

function formatTime12h(value) {
  if (!value) return "—";
  const [h, m] = String(value).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "—";
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${period}`;
}

function renderGrcPreview(g) {
  const info = BRANCH_INFO[g.branch] || {};
  el("grc-prev-hotel-name").textContent = info.hotelName || appState.selectedBranchLabel;
  el("grc-prev-address").textContent = info.address || "";
  el("grc-prev-contact-line").textContent =
    [info.phone ? `Tel ${info.phone}` : "", info.email ? `Email: ${info.email}` : ""].filter(Boolean).join("  •  ");
  setLogoSrc("grc-prev-logo", appState.selectedBranchLogo);

  el("grc-prev-no").textContent = String(g.grcNo);
  el("grc-prev-name").textContent = orDash(g.guestName);
  el("grc-prev-address-val").textContent = orDash(g.address);
  el("grc-prev-country").textContent = orDash(g.country);
  el("grc-prev-nationality").textContent = orDash(g.nationality);
  el("grc-prev-passport").textContent = orDash(g.passportNo);
  el("grc-prev-nic").textContent = orDash(g.nicNo);
  el("grc-prev-phone").textContent = orDash(g.phone);
  el("grc-prev-email").textContent = orDash(g.email);

  el("grc-prev-prevdest").textContent = orDash(g.previousDestination);
  el("grc-prev-nextdest").textContent = orDash(g.nextDestination);
  el("grc-prev-arrival").textContent = formatDate(g.arrivalDate);
  el("grc-prev-arrival-time").textContent = formatTime12h(g.arrivalTime);
  el("grc-prev-departure").textContent = formatDate(g.departureDate);
  el("grc-prev-departure-time").textContent = formatTime12h(g.departureTime);

  el("grc-prev-room-types").innerHTML = tickRows(ROOM_TYPES, g.roomType);
  el("grc-prev-meal-plans").innerHTML = tickRows(MEAL_PLANS, g.mealPlan);

  el("grc-prev-pax").innerHTML = [
    ["Adults", g.adults], ["Children", g.children], ["Kids", g.kids], ["Guide", g.guidePax],
  ].map(([label, n]) => `<span class="grc-pax-cell"><span>${label}</span><strong>${n}</strong></span>`).join("");

  el("grc-prev-liability").textContent = GRC_LIABILITY_NOTICE;
  el("grc-prev-std-in").textContent = STANDARD_CHECKIN_TIME;
  el("grc-prev-std-out").textContent = STANDARD_CHECKOUT_TIME;

  el("grc-prev-nights").textContent = String(g.nights);
  el("grc-prev-room-no").textContent = orDash(g.roomName);
  el("grc-prev-reservation-by").textContent = orDash(g.reservationMadeBy);
  el("grc-prev-travel-agent").textContent = orDash(g.travelAgent);
  el("grc-prev-guide").textContent = orDash(g.guideChauffeur);
  el("grc-prev-contact").textContent = orDash(g.contactNo);
  el("grc-prev-vehicle").textContent = orDash(g.vehicleNo);
  el("grc-prev-voucher").textContent = orDash(g.voucherNo);
  el("grc-prev-master-bill").textContent = orDash(g.masterBillNo);
  el("grc-prev-total").textContent = g.totalAmount ? fmtLKR(g.totalAmount) : "—";
  el("grc-prev-special").textContent = orDash(g.specialInstructions);
}

el("grc-print-btn").addEventListener("click", () => window.print());
el("grc-done-btn").addEventListener("click", () => showScreen("screen-rooms"));

// Fields that take the same few answers repeatedly. Seeded with what the
// staff's own records already show, so the very first card offers useful
// options rather than an empty list.
attachSuggestions(el("grc-guide-name"), SUGGESTION_KEYS.GUIDE, ["Ashen", "Pradeep", "Shalika", "Sanjula", "Ashik"]);
attachSuggestions(el("grc-travel-agent"), SUGGESTION_KEYS.TRAVEL_AGENT);
attachSuggestions(el("grc-country"), SUGGESTION_KEYS.COUNTRY, ["Sri Lanka", "India", "United Kingdom", "Germany", "France", "Netherlands", "Australia"]);
attachSuggestions(el("grc-nationality"), SUGGESTION_KEYS.NATIONALITY, ["Sri Lankan", "Indian", "British", "German", "French", "Dutch", "Australian"]);
attachSuggestions(el("grc-vehicle-no"), SUGGESTION_KEYS.VEHICLE);
attachSuggestions(el("grc-reservation-by"), SUGGESTION_KEYS.RESERVED_BY, BOOKING_SOURCES);
