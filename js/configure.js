import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, fmtLKR, setLogoSrc, showToast } from "./utils.js";
import { ROOMS_BY_BRANCH } from "./data/rooms.js";
import { ACTIVITIES_BY_BRANCH, allocateActivityId } from "./data/activities.js";
import { BRANCH_INFO, RESERVATION_CONDITIONS, allocateConditionId } from "./data/branches.js";
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
      <td class="list-td-name">${escapeHtml(room.name)}<span class="list-item-tag">${escapeHtml(room.type)}</span></td>
      <td class="list-td-price">${fmtLKR(room.rate)}</td>
      <td>
        <button type="button" class="list-edit-btn" data-room-id="${room.id}" aria-label="Edit rate for ${escapeHtml(room.name)}">
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

  document.getElementById("villa-rate-sheet-title").textContent = room.name;
  document.getElementById("villa-rate-sheet-type").textContent = room.type;
  document.getElementById("villa-rate-input").value = room.rate;

  document.getElementById("villa-rate-sheet-overlay").classList.add("open");
}

function closeVillaRateSheet() {
  document.getElementById("villa-rate-sheet-overlay").classList.remove("open");
  editingVillaId = null;
}

document.getElementById("villa-rate-sheet-close").addEventListener("click", closeVillaRateSheet);
document.getElementById("villa-rate-sheet-overlay").addEventListener("click", (e) => {
  if (e.target.id === "villa-rate-sheet-overlay") closeVillaRateSheet();
});

document.getElementById("villa-rate-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (editingVillaId === null) return;

  // required + min="1" on the input itself blocks a zero/blank submit
  // before this handler ever runs — same pattern as the other plain
  // numeric fields in the app (dish price, item stock).
  const rate = parseFloat(document.getElementById("villa-rate-input").value);
  const room = (ROOMS_BY_BRANCH[appState.selectedBranch] || []).find(r => r.id === editingVillaId);
  if (!room) return;
  room.rate = rate;

  closeVillaRateSheet();
  renderVillaList();
  showToast(`${room.name} rate updated to ${fmtLKR(rate)} / night`);
});

document.getElementById("open-configure-btn").addEventListener("click", () => {
  document.getElementById("configure-branch-label").textContent = appState.selectedBranchLabel;
  setLogoSrc("configure-logo", appState.selectedBranchLogo);
  showScreen("screen-configure");
});

document.getElementById("open-configure-villas-btn").addEventListener("click", () => {
  document.getElementById("configure-villas-branch-label").textContent = appState.selectedBranchLabel;
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

  list.innerHTML = activities.map(a => `
    <tr class="list-item-row">
      <td class="list-td-name">${escapeHtml(a.name || "Unnamed activity")}</td>
      <td class="list-td-price">${fmtLKR(a.price)}</td>
      <td>
        <button type="button" class="list-edit-btn" data-activity-id="${a.id}" aria-label="Edit ${escapeHtml(a.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="3" class="room-detail-empty">No activities yet — tap "+" to add one.</td></tr>`;

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

document.getElementById("activity-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("activity-name");
  const name = nameInput.value.trim();
  // required + min="1" on the inputs block empty/zero before this runs.
  const price = parseFloat(document.getElementById("activity-price").value);
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

  if (editingActivityId) {
    const activity = branchActivities().find(a => a.id === editingActivityId);
    if (activity) Object.assign(activity, { name, price });
    showToast(`${name} updated`);
  } else {
    branchActivities().push({ id: allocateActivityId(), name, price });
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
  document.getElementById("configure-activities-branch-label").textContent = appState.selectedBranchLabel;
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
  document.getElementById("configure-branch-branch-label").textContent = appState.selectedBranchLabel;
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

  if (editingConditionId) {
    const condition = branchConditions().find(c => c.id === editingConditionId);
    if (condition) condition.text = text;
    showToast("Condition updated");
  } else {
    branchConditions().push({ id: allocateConditionId(), text });
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
  document.getElementById("configure-conditions-branch-label").textContent = appState.selectedBranchLabel;
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
