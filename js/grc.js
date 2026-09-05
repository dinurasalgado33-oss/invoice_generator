import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import {
  escapeHtml, formatDate, fmtLKR, setLogoSrc, showToast, toDateISO,
  nightsBetween, clampMoney, capNumericInput, MAX_COUNT, orDash,
} from "./utils.js";
import { BRANCH_INFO } from "./data/branches.js";
import { openReservations, findReservationById, RESERVATION_STATUS } from "./data/reservations.js";
import { refreshReservationsList } from "./reservations.js";
import { attachSuggestions, SUGGESTION_KEYS } from "./suggestions.js";
import { makeStepperNavigable } from "./stepper.js";
import { readPhone, setPhone } from "./phone-field.js";
import { bookingSourcesFor, mealPlanTotal, mealPlanRateFor, planKey } from "./data/charges.js";
import { queueWelcomeEmail } from "./data/guest-email.js";
import { add, update, COLLECTIONS } from "./data/store.js";
import {
  GRC_RECORDS, findGrcByBookingId, ROOM_TYPES, MEAL_PLANS, liabilityNoticeFor,
  standardTimesFor, displayTime,
} from "./data/grc.js";
import { takeNumber, DOC_TYPES } from "./data/numbering.js";

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

    // The welcome e-mail carries the menu, so a blank address is a guest
    // who silently gets nothing. Not required outright — plenty of guests
    // genuinely have no e-mail — but it cannot be skipped by accident.
    if (!val("grc-email") && !el("grc-no-email").checked) {
      return showError("grc-email-error", "grc-email");
    }
    el("grc-email-error").classList.remove("show");
    el("grc-email").classList.remove("invalid");
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
// Villas this card covers: the reservation's, when one is linked and its
// villas are free, otherwise just the one being checked into.
function villaNamesForStay() {
  if (!context) return "";
  if (!linkedReservation) return context.room.name;
  const names = (linkedReservation.villas || []).map(v => v.name).filter(Boolean);
  return names.length ? names.join(" + ") : context.room.name;
}

// The villas this card covers, each with the nightly rate it should be
// charged at. A linked reservation carries its own rate snapshot, which is
// what the guest was actually quoted — using today's configured rate
// instead would quietly re-price a stay that was agreed weeks ago.
function villaRatesForStay() {
  if (!context) return [];
  if (linkedReservation && (linkedReservation.villas || []).length) {
    return linkedReservation.villas.map(v => ({ name: v.name, rate: clampMoney(v.rate) }));
  }
  return [{ name: context.room.name, rate: clampMoney(context.room.rate) }];
}

// Room charge for the whole stay: every villa's nightly rate times the
// nights. Same arithmetic the reservation uses, so the card, the
// confirmation and the eventual invoice all say the same number.
function stayTotal(nights) {
  if (!nights) return 0;
  const villas = villaRatesForStay();
  const rooms = villas.reduce((sum, v) => sum + v.rate * nights, 0);
  // Whatever the booking type adds, on the same terms the invoice will
  // use — one function, so the card and the bill cannot disagree.
  const plan = linkedReservation ? linkedReservation.bookingType : el("grc-meal-plan").value;
  return rooms + mealPlanTotal(appState.selectedBranch, plan, villas.length, nights);
}

function syncDerivedFields() {
  const arrival = val("grc-arrival-date");
  const departure = val("grc-departure-date");
  const nights = arrival && departure && departure > arrival ? nightsBetween(arrival, departure) : 0;
  el("grc-nights").value = nights ? String(nights) : "—";
  // Lists every villa on the stay once a reservation is linked — the card
  // is one document for the whole party, so naming only the villa staff
  // happened to start from would understate what they were given.
  el("grc-room-no").value = villaNamesForStay();

  // Total was a free number field: staff had to work out rate × nights in
  // their head and type it onto a document the guest signs. It is derived
  // now, and shows its working so the figure can be checked at a glance.
  const villas = villaRatesForStay();
  const total = stayTotal(nights);
  el("grc-total-amount").value = nights ? fmtLKR(total) : "—";
  // The working has to add up to the total beside it. When a booking type
  // carries a supplement it is part of that sum, so it is part of the
  // working — a line reading "8,500 × 2 nights" under a total of 22,000 is
  // a document arguing with itself.
  const plan = linkedReservation ? linkedReservation.bookingType : el("grc-meal-plan").value;
  const planRate = mealPlanRateFor(appState.selectedBranch, plan);
  const terms = villas.map(v => `${v.name} ${fmtLKR(v.rate)} × ${nights} night${nights === 1 ? "" : "s"}`);
  if (planRate > 0) {
    terms.push(`${plan} ${fmtLKR(planRate)} × ${villas.length} villa${villas.length === 1 ? "" : "s"} × ${nights} night${nights === 1 ? "" : "s"}`);
  }
  el("grc-total-basis").textContent = nights
    ? terms.join("  +  ")
    : "Set the arrival and departure dates to work out the total.";
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

  // Rebuilt every time, including when there is nothing to offer.
  //
  // This used to only run when there WERE matches, which left the
  // previous villa's options sitting in the DOM. Paired with a `hidden`
  // that did not hide (see [hidden] in base.css), the picker stayed on
  // screen at the next villa still offering a reservation that belonged
  // to a different one — and choosing it silently rewrote the villa field
  // to the reservation's villa. Clearing unconditionally also matters for
  // the keyboard and for screen readers, which can still reach options
  // inside a hidden element in some browsers.
  el("grc-reservation-select").innerHTML = matchingReservations.length
    ? `<option value="">Walk-in — no reservation</option>` +
      matchingReservations.map(r =>
        `<option value="${r.id}">${r.no} · ${escapeHtml(r.guestName)} · ${formatDate(r.checkinDate)}</option>`
      ).join("")
    : "";

  el("grc-room-type").innerHTML = ROOM_TYPES.map(t => `<option value="${t}">${t}</option>`).join("");
  el("grc-meal-plan").innerHTML = MEAL_PLANS.map(m => `<option value="${m}">${m}</option>`).join("");
  el("grc-liability-preview").textContent = liabilityNoticeFor(branch);

  const today = toDateISO();
  el("grc-arrival-date").value = today;
  // Prefilled from the property's own standard times, not from a separate
  // pair of constants. They were the same two values written twice, so a
  // manager moving check-in to 3pm would have changed what the card
  // *printed* while the form still suggested 2pm.
  const stdTimes = standardTimesFor(branch);
  el("grc-arrival-time").value = stdTimes.checkin;
  el("grc-departure-date").value = toDateISO(new Date(Date.now() + 86400000));
  el("grc-departure-time").value = stdTimes.checkout;
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
  // The option value is a reservation UUID, so it is used as-is. Number()
  // here yielded NaN, which is falsy — so picking a reservation silently
  // did nothing at all, and `linkedReservation` stayed null right through
  // submit. The empty value is the "Walk-in" option, and is falsy too,
  // which is what keeps that branch working.
  const id = e.target.value;
  linkedReservation = id ? findReservationById(id) : null;
  if (!linkedReservation) return;

  const r = linkedReservation;
  el("grc-guest-name").value = r.guestName || "";
  setPhone("grc-country-code", "grc-phone", r.contact);
  // Only when the reservation carries one. An empty reservation e-mail must
  // not wipe an address reception has already typed on the card.
  if (r.email) {
    el("grc-email").value = r.email;
    el("grc-no-email").checked = false;
  }
  el("grc-arrival-date").value = r.checkinDate || "";
  el("grc-arrival-time").value = r.checkinTime || standardTimesFor(appState.selectedBranch).checkin;
  el("grc-departure-date").value = r.checkoutDate || "";
  el("grc-departure-time").value = r.checkoutTime || standardTimesFor(appState.selectedBranch).checkout;
  el("grc-adults").value = String(r.adults ?? 1);
  el("grc-children").value = String(r.children ?? 0);
  el("grc-reservation-by").value = `${r.no}`;
  // The reservation's booking type is the meal plan on the card.
  //
  // Matched on the normalised key, not the exact string. A reservation
  // says "HB" and this list says "H/B", so an exact match never found
  // anything: the card kept its default of R/O — room only — while the
  // guest was on half board and being charged for it. The money was right,
  // because that comes from the booking type; the card the guest signs was
  // the thing saying otherwise.
  const wanted = planKey(r.bookingType);
  const match = MEAL_PLANS.find(m => planKey(m) === wanted);
  if (match) el("grc-meal-plan").value = match;

  el("grc-guest-name-error").classList.remove("show");
  syncDerivedFields();
  showToast(`Filled in from ${r.no}`);
});

// Going to a step, having checked it is allowed.
//
// Backwards is always allowed. Forwards, every step being *skipped* has to
// be valid, not just the one being left — a distinction that did not
// matter while Next was the only way to move, because Next only ever
// crosses one step. The stepper circles are live now, so it does.
function goToStep(step) {
  const target = Math.min(Math.max(step, 1), TOTAL_STEPS);
  if (target > currentStep) {
    for (let s = currentStep; s < target; s++) {
      if (validateStep(s)) continue;
      // Land on the unfinished step so the person can see what is wrong,
      // then validate it again — the first run marked the field and tried
      // to focus it while it was still off screen.
      if (s !== currentStep) {
        setStep(s);
        validateStep(s);
      }
      return;
    }
  }
  setStep(target);
}

el("grc-step-next").addEventListener("click", () => goToStep(currentStep + 1));
el("grc-step-prev").addEventListener("click", () => goToStep(currentStep - 1));

// The circles move the card too. Same reasoning as the invoice: a control
// that looks pressable and is not teaches people to distrust the screen.
makeStepperNavigable(
  [...document.querySelectorAll("#grc-stepper .stepper-item")],
  goToStep,
  () => currentStep
);

["grc-email", "grc-no-email"].forEach(id => {
  el(id).addEventListener("input", () => {
    el("grc-email-error").classList.remove("show");
    el("grc-email").classList.remove("invalid");
  });
  el(id).addEventListener("change", () => {
    el("grc-email-error").classList.remove("show");
    el("grc-email").classList.remove("invalid");
  });
});

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
  // A registration card is a signed legal document the hotel is required
  // to keep, so its number comes from this device's reserved block like
  // every other document — and is refused rather than guessed at if none
  // is available.
  const issued = takeNumber(context.branch, DOC_TYPES.GRC);
  if (!issued) {
    showToast("No card numbers left on this device — reconnect and try again");
    return;
  }

  isSubmitting = true;

  const arrival = val("grc-arrival-date");
  const departure = val("grc-departure-date");
  const record = {
    grcNo: issued.formatted,
    financialYear: issued.fy,
    sequence: issued.seq,
    branch: context.branch,
    roomId: context.room.id,
    roomName: villaNamesForStay(),
    bookingId: null, // set by the caller once the booking exists
    guestName: val("grc-guest-name"),
    address: val("grc-address"),
    country: val("grc-country"),
    nationality: val("grc-nationality"),
    passportNo: val("grc-passport"),
    nicNo: val("grc-nic"),
    phone: readPhone("grc-country-code", "grc-phone"),
    email: val("grc-email"),
    noEmail: el("grc-no-email").checked,
    previousDestination: val("grc-prev-destination"),
    nextDestination: val("grc-next-destination"),
    arrivalDate: arrival,
    arrivalTime: val("grc-arrival-time"),
    departureDate: departure,
    departureTime: val("grc-departure-time"),
    roomType: el("grc-room-type").value,
    mealPlan: el("grc-meal-plan").value,
    // The reservation's booking type, kept beside the meal plan so the
    // invoice can price this stay without re-deriving which reservation
    // the card came from. A walk-in has no reservation, so the meal plan
    // chosen on the card is the booking type.
    bookingType: linkedReservation ? (linkedReservation.bookingType || "") : el("grc-meal-plan").value,
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
    // Recomputed rather than read back off the field, which now holds a
    // formatted string ("LKR 75,000.00") that would not parse cleanly.
    totalAmount: stayTotal(nightsBetween(arrival, departure)),
    specialInstructions: val("grc-special"),
    reservationId: linkedReservation ? linkedReservation.id : null,
    reservationNo: linkedReservation ? linkedReservation.no : null,
    createdAt: new Date().toISOString(),
  };

  // The booking only comes into existence here — this is the point the
  // guest is actually checked in.
  // The linked reservation goes through too: it decides which villas the
  // stay covers, which only the caller can act on.
  const bookingId = context.onComplete(record, linkedReservation);
  record.bookingId = bookingId ?? null;
  add(COLLECTIONS.GRC, GRC_RECORDS, record);

  // Queued, not sent: sending is the server's job. A guest with no address
  // gets a row marked "No e-mail" rather than no row, so the question
  // "why did this one get nothing" always has an answer.
  queueWelcomeEmail({
    bookingId: record.bookingId,
    grcNo: record.grcNo,
    branch: context.branch,
    guestName: record.guestName,
    email: record.email,
    noEmail: record.noEmail,
  });

  // The reservation is fulfilled the moment the guest is checked in — it
  // stops being an outstanding promise, and the villa is no longer
  // reserved for those nights because it is now occupied for them.
  if (linkedReservation) {
    update(COLLECTIONS.RESERVATIONS, linkedReservation, {
      status: RESERVATION_STATUS.CHECKED_IN,
      bookingId: record.bookingId,
    });
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
// returnTo is passed by the caller rather than fixed here: this card is
// reachable from a villa and from Guest History, and Back has to go to
// whichever one the user actually came from.
export function reprintGrc(bookingId, returnTo = "screen-rooms") {
  const card = findGrcByBookingId(bookingId);
  if (!card) {
    // Stays that predate the card — the seeded bookings, or anything
    // checked in before this screen existed — genuinely have none.
    showToast("No registration card on file for this stay");
    return;
  }
  renderGrcPreview(card);
  setGrcPreviewReturn(returnTo, "Back");
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

  el("grc-prev-liability").textContent = liabilityNoticeFor(appState.selectedBranch);
  // Read at print time, not at module load: the times are a per-property
  // setting now, and which property is selected is not known when this
  // module first evaluates.
  const times = standardTimesFor(appState.selectedBranch);
  el("grc-prev-std-in").textContent = displayTime(times.checkin);
  el("grc-prev-std-out").textContent = displayTime(times.checkout);

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
attachSuggestions(el("grc-reservation-by"), SUGGESTION_KEYS.RESERVED_BY, bookingSourcesFor(appState.selectedBranch));
