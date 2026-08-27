import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import {
  escapeHtml, formatDate, setLogoSrc, showToast, toDateISO, orDash,
  clampMoney, capNumericInput, MAX_MONEY, MAX_COUNT,
} from "./utils.js";
import { BRANCH_INFO, CANCELLATION_POLICY, PROFORMA_NOTICES, PROFORMA_CLOSING } from "./data/branches.js";
import {
  findReservationById, PROFORMA_INVOICES, allocateProformaNo,
  PROFORMA_CURRENCIES, DEFAULT_PROFORMA_CURRENCY,
} from "./data/reservations.js";
import { refreshReservationsList } from "./reservations.js";
import { takeNumber, DOC_TYPES } from "./data/numbering.js";
import { attachSuggestions, SUGGESTION_KEYS } from "./suggestions.js";
import { add, update, COLLECTIONS } from "./data/store.js";

// Proforma Invoice — the pre-arrival bill sent to the travel agent or
// guide who made the booking. Raised against an existing reservation, so
// everything about the stay is inherited rather than retyped; staff only
// supply what the reservation couldn't know (who the agent is, the agreed
// currency and rates, the voucher).

let sourceReservation = null;

// Which invoice is being corrected, or null when raising a new one. Same
// reasoning as the reservation form: this exists for an invoice entered
// wrongly, so it overwrites in place and keeps its number rather than
// issuing a revision.
let editingProformaId = null;

// Which invoice the printed preview is currently showing, so Correct knows
// what to reopen. Declared here rather than beside its button: it is read
// by renderProformaPreview, which sits higher up the file.
let previewedProformaId = null;

const el = (id) => document.getElementById(id);
const val = (id) => (el(id).value || "").trim();

// What this agent was last charged for this villa, in this currency.
// Foreign-currency rates are contracted per agent and the reservation
// never knows them, so staff were retyping the same figure every time —
// and a mistyped rate on an agent's invoice is the error that costs money.
// Suggested, never forced: the field stays editable.
export function lastAgentRate(travelAgent, roomId, currency) {
  const agent = (travelAgent || "").trim().toLowerCase();
  if (!agent) return null;
  for (let i = PROFORMA_INVOICES.length - 1; i >= 0; i--) {
    const p = PROFORMA_INVOICES[i];
    if (p.id === editingProformaId) continue;
    if ((p.travelAgent || "").trim().toLowerCase() !== agent) continue;
    if (p.currency !== currency) continue;
    const line = (p.items || []).find(it => it.roomId === roomId && it.rate > 0);
    if (line) return line.rate;
  }
  return null;
}

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

// A line can only name a villa that is actually on the reservation, and
// its rate is whatever that reservation set. Staff change nights, nothing
// else — an agent invoice that could name a villa the guest never booked,
// at a rate nobody agreed, is a document that disagrees with its own
// reservation.
function addItemRow(roomId = null, nights = 1) {
  const villas = (sourceReservation && sourceReservation.villas) || [];
  const row = document.createElement("tr");
  row.innerHTML = `
    <td class="col-no"></td>
    <td class="col-desc" data-label="Villa">
      <select class="pf-item-villa" aria-label="Villa">
        <option value="">Select a villa…</option>
        ${villas.map(v => `<option value="${v.roomId}">${escapeHtml(v.name)}</option>`).join("")}
      </select>
    </td>
    <td class="col-qty" data-label="Nights"><input type="number" class="pf-item-nights" min="1" step="1" inputmode="numeric" aria-label="Nights"></td>
    <td class="col-price" data-label="Rate"><input type="number" class="pf-item-rate" min="0" step="0.01" inputmode="decimal" readonly aria-label="Rate"></td>
    <td class="col-total" data-label="Value"><input type="number" class="pf-item-value" min="0" step="0.01" readonly aria-label="Value"></td>
    <td class="col-del"><button type="button" class="row-del-btn" title="Remove line">✕</button></td>
  `;
  const villaSelect = row.querySelector(".pf-item-villa");
  const nightsInput = row.querySelector(".pf-item-nights");
  const rateInput = row.querySelector(".pf-item-rate");
  const valueInput = row.querySelector(".pf-item-value");
  itemsBody().appendChild(row);
  capNumericInput(rateInput, MAX_MONEY);

  // Picking a different villa re-inherits that villa's rate — but only in
  // LKR. In a foreign currency the inherited figure means nothing, so the
  // field is left for staff to fill with the contracted rate.
  function onVillaChange() {
    const villa = villas.find(v => String(v.roomId) === villaSelect.value);
    rateInput.value = villa ? inheritedRate(villa) : "";
    recalc();
  }

  // In LKR the reservation's own rate is authoritative. In a foreign
  // currency it means nothing, so fall back to whatever this agent was
  // last charged for this villa — a suggestion staff can overwrite, not a
  // figure the app insists on.
  function inheritedRate(villa) {
    if (isLocalCurrency()) return villa.rate;
    const remembered = lastAgentRate(val("pf-travel-agent"), villa.roomId, el("pf-currency").value);
    return remembered ?? "";
  }

  function recalc() {
    const n = Math.max(1, Math.floor(clampMoney(nightsInput.value, MAX_COUNT)) || 1);
    const r = clampMoney(rateInput.value);
    valueInput.value = villaSelect.value ? clampMoney(r * n).toFixed(2) : "";
    updateTotals();
  }

  villaSelect.addEventListener("change", onVillaChange);
  nightsInput.addEventListener("input", recalc);
  rateInput.addEventListener("input", recalc);
  // Exposed so a currency change can re-lock or re-inherit every row at
  // once without rebuilding the table and losing the nights staff typed.
  row._applyCurrency = () => {
    const villa = villas.find(v => String(v.roomId) === villaSelect.value);
    rateInput.readOnly = isLocalCurrency();
    // Never converted: the app doesn't know today's exchange rate, and an
    // LKR figure printed under a "Value (USD)" heading is a wrong invoice
    // rather than an approximate one. Either the reservation's LKR rate,
    // or what this agent last paid in this currency, or blank.
    rateInput.value = villa ? inheritedRate(villa) : "";
    recalc();
  };

  // Called once the agent's name is settled. Only fills a rate that is
  // still blank — a figure staff have already typed is the agreed one for
  // this booking and must not be replaced by an older invoice's.
  row._fillRememberedRate = () => {
    const villa = villas.find(v => String(v.roomId) === villaSelect.value);
    if (!villa || isLocalCurrency() || clampMoney(rateInput.value) > 0) return false;
    const remembered = lastAgentRate(val("pf-travel-agent"), villa.roomId, el("pf-currency").value);
    if (remembered == null) return false;
    rateInput.value = remembered;
    recalc();
    return true;
  };

  if (roomId != null) villaSelect.value = String(roomId);
  nightsInput.value = String(Math.max(1, nights));
  row._applyCurrency();

  row.querySelector(".row-del-btn").addEventListener("click", () => {
    row.remove();
    renumber();
    updateTotals();
  });

  renumber();
  el("pf-items-error").classList.remove("show");
}

// The villa rates on a reservation are LKR. Billing an agent in their own
// currency means those figures don't apply, so the rate field unlocks and
// staff enter the contracted rate instead. In LKR it stays inherited and
// locked, which is the common case.
function isLocalCurrency() {
  return el("pf-currency").value === "LKR";
}

function getItems() {
  const villas = (sourceReservation && sourceReservation.villas) || [];
  return [...itemsBody().querySelectorAll("tr")].map((row, i) => {
    const id = row.querySelector(".pf-item-villa").value;
    const villa = villas.find(v => String(v.roomId) === id);
    if (!villa) return null;
    const n = Math.max(1, Math.floor(clampMoney(row.querySelector(".pf-item-nights").value, MAX_COUNT)) || 1);
    // Read from the field, not from the villa — in a foreign currency the
    // field holds the agreed rate, which the reservation never knew.
    const rate = clampMoney(row.querySelector(".pf-item-rate").value);
    return {
      no: i + 1,
      roomId: villa.roomId,
      // Printed exactly as the paper document reads it: villa name with
      // the meal plan in brackets, quantity as "N Nights".
      desc: sourceReservation.bookingType ? `${villa.name} (${sourceReservation.bookingType})` : villa.name,
      qty: `${n} Night${n === 1 ? "" : "s"}`,
      nights: n,
      rate,
      value: clampMoney(rate * n),
    };
  }).filter(Boolean);
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
  // Clear the zero-total complaint as soon as it stops being true, rather
  // than leaving it on screen contradicting the totals below it.
  if (billTotal > 0) el("pf-items-error").classList.remove("show");
  el("pf-live-bill").textContent = money(billTotal);
  el("pf-live-discount").textContent = money(discount);
  el("pf-live-gross").textContent = money(gross);
  el("pf-live-net").textContent = money(net);
  el("pf-live-advance").textContent = money(advance);
  el("pf-live-grand").textContent = money(grand);
}

export function openProformaForm(reservationId) {
  editingProformaId = null;
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
    <p class="proforma-source-main">${escapeHtml(String(res.no))} · ${escapeHtml(orDash(res.guestName))}</p>
    <p class="proforma-source-meta">
      ${formatDate(res.checkinDate)} &rarr; ${formatDate(res.checkoutDate)}
      · ${res.nights} night${res.nights === 1 ? "" : "s"}
      · ${res.guestTotal} guest${res.guestTotal === 1 ? "" : "s"}
    </p>
  `;

  // One line per villa on the reservation, at that reservation's rate and
  // its number of nights. Staff adjust nights if the agent is being billed
  // for a different span; everything else is inherited.
  itemsBody().innerHTML = "";
  const villas = (res.villas || []).filter(v => v.name);
  villas.forEach(v => addItemRow(v.roomId, res.nights || 1));

  // A reservation with no villas can't produce a meaningful agent invoice,
  // and there's no "add a line" escape any more — say so rather than
  // showing an empty table with a dead submit button.
  el("pf-no-villas-note").hidden = villas.length > 0;
  el("pf-submit-btn").disabled = villas.length === 0;

  el("pf-discount").value = "0";
  el("pf-advance").value = "0";
  applyFormMode();
  updateTotals();
  showScreen("screen-proforma-form");
}

function applyFormMode() {
  const editing = editingProformaId != null;
  el("proforma-form-heading").textContent = editing
    ? `Correct Agent Invoice TRA-${editingProformaId}`
    : "Invoice for Travel Agent / Guide";
  el("pf-submit-label").textContent = editing ? "Save Changes" : "Generate Proforma Invoice";
}

// Correcting an invoice raised wrongly. The reservation behind it still
// supplies the dates and villas — those are never editable here — so this
// only reopens what staff actually chose: the agent, currency, rates,
// nights, discount, advance and remark.
export function openProformaEdit(proformaId) {
  // String-compared, never Number()'d: a proforma id is a UUID, so
  // Number() yields NaN and the find silently misses — which surfaced as
  // "That invoice is no longer available", i.e. as data loss.
  const p = PROFORMA_INVOICES.find(x => String(x.id) === String(proformaId));
  if (!p) {
    showToast("That invoice is no longer available");
    return;
  }
  const res = findReservationById(p.reservationId);
  if (!res) {
    showToast("The reservation behind this invoice is gone");
    return;
  }
  openProformaForm(res.id);
  editingProformaId = p.id;

  el("pf-travel-agent").value = p.travelAgent || "";
  el("pf-voucher-no").value = p.voucherNo || "";
  el("pf-currency").value = p.currency || DEFAULT_PROFORMA_CURRENCY;
  el("pf-remark").value = p.remark || "";
  el("pf-discount").value = String(p.discount || 0);
  el("pf-advance").value = String(p.advance || 0);

  // Rebuilt from the saved lines so the agreed rates come back exactly as
  // they were invoiced, not re-inherited from the villa.
  itemsBody().innerHTML = "";
  (p.items || []).forEach(it => addItemRow(it.roomId, it.nights || 1));
  [...itemsBody().querySelectorAll("tr")].forEach((row, i) => {
    const saved = (p.items || [])[i];
    if (!saved) return;
    const rateInput = row.querySelector(".pf-item-rate");
    rateInput.readOnly = isLocalCurrency();
    rateInput.value = saved.rate;
    rateInput.dispatchEvent(new Event("input"));
  });

  el("pf-rate-note").hidden = isLocalCurrency();
  applyFormMode();
  updateTotals();
  showScreen("screen-proforma-form");
}

["pf-discount", "pf-advance"].forEach(id => {
  capNumericInput(el(id), MAX_MONEY);
  el(id).addEventListener("input", updateTotals);
});

// Switching currency re-locks or unlocks every rate at once, keeping the
// nights already typed.
el("pf-currency").addEventListener("change", () => {
  [...itemsBody().querySelectorAll("tr")].forEach(row => row._applyCurrency && row._applyCurrency());
  const foreign = !isLocalCurrency();
  el("pf-rate-note").hidden = !foreign;
  el("pf-rate-note").textContent =
    `Enter the rate agreed with the agent in ${el("pf-currency").value} — the reservation's LKR rates don't apply.`;
});
attachSuggestions(el("pf-travel-agent"), SUGGESTION_KEYS.TRAVEL_AGENT);

el("pf-travel-agent").addEventListener("input", () => {
  el("pf-travel-agent-error").classList.remove("show");
  el("pf-travel-agent").classList.remove("invalid");
});

// Recognising the agent is what makes the remembered rate available, so the
// rows are refreshed once the name is settled rather than on every keystroke.
el("pf-travel-agent").addEventListener("change", applyRememberedRates);
el("pf-travel-agent").addEventListener("blur", applyRememberedRates);

function applyRememberedRates() {
  if (isLocalCurrency()) return;
  let filled = 0;
  [...itemsBody().querySelectorAll("tr")].forEach(row => {
    if (row._fillRememberedRate && row._fillRememberedRate()) filled++;
  });
  if (filled) showToast(`Rates filled from this agent's last invoice`);
}

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
  const res = sourceReservation;
  // A correction keeps its number, for the same reason a reservation does:
  // allocating on every edit would leave gaps that read as invoices someone
  // deleted.
  const existing = editingProformaId != null
    ? PROFORMA_INVOICES.find(x => x.id === editingProformaId)
    : null;

  let issued = null;
  if (!existing) {
    issued = takeNumber(res.branch, DOC_TYPES.PROFORMA);
    if (!issued) {
      showToast("No agent invoice numbers left on this device — reconnect and try again");
      return;
    }
  }

  isSubmitting = true;

  const record = {
    id: existing ? existing.id : allocateProformaNo(),
    no: existing ? existing.no : issued.formatted,
    financialYear: existing ? existing.financialYear : issued.fy,
    sequence: existing ? existing.sequence : issued.seq,
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
  if (existing) {
    // Overwrite in place, preserving when it was first raised.
    record.createdAt = existing.createdAt;
    record.correctedAt = new Date().toISOString();
    update(COLLECTIONS.PROFORMAS, existing, record);
  } else {
    add(COLLECTIONS.PROFORMAS, PROFORMA_INVOICES, record);
  }

  renderProformaPreview(record);
  // Reset explicitly: a reprint from Guest History mutates this button,
  // and a freshly generated invoice must not inherit that destination.
  const backBtn = document.querySelector("#screen-proforma-preview .back-btn");
  if (backBtn) { backBtn.dataset.back = "screen-reservations"; backBtn.textContent = "← Done"; }
  refreshReservationsList();
  sourceReservation = null;
  isSubmitting = false;
  showToast(existing
    ? `Agent invoice TRA-${record.id} updated`
    : `Proforma invoice raised for ${record.travelAgent}`);
  editingProformaId = null;
  showScreen("screen-proforma-preview");
});

function renderProformaPreview(p) {
  previewedProformaId = p.id;
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
  // This document's own printed number, and the reservation it was
  // raised against — two different numbers, no longer mashed into one
  // string. That string-concatenation was left over from when both were
  // bare integers; now that each is its own formatted "PREFIX-FY-###",
  // gluing them together read as garbage.
  el("pf-prev-no").textContent = p.no || "";
  el("pf-prev-resno").textContent = p.reservationNo || "";
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

// Reopen an agent invoice already issued — same reason as the others: it
// was previously reachable only at the moment it was generated.
// Same as the others: the destination travels with the call. Hardcoding
// it here meant one reprint from Guest History left every later proforma
// pointing back at Guest History too.
export function reprintProforma(proformaId, returnTo = "screen-reservations") {
  // See openProformaEdit — UUID, so string-compared.
  const p = PROFORMA_INVOICES.find(x => String(x.id) === String(proformaId));
  if (!p) {
    showToast("That invoice is no longer available");
    return;
  }
  renderProformaPreview(p);
  const btn = document.querySelector("#screen-proforma-preview .back-btn");
  if (btn) { btn.dataset.back = returnTo; btn.textContent = "← Back"; }
  showScreen("screen-proforma-preview");
}

el("pf-print-btn").addEventListener("click", () => window.print());

el("pf-correct-btn").addEventListener("click", () => {
  if (previewedProformaId == null) return;
  openProformaEdit(previewedProformaId);
});

el("pf-done-btn").addEventListener("click", async () => {
  const { openReservationsScreen } = await import("./reservations.js");
  openReservationsScreen();
});

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
