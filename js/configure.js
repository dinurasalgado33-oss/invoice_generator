import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, fmtLKR, setLogoSrc, showToast } from "./utils.js";
import { ROOMS_BY_BRANCH } from "./data/rooms.js";

// Manager-only settings hub. Villa rates are the first thing configurable
// here — deliberately built as a hub + cards (not a single screen) so more
// settings can be added later as their own cards without a redesign.

let editingVillaId = null;

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
