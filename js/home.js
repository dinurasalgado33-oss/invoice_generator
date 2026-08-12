import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, showToast } from "./utils.js";
import { ROOMS_BY_BRANCH } from "./data/rooms.js";
import { renderRooms, openRoomDetail } from "./rooms.js";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

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
        <div>
          <div class="today-checkout-row-name">${escapeHtml(r.guest)}</div>
          <div class="today-checkout-row-villa">${escapeHtml(r.name)}</div>
        </div>
        <span class="stock-badge">Bill</span>
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

  const occupiedCount = rooms.filter(r => r.status === "occupied").length;
  document.getElementById("occupied-now-count").textContent = occupiedCount;

  if (checkoutsToday.length) {
    showToast(`${checkoutsToday.length} checkout${checkoutsToday.length === 1 ? "" : "s"} today`);
  }
}

document.getElementById("occupied-now-card").addEventListener("click", () => {
  renderRooms();
  showScreen("screen-rooms");
});

document.getElementById("qa-food-order-btn").addEventListener("click", () => {
  document.getElementById("open-rooms-btn").click();
});
