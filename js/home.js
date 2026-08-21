import { appState } from "./state.js";
import { showScreen, onScreenEnter } from "./navigation.js";
import { escapeHtml, showToast, todayISO, orDash } from "./utils.js";
import { ROOMS_BY_BRANCH } from "./data/rooms.js";
import { renderRooms, openRoomDetail } from "./rooms.js";

// announce: only the first render after picking a branch says it out loud.
// This also runs on every return to the home screen, and a toast on each
// one would be noise.
export function renderHomeDashboard({ announce = false } = {}) {
  const rooms = ROOMS_BY_BRANCH[appState.selectedBranch] || [];
  const today = todayISO();

  // Was `r.checkout === today` — an exact match, so a stay that overran
  // dropped off this panel entirely. The one screen that tells reception
  // who is leaving went quiet precisely when a guest was overdue, and the
  // villa sat "occupied" indefinitely with nobody prompted to close it.
  // Overdue stays are the ones that need attention most, so they lead.
  const due = rooms
    .filter(r => r.status === "occupied" && r.checkout && r.checkout <= today)
    .sort((a, b) => (a.checkout < b.checkout ? -1 : 1));
  const overdueCount = due.filter(r => r.checkout < today).length;

  const list = document.getElementById("today-checkouts-list");
  if (!due.length) {
    list.innerHTML = `<p class="room-detail-empty">No checkouts today.</p>`;
  } else {
    // data-room-id, NOT the array index. openRoomDetail() looks the villa
    // up by id, so passing an index opened the wrong villa where ids and
    // positions happen to line up, and threw outright where they don't
    // (Wilpattu's ids start at 7, so every row here failed).
    list.innerHTML = due.map(r => {
      const late = r.checkout < today;
      const days = late
        ? Math.round((new Date(today + "T00:00:00") - new Date(r.checkout + "T00:00:00")) / 86400000)
        : 0;
      return `
      <div class="today-checkout-row ${late ? "is-overdue" : ""}" data-room-id="${r.id}">
        <span class="today-checkout-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
        </span>
        <div class="today-checkout-info">
          <div class="today-checkout-row-name">${escapeHtml(orDash(r.guest))}</div>
          <div class="today-checkout-row-villa">${escapeHtml(r.name || "Unnamed villa")}${
            late ? ` &middot; due ${days} day${days === 1 ? "" : "s"} ago` : ""}</div>
        </div>
        <span class="today-checkout-bill-badge ${late ? "overdue" : ""}">${late ? "Overdue" : "Bill"}</span>
      </div>`;
    }).join("");
    list.querySelectorAll(".today-checkout-row").forEach(row => {
      row.addEventListener("click", () => {
        renderRooms();
        showScreen("screen-rooms");
        openRoomDetail(appState.selectedBranch, Number(row.dataset.roomId));
      });
    });
  }

  if (!announce) return;
  if (overdueCount) {
    showToast(`${overdueCount} stay${overdueCount === 1 ? "" : "s"} past checkout`);
  } else if (due.length) {
    showToast(`${due.length} checkout${due.length === 1 ? "" : "s"} today`);
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
  renderRooms("available");
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

// Keeps the checkout list honest: a villa checked out or a check-in
// cancelled removes its card the next time home is shown, instead of
// leaving a stale row that reopens a villa nobody is staying in.
onScreenEnter("screen-home", () => renderHomeDashboard());
