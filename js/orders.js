import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, fmtLKR, setLogoSrc, showToast, todayISO } from "./utils.js";
import { ROOMS_BY_BRANCH } from "./data/rooms.js";
import { MENU_ITEMS } from "./data/menu.js";
import { INVENTORY_BY_BRANCH } from "./data/inventory.js";
import { FOOD_ORDER_RECORDS, allocateFoodOrderRecordId } from "./data/reports.js";
import { FOOD_ORDERS, allocateOrderId } from "./data/orders.js";
import { chargeRoom } from "./rooms.js";
import { updateInventoryBadge } from "./inventory.js";

let currentOrderSelection = {}; // dishId -> qty, for the Create/Edit view
let orderSearchQuery = "";
let editingOrderId = null;

// ---- Inventory reservation — deducted when an order is placed/edited,
// returned if it's edited down or deleted before being completed. ----
function deductIngredients(branch, dish, qty) {
  const inventory = INVENTORY_BY_BRANCH[branch];
  dish.ingredients.forEach(ing => {
    const invItem = inventory.find(i => i.name === ing.item);
    if (invItem) invItem.stock = Math.max(0, Math.round((invItem.stock - ing.qty * qty) * 100) / 100);
  });
}

function restoreIngredients(branch, dish, qty) {
  const inventory = INVENTORY_BY_BRANCH[branch];
  dish.ingredients.forEach(ing => {
    const invItem = inventory.find(i => i.name === ing.item);
    if (invItem) invItem.stock = Math.round((invItem.stock + ing.qty * qty) * 100) / 100;
  });
}

function restoreOrderIngredients(order) {
  order.items.forEach(item => {
    const dish = MENU_ITEMS.find(d => d.id === item.dishId);
    if (dish) restoreIngredients(order.branch, dish, item.qty);
  });
}

// ---- Room picker (Create/Edit view) ----
function getOccupiedRooms() {
  const rooms = ROOMS_BY_BRANCH[appState.selectedBranch] || [];
  return rooms.map((room, index) => ({ room, index })).filter(r => r.room.status === "occupied");
}

function populateRoomSelect() {
  const select = document.getElementById("order-room-select");
  const occupied = getOccupiedRooms();
  select.innerHTML = occupied.length
    ? occupied.map(r => `<option value="${r.index}">${escapeHtml(r.room.name)} — ${escapeHtml(r.room.guest)}</option>`).join("")
    : `<option value="">No occupied villas</option>`;
  select.disabled = !occupied.length;
}

// ---- Dish list (Create/Edit view) ----
function renderDishList() {
  const q = orderSearchQuery.trim().toLowerCase();
  const matches = MENU_ITEMS.filter(dish => {
    if (!q) return true;
    const matchesNumber = String(dish.id) === q || String(dish.id).startsWith(q);
    const matchesName = dish.name.toLowerCase().includes(q);
    return matchesNumber || matchesName;
  });

  const list = document.getElementById("order-dish-list");
  list.innerHTML = matches.map(dish => {
    const qty = currentOrderSelection[dish.id] || 0;
    return `
      <div class="food-order-row">
        <div class="food-order-info">
          <span class="food-order-name"><span class="food-order-number">#${dish.id}</span>${escapeHtml(dish.name)}</span>
          <span class="food-order-price">${fmtLKR(dish.price)}</span>
        </div>
        <div class="food-order-qty-stepper">
          <button type="button" class="stepper-input-btn order-qty-minus" data-dish-id="${dish.id}" aria-label="Remove one ${escapeHtml(dish.name)}">&minus;</button>
          <span class="food-order-qty-value" id="order-qty-${dish.id}">${qty}</span>
          <button type="button" class="stepper-input-btn order-qty-plus" data-dish-id="${dish.id}" aria-label="Add one ${escapeHtml(dish.name)}">+</button>
        </div>
      </div>
    `;
  }).join("") || `<p class="room-detail-empty">No dishes match “${escapeHtml(orderSearchQuery)}”.</p>`;

  list.querySelectorAll(".order-qty-plus").forEach(btn => {
    btn.addEventListener("click", () => adjustOrderQty(btn.dataset.dishId, 1));
  });
  list.querySelectorAll(".order-qty-minus").forEach(btn => {
    btn.addEventListener("click", () => adjustOrderQty(btn.dataset.dishId, -1));
  });
}

function renderOrderSelected() {
  const selected = document.getElementById("order-selected");
  const entries = Object.keys(currentOrderSelection)
    .map(id => ({ dish: MENU_ITEMS.find(d => d.id === Number(id)), qty: currentOrderSelection[id] }))
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
      currentOrderSelection[btn.dataset.dishId] = 0;
      const qtyEl = document.getElementById("order-qty-" + btn.dataset.dishId);
      if (qtyEl) qtyEl.textContent = "0";
      updateOrderTotal();
    });
  });
}

function updateOrderTotal() {
  let total = 0;
  let anyQty = false;
  Object.keys(currentOrderSelection).forEach(id => {
    const qty = currentOrderSelection[id];
    if (qty > 0) {
      anyQty = true;
      const dish = MENU_ITEMS.find(d => d.id === Number(id));
      if (dish) total += dish.price * qty;
    }
  });
  document.getElementById("order-total").textContent = fmtLKR(total);
  const roomSelected = Boolean(document.getElementById("order-room-select").value);
  document.getElementById("order-submit-btn").disabled = !anyQty || !roomSelected;
  renderOrderSelected();
}

function adjustOrderQty(dishId, delta) {
  const current = currentOrderSelection[dishId] || 0;
  const next = Math.max(0, current + delta);
  currentOrderSelection[dishId] = next;
  document.getElementById("order-qty-" + dishId).textContent = next;
  updateOrderTotal();
}

function resetCreateView() {
  currentOrderSelection = {};
  orderSearchQuery = "";
  editingOrderId = null;
  document.getElementById("order-search").value = "";
  document.getElementById("order-edit-banner").style.display = "none";
  document.getElementById("order-room-select").disabled = false;
  document.getElementById("order-submit-label").textContent = "Place Order";
  populateRoomSelect();
  renderDishList();
  updateOrderTotal();
}

document.getElementById("order-search").addEventListener("input", (e) => {
  orderSearchQuery = e.target.value;
  renderDishList();
});
document.getElementById("order-room-select").addEventListener("change", updateOrderTotal);
document.getElementById("order-edit-cancel-btn").addEventListener("click", () => {
  resetCreateView();
  showToast("Edit cancelled");
});

document.getElementById("order-submit-btn").addEventListener("click", () => {
  const roomIndex = Number(document.getElementById("order-room-select").value);
  const room = ROOMS_BY_BRANCH[appState.selectedBranch][roomIndex];
  if (!room) return;

  const items = Object.keys(currentOrderSelection)
    .map(id => ({ dishId: Number(id), qty: currentOrderSelection[id] }))
    .filter(e => e.qty > 0)
    .map(e => {
      const dish = MENU_ITEMS.find(d => d.id === e.dishId);
      return { dishId: e.dishId, name: dish.name, qty: e.qty, price: dish.price };
    });
  if (!items.length) return;

  const total = items.reduce((s, it) => s + it.qty * it.price, 0);

  if (editingOrderId) {
    const order = FOOD_ORDERS.find(o => o.id === editingOrderId);
    if (order) {
      restoreOrderIngredients(order);
      items.forEach(item => {
        const dish = MENU_ITEMS.find(d => d.id === item.dishId);
        deductIngredients(order.branch, dish, item.qty);
      });
      order.items = items;
      order.total = total;
      showToast(`Order updated for ${order.roomName}`);
    }
  } else {
    items.forEach(item => {
      const dish = MENU_ITEMS.find(d => d.id === item.dishId);
      deductIngredients(appState.selectedBranch, dish, item.qty);
    });
    FOOD_ORDERS.push({
      id: allocateOrderId(),
      branch: appState.selectedBranch,
      roomIndex,
      roomName: room.name,
      guestName: room.guest,
      items,
      total,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    showToast(`Order placed for ${room.name} — ${fmtLKR(total)}`);
  }

  updateInventoryBadge();
  resetCreateView();
  switchOrdersView("orders");
});

// ---- Pending orders list ----
function renderPendingOrdersList() {
  const pending = FOOD_ORDERS.filter(o => o.branch === appState.selectedBranch && o.status === "pending");
  const list = document.getElementById("orders-pending-list");

  list.innerHTML = pending.map(order => `
    <div class="pending-order-card">
      <div class="pending-order-top">
        <div>
          <span class="pending-order-guest">${escapeHtml(order.guestName)}</span>
          <span class="pending-order-room">${escapeHtml(order.roomName)}</span>
        </div>
        <span class="pending-order-total">${fmtLKR(order.total)}</span>
      </div>
      <p class="pending-order-items">${order.items.map(it => `${it.qty}× ${escapeHtml(it.name)}`).join(", ")}</p>
      <div class="pending-order-actions">
        <button type="button" class="pending-order-edit-btn" data-order-id="${order.id}">Edit</button>
        <button type="button" class="pending-order-delete-btn" data-order-id="${order.id}">Delete</button>
        <button type="button" class="pending-order-complete-btn" data-order-id="${order.id}">Complete</button>
      </div>
    </div>
  `).join("") || `<p class="room-detail-empty">No pending orders right now.</p>`;

  list.querySelectorAll(".pending-order-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => editOrder(Number(btn.dataset.orderId)));
  });
  list.querySelectorAll(".pending-order-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteOrder(Number(btn.dataset.orderId)));
  });
  list.querySelectorAll(".pending-order-complete-btn").forEach(btn => {
    btn.addEventListener("click", () => completeOrder(Number(btn.dataset.orderId)));
  });
}

function editOrder(orderId) {
  const order = FOOD_ORDERS.find(o => o.id === orderId);
  if (!order) return;

  editingOrderId = orderId;
  currentOrderSelection = {};
  order.items.forEach(item => { currentOrderSelection[item.dishId] = item.qty; });
  orderSearchQuery = "";
  document.getElementById("order-search").value = "";

  populateRoomSelect();
  const roomSelect = document.getElementById("order-room-select");
  roomSelect.value = String(order.roomIndex);
  roomSelect.disabled = true;

  document.getElementById("order-edit-banner").style.display = "flex";
  document.getElementById("order-submit-label").textContent = "Save Changes";

  renderDishList();
  updateOrderTotal();
  switchOrdersView("create");
}

function deleteOrder(orderId) {
  const order = FOOD_ORDERS.find(o => o.id === orderId);
  if (!order) return;
  if (!confirm(`Delete this order for ${order.roomName}? Reserved ingredients will be returned to inventory.`)) return;

  restoreOrderIngredients(order);
  const idx = FOOD_ORDERS.findIndex(o => o.id === orderId);
  FOOD_ORDERS.splice(idx, 1);

  updateInventoryBadge();
  showToast(`Order deleted for ${order.roomName}`);
  renderPendingOrdersList();
}

function completeOrder(orderId) {
  const order = FOOD_ORDERS.find(o => o.id === orderId);
  if (!order) return;

  const room = ROOMS_BY_BRANCH[order.branch][order.roomIndex];
  const today = todayISO();

  order.items.forEach(item => {
    chargeRoom(room, item.name, item.qty, item.price);
    FOOD_ORDER_RECORDS.push({
      id: allocateFoodOrderRecordId(),
      dish: item.name,
      qty: item.qty,
      branch: order.branch,
      date: today,
      revenue: item.qty * item.price,
    });
  });

  const idx = FOOD_ORDERS.findIndex(o => o.id === orderId);
  FOOD_ORDERS.splice(idx, 1);

  showToast(`Order completed — ${fmtLKR(order.total)} billed to ${order.roomName}`);
  renderPendingOrdersList();
}

// ---- Nav (Create Order / Orders) ----
function switchOrdersView(view) {
  document.querySelectorAll("#orders-nav .report-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.ordersView === view);
  });
  document.getElementById("orders-create-view").style.display = view === "create" ? "" : "none";
  document.getElementById("orders-list-view").style.display = view === "orders" ? "" : "none";
  if (view === "orders") renderPendingOrdersList();
}

document.querySelectorAll("#orders-nav .report-tab").forEach(tab => {
  tab.addEventListener("click", () => switchOrdersView(tab.dataset.ordersView));
});

document.getElementById("qa-food-order-btn").addEventListener("click", () => {
  document.getElementById("orders-branch-label").textContent = appState.selectedBranchLabel;
  setLogoSrc("orders-logo", appState.selectedBranchLogo);
  resetCreateView();
  switchOrdersView("create");
  showScreen("screen-orders");
});
