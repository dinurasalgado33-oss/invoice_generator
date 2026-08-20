import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import {
  escapeHtml, formatDate, setLogoSrc, showToast, toDateISO, orDash,
  clampMoney, capNumericInput, MAX_MONEY,
} from "./utils.js";
import { BRANCH_INFO, CANCELLATION_POLICY, PROFORMA_NOTICES, PROFORMA_CLOSING } from "./data/branches.js";
import {
  findReservationById, PROFORMA_INVOICES, allocateProformaNo,
  PROFORMA_CURRENCIES, DEFAULT_PROFORMA_CURRENCY,
} from "./data/reservations.js";
import { refreshReservationsList } from "./reservations.js";

// Proforma Invoice — the pre-arrival bill sent to the travel agent or
// guide who made the booking. Raised against an existing reservation, so
// everything about the stay is inherited rather than retyped; staff only
// supply what the reservation couldn't know (who the agent is, the agreed
// currency and rates, the voucher).

let sourceReservation = null;

const el = (id) => document.getElementById(id);
const val = (id) => (el(id).value || "").trim();

// Agent invoices are issued in a foreign currency, so amounts are shown
// as plain numbers with the currency named once at the top — printing
// "LKR" against a USD figure would be worse than printing no symbol.
function money(n) {
  return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const itemsBody = () => el("pf-items-body");

function renumber() {
  [...itemsBody().querySelectorAll("tr")].forEach((row, i) => {
    row.querySelector(".col-no").textContent = i + 1;
  });
}

function addItemRow(desc = "", qty = "", rate = "", value = "") {
  const row = document.createElement("tr");
  // Set as DOM properties below, never interpolated — escapeHtml leaves
  // quotes alone, so a villa name containing one would break out of a
  // value="" attribute. Same rule as the invoice charges table.
  row.innerHTML = `
    <td class="col-no"></td>
    <td class="col-desc" data-label="Description"><input type="text" class="pf-item-desc" placeholder="e.g. Luxury chalet with a private pool DBL (HB)"></td>
    <td class="col-qty" data-label="Qty"><input type="text" class="pf-item-qty" placeholder="e.g. 1 Night"></td>
    <td class="col-price" data-label="Rate"><input type="number" class="pf-item-rate" min="0" step="0.01" inputmode="decimal"></td>
    <td class="col-total" data-label="Value"><input type="number" class="pf-item-value" min="0" step="0.01" inputmode="decimal"></td>
    <td class="col-del"><button type="button" class="row-del-btn" title="Remove line">✕</button></td>
  `;
  const descInput = row.querySelector(".pf-item-desc");
  const qtyInput = row.querySelector(".pf-item-qty");
  const rateInput = row.querySelector(".pf-item-rate");
  const valueInput = row.querySelector(".pf-item-value");
  descInput.value = desc;
  qtyInput.value = qty;
  rateInput.value = rate;
  valueInput.value = value;
  itemsBody().appendChild(row);

  capNumericInput(rateInput, MAX_MONEY);
  capNumericInput(valueInput, MAX_MONEY);

  function autoFill() {
    const r = clampMoney(rateInput.value);
    // Qty is free text because the document prints it that way ("1 Night"),
    // but it always leads with the number. Reading that leading number is
    // what makes the common case work — the prefilled lines are all
    // "N Nights", and requiring the value to be retyped for those meant a
    // rate could be entered and the line still total zero.
    const q = parseFloat(qtyInput.value);
    if (Number.isFinite(q) && /^\s*\d/.test(qtyInput.value)) {
      valueInput.value = clampMoney(q * r).toFixed(2);
    }
    updateTotals();
  }
  qtyInput.addEventListener("input", autoFill);
  rateInput.addEventListener("input", autoFill);
  valueInput.addEventListener("input", updateTotals);
  row.querySelector(".row-del-btn").addEventListener("click", () => {
    row.remove();
    renumber();
    updateTotals();
  });

  renumber();
  updateTotals();
  el("pf-items-error").classList.remove("show");
}

function getItems() {
  return [...itemsBody().querySelectorAll("tr")].map((row, i) => ({
    no: i + 1,
    desc: row.querySelector(".pf-item-desc").value.trim(),
    qty: row.querySelector(".pf-item-qty").value.trim(),
    rate: clampMoney(row.querySelector(".pf-item-rate").value),
    value: clampMoney(row.querySelector(".pf-item-value").value),
  })).filter(it => it.desc || it.qty || it.rate || it.value);
}

function computeTotals() {
  const items = getItems();
  const billTotal = items.reduce((s, it) => s + it.value, 0);
  // A discount can't exceed what it's discounting; an advance can, since
  // an agent overpaying is a real (refundable) situation.
  const discount = Math.min(clampMoney(el("pf-discount").value), billTotal);
  const gross = billTotal;
  const net = gross - discount;
  const advance = clampMoney(el("pf-advance").value);
  const grand = net - advance;
  return { items, billTotal, discount, gross, net, advance, grand };
}

function updateTotals() {
  const { billTotal, discount, gross, net, advance, grand } = computeTotals();
  el("pf-live-bill").textContent = money(billTotal);
  el("pf-live-discount").textContent = money(discount);
  el("pf-live-gross").textContent = money(gross);
  el("pf-live-net").textContent = money(net);
  el("pf-live-advance").textContent = money(advance);
  el("pf-live-grand").textContent = money(grand);
}

export function openProformaForm(reservationId) {
  const res = findReservationById(reservationId);
  if (!res) {
    showToast("That reservation is no longer available");
    return;
  }
  sourceReservation = res;

  el("proforma-form").reset();
  el("pf-travel-agent-error").classList.remove("show");
  el("pf-items-error").classList.remove("show");
  setLogoSrc("proforma-form-logo", appState.selectedBranchLogo);

  el("pf-currency").innerHTML = PROFORMA_CURRENCIES
    .map(c => `<option value="${c}" ${c === DEFAULT_PROFORMA_CURRENCY ? "selected" : ""}>${c}</option>`).join("");

  // What the reservation already established, shown read-only so it's
  // clear this invoice belongs to that booking and isn't re-stating it.
  el("proforma-source-summary").innerHTML = `
    <p class="proforma-source-label">Raising an invoice against</p>
    <p class="proforma-source-main">RES-${escapeHtml(String(res.no))} · ${escapeHtml(orDash(res.guestName))}</p>
    <p class="proforma-source-meta">
      ${formatDate(res.checkinDate)} &rarr; ${formatDate(res.checkoutDate)}
      · ${res.nights} night${res.nights === 1 ? "" : "s"}
      · ${res.guestTotal} guest${res.guestTotal === 1 ? "" : "s"}
    </p>
  `;

  // Seed the charge lines from the villas on the reservation. Rates are
  // deliberately left blank: the reservation carries the rack rate in LKR,
  // and an agent is billed a contracted rate in their own currency, so
  // copying the number across would be wrong more often than right.
  itemsBody().innerHTML = "";
  const villas = (res.villas || []).filter(v => v.name);
  if (villas.length) {
    villas.forEach(v => addItemRow(
      res.bookingType ? `${v.name} (${res.bookingType})` : v.name,
      `${res.nights} Night${res.nights === 1 ? "" : "s"}`,
    ));
  } else {
    addItemRow();
  }

  el("pf-discount").value = "0";
  el("pf-advance").value = "0";
  updateTotals();
  showScreen("screen-proforma-form");
}

el("pf-add-item-btn").addEventListener("click", () => addItemRow());
["pf-discount", "pf-advance"].forEach(id => {
  capNumericInput(el(id), MAX_MONEY);
  el(id).addEventListener("input", updateTotals);
});
el("pf-travel-agent").addEventListener("input", () => {
  el("pf-travel-agent-error").classList.remove("show");
  el("pf-travel-agent").classList.remove("invalid");
});

let isSubmitting = false;

el("proforma-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (isSubmitting || !sourceReservation) return;

  if (!val("pf-travel-agent")) {
    el("pf-travel-agent-error").classList.add("show");
    el("pf-travel-agent").classList.add("invalid");
    el("pf-travel-agent").focus();
    return;
  }
  const totals = computeTotals();
  if (!totals.items.length) {
    el("pf-items-error").textContent = "Add at least one charge";
    el("pf-items-error").classList.add("show");
    return;
  }
  // A bill for nothing is not a bill. Easy to produce by accident here,
  // since a line can carry a description and a rate but still have no
  // value if the quantity wasn't readable as a number.
  if (totals.billTotal <= 0) {
    el("pf-items-error").textContent = "Every line needs a value — this invoice totals zero";
    el("pf-items-error").classList.add("show");
    return;
  }
  isSubmitting = true;

  const res = sourceReservation;
  const record = {
    id: allocateProformaNo(),
    reservationId: res.id,
    reservationNo: res.no,
    branch: res.branch,
    issuedDate: toDateISO(),
    guestName: res.guestName,
    guestTotal: res.guestTotal,
    contact: res.contact,
    nights: res.nights,
    checkinDate: res.checkinDate,
    checkoutDate: res.checkoutDate,
    travelAgent: val("pf-travel-agent"),
    voucherNo: val("pf-voucher-no"),
    currency: el("pf-currency").value,
    items: totals.items,
    billTotal: totals.billTotal,
    discount: totals.discount,
    gross: totals.gross,
    net: totals.net,
    advance: totals.advance,
    grandTotal: totals.grand,
    remark: val("pf-remark"),
    createdAt: new Date().toISOString(),
  };
  PROFORMA_INVOICES.push(record);

  renderProformaPreview(record);
  refreshReservationsList();
  sourceReservation = null;
  isSubmitting = false;
  showToast(`Proforma invoice raised for ${record.travelAgent}`);
  showScreen("screen-proforma-preview");
});

function renderProformaPreview(p) {
  const info = BRANCH_INFO[p.branch] || {};
  el("pf-prev-hotel-name").textContent = info.hotelName || appState.selectedBranchLabel;
  el("pf-prev-address").textContent = info.address || "";
  el("pf-prev-contact-line").textContent =
    [info.phone ? `Tel ${info.phone}` : "", info.email ? `Email: ${info.email}` : ""].filter(Boolean).join("  •  ");
  setLogoSrc("pf-prev-logo", appState.selectedBranchLogo);

  el("pf-prev-guest").textContent = orDash(p.guestName);
  el("pf-prev-agent").textContent = orDash(p.travelAgent);
  el("pf-prev-guests").textContent = String(p.guestTotal);
  el("pf-prev-contact").textContent = orDash(p.contact);
  el("pf-prev-nights").textContent = `${p.nights} Night${p.nights === 1 ? "" : "s"}`;
  el("pf-prev-voucher").textContent = p.voucherNo || "N/A";
  el("pf-prev-checkin").textContent = formatDate(p.checkinDate);
  el("pf-prev-checkout").textContent = formatDate(p.checkoutDate);

  // Matches the paper document's "RES - TRA102" — RES marks the booking,
  // TRA marks it as a travel agent invoice against that booking.
  el("pf-prev-resno").textContent = `RES - TRA${p.reservationNo}`;
  el("pf-prev-date").textContent = formatDate(p.issuedDate);
  el("pf-prev-currency").textContent = p.currency;
  el("pf-prev-currency-head").textContent = p.currency;

  el("pf-prev-items").innerHTML = p.items.map(it => `
    <tr>
      <td>${it.no}</td>
      <td>${escapeHtml(it.desc)}</td>
      <td>${escapeHtml(it.qty)}</td>
      <td>${it.rate ? money(it.rate) : ""}</td>
      <td>${money(it.value)}</td>
    </tr>
  `).join("");

  el("pf-prev-bill").textContent = money(p.billTotal);
  el("pf-prev-discount").textContent = p.discount ? money(p.discount) : "-";
  el("pf-prev-gross").textContent = money(p.gross);
  el("pf-prev-net").textContent = money(p.net);
  el("pf-prev-advance").textContent = p.advance ? money(p.advance) : "-";
  el("pf-prev-grand").textContent = money(p.grandTotal);

  el("pf-prev-remark-row").style.display = p.remark ? "" : "none";
  el("pf-prev-remark").textContent = p.remark;

  // Notices split around the bank block: everything up to and including
  // "settled to the below mentioned bank account" prints above it, the
  // rest below — the same order as the paper original.
  const notices = PROFORMA_NOTICES[p.branch] || [];
  const splitAt = notices.findIndex(n => /bank account/i.test(n.text));
  const before = splitAt >= 0 ? notices.slice(0, splitAt + 1) : notices;
  const after = splitAt >= 0 ? notices.slice(splitAt + 1) : [];
  const renderNotices = (list) => list
    .map(n => `<p class="${n.emphasis ? "proforma-notice-strong" : "proforma-notice"}">${escapeHtml(n.text)}</p>`)
    .join("");
  el("pf-prev-notices").innerHTML = renderNotices(before);
  el("pf-prev-notices-after").innerHTML = renderNotices(after);

  el("pf-prev-bank-name").textContent = orDash(info.bankAccountName);
  el("pf-prev-bank-no").textContent = orDash(info.bankAccountNumber);
  el("pf-prev-bank").textContent = orDash(info.bankName);
  el("pf-prev-bank-branch").textContent = orDash(info.bankBranch);

  const policy = CANCELLATION_POLICY[p.branch] || [];
  el("pf-prev-policy").innerHTML = policy.length
    ? policy.map(c => `<li>${escapeHtml(c.text)}</li>`).join("")
    : `<li class="room-detail-empty">No cancellation policy set.</li>`;

  el("pf-prev-closing").textContent = PROFORMA_CLOSING;
}

el("pf-print-btn").addEventListener("click", () => window.print());

el("pf-image-btn").addEventListener("click", () => {
  const target = el("proforma-preview");
  // Same CDN guard as the other documents — a missing script throws
  // synchronously, which .catch() never sees.
  if (typeof html2canvas !== "function") {
    showToast("Image export needs a connection — use Print instead");
    return;
  }
  try {
    html2canvas(target, { scale: 2, backgroundColor: "#ffffff" }).then(canvas => {
      const link = document.createElement("a");
      const agent = (el("pf-prev-agent").textContent || "agent")
        .replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "agent";
      link.download = `LeopardInn-Proforma-${agent}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    }).catch(() => showToast("Couldn't generate image"));
  } catch {
    showToast("Couldn't generate image");
  }
});
