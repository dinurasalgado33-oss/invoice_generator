import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, fmtLKR, setLogoSrc, showToast, clampMoney, capNumericInput, MAX_MONEY, setBranchLabel } from "./utils.js";
import { ROOMS_BY_BRANCH } from "./data/rooms.js";
import { ACTIVITIES_BY_BRANCH, allocateActivityId, clampHotelIncome } from "./data/activities.js";
import { CHARGE_CATEGORIES, CHARGE_CATEGORY_LABELS, chargeCategoryLabel } from "./data/charges.js";
import {
  BRANCH_INFO, RESERVATION_CONDITIONS, allocateConditionId,
  CANCELLATION_POLICY, allocateCancellationId,
  PROFORMA_NOTICES, allocateNoticeId,
} from "./data/branches.js";
import { confirmAction } from "./confirm.js";
import { openInventoryScreen } from "./inventory.js";

// Manager-only settings hub — a hub + cards (not one big screen) so each
// new configurable area lands as its own card without a redesign.

let editingVillaId = null;
let editingActivityId = null;

function renderVillaList() {
  const rooms = ROOMS_BY_BRANCH[appState.selectedBranch] || [];
  const list = document.getElementById("configure-villas-list");

  list.innerHTML = rooms.map(room => `
    <tr class="list-item-row">
      <td class="list-td-name">${escapeHtml(room.name || "Unnamed villa")}</td>
      <td class="list-td-price">${fmtLKR(room.rate)}</td>
      <td>
        <button type="button" class="list-edit-btn" data-room-id="${room.id}" aria-label="Edit ${escapeHtml(room.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="3" class="room-detail-empty">No villas for this branch yet.</td></tr>`;

  list.querySelectorAll(".list-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openVillaRateSheet(Number(btn.dataset.roomId)));
  });
}

function openVillaRateSheet(roomId) {
  const room = (ROOMS_BY_BRANCH[appState.selectedBranch] || []).find(r => r.id === roomId);
  if (!room) return;
  editingVillaId = roomId;

  document.getElementById("cfg-villa-name").value = room.name || "";
  document.getElementById("villa-rate-input").value = room.rate;
  document.getElementById("cfg-villa-name-error").classList.remove("show");
  document.getElementById("cfg-villa-name").classList.remove("invalid");

  document.getElementById("villa-rate-sheet-overlay").classList.add("open");
}

function closeVillaRateSheet() {
  document.getElementById("villa-rate-sheet-overlay").classList.remove("open");
  editingVillaId = null;
}

document.getElementById("cfg-villa-name").addEventListener("input", () => {
  document.getElementById("cfg-villa-name-error").classList.remove("show");
  document.getElementById("cfg-villa-name").classList.remove("invalid");
});

document.getElementById("villa-rate-sheet-close").addEventListener("click", closeVillaRateSheet);
document.getElementById("villa-rate-sheet-overlay").addEventListener("click", (e) => {
  if (e.target.id === "villa-rate-sheet-overlay") closeVillaRateSheet();
});

document.getElementById("villa-rate-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (editingVillaId === null) return;

  // required + min="1" on the inputs blocks a zero/blank submit before
  // this handler runs — same pattern as the other plain fields in the app.
  const nameInput = document.getElementById("cfg-villa-name");
  const name = nameInput.value.trim();
  // Clamped, not just parsed: an unparseable rate would set room.rate to
  // NaN, which then multiplies through every future checkout total for
  // this villa and prints "LKR NaN" on the guest's bill.
  const rate = clampMoney(document.getElementById("villa-rate-input").value);
  const room = (ROOMS_BY_BRANCH[appState.selectedBranch] || []).find(r => r.id === editingVillaId);
  if (!room || !name) return;

  // Scoped to this branch — the same villa name at the other property is
  // a different villa, not a duplicate.
  const duplicate = (ROOMS_BY_BRANCH[appState.selectedBranch] || [])
    .some(r => r.id !== editingVillaId && (r.name || "").trim().toLowerCase() === name.toLowerCase());
  if (duplicate) {
    document.getElementById("cfg-villa-name-error").classList.add("show");
    nameInput.classList.add("invalid");
    nameInput.focus();
    return;
  }

  // Renaming is safe: every historical record joins on the villa's id and
  // keeps its own name snapshot, so past bookings/invoices are untouched.
  room.name = name;
  room.rate = rate;

  closeVillaRateSheet();
  renderVillaList();
  showToast(`${name} updated — ${fmtLKR(rate)} / night`);
});

document.getElementById("open-configure-btn").addEventListener("click", () => {
  setBranchLabel("configure-branch-label", appState.selectedBranchLabel, appState.selectedBranch);
  setLogoSrc("configure-logo", appState.selectedBranchLogo);
  showScreen("screen-configure");
});

document.getElementById("open-configure-villas-btn").addEventListener("click", () => {
  setBranchLabel("configure-villas-branch-label", appState.selectedBranchLabel, appState.selectedBranch);
  setLogoSrc("configure-villas-logo", appState.selectedBranchLogo);
  renderVillaList();
  showScreen("screen-configure-villas");
});

// ---- Activities (per branch) ----
// Each branch keeps its own list — Wilpattu's safari tours and Arugam Bay's
// surf lessons have nothing to do with each other.
function branchActivities() {
  return ACTIVITIES_BY_BRANCH[appState.selectedBranch] || [];
}

function renderActivityList() {
  const list = document.getElementById("configure-activities-list");
  const activities = branchActivities();

  list.innerHTML = activities.map(a => {
    const income = clampHotelIncome(a.price, a.hotelIncome ?? a.price);
    const payout = (Number(a.price) || 0) - income;
    return `
    <tr class="list-item-row">
      <td class="list-td-name">
        ${escapeHtml(a.name || "Unnamed activity")}
        <span class="list-item-tag">${escapeHtml(chargeCategoryLabel(a.category))}</span>
        ${payout > 0 ? `<span class="list-item-sub">keeps ${fmtLKR(income)}</span>` : ""}
      </td>
      <td class="list-td-price">${fmtLKR(a.price)}</td>
      <td>
        <button type="button" class="list-edit-btn" data-activity-id="${a.id}" aria-label="Edit ${escapeHtml(a.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
      </td>
    </tr>
  `;
  }).join("") || `<tr><td colspan="3" class="room-detail-empty">No activities yet — tap "+" to add one.</td></tr>`;

  list.querySelectorAll(".list-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openActivitySheet(Number(btn.dataset.activityId)));
  });
}

function openActivitySheet(activityId = null) {
  editingActivityId = activityId;
  const activity = activityId ? branchActivities().find(a => a.id === activityId) : null;

  document.getElementById("activity-sheet-title").textContent = activity ? "Edit Activity" : "Add Activity";
  document.getElementById("activity-name").value = activity ? activity.name : "";
  document.getElementById("activity-price").value = activity ? activity.price : "";
  // Default a new activity to "hotel keeps everything" — that's true of
  // anything run in-house, and it's the safe direction to be wrong in
  // (understating a payout inflates profit; this way it can't).
  document.getElementById("activity-income").value = activity
    ? clampHotelIncome(activity.price, activity.hotelIncome ?? activity.price)
    : "";
  document.getElementById("activity-category").innerHTML = CHARGE_CATEGORIES.map(c =>
    `<option value="${c}" ${activity && activity.category === c ? "selected" : ""}>${CHARGE_CATEGORY_LABELS[c]}</option>`
  ).join("");
  updateActivityPayoutHint();
  document.getElementById("activity-delete-btn").style.display = activity ? "" : "none";
  document.getElementById("activity-name-error").classList.remove("show");
  document.getElementById("activity-name").classList.remove("invalid");

  document.getElementById("activity-sheet-overlay").classList.add("open");
}

function closeActivitySheet() {
  document.getElementById("activity-sheet-overlay").classList.remove("open");
  editingActivityId = null;
}

document.getElementById("add-activity-btn").addEventListener("click", () => openActivitySheet(null));
document.getElementById("activity-sheet-close").addEventListener("click", closeActivitySheet);
document.getElementById("activity-sheet-overlay").addEventListener("click", (e) => {
  if (e.target.id === "activity-sheet-overlay") closeActivitySheet();
});
document.getElementById("activity-name").addEventListener("input", () => {
  document.getElementById("activity-name-error").classList.remove("show");
  document.getElementById("activity-name").classList.remove("invalid");
});

// Spells out the split in words as it's typed — "hotel keeps X, provider
// gets Y" is the thing the manager actually needs to get right, and it's
// easy to mis-read two bare number fields.
function updateActivityPayoutHint() {
  const price = clampMoney(document.getElementById("activity-price").value);
  const raw = document.getElementById("activity-income").value;
  const income = raw === "" ? price : clampHotelIncome(price, parseFloat(raw) || 0);
  const payout = price - income;
  const hint = document.getElementById("activity-payout-hint");
  hint.textContent = payout > 0
    ? `Hotel keeps ${fmtLKR(income)} — ${fmtLKR(payout)} goes to the provider.`
    : "Hotel keeps the full amount — nothing is paid out.";
}
["activity-price", "activity-income"].forEach(id => {
  document.getElementById(id).addEventListener("input", updateActivityPayoutHint);
});

document.getElementById("activity-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("activity-name");
  const name = nameInput.value.trim();
  // required + min="1" on the inputs block empty/zero before this runs.
  const price = clampMoney(document.getElementById("activity-price").value);
  if (!name) return;

  // Scoped to this branch — the same activity name on the other branch is
  // a different activity, not a duplicate.
  const duplicate = branchActivities().some(a => a.id !== editingActivityId && a.name.trim().toLowerCase() === name.toLowerCase());
  if (duplicate) {
    document.getElementById("activity-name-error").classList.add("show");
    nameInput.classList.add("invalid");
    nameInput.focus();
    return;
  }

  const category = document.getElementById("activity-category").value;
  const incomeRaw = document.getElementById("activity-income").value;
  // Blank means "no payout arrangement", which is the whole price.
  const hotelIncome = incomeRaw === "" ? price : clampHotelIncome(price, parseFloat(incomeRaw) || 0);

  if (editingActivityId) {
    const activity = branchActivities().find(a => a.id === editingActivityId);
    if (activity) Object.assign(activity, { name, price, hotelIncome, category });
    showToast(`${name} updated`);
  } else {
    branchActivities().push({ id: allocateActivityId(), name, price, hotelIncome, category });
    showToast(`${name} added`);
  }

  closeActivitySheet();
  renderActivityList();
});

document.getElementById("activity-delete-btn").addEventListener("click", async () => {
  if (!editingActivityId) return;
  const activities = branchActivities();
  const activity = activities.find(a => a.id === editingActivityId);
  if (!activity) return;

  const ok = await confirmAction({
    title: "Remove this activity?",
    message: `Remove "${activity.name}" from ${appState.selectedBranchLabel}? Charges already added to a guest's bill are not affected.`,
    confirmLabel: "Remove Activity",
    tone: "danger",
  });
  if (!ok) return;

  activities.splice(activities.findIndex(a => a.id === editingActivityId), 1);
  closeActivitySheet();
  renderActivityList();
  showToast(`${activity.name} removed`);
});

document.getElementById("open-configure-activities-btn").addEventListener("click", () => {
  setBranchLabel("configure-activities-branch-label", appState.selectedBranchLabel, appState.selectedBranch);
  setLogoSrc("configure-activities-logo", appState.selectedBranchLogo);
  renderActivityList();
  showScreen("screen-configure-activities");
});

// ---- Branch & bank details ----
// One record per branch rather than a list, so this screen is a plain form.
// Both guest-facing documents read BRANCH_INFO live at render time, so a
// save here shows up on the very next invoice or confirmation.
const BRANCH_FIELDS = {
  "cfg-hotel-name": "hotelName",
  "cfg-address": "address",
  "cfg-phone": "phone",
  "cfg-email": "email",
  "cfg-bank-account-name": "bankAccountName",
  "cfg-bank-account-no": "bankAccountNumber",
  "cfg-bank-name": "bankName",
  "cfg-bank-branch": "bankBranch",
};

function loadBranchDetailsForm() {
  const info = BRANCH_INFO[appState.selectedBranch] || {};
  Object.entries(BRANCH_FIELDS).forEach(([inputId, key]) => {
    document.getElementById(inputId).value = info[key] || "";
  });
}

document.getElementById("branch-details-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const branch = appState.selectedBranch;
  if (!BRANCH_INFO[branch]) BRANCH_INFO[branch] = {};

  Object.entries(BRANCH_FIELDS).forEach(([inputId, key]) => {
    BRANCH_INFO[branch][key] = document.getElementById(inputId).value.trim();
  });

  showToast("Branch details saved");
});

document.getElementById("open-configure-branch-btn").addEventListener("click", () => {
  setBranchLabel("configure-branch-branch-label", appState.selectedBranchLabel, appState.selectedBranch);
  setLogoSrc("configure-branch-logo", appState.selectedBranchLogo);
  loadBranchDetailsForm();
  showScreen("screen-configure-branch");
});

// ---- Reservation conditions ----
let editingConditionId = null;

function branchConditions() {
  return RESERVATION_CONDITIONS[appState.selectedBranch] || [];
}

function renderConditionList() {
  const list = document.getElementById("configure-conditions-list");
  const conditions = branchConditions();

  list.innerHTML = conditions.map(c => `
    <div class="report-row">
      <div class="report-row-top">
        <div>
          <span class="report-row-sub">${escapeHtml(c.text || "")}</span>
        </div>
        <div class="report-row-end">
          <button type="button" class="list-edit-btn" data-condition-id="${c.id}" aria-label="Edit condition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
        </div>
      </div>
    </div>
  `).join("") || `<p class="room-detail-empty">No conditions yet — tap "+" to add one.</p>`;

  list.querySelectorAll(".list-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openConditionSheet(Number(btn.dataset.conditionId)));
  });
}

function openConditionSheet(conditionId = null) {
  editingConditionId = conditionId;
  const condition = conditionId ? branchConditions().find(c => c.id === conditionId) : null;

  document.getElementById("condition-sheet-title").textContent = condition ? "Edit Condition" : "Add Condition";
  document.getElementById("condition-text").value = condition ? condition.text : "";
  document.getElementById("condition-hide-guest").checked = Boolean(condition && condition.hideFromGuest);
  document.getElementById("condition-delete-btn").style.display = condition ? "" : "none";
  document.getElementById("condition-text-error").classList.remove("show");
  document.getElementById("condition-text").classList.remove("invalid");

  document.getElementById("condition-sheet-overlay").classList.add("open");
}

function closeConditionSheet() {
  document.getElementById("condition-sheet-overlay").classList.remove("open");
  editingConditionId = null;
}

document.getElementById("add-condition-btn").addEventListener("click", () => openConditionSheet(null));
document.getElementById("condition-sheet-close").addEventListener("click", closeConditionSheet);
document.getElementById("condition-sheet-overlay").addEventListener("click", (e) => {
  if (e.target.id === "condition-sheet-overlay") closeConditionSheet();
});
document.getElementById("condition-text").addEventListener("input", () => {
  document.getElementById("condition-text-error").classList.remove("show");
  document.getElementById("condition-text").classList.remove("invalid");
});

document.getElementById("condition-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("condition-text");
  const text = input.value.trim();
  if (!text) {
    document.getElementById("condition-text-error").classList.add("show");
    input.classList.add("invalid");
    input.focus();
    return;
  }

  const hideFromGuest = document.getElementById("condition-hide-guest").checked;
  if (editingConditionId) {
    const condition = branchConditions().find(c => c.id === editingConditionId);
    if (condition) { condition.text = text; condition.hideFromGuest = hideFromGuest; }
    showToast("Condition updated");
  } else {
    branchConditions().push({ id: allocateConditionId(), text, hideFromGuest });
    showToast("Condition added");
  }

  closeConditionSheet();
  renderConditionList();
});

document.getElementById("condition-delete-btn").addEventListener("click", async () => {
  if (!editingConditionId) return;
  const conditions = branchConditions();
  const condition = conditions.find(c => c.id === editingConditionId);
  if (!condition) return;

  const ok = await confirmAction({
    title: "Remove this condition?",
    message: "It will stop printing on new Reservation Confirmations. Confirmations already given to guests are unaffected.",
    confirmLabel: "Remove Condition",
    tone: "danger",
  });
  if (!ok) return;

  conditions.splice(conditions.findIndex(c => c.id === editingConditionId), 1);
  closeConditionSheet();
  renderConditionList();
  showToast("Condition removed");
});

document.getElementById("open-configure-conditions-btn").addEventListener("click", () => {
  setBranchLabel("configure-conditions-branch-label", appState.selectedBranchLabel, appState.selectedBranch);
  setLogoSrc("configure-conditions-logo", appState.selectedBranchLogo);
  renderConditionList();
  showScreen("screen-configure-conditions");
});

// ---- Inventory (shared screen) ----
// Opens the same Inventory screen the Log Inventory quick action uses —
// this is just the manager's entry point from the settings hub, so Back
// returns here rather than to Home.
document.getElementById("open-configure-inventory-btn").addEventListener("click", () => {
  openInventoryScreen("screen-configure");
});

// Same as-you-type capping the invoice and inventory screens use, so a
// mistyped villa rate or activity price can't reach a guest's bill.
[
  ["villa-rate-input", MAX_MONEY],
  ["activity-price", MAX_MONEY],
  ["activity-income", MAX_MONEY],
].forEach(([id, max]) => capNumericInput(document.getElementById(id), max));

// ---- Travel agent / guide invoice settings ----
// Two editable lists that print on the Proforma Invoice. The bank account
// it also prints is deliberately NOT here — it lives in Branch & Bank
// Details, so an account change follows through to every document.

let editingCancellationId = null;
let editingNoticeId = null;

function branchCancellation() {
  return CANCELLATION_POLICY[appState.selectedBranch] || [];
}
function branchNotices() {
  return PROFORMA_NOTICES[appState.selectedBranch] || [];
}

function renderCancellationList() {
  const list = document.getElementById("configure-cancellation-list");
  list.innerHTML = branchCancellation().map(c => `
    <div class="report-row">
      <div class="report-row-top">
        <div>
          <span class="report-row-sub">${escapeHtml(c.text || "")}</span>
        </div>
        <div class="report-row-end">
          <button type="button" class="list-edit-btn" data-cancellation-id="${c.id}" aria-label="Edit policy line">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
        </div>
      </div>
    </div>
  `).join("") || `<p class="room-detail-empty">No cancellation policy yet — tap "+" to add one.</p>`;

  list.querySelectorAll(".list-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openCancellationSheet(Number(btn.dataset.cancellationId)));
  });
}

function openCancellationSheet(id) {
  editingCancellationId = id;
  const line = id ? branchCancellation().find(c => c.id === id) : null;
  document.getElementById("cancellation-sheet-title").textContent = line ? "Edit Policy Line" : "Add Policy Line";
  document.getElementById("cancellation-text").value = line ? line.text : "";
  document.getElementById("cancellation-delete-btn").style.display = line ? "" : "none";
  document.getElementById("cancellation-sheet-overlay").classList.add("open");
}

function closeCancellationSheet() {
  document.getElementById("cancellation-sheet-overlay").classList.remove("open");
  editingCancellationId = null;
}

document.getElementById("add-cancellation-btn").addEventListener("click", () => openCancellationSheet(null));
document.getElementById("cancellation-sheet-close").addEventListener("click", closeCancellationSheet);
document.getElementById("cancellation-sheet-overlay").addEventListener("click", (e) => {
  if (e.target.id === "cancellation-sheet-overlay") closeCancellationSheet();
});

document.getElementById("cancellation-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = document.getElementById("cancellation-text").value.trim();
  if (!text) return;
  const list = branchCancellation();
  if (editingCancellationId) {
    const line = list.find(c => c.id === editingCancellationId);
    if (!line) { closeCancellationSheet(); showToast("That line no longer exists"); return; }
    line.text = text;
    showToast("Policy line updated");
  } else {
    list.push({ id: allocateCancellationId(), text });
    showToast("Policy line added");
  }
  closeCancellationSheet();
  renderCancellationList();
});

document.getElementById("cancellation-delete-btn").addEventListener("click", async () => {
  if (!editingCancellationId) return;
  const list = branchCancellation();
  const line = list.find(c => c.id === editingCancellationId);
  if (!line) return;
  const ok = await confirmAction({
    title: "Remove this policy line?",
    message: `"${line.text}" will stop printing on travel agent invoices.`,
    confirmLabel: "Remove Line",
    tone: "danger",
  });
  if (!ok) return;
  list.splice(list.findIndex(c => c.id === editingCancellationId), 1);
  closeCancellationSheet();
  renderCancellationList();
  showToast("Policy line removed");
});

function renderNoticesList() {
  const list = document.getElementById("configure-notices-list");
  list.innerHTML = branchNotices().map(n => `
    <div class="report-row">
      <div class="report-row-top">
        <div>
          <span class="report-row-sub">${escapeHtml(n.text || "")}</span>
          ${n.emphasis ? `<span class="notice-emphasis-tag">prints in red</span>` : ""}
        </div>
        <div class="report-row-end">
          <button type="button" class="list-edit-btn" data-notice-id="${n.id}" aria-label="Edit remark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
        </div>
      </div>
    </div>
  `).join("") || `<p class="room-detail-empty">No remarks yet — tap "+" to add one.</p>`;

  list.querySelectorAll(".list-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openNoticeSheet(Number(btn.dataset.noticeId)));
  });
}

function openNoticeSheet(id) {
  editingNoticeId = id;
  const notice = id ? branchNotices().find(n => n.id === id) : null;
  document.getElementById("notice-sheet-title").textContent = notice ? "Edit Remark" : "Add Remark";
  document.getElementById("notice-text").value = notice ? notice.text : "";
  document.getElementById("notice-emphasis").checked = notice ? Boolean(notice.emphasis) : false;
  document.getElementById("notice-delete-btn").style.display = notice ? "" : "none";
  document.getElementById("notice-sheet-overlay").classList.add("open");
}

function closeNoticeSheet() {
  document.getElementById("notice-sheet-overlay").classList.remove("open");
  editingNoticeId = null;
}

document.getElementById("add-notice-btn").addEventListener("click", () => openNoticeSheet(null));
document.getElementById("notice-sheet-close").addEventListener("click", closeNoticeSheet);
document.getElementById("notice-sheet-overlay").addEventListener("click", (e) => {
  if (e.target.id === "notice-sheet-overlay") closeNoticeSheet();
});

document.getElementById("notice-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = document.getElementById("notice-text").value.trim();
  if (!text) return;
  const emphasis = document.getElementById("notice-emphasis").checked;
  const list = branchNotices();
  if (editingNoticeId) {
    const notice = list.find(n => n.id === editingNoticeId);
    if (!notice) { closeNoticeSheet(); showToast("That remark no longer exists"); return; }
    Object.assign(notice, { text, emphasis });
    showToast("Remark updated");
  } else {
    list.push({ id: allocateNoticeId(), text, emphasis });
    showToast("Remark added");
  }
  closeNoticeSheet();
  renderNoticesList();
});

document.getElementById("notice-delete-btn").addEventListener("click", async () => {
  if (!editingNoticeId) return;
  const list = branchNotices();
  const notice = list.find(n => n.id === editingNoticeId);
  if (!notice) return;
  const ok = await confirmAction({
    title: "Remove this remark?",
    message: `"${notice.text}" will stop printing on travel agent invoices.`,
    confirmLabel: "Remove Remark",
    tone: "danger",
  });
  if (!ok) return;
  list.splice(list.findIndex(n => n.id === editingNoticeId), 1);
  closeNoticeSheet();
  renderNoticesList();
  showToast("Remark removed");
});

document.getElementById("open-configure-proforma-btn").addEventListener("click", () => {
  setBranchLabel("configure-proforma-branch-label", appState.selectedBranchLabel, appState.selectedBranch);
  setLogoSrc("configure-proforma-logo", appState.selectedBranchLogo);
  showScreen("screen-configure-proforma");
});

document.getElementById("open-configure-cancellation-btn").addEventListener("click", () => {
  setBranchLabel("configure-cancellation-branch-label", appState.selectedBranchLabel, appState.selectedBranch);
  setLogoSrc("configure-cancellation-logo", appState.selectedBranchLogo);
  renderCancellationList();
  showScreen("screen-configure-cancellation");
});

document.getElementById("open-configure-notices-btn").addEventListener("click", () => {
  setBranchLabel("configure-notices-branch-label", appState.selectedBranchLabel, appState.selectedBranch);
  setLogoSrc("configure-notices-logo", appState.selectedBranchLogo);
  renderNoticesList();
  showScreen("screen-configure-notices");
});
