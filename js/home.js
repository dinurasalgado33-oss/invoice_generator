import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, showToast } from "./utils.js";
import { ROOMS_BY_BRANCH } from "./data/rooms.js";
import { renderRooms, openRoomDetail } from "./rooms.js";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

let latestBoardedIndex = null;

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

  const occupied = rooms.filter(r => r.status === "occupied");
  const available = rooms.filter(r => r.status === "available");
  document.getElementById("stat-occupied-count").textContent = occupied.length;
  document.getElementById("stat-available-count").textContent = available.length;

  // "Latest boarded" — the occupied villa with the most recent check-in date.
  const latestLabel = document.getElementById("stat-latest-room");
  latestBoardedIndex = null;
  if (occupied.length) {
    let latest = null;
    rooms.forEach((r, i) => {
      if (r.status !== "occupied") return;
      if (!latest || r.checkin > latest.checkin) {
        latest = r;
        latestBoardedIndex = i;
      }
    });
    latestLabel.textContent = latest.name;
  } else {
    latestLabel.textContent = "—";
  }

  if (checkoutsToday.length) {
    showToast(`${checkoutsToday.length} checkout${checkoutsToday.length === 1 ? "" : "s"} today`);
  }
}

document.getElementById("stat-occupied-card").addEventListener("click", () => {
  renderRooms("occupied");
  showScreen("screen-rooms");
});

document.getElementById("stat-available-card").addEventListener("click", () => {
  renderRooms("available");
  showScreen("screen-rooms");
});

document.getElementById("stat-latest-card").addEventListener("click", () => {
  if (latestBoardedIndex === null) return;
  renderRooms();
  showScreen("screen-rooms");
  openRoomDetail(appState.selectedBranch, latestBoardedIndex);
});

document.getElementById("qa-food-order-btn").addEventListener("click", () => {
  // Only occupied villas can take a food order — no point showing the
  // full map (available/booked villas would just be dead ends here).
  // "food-order" mode also skips the Check Out button in the detail sheet,
  // since that's not what this shortcut is for.
  renderRooms("occupied", "food-order");
  showScreen("screen-rooms");
});
