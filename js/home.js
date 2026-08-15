import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, showToast, todayISO } from "./utils.js";
import { ROOMS_BY_BRANCH } from "./data/rooms.js";
import { renderRooms, openRoomDetail } from "./rooms.js";

export function renderHomeDashboard() {
  const rooms = ROOMS_BY_BRANCH[appState.selectedBranch] || [];
  const today = todayISO();

  const checkoutsToday = rooms
    .map((r, i) => ({ ...r, index: i }))
    .filter(r => r.status === "occupied" && r.checkout === today);

  const list = document.getElementById("today-checkouts-list");
  if (!checkoutsToday.length) {
    list.innerHTML = `<p class="room-detail-empty">No checkouts today.</p>`;
  } else {
    list.innerHTML = checkoutsToday.map(r => `
      <div class="today-checkout-row" data-index="${r.index}">
        <span class="today-checkout-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
        </span>
        <div class="today-checkout-info">
          <div class="today-checkout-row-name">${escapeHtml(r.guest)}</div>
          <div class="today-checkout-row-villa">${escapeHtml(r.name)}</div>
        </div>
        <span class="today-checkout-bill-badge">Bill</span>
      </div>
    `).join("");
    list.querySelectorAll(".today-checkout-row").forEach(row => {
      row.addEventListener("click", () => {
        renderRooms();
        showScreen("screen-rooms");
        openRoomDetail(appState.selectedBranch, Number(row.dataset.index));
      });
    });
  }

  if (checkoutsToday.length) {
    showToast(`${checkoutsToday.length} checkout${checkoutsToday.length === 1 ? "" : "s"} today`);
  }
}

document.getElementById("qa-activities-btn").addEventListener("click", () => {
  // Same idea as Food Order — only occupied villas can be charged for an
  // activity, and "activity" mode shows only the activities panel.
  renderRooms("occupied", "activity");
  showScreen("screen-rooms");
});

document.getElementById("qa-checkin-btn").addEventListener("click", () => {
  // Only free villas can be checked into.
  renderRooms("available", "checkin");
  showScreen("screen-rooms");
});

document.getElementById("qa-checkout-btn").addEventListener("click", () => {
  // Only occupied villas can be checked out.
  renderRooms("occupied");
  showScreen("screen-rooms");
});

// ---- Live clock + connection status (header) ----
function updateClock() {
  document.getElementById("dash-clock").textContent = new Date().toLocaleTimeString("en-GB", { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

function updateConnectionStatus() {
  const dot = document.getElementById("dash-connection-dot");
  const label = document.getElementById("dash-connection-label");
  const online = navigator.onLine;
  dot.classList.toggle("offline", !online);

  let text = online ? "Online" : "Offline";
  // navigator.connection is Chrome/Android only — quietly skip the extra
  // detail everywhere else rather than showing something we can't back up.
  const conn = navigator.connection;
  if (online && conn && conn.effectiveType) {
    text += ` · ${conn.effectiveType === "4g" ? "Fast" : "Slow"}`;
  }
  label.textContent = text;
}
window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);
if (navigator.connection) navigator.connection.addEventListener("change", updateConnectionStatus);
updateConnectionStatus();
