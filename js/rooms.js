import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, formatDate, fmtLKR, nightsBetween, showToast } from "./utils.js";
import { ROOMS_BY_BRANCH, ROOM_STATUS_LABELS, logRoomActivity } from "./data/rooms.js";
import { MENU_ITEMS } from "./data/menu.js";
import { INVENTORY_BY_BRANCH } from "./data/inventory.js";
import { resetForm, addItemRow, clearItems, onAfterGenerate } from "./invoice.js";
import { updateInventoryBadge } from "./inventory.js";

let activeRoomRef = null; // { branch, index } — the villa the detail sheet is currently showing
let checkoutRoomRef = null; // villa currently mid-checkout, reset to available once the invoice is generated

export function updateRoomsCardAvailability() {
  const btn = document.getElementById("open-rooms-btn");
  const badge = document.getElementById("rooms-card-badge");
  const arrow = document.getElementById("rooms-card-arrow");
  const subtext = document.getElementById("rooms-card-subtext");
  const hasData = Boolean(ROOMS_BY_BRANCH[appState.selectedBranch]);

  btn.disabled = !hasData;
  badge.style.display = hasData ? "none" : "";
  arrow.style.display = hasData ? "" : "none";
  subtext.textContent = hasData
    ? "See which villas are booked and which are free"
    : "Check room availability and booking details";
}

export function renderRooms(statusFilter = null, mode = null) {
  const grid = document.getElementById("rooms-grid");
  const rooms = ROOMS_BY_BRANCH[appState.selectedBranch] || [];
  grid.innerHTML = "";

  if (statusFilter && !rooms.some(r => r.status === statusFilter)) {
    grid.innerHTML = `<p class="room-detail-empty">No ${ROOM_STATUS_LABELS[statusFilter].toLowerCase()} villas right now.</p>`;
    return;
  }

  rooms.forEach((room, index) => {
    if (statusFilter && room.status !== statusFilter) return;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "room-card " + room.status;

    const hasStay = room.status === "booked" || room.status === "occupied";
    const ribbon = hasStay
      ? `<span class="room-card-ribbon">${formatDate(room.checkin)} &rarr; ${formatDate(room.checkout)}</span>`
      : "";
    const guestLine = hasStay ? `<span class="room-card-guest">${escapeHtml(room.guest)}</span>` : "";
    // When a status filter is active every card shares the same status —
    // showing the badge on each one is just noise, so skip it then.
    const statusBadge = statusFilter
      ? ""
      : `<span class="room-card-status"><span class="room-card-status-dot"></span>${ROOM_STATUS_LABELS[room.status]}</span>`;

    card.innerHTML = `
      ${ribbon}
      <svg class="room-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
      <span class="room-card-name">${escapeHtml(room.name)}</span>
      ${guestLine}
      ${statusBadge}
    `;

    card.addEventListener("click", () => openRoomDetail(appState.selectedBranch, index, mode));
    grid.appendChild(card);
  });
}

export function openRoomDetail(branch, index, mode = null) {
  activeRoomRef = { branch, index, mode };
  renderRoomDetailBody();
  document.getElementById("room-detail-overlay").classList.add("open");
}

function closeRoomDetail() {
  document.getElementById("room-detail-overlay").classList.remove("open");
}

function getActiveRoom() {
  return ROOMS_BY_BRANCH[activeRoomRef.branch][activeRoomRef.index];
}

function renderRoomDetailBody() {
  const room = getActiveRoom();

  document.getElementById("room-detail-name").textContent = room.name;
  const statusEl = document.getElementById("room-detail-status");
  statusEl.textContent = ROOM_STATUS_LABELS[room.status];
  statusEl.className = "room-detail-status " + room.status;

  const body = document.getElementById("room-detail-body");

  if (room.status === "available") {
    body.innerHTML = `
      <div class="room-detail-row"><span>Type</span><span>${escapeHtml(room.type)}</span></div>
      <div class="room-detail-row"><span>Rate</span><span>LKR ${room.rate.toLocaleString("en-US")} / night</span></div>
      <p class="room-detail-empty">This villa is free right now.</p>
      <button type="button" class="primary-btn big" id="new-booking-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
        New Booking
      </button>
    `;
    document.getElementById("new-booking-btn").addEventListener("click", showNewBookingForm);
  } else if (room.status === "booked") {
    body.innerHTML = `
      <div class="room-detail-row"><span>Type</span><span>${escapeHtml(room.type)}</span></div>
      <div class="room-detail-row"><span>Guest</span><span>${escapeHtml(room.guest)}</span></div>
      <div class="room-detail-row"><span>Contact</span><span>${escapeHtml(room.phone || "-")}</span></div>
      <div class="room-detail-row"><span>Check-in</span><span>${formatDate(room.checkin)}</span></div>
      <div class="room-detail-row"><span>Check-out</span><span>${formatDate(room.checkout)}</span></div>
      <button type="button" class="primary-btn big" id="check-in-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>
        Check In
      </button>
    `;
    document.getElementById("check-in-btn").addEventListener("click", () => {
      room.status = "occupied";
      logRoomActivity(activeRoomRef.branch, room.name, room.guest, "Check In");
      renderRoomDetailBody();
      renderRooms();
    });
  } else {
    // Two distinct purposes now use this same "occupied villa" sheet:
    // the Food Order shortcut (order food, nothing else) and every other
    // entry point — Room Map, "Latest Boarded", a checkout row — which is
    // just about the stay itself (info + Check Out), no food ordering.
    const isFoodOrderMode = activeRoomRef.mode === "food-order";

    if (isFoodOrderMode) {
      body.innerHTML = renderFoodOrdersPanel();
      wireFoodOrdersPanel();
    } else {
      body.innerHTML = `
        <div class="room-detail-row"><span>Type</span><span>${escapeHtml(room.type)}</span></div>
        <div class="room-detail-row"><span>Guest</span><span>${escapeHtml(room.guest)}</span></div>
        <div class="room-detail-row"><span>Contact</span><span>${escapeHtml(room.phone || "-")}</span></div>
        <div class="room-detail-row"><span>Check-in</span><span>${formatDate(room.checkin)}</span></div>
        <div class="room-detail-row"><span>Check-out</span><span>${formatDate(room.checkout)}</span></div>
        <button type="button" class="primary-btn big" id="check-out-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
          Check Out
        </button>
      `;
      document.getElementById("check-out-btn").addEventListener("click", startCheckout);
    }
  }
}

// ---- Food ordering (inside an occupied villa's detail sheet) ----
let currentFoodOrder = {}; // dishId -> qty, reset each time the panel is (re)built
let foodSearchQuery = "";

function renderFoodOrdersPanel() {
  currentFoodOrder = {};
  foodSearchQuery = "";

  return `
    <div class="food-orders-panel">
      <h4>Food Orders</h4>
      <div class="food-order-selected" id="food-order-selected" style="display:none"></div>
      <div class="food-order-search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input type="search" id="food-order-search" placeholder="Search dish name or #…" autocomplete="off" autocapitalize="off" enterkeyhint="search" />
      </div>
      <div class="food-order-list" id="food-order-list"></div>
      <div class="food-order-total-row"><span>Total</span><span id="food-order-total">${fmtLKR(0)}</span></div>
      <button type="button" class="primary-btn big" id="place-order-btn" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" /></svg>
        Place Order
      </button>
    </div>
  `;
}

function renderFoodOrderList() {
  const q = foodSearchQuery.trim().toLowerCase();
  const matches = MENU_ITEMS.filter(dish => {
    if (!q) return true;
    const matchesNumber = String(dish.id) === q || String(dish.id).startsWith(q);
    const matchesName = dish.name.toLowerCase().includes(q);
    return matchesNumber || matchesName;
  });

  const list = document.getElementById("food-order-list");
  list.innerHTML = matches.map(dish => {
    const qty = currentFoodOrder[dish.id] || 0;
    return `
      <div class="food-order-row">
        <div class="food-order-info">
          <span class="food-order-name"><span class="food-order-number">#${dish.id}</span>${escapeHtml(dish.name)}</span>
          <span class="food-order-price">${fmtLKR(dish.price)}</span>
        </div>
        <div class="food-order-qty-stepper">
          <button type="button" class="stepper-input-btn food-qty-minus" data-dish-id="${dish.id}" aria-label="Remove one ${escapeHtml(dish.name)}">&minus;</button>
          <span class="food-order-qty-value" id="food-qty-${dish.id}">${qty}</span>
          <button type="button" class="stepper-input-btn food-qty-plus" data-dish-id="${dish.id}" aria-label="Add one ${escapeHtml(dish.name)}">+</button>
        </div>
      </div>
    `;
  }).join("") || `<p class="room-detail-empty">No dishes match “${escapeHtml(foodSearchQuery)}”.</p>`;

  list.querySelectorAll(".food-qty-plus").forEach(btn => {
    btn.addEventListener("click", () => adjustFoodOrderQty(btn.dataset.dishId, 1));
  });
  list.querySelectorAll(".food-qty-minus").forEach(btn => {
    btn.addEventListener("click", () => adjustFoodOrderQty(btn.dataset.dishId, -1));
  });
}

function renderFoodOrderSelected() {
  const selected = document.getElementById("food-order-selected");
  const entries = Object.keys(currentFoodOrder)
    .map(id => ({ dish: MENU_ITEMS.find(d => d.id === Number(id)), qty: currentFoodOrder[id] }))
    .filter(e => e.dish && e.qty > 0);

  if (!entries.length) {
    selected.style.display = "none";
    selected.innerHTML = "";
    return;
  }

  selected.style.display = "flex";
  selected.innerHTML = entries.map(e => `
    <span class="food-order-chip">
      ${escapeHtml(e.dish.name)} &times;${e.qty}
      <button type="button" class="food-order-chip-remove" data-dish-id="${e.dish.id}" aria-label="Remove ${escapeHtml(e.dish.name)}">&times;</button>
    </span>
  `).join("");

  selected.querySelectorAll(".food-order-chip-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      currentFoodOrder[btn.dataset.dishId] = 0;
      const qtyEl = document.getElementById("food-qty-" + btn.dataset.dishId);
      if (qtyEl) qtyEl.textContent = "0";
      updateFoodOrderTotal();
    });
  });
}

function wireFoodOrdersPanel() {
  renderFoodOrderList();
  document.getElementById("food-order-search").addEventListener("input", (e) => {
    foodSearchQuery = e.target.value;
    renderFoodOrderList();
  });
  document.getElementById("place-order-btn").addEventListener("click", placeFoodOrder);
}

function adjustFoodOrderQty(dishId, delta) {
  const current = currentFoodOrder[dishId] || 0;
  const next = Math.max(0, current + delta);
  currentFoodOrder[dishId] = next;
  document.getElementById("food-qty-" + dishId).textContent = next;
  updateFoodOrderTotal();
}

function updateFoodOrderTotal() {
  let total = 0;
  let anyQty = false;
  Object.keys(currentFoodOrder).forEach(id => {
    const qty = currentFoodOrder[id];
    if (qty > 0) {
      anyQty = true;
      const dish = MENU_ITEMS.find(d => d.id === Number(id));
      if (dish) total += dish.price * qty;
    }
  });
  document.getElementById("food-order-total").textContent = fmtLKR(total);
  document.getElementById("place-order-btn").disabled = !anyQty;
  renderFoodOrderSelected();
}

function placeFoodOrder() {
  const room = getActiveRoom();
  const inventory = INVENTORY_BY_BRANCH[activeRoomRef.branch];

  Object.keys(currentFoodOrder).forEach(id => {
    const qty = currentFoodOrder[id];
    if (qty <= 0) return;
    const dish = MENU_ITEMS.find(d => d.id === Number(id));
    if (!dish) return;
    dish.ingredients.forEach(ing => {
      const invItem = inventory.find(i => i.name === ing.item);
      if (invItem) invItem.stock = Math.max(0, Math.round((invItem.stock - ing.qty * qty) * 100) / 100);
    });
  });

  showToast("Order placed for " + room.name);
  updateInventoryBadge();
  renderRoomDetailBody();
}

function showNewBookingForm() {
  const room = getActiveRoom();
  const body = document.getElementById("room-detail-body");
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  body.innerHTML = `
    <form id="new-booking-form">
      <div class="field">
        <label>Guest Name</label>
        <input type="text" id="nb-guest" required autocomplete="name" autocapitalize="words" enterkeyhint="next" />
      </div>
      <div class="field">
        <label>Phone Number</label>
        <input type="tel" id="nb-phone" autocomplete="tel" inputmode="tel" enterkeyhint="next" />
      </div>
      <div class="form-grid">
        <div class="field">
          <label>Check-in</label>
          <input type="date" id="nb-checkin" required value="${today}" />
        </div>
        <div class="field">
          <label>Check-out</label>
          <input type="date" id="nb-checkout" required value="${tomorrow}" />
        </div>
      </div>
      <button type="submit" class="primary-btn big">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" /></svg>
        Save Booking
      </button>
    </form>
  `;

  document.getElementById("new-booking-form").addEventListener("submit", (e) => {
    e.preventDefault();
    room.guest = document.getElementById("nb-guest").value.trim();
    room.phone = document.getElementById("nb-phone").value.trim();
    room.checkin = document.getElementById("nb-checkin").value;
    room.checkout = document.getElementById("nb-checkout").value;
    room.status = "booked";
    renderRoomDetailBody();
    renderRooms();
  });
}

function startCheckout() {
  const room = getActiveRoom();
  checkoutRoomRef = { branch: activeRoomRef.branch, index: activeRoomRef.index };
  closeRoomDetail();
  prefillInvoiceForCheckout(room);
  showScreen("screen-form");
}

function prefillInvoiceForCheckout(room) {
  resetForm();
  document.getElementById("guest-name").value = room.guest || "";
  document.getElementById("guest-phone").value = room.phone || "";
  document.getElementById("checkin-date").value = room.checkin || "";
  document.getElementById("checkout-date").value = room.checkout || "";

  const nights = nightsBetween(room.checkin, room.checkout);
  const rate = room.rate || 0;
  clearItems();
  addItemRow(room.name + " — Room Charge", String(nights), String(rate), String(nights * rate));
}

// If an invoice was generated from a Room Map checkout, the villa is free again.
onAfterGenerate(() => {
  if (checkoutRoomRef) {
    const room = ROOMS_BY_BRANCH[checkoutRoomRef.branch][checkoutRoomRef.index];
    logRoomActivity(checkoutRoomRef.branch, room.name, room.guest, "Check Out");
    room.status = "available";
    delete room.guest;
    delete room.phone;
    delete room.checkin;
    delete room.checkout;
    checkoutRoomRef = null;
  }
});

document.getElementById("room-detail-close").addEventListener("click", closeRoomDetail);
document.getElementById("room-detail-overlay").addEventListener("click", (e) => {
  if (e.target.id === "room-detail-overlay") closeRoomDetail();
});

document.getElementById("open-rooms-btn").addEventListener("click", () => {
  renderRooms();
  showScreen("screen-rooms");
});
