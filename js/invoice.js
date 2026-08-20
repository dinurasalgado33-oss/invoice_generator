import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, formatDate, fmt, setLogoSrc, showToast, toDateISO, safeStorage, clampMoney, MAX_MONEY, MAX_COUNT } from "./utils.js";
import { BRANCH_INFO } from "./data/branches.js";
import { INVOICES } from "./data/reports.js";
import {
  CHARGE_CATEGORIES, CHARGE_CATEGORY_LABELS, DEFAULT_CHARGE_CATEGORY,
  isChargeCategory, serviceChargeFor, categoryTotals, INVOICE_REMARK,
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

// Shown read-only on step 4 so staff can see what the guest will read,
// set once at load since it never changes.
document.getElementById("fixed-remark-preview").textContent = INVOICE_REMARK;

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
  const serviceCharge = serviceChargeIsAuto() ? serviceChargeFor(items) : num("service-charge");
  const advance = num("advance");
  const grossAmount = billTotal + serviceCharge;
  const discountType = document.getElementById("discount-type").value;
  const discountInputRaw = num("discount-amount");
  // A discount can never exceed what it's discounting — cap percent at
  // 100% and a flat amount at the gross, rather than letting it drive the
  // net amount negative (advance is allowed to exceed gross, since that's
  // a legitimate refund-style scenario; a discount overshooting isn't).
  const discountInput = discountType === "percent" ? Math.min(100, discountInputRaw) : Math.min(discountInputRaw, grossAmount);
  const discountAmount = discountType === "percent" ? grossAmount * (discountInput / 100) : discountInput;
  const netAmount = grossAmount - discountAmount;
  const grandTotal = netAmount - advance;
  return { items, billTotal, serviceCharge, advance, grossAmount, discountType, discountInput, discountAmount, netAmount, grandTotal };
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
document.getElementById("discount-type").addEventListener("change", updateLiveTotals);
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

const formSteps = [...document.querySelectorAll(".form-step")];
const stepperItems = [...document.querySelectorAll(".stepper-item")];
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

function goToStep(step) {
  if (step > currentStep && !validateStep(currentStep)) return;

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

stepNextBtn.addEventListener("click", () => goToStep(currentStep + 1));
stepPrevBtn.addEventListener("click", () => goToStep(currentStep - 1));

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

export function resetForm() {
  document.getElementById("invoice-form").reset();
  itemsBody.innerHTML = "";
  addItemRow();
  document.getElementById("inv-number").value = String(appState.invoiceCounter);
  document.getElementById("inv-date").value = toDateISO();
  document.getElementById("currency").value = "LKR";
  // form.reset() restores the checkbox's HTML default (checked), but the
  // readOnly state it drives is a DOM property reset doesn't touch.
  document.getElementById("service-charge-auto").checked = true;
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
  isSubmitting = true;

  const { billTotal, serviceCharge, advance, grossAmount, discountType, discountAmount, netAmount, grandTotal } = computeTotals();

  // Header
  const branchInfo = BRANCH_INFO[appState.selectedBranch] || {};
  document.getElementById("prev-inv-hotel-name").textContent = branchInfo.hotelName || appState.selectedBranchLabel;
  document.getElementById("prev-inv-address").textContent = branchInfo.address || "";
  document.getElementById("prev-inv-contact-line").textContent =
    [branchInfo.phone ? `Tel ${branchInfo.phone}` : "", branchInfo.email ? `Email: ${branchInfo.email}` : ""].filter(Boolean).join("  •  ");
  setLogoSrc("prev-inv-logo", appState.selectedBranchLogo);
  document.getElementById("prev-number").textContent = val("inv-number");
  document.getElementById("prev-date").textContent = formatDate(document.getElementById("inv-date").value);

  // Guest details
  document.getElementById("prev-guest-name").textContent = val("guest-name") || "-";
  document.getElementById("prev-guest-count").textContent = Number(val("guest-count")) > 0 ? val("guest-count") : "-";
  document.getElementById("prev-guest-phone").textContent = val("guest-phone") || "-";
  document.getElementById("prev-reg-card").textContent = val("reg-card-no") || "N/A";
  document.getElementById("prev-voucher").textContent = val("voucher-no") || "N/A";
  document.getElementById("prev-checkin").textContent = formatDate(document.getElementById("checkin-date").value);
  document.getElementById("prev-checkout").textContent = formatDate(document.getElementById("checkout-date").value);

  // Items
  const itemsBodyPrev = document.getElementById("prev-items-body");
  const money = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  itemsBodyPrev.innerHTML = items.map(it => `
    <tr>
      <td>${it.no}</td>
      <td>${escapeHtml(it.desc)}</td>
      <td>${escapeHtml(it.qty)}</td>
      <td>${it.rate ? money(it.rate) : ""}</td>
      <td>${it.value ? money(it.value) : "-"}</td>
    </tr>
  `).join("");

  // Totals
  const currency = val("currency") || "LKR";
  document.getElementById("prev-currency").textContent = currency;
  document.getElementById("prev-bill-total").textContent = fmt(billTotal, currency);
  document.getElementById("prev-service-charge").textContent = fmt(serviceCharge, currency);
  document.getElementById("prev-gross").textContent = fmt(grossAmount, currency);
  document.getElementById("prev-discount-row").style.display = discountAmount ? "" : "none";
  document.getElementById("prev-discount-label").textContent = discountType === "percent" ? `Discount (${val("discount-amount")}%)` : "Discount";
  document.getElementById("prev-discount").textContent = discountAmount ? "-" + fmt(discountAmount, currency) : "";
  document.getElementById("prev-net").textContent = fmt(netAmount, currency);
  document.getElementById("prev-advance").textContent = advance ? fmt(advance, currency) : "-";
  document.getElementById("prev-total").textContent = fmt(grandTotal, currency);

  // Remark + signature. The remark is a fixed policy notice, so it isn't
  // read from a field — it's the same sentence on every invoice.
  document.getElementById("prev-notes").textContent = INVOICE_REMARK;
  document.getElementById("prev-staff").textContent = val("staff-name") || "";

  // The record's id is the same number printed on the document — so a
  // paper invoice can always be found in Reports by the number on it,
  // instead of a separate internal counter nobody printed.
  // Category totals are stored on the record rather than recomputed from
  // line items later — the dashboard used to infer its room/food/activity
  // split by subtracting food and activity records from the invoice total,
  // which silently broke whenever a charge existed in neither place.
  INVOICES.push({
    id: val("inv-number") || String(appState.invoiceCounter),
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
  });
  checkoutContext = null;

  appState.invoiceCounter++;
  safeStorage.set("leopardinn-invoice-counter", String(appState.invoiceCounter));

  afterGenerateCallbacks.forEach(cb => cb());

  showToast("Invoice generated");
  showScreen("screen-preview");
});

document.getElementById("new-invoice-btn").addEventListener("click", () => {
  resetForm();
  showScreen("screen-form");
});

// Export actions
document.getElementById("print-btn").addEventListener("click", () => window.print());

document.getElementById("image-btn").addEventListener("click", () => {
  const target = document.getElementById("invoice-preview");
  const hint = target.querySelector(".scroll-hint");

  // html2canvas is a CDN script. Both properties are in remote areas with
  // patchy connectivity, so it genuinely fails to load sometimes — and
  // calling it then throws a ReferenceError that .catch() never sees,
  // leaving the button silently dead. Check before calling, and tell staff
  // what to do instead.
  if (typeof html2canvas !== "function") {
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
