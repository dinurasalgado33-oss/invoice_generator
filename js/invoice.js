import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, formatDate, fmt, setLogoSrc, showToast, toDateISO, safeStorage, clampMoney, MAX_MONEY, MAX_COUNT } from "./utils.js";
import { BRANCH_INFO } from "./data/branches.js";
import { INVOICES } from "./data/reports.js";
import { add, COLLECTIONS } from "./data/store.js";
import { downloadInvoicePdf, tryInvoicePdfBase64 } from "./invoice-pdf.js";
import { ensureHtml2Canvas, ensurePdfTools } from "./cdn.js";
import { makeStepperNavigable } from "./stepper.js";
import { queueInvoiceEmail } from "./data/invoice-email.js";
import { logError } from "./data/error-log.js";
import { takeNumber, DOC_TYPES } from "./data/numbering.js";
import {
  CHARGE_CATEGORIES, CHARGE_CATEGORY_LABELS, DEFAULT_CHARGE_CATEGORY,
  isChargeCategory, serviceChargeFor, categoryTotals, invoiceRemark, CURRENCIES, vatRateFor,
} from "./data/charges.js";

const afterGenerateCallbacks = [];
export function onAfterGenerate(cb) {
  afterGenerateCallbacks.push(cb);
}

// Blocks a second submit from creating a duplicate invoice. Only re-armed
// by resetForm() (a fresh "New Invoice" or checkout prefill) — NOT at the
// end of the submit handler itself, since form.requestSubmit() dispatches
// its event synchronously: resetting the flag there would let a second
// rapid-fire submit slip through before the first one's screen swap ever
// happens.
let isSubmitting = false;

// Which stay this invoice is billing, set by rooms.js when a checkout
// prefills the form. Stamped onto the INVOICES row so a bill can be traced
// back to its villa and booking instead of only matching on guest name.
let checkoutContext = null;
export function setCheckoutContext(ctx) {
  checkoutContext = ctx;
}

// Every money field reads through here, so the ceiling can't be bypassed
// by whichever input the typo landed in.
function num(id) {
  return clampMoney(document.getElementById(id).value);
}

function val(id) {
  return document.getElementById(id).value.trim();
}

// Strip anything that isn't a digit (and, for money fields, a single
// decimal point) as the user types — blocks letters/words on fields
// that must stay numeric, without relying on type="number" alone
// (mobile keyboards can still let stray letters through via paste etc.)
function sanitizeInteger(e) {
  const input = e.target;
  const cleaned = input.value.replace(/[^0-9]/g, "");
  if (cleaned !== input.value) input.value = cleaned;
  capField(input, MAX_COUNT);
}

function sanitizeDecimal(e) {
  const input = e.target;
  let cleaned = input.value.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
  if (cleaned !== input.value) input.value = cleaned;
  capField(input, MAX_MONEY);
}

// Stripping characters is not enough on its own: "1e5" loses its "e" and
// silently becomes 15, and a held-down key produces a number in the
// quintillions that goes straight onto the printed bill. Cap the field as
// it's typed so the value on screen is always the value that gets billed.
function capField(input, max) {
  const n = parseFloat(input.value);
  if (Number.isFinite(n) && n > max) input.value = String(max);
}

// Shown read-only on step 4 so staff can see what the guest will read.
// Set when the form opens rather than once at load: the remark now
// depends on the property's service charge, and which property is
// selected is not known when this module first evaluates.
function refreshRemarkPreview() {
  document.getElementById("fixed-remark-preview").textContent = invoiceRemark(appState.selectedBranch);
}

// Currency prints on the guest's bill, so a typo there is a typo on a
// financial document — and it was a free text field. Same list the travel
// agent invoice offers, so the two documents can't drift apart.
document.getElementById("currency").innerHTML =
  CURRENCIES.map(c => `<option value="${c}">${c}</option>`).join("");

// A bill in a foreign currency has to record the rate it was converted at.
// Without it the dashboard added USD 500 to LKR revenue as five hundred
// rupees — right on the printed invoice, wrong on every management figure,
// and nothing on the guest's copy would ever show it.
function syncExchangeRateField() {
  const currency = document.getElementById("currency").value || "LKR";
  const foreign = currency !== "LKR";
  document.getElementById("exchange-rate-field").hidden = !foreign;
  document.getElementById("exchange-rate-label").textContent = foreign ? `(1 ${currency} = ? LKR)` : "";
  if (!foreign) {
    document.getElementById("exchange-rate").value = "";
    document.getElementById("exchange-rate-error").classList.remove("show");
    document.getElementById("exchange-rate").classList.remove("invalid");
  }
  updateExchangeHint();
}

function updateExchangeHint() {
  const currency = document.getElementById("currency").value || "LKR";
  const hint = document.getElementById("exchange-rate-hint");
  if (currency === "LKR") { hint.textContent = ""; return; }
  const rate = clampMoney(document.getElementById("exchange-rate").value);
  const { grandTotal } = computeTotals();
  hint.textContent = rate > 0
    ? `Reports will count this bill as ${fmt(grandTotal * rate, "LKR")}.`
    : "The guest is billed in " + currency + "; reports need the rate to count it.";
}

document.getElementById("currency").addEventListener("change", syncExchangeRateField);
document.getElementById("exchange-rate").addEventListener("input", () => {
  document.getElementById("exchange-rate-error").classList.remove("show");
  document.getElementById("exchange-rate").classList.remove("invalid");
  updateExchangeHint();
});

const itemsBody = document.getElementById("items-body");

function renumberRows() {
  [...itemsBody.querySelectorAll("tr")].forEach((row, i) => {
    row.querySelector(".col-no").textContent = i + 1;
  });
}

function getItems() {
  return [...itemsBody.querySelectorAll("tr")].map((row, i) => {
    const desc = row.querySelector(".item-desc").value.trim();
    const qty = row.querySelector(".item-qty").value.trim();
    const rate = clampMoney(row.querySelector(".item-rate").value);
    const value = clampMoney(row.querySelector(".item-value").value);
    const category = row.querySelector(".item-category").value;
    return { no: i + 1, desc, qty, rate, value, category };
  }).filter(it => it.desc || it.qty || it.rate || it.value);
}

// Service charge is 10% of food only, so it's derived rather than typed —
// but staff can still override it (their own books show plenty of bills
// where the charge was waived or negotiated). Unticking "auto" hands the
// field back to them and stops it being recomputed underneath.
function serviceChargeIsAuto() {
  return document.getElementById("service-charge-auto").checked;
}

function computeTotals() {
  const items = getItems();
  const billTotal = items.reduce((sum, it) => sum + it.value, 0);
  const serviceCharge = serviceChargeIsAuto() ? serviceChargeFor(items, appState.selectedBranch) : num("service-charge");
  const advance = num("advance");
  const grossAmount = billTotal + serviceCharge;
  // Always a percentage. A flat amount and a percentage in the same field,
  // told apart by a dropdown beside it, is a discount entered in the wrong
  // mode — 10 meaning ten rupees off a 50,000 bill, or ten percent off it.
  const discountPercent = Math.min(100, num("discount-amount"));
  const discountAmount = grossAmount * (discountPercent / 100);
  const netAmount = grossAmount - discountAmount;
  // VAT applies to what the guest actually pays after the discount, and
  // before any advance they have already handed over.
  const vatRate = vatRateFor(appState.selectedBranch);
  const vatAmount = netAmount * (vatRate / 100);
  const grandTotal = netAmount + vatAmount - advance;
  return { items, billTotal, serviceCharge, advance, grossAmount, discountPercent, discountAmount, netAmount, vatRate, vatAmount, grandTotal };
}

function updateLiveTotals() {
  const { billTotal, serviceCharge, advance, grossAmount, discountAmount, netAmount, grandTotal } = computeTotals();
  // Keep the visible field in step with the derived value while it's on
  // auto, so what staff read matches what gets billed.
  const scField = document.getElementById("service-charge");
  scField.readOnly = serviceChargeIsAuto();
  if (serviceChargeIsAuto()) scField.value = serviceCharge ? String(serviceCharge) : "0";
  const currency = val("currency") || "LKR";
  document.getElementById("live-bill-total").textContent = fmt(billTotal, currency);
  document.getElementById("live-service-charge").textContent = fmt(serviceCharge, currency);
  document.getElementById("live-gross").textContent = fmt(grossAmount, currency);
  document.getElementById("live-discount").textContent = fmt(discountAmount, currency);
  document.getElementById("live-net").textContent = fmt(netAmount, currency);
  document.getElementById("live-advance").textContent = fmt(advance, currency);
  document.getElementById("live-grand").textContent = fmt(grandTotal, currency);
  document.getElementById("grand-total-warning").classList.toggle("show", grandTotal < 0);
}

export function addItemRow(desc = "", qty = "", rate = "", value = "", category = DEFAULT_CHARGE_CATEGORY) {
  const row = document.createElement("tr");
  const cat = isChargeCategory(category) ? category : DEFAULT_CHARGE_CATEGORY;
  // desc/qty are set as DOM properties below, not interpolated into the
  // HTML string — escapeHtml() only neutralizes <, >, & (via textContent
  // round-tripping), not quotes, so it can't safely sit inside value="...".
  row.innerHTML = `
    <td class="col-no"></td>
    <td class="col-desc" data-label="Description"><input type="text" class="item-desc" placeholder="e.g. Luxury Chalet with private pool (FB)"></td>
    <td class="col-cat" data-label="Type"><select class="item-category" aria-label="Charge type">
      ${CHARGE_CATEGORIES.map(c => `<option value="${c}" ${c === cat ? "selected" : ""}>${CHARGE_CATEGORY_LABELS[c]}</option>`).join("")}
    </select></td>
    <td class="col-qty" data-label="Qty"><input type="text" class="item-qty" placeholder="e.g. 2 nights"></td>
    <td class="col-price" data-label="Rate (LKR)"><input type="number" class="item-rate" min="0" step="0.01" inputmode="decimal" value="${rate}"></td>
    <td class="col-total" data-label="Value"><input type="number" class="item-value" min="0" step="0.01" inputmode="decimal" value="${value}"></td>
    <td class="col-del"><button type="button" class="row-del-btn" title="Remove item">✕</button></td>
  `;
  row.querySelector(".item-desc").value = desc;
  itemsBody.appendChild(row);
  // Changing a line's type moves it in or out of the food subtotal, which
  // is what service charge is levied on — so totals must recompute.
  row.querySelector(".item-category").addEventListener("change", updateLiveTotals);

  const qtyInput = row.querySelector(".item-qty");
  qtyInput.value = qty;
  const rateInput = row.querySelector(".item-rate");
  const valueInput = row.querySelector(".item-value");

  rateInput.addEventListener("input", sanitizeDecimal);
  valueInput.addEventListener("input", sanitizeDecimal);

  function autoFillValue() {
    const qtyNum = parseFloat(qtyInput.value);
    const rateNum = clampMoney(rateInput.value);
    if (!isNaN(qtyNum) && qtyInput.value.trim() === String(qtyNum)) {
      // Qty is free text ("2 nights"), so it has no sanitizer of its own —
      // clamp the product rather than letting a huge qty multiply a valid
      // rate into a nonsense line total.
      valueInput.value = clampMoney(qtyNum * rateNum).toFixed(2);
    }
    updateLiveTotals();
  }

  qtyInput.addEventListener("input", autoFillValue);
  rateInput.addEventListener("input", autoFillValue);
  valueInput.addEventListener("input", updateLiveTotals);

  row.querySelector(".row-del-btn").addEventListener("click", () => {
    row.remove();
    renumberRows();
    updateLiveTotals();
  });

  renumberRows();
  updateLiveTotals();
  document.getElementById("items-error").classList.remove("show");
}

export function clearItems() {
  itemsBody.innerHTML = "";
}

document.getElementById("add-item-btn").addEventListener("click", () => addItemRow());

document.getElementById("guest-count").addEventListener("input", sanitizeInteger);
["service-charge", "advance", "discount-amount"].forEach(id => {
  document.getElementById(id).addEventListener("input", sanitizeDecimal);
});
["service-charge", "advance", "currency", "discount-amount"].forEach(id => {
  document.getElementById(id).addEventListener("input", updateLiveTotals);
});
document.getElementById("service-charge-auto").addEventListener("change", updateLiveTotals);

// Snap an out-of-range discount back to its cap once the staff member
// finishes typing, rather than fighting every keystroke while they type.
document.getElementById("discount-amount").addEventListener("blur", () => {
  const { discountInput } = computeTotals();
  const field = document.getElementById("discount-amount");
  if (Number(field.value) !== discountInput) field.value = discountInput || "";
});

// Guest count +/- stepper
const guestCountInput = document.getElementById("guest-count");
document.getElementById("guest-count-minus").addEventListener("click", () => {
  guestCountInput.value = Math.max(0, (parseInt(guestCountInput.value, 10) || 0) - 1);
});
document.getElementById("guest-count-plus").addEventListener("click", () => {
  guestCountInput.value = Math.min(MAX_COUNT, (parseInt(guestCountInput.value, 10) || 0) + 1);
});

// Multi-step form wizard
const TOTAL_STEPS = 4;
const STEP_TITLES = { 1: "Reservation & Guest", 2: "Charges", 3: "Totals", 4: "Final Details" };
let currentStep = 1;

// Scoped to this screen. Both selectors used to be document-wide, and the
// registration card uses the same two class names — so every invoice step
// change was also silently repainting the check-in card's stepper and
// toggling its form steps. Invisible, because the card's own setStep()
// repaints it on open, but it is the same "one fact written in two places"
// shape as every other bug in this file's history.
const formSteps = [...document.querySelectorAll("#screen-form .form-step")];
const stepperItems = [...document.querySelectorAll("#stepper .stepper-item")];
const stepPrevBtn = document.getElementById("step-prev-btn");
const stepNextBtn = document.getElementById("step-next-btn");
const generateBtn = document.getElementById("generate-btn");

function validateStep(step) {
  if (step === 1) {
    const guestName = document.getElementById("guest-name");
    const error = document.getElementById("guest-name-error");
    if (!guestName.value.trim()) {
      error.classList.add("show");
      guestName.classList.add("invalid");
      guestName.focus();
      return false;
    }
    error.classList.remove("show");
    guestName.classList.remove("invalid");

    const checkinInput = document.getElementById("checkin-date");
    const checkoutInput = document.getElementById("checkout-date");
    const dateError = document.getElementById("checkout-date-error");
    if (checkinInput.value && checkoutInput.value && checkoutInput.value <= checkinInput.value) {
      dateError.classList.add("show");
      checkoutInput.classList.add("invalid");
      checkoutInput.focus();
      return false;
    }
    dateError.classList.remove("show");
    checkoutInput.classList.remove("invalid");
  }

  if (step === 2) {
    const itemsError = document.getElementById("items-error");
    if (getItems().length === 0) {
      itemsError.classList.add("show");
      return false;
    }
    itemsError.classList.remove("show");
  }
  return true;
}

// Moves to a step, having decided it is allowed. Everything that decides
// lives in goToStep below; this only draws.
function showStep(step) {
  currentStep = Math.min(Math.max(step, 1), TOTAL_STEPS);

  formSteps.forEach(s => s.classList.toggle("active", Number(s.dataset.step) === currentStep));

  stepperItems.forEach(item => {
    const n = Number(item.dataset.step);
    const state = n < currentStep ? "done" : n === currentStep ? "active" : "upcoming";
    item.dataset.state = state;
    item.classList.toggle("line-filled", currentStep > n);
  });
  document.getElementById("step-announce").textContent = `Step ${currentStep} of ${TOTAL_STEPS}: ${STEP_TITLES[currentStep]}`;

  stepPrevBtn.style.display = currentStep === 1 ? "none" : "";
  stepNextBtn.style.display = currentStep === TOTAL_STEPS ? "none" : "";
  generateBtn.style.display = currentStep === TOTAL_STEPS ? "" : "none";

  document.getElementById("screen-form").scrollTo({ top: 0, behavior: "smooth" });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Going to a step, having checked it is allowed.
//
// Backwards is always allowed. Forwards, every step being *skipped* has to
// be valid, not merely the one being left — that distinction did not
// matter while Next was the only way to move, because Next only ever
// crosses one step. Now that the stepper circles are live and somebody can
// jump from 1 to 4, it does.
function goToStep(step) {
  const target = Math.min(Math.max(step, 1), TOTAL_STEPS);

  if (target > currentStep) {
    for (let s = currentStep; s < target; s++) {
      if (validateStep(s)) continue;
      // Land on the step that is not finished so the person can see what
      // is wrong, then re-run its validation — the first run marked the
      // field and tried to focus it while it was still off screen.
      if (s !== currentStep) {
        showStep(s);
        validateStep(s);
      }
      return;
    }
  }
  showStep(target);
}

stepNextBtn.addEventListener("click", () => goToStep(currentStep + 1));
stepPrevBtn.addEventListener("click", () => goToStep(currentStep - 1));

// The stepper circles move the form.
//
// They always looked pressable and never were, which is its own problem —
// a control that looks interactive and does nothing teaches people to
// distrust the rest of the screen. It is also the most repeated waste in
// the app: a checkout arrives with everything already filled in, and the
// person at the desk still taps Next three times to change nothing.
makeStepperNavigable(stepperItems, goToStep, () => currentStep);

document.getElementById("guest-name").addEventListener("input", () => {
  document.getElementById("guest-name-error").classList.remove("show");
  document.getElementById("guest-name").classList.remove("invalid");
});

// Keep the checkout picker from even offering an invalid date, and clear
// the error as soon as the guest starts fixing it.
const checkinDateInput = document.getElementById("checkin-date");
const checkoutDateInput = document.getElementById("checkout-date");
checkinDateInput.addEventListener("change", () => {
  checkoutDateInput.min = checkinDateInput.value;
});
[checkinDateInput, checkoutDateInput].forEach(input => {
  input.addEventListener("input", () => {
    document.getElementById("checkout-date-error").classList.remove("show");
    checkoutDateInput.classList.remove("invalid");
  });
});

// Enter key on steps 1-3 advances to the next step instead of doing
// nothing (the real submit button is hidden until the last step)
document.getElementById("invoice-form").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.target.tagName === "TEXTAREA") return;
  if (currentStep < TOTAL_STEPS) {
    e.preventDefault();
    goToStep(currentStep + 1);
  }
});

// Renders the printed invoice from a stored record. Shared by generating
// and by reopening one later from Guest History, so a reopened invoice is
// the same document the guest was handed, not a reconstruction.
//
// The letterhead comes from current branch config rather than the record:
// if the hotel's phone number changes, a reprint should carry the number
// that works today. The figures, which are what the guest paid, come
// entirely from the record and never move.
// The record the preview is currently showing. Kept so Download PDF works
// from the same record the page was drawn from — a freshly generated
// invoice and one reopened from Guest History are then the same file.
let previewedInvoice = null;

function renderInvoicePreview(r) {
  previewedInvoice = r;
  const branchInfo = BRANCH_INFO[r.branch] || {};
  document.getElementById("prev-inv-hotel-name").textContent = branchInfo.hotelName || appState.selectedBranchLabel;
  document.getElementById("prev-inv-address").textContent = branchInfo.address || "";
  document.getElementById("prev-inv-contact-line").textContent =
    [branchInfo.phone ? `Tel ${branchInfo.phone}` : "", branchInfo.email ? `Email: ${branchInfo.email}` : ""].filter(Boolean).join("  •  ");
  setLogoSrc("prev-inv-logo", appState.selectedBranchLogo);
  document.getElementById("prev-number").textContent = r.id;
  document.getElementById("prev-date").textContent = formatDate(r.date);

  document.getElementById("prev-guest-name").textContent = r.guest || "-";
  document.getElementById("prev-guest-count").textContent = Number(r.guestCount) > 0 ? r.guestCount : "-";
  document.getElementById("prev-guest-phone").textContent = r.guestPhone || "-";
  document.getElementById("prev-reg-card").textContent = r.regCardNo || "N/A";
  document.getElementById("prev-voucher").textContent = r.voucherNo || "N/A";
  document.getElementById("prev-checkin").textContent = formatDate(r.checkinDate);
  document.getElementById("prev-checkout").textContent = formatDate(r.checkoutDate);

  const money = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById("prev-items-body").innerHTML = (r.items || []).map(it => `
    <tr>
      <td>${it.no}</td>
      <td>${escapeHtml(it.desc)}</td>
      <td>${escapeHtml(it.qty)}</td>
      <td>${it.rate ? money(it.rate) : ""}</td>
      <td>${it.value ? money(it.value) : "-"}</td>
    </tr>
  `).join("");

  const currency = r.currency || "LKR";
  document.getElementById("prev-currency").textContent = currency;
  document.getElementById("prev-bill-total").textContent = fmt(r.billTotal, currency);
  document.getElementById("prev-service-charge").textContent = fmt(r.serviceCharge, currency);
  document.getElementById("prev-gross").textContent = fmt(r.grossAmount, currency);
  document.getElementById("prev-discount-row").style.display = r.discount ? "" : "none";
  document.getElementById("prev-discount-label").textContent =
    r.discountPercent ? `Discount (${r.discountPercent}%)` : "Discount";
  document.getElementById("prev-discount").textContent = r.discount ? "-" + fmt(r.discount, currency) : "";
  document.getElementById("prev-net").textContent = fmt(r.total, currency);
  // A rate of zero means the hotel is not registered for VAT — printing
  // "VAT 0.00" would imply it is.
  const vatRow = document.getElementById("prev-vat-row");
  const showVat = Number(r.vatRate) > 0;
  vatRow.hidden = !showVat;
  if (showVat) {
    document.getElementById("prev-vat-label").textContent = `VAT (${r.vatRate}%)`;
    document.getElementById("prev-vat").textContent = fmt(r.vatAmount || 0, currency);
  }
  document.getElementById("prev-advance").textContent = r.advance ? fmt(r.advance, currency) : "-";
  document.getElementById("prev-total").textContent = fmt(r.grandTotal, currency);

  document.getElementById("prev-notes").textContent = invoiceRemark(appState.selectedBranch);
  document.getElementById("prev-staff").textContent = r.staffName || "";

  // A cancelled invoice must not reprint as though it were still owed.
  // The figures stay on the page — the record has to remain readable —
  // but the document says plainly that it no longer stands.
  const voided = r.status === "Void";
  const banner = document.getElementById("prev-void-banner");
  banner.hidden = !voided;
  // Reason and author together — a reprinted void needs to say not just
  // that it was cancelled but on whose authority.
  const voidDetail = !voided ? "" : [r.voidReason, r.voidedBy ? "voided by " + r.voidedBy : ""].filter(Boolean).join(" · ");
  document.getElementById("prev-void-reason").textContent = voidDetail;
  document.getElementById("invoice-preview").classList.toggle("is-void", voided);
}

// Reopen an invoice already issued — the guest wants another copy, or
// staff left the page before printing.
// Reachable from Guest History today, and from anywhere that lists an
// invoice later — the caller names where Back goes.
export function reopenInvoice(invoiceId, returnTo = "screen-guest-history") {
  const r = INVOICES.find(i => String(i.id) === String(invoiceId));
  if (!r) {
    showToast("That invoice is no longer available");
    return;
  }
  if (!r.items) {
    // Seeded history predates the full snapshot, so there is no page to
    // draw — better to say so than to render a blank invoice.
    showToast(`Invoice #${r.id} was recorded before documents were stored`);
    return;
  }
  renderInvoicePreview(r);
  setInvoicePreviewReturn(returnTo, "Back");
  showScreen("screen-preview");
}

// "New Invoice" after generating one, but a return to the list when the
// invoice was reopened from Guest History.
function setInvoicePreviewReturn(screenId, label) {
  const btn = document.querySelector("#screen-preview .back-btn");
  if (!btn) return;
  btn.dataset.back = screenId;
  btn.textContent = `← ${label}`;
}

export function resetForm() {
  document.getElementById("invoice-form").reset();
  itemsBody.innerHTML = "";
  addItemRow();
  // Drawn from this device's reserved block at the moment the invoice is
  // actually raised, not shown in advance — a number displayed here and
  // then abandoned (the guest changes their mind, the form is backed out
  // of) would burn a real number on nothing.
  document.getElementById("inv-number").value = "Assigned on Generate";
  document.getElementById("inv-date").value = toDateISO();
  refreshRemarkPreview();
  document.getElementById("currency").value = "LKR";
  document.getElementById("exchange-rate").value = "";
  document.getElementById("exchange-rate-field").hidden = true;
  document.getElementById("exchange-rate-error").classList.remove("show");
  document.getElementById("exchange-rate").classList.remove("invalid");
  // form.reset() restores the checkbox's HTML default (checked), but the
  // readOnly state it drives is a DOM property reset doesn't touch.
  document.getElementById("service-charge-auto").checked = true;
  // The app authenticated this person — no reason to make them type their
  // own name onto every invoice they raise. Still editable, since one
  // device is shared and whoever checked the bill may not be who logged in.
  // `invoice-staff-name`, not `staff-name`. The Staff Accounts screen has a
  // field of that name too, and getElementById returns whichever comes
  // first in the document — which was that one. So this wrote the signed-in
  // name into a form on another screen and read it back from there, which
  // looked right only because it round-tripped through the same wrong box.
  // What actually broke is the sentence above: reception editing this field
  // changed nothing, and a name left sitting in the Staff Accounts form
  // would have ridden onto the next invoice.
  document.getElementById("invoice-staff-name").value = appState.currentUser || "";
  document.getElementById("guest-name-error").classList.remove("show");
  document.getElementById("guest-name").classList.remove("invalid");
  updateLiveTotals();
  currentStep = 1;
  goToStep(1);
  isSubmitting = false;
}

// Form submit -> build preview
document.getElementById("invoice-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (isSubmitting) return;

  const items = getItems();
  // Guards in case a line item was deleted after passing step 2 (e.g. the
  // guest was navigated back to Charges and removed the only row).
  if (items.length === 0) {
    document.getElementById("items-error").classList.add("show");
    goToStep(2);
    return;
  }

  // A foreign bill with no rate would be counted at face value — USD 500
  // added to LKR revenue as five hundred rupees. Refused rather than
  // guessed at, since the app has no way to know the rate.
  const chosenCurrency = val("currency") || "LKR";
  if (chosenCurrency !== "LKR" && clampMoney(document.getElementById("exchange-rate").value) <= 0) {
    document.getElementById("exchange-rate-error").classList.add("show");
    document.getElementById("exchange-rate").classList.add("invalid");
    goToStep(1);
    document.getElementById("exchange-rate").focus();
    return;
  }

  // Drawn from this device's reserved block, now — not shown in advance,
  // so nothing is burned if the form is abandoned first. Refused rather
  // than guessed at if the block is genuinely empty and none could be
  // reserved: a wrong number on an invoice is worse than being asked to
  // reconnect.
  const issued = takeNumber(appState.selectedBranch, DOC_TYPES.INVOICE);
  if (!issued) {
    showToast("No invoice numbers left on this device — reconnect and try again");
    return;
  }

  isSubmitting = true;

  const { billTotal, serviceCharge, advance, grossAmount, discountPercent, discountAmount, netAmount, vatRate, vatAmount, grandTotal } = computeTotals();

  // The record's id is the same number printed on the document — so a
  // paper invoice can always be found in Reports by the number on it,
  // instead of a separate internal counter nobody printed.
  // Category totals are stored on the record rather than recomputed from
  // line items later — the dashboard used to infer its room/food/activity
  // split by subtracting food and activity records from the invoice total,
  // which silently broke whenever a charge existed in neither place.
  // The record now holds everything the printed page shows, not just the
  // totals. Line items, dates, phone, currency and who signed it used to
  // exist only in the form — so once staff left the preview the document
  // could never be shown again, and a mis-tap lost a financial record.
  const record = {
    id: issued.formatted,
    financialYear: issued.fy,
    sequence: issued.seq,
    // When the bill was actually raised, as distinct from `date`, which is
    // the invoice date reception types and can back- or forward-date. An
    // audit needs to know when the document came into existence, and the
    // nightly mirror needs a value that only ever moves forward to know
    // what it has not yet exported.
    createdAt: new Date().toISOString(),
    roomId: checkoutContext ? checkoutContext.roomId : null,
    bookingId: checkoutContext ? checkoutContext.bookingId : null,
    source: checkoutContext && checkoutContext.source ? checkoutContext.source : null,
    interim: Boolean(checkoutContext && checkoutContext.interim),
    walkin: Boolean(checkoutContext && checkoutContext.walkin),
    guest: val("guest-name") || "-",
    branch: appState.selectedBranch,
    date: document.getElementById("inv-date").value,
    total: netAmount,
    status: "Active",
    discount: discountAmount,
    serviceCharge,
    advance,
    categoryTotals: categoryTotals(items),
    // ---- everything below exists so the page can be re-rendered ----
    items,
    guestCount: val("guest-count"),
    guestPhone: val("guest-phone"),
    regCardNo: val("reg-card-no"),
    voucherNo: val("voucher-no"),
    checkinDate: document.getElementById("checkin-date").value,
    checkoutDate: document.getElementById("checkout-date").value,
    currency: val("currency") || "LKR",
    // Stamped at billing time, not looked up later: converting an old bill
    // at today's rate would restate last month's takings every time the
    // rupee moved.
    exchangeRate: (val("currency") || "LKR") === "LKR" ? 1 : clampMoney(document.getElementById("exchange-rate").value),
    discountPercent,
    vatRate,
    vatAmount,
    billTotal,
    grossAmount,
    grandTotal,
    staffName: val("invoice-staff-name") || "",
  };
  add(COLLECTIONS.INVOICES, INVOICES, record);

  renderInvoicePreview(record);
  setInvoicePreviewReturn("screen-form", "Back");
  const bookingIdForEmail = record.bookingId;
  checkoutContext = null;

  // The record is passed so a listener can tell *which* invoice was just
  // raised. Without it, a listener holding state from an abandoned flow
  // has no way to know this generate wasn't the one it was waiting for.
  afterGenerateCallbacks.forEach(cb => cb(record));

  showToast("Invoice generated");
  showScreen("screen-preview");

  // The guest's copy, queued *after* the preview is on screen — because
  // the PDF is a photograph of that preview, and you cannot photograph a
  // screen that has not been drawn yet. This is the ordering the file
  // depends on; moving the queue back above renderInvoicePreview would
  // silently start attaching blank pages.
  //
  // Deliberately not awaited. The bill is raised, the screen has moved on,
  // and reception is already talking to the next guest — the attachment
  // finishing is not something anybody should be made to wait for.
  //
  // Never allowed to fail the invoice either. A bill that exists but was
  // not e-mailed is a small problem somebody can fix from Guest History; a
  // checkout that refuses to complete because an attachment would not
  // build is a guest standing at the desk.
  (async () => {
    try {
      const pdf = await tryInvoicePdfBase64();
      queueInvoiceEmail({
        invoice: record,
        pdfBase64: pdf || "",
        // The address is looked up from the welcome e-mail for the same
        // booking, so one guest has one address.
        bookingId: bookingIdForEmail,
      });
    } catch (err) {
      logError(`Could not queue the invoice e-mail: ${err && err.message}`, { source: "invoice-email" });
    }
  })();
});

// "Done", not "New Invoice": finishing a bill almost never means starting
// another one from scratch, and reception works out of the Reservations
// screen. Imported here rather than at the top because reservations.js
// reaches back into this module — a static import would close the cycle
// at load time.
document.getElementById("new-invoice-btn").addEventListener("click", async () => {
  resetForm();
  const { openReservationsScreen } = await import("./reservations.js");
  openReservationsScreen();
});

// Export actions
document.getElementById("print-btn").addEventListener("click", () => window.print());

// The same builder the e-mailed copy uses, so "the invoice we sent you"
// and "the invoice I downloaded" are the same document rather than two
// renderings that agree today.
document.getElementById("pdf-btn").addEventListener("click", async (e) => {
  if (!previewedInvoice) return;
  if (!await ensurePdfTools()) {
    // jsPDF and html2canvas are both CDN scripts, fetched the first time a
    // PDF is actually built rather than on every visit. Both properties
    // have patchy connectivity, so this genuinely fails sometimes. Print
    // still works offline.
    showToast("PDF needs a connection — use Print instead");
    return;
  }
  // The capture takes a moment and briefly reflows the page to print
  // width. Without this the button looks dead and gets pressed again,
  // producing a second capture on top of the first.
  const btn = e.currentTarget;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Building…";
  try {
    await downloadInvoicePdf(previewedInvoice);
  } catch (err) {
    logError(`Could not build the invoice PDF: ${err && err.message}`, { source: "invoice-pdf" });
    showToast("Couldn't build the PDF — use Print instead");
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

document.getElementById("image-btn").addEventListener("click", async () => {
  const target = document.getElementById("invoice-preview");
  const hint = target.querySelector(".scroll-hint");

  // html2canvas is a CDN script, fetched the first time this button is
  // pressed rather than on every visit — see js/cdn.js. Both properties are
  // in remote areas with patchy connectivity, so it genuinely fails to
  // arrive sometimes, and calling it then throws a ReferenceError that
  // .catch() never sees, leaving the button silently dead. Ask for it,
  // then check, and tell staff what to do instead.
  if (!await ensureHtml2Canvas()) {
    showToast("Image export needs a connection — use Print instead");
    return;
  }

  if (hint) hint.style.visibility = "hidden";
  try {
    html2canvas(target, { scale: 2, backgroundColor: "#ffffff" }).then(canvas => {
      if (hint) hint.style.visibility = "";
      const link = document.createElement("a");
      const invNum = document.getElementById("prev-number").textContent || "invoice";
      link.download = `LeopardInn-${invNum}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    }).catch(() => {
      if (hint) hint.style.visibility = "";
      showToast("Couldn't generate image");
    });
  } catch {
    if (hint) hint.style.visibility = "";
    showToast("Couldn't generate image");
  }
});
