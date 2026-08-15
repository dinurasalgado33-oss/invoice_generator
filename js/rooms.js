import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, formatDate, fmtLKR, nightsBetween, showToast, todayISO } from "./utils.js";
import { ROOMS_BY_BRANCH, ROOM_STATUS_LABELS, logRoomActivity } from "./data/rooms.js";
import { ACTIVITIES_BY_BRANCH } from "./data/activities.js";
import { resetForm, addItemRow, clearItems, onAfterGenerate } from "./invoice.js";
import { confirmAction } from "./confirm.js";
import { ACTIVITY_RECORDS, allocateActivityRecordId, BOOKINGS } from "./data/reports.js";

let activeRoomRef = null; // { branch, index } — the villa the detail sheet is currently showing
let checkoutRoomRef = null; // villa currently mid-checkout, reset to available once the invoice is generated

export function updateRoomsCardAvailability() {
  const hasData = Boolean(ROOMS_BY_BRANCH[appState.selectedBranch]);
  document.getElementById("qa-checkin-btn").disabled = !hasData;
  document.getElementById("qa-checkout-btn").disabled = !hasData;
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

    const hasStay = room.status === "occupied";
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>
        Check In Guest
      </button>
    `;
    document.getElementById("new-booking-btn").addEventListener("click", showNewBookingForm);
  } else {
    // Two distinct purposes now use this same "occupied villa" sheet: the
    // Activities shortcut (charges to this room's eventual invoice,
    // nothing else on screen), and every other entry point — Check Out
    // quick action, a checkout row — which is just about the stay itself
    // (info + Check Out). Food ordering moved to its own Orders screen.
    const mode = activeRoomRef.mode;

    if (mode === "activity") {
      body.innerHTML = renderActivitiesPanel();
      wireActivitiesPanel();
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
        <button type="button" class="sheet-text-danger-btn" id="cancel-checkin-btn">Cancel this check-in</button>
      `;
      document.getElementById("check-out-btn").addEventListener("click", startCheckout);
      document.getElementById("cancel-checkin-btn").addEventListener("click", cancelCheckIn);
    }
  }
}

// Undo a mistaken check-in — clears the room back to available without
// generating an invoice. Any food/activity charges already run up during
// that stay are discarded along with it (they were never billed, since
// billing only happens at Check Out).
async function cancelCheckIn() {
  const room = getActiveRoom();
  const ok = await confirmAction({
    title: "Cancel check-in?",
    message: `Cancel ${room.guest}'s check-in for ${room.name}? This can't be undone.`,
    confirmLabel: "Cancel Check-In",
    tone: "danger",
  });
  if (!ok) return;

  const booking = BOOKINGS.find(b => b.branch === activeRoomRef.branch && b.villa === room.name && b.guest === room.guest && b.checkin === room.checkin && b.status === "Checked In");
  if (booking) booking.status = "Cancelled";

  logRoomActivity(activeRoomRef.branch, room.name, room.guest, "Check-In Cancelled");
  room.status = "available";
  delete room.guest;
  delete room.phone;
  delete room.checkin;
  delete room.checkout;
  delete room.pendingCharges;

  showToast(`Check-in cancelled for ${room.name}`);
  closeRoomDetail();
  renderRooms();
}

// Appends a line item to a room's running bill — picked up by
// prefillInvoiceForCheckout() whenever that villa is checked out, so
// whatever was ordered/charged during the stay lands on the invoice.
// Exported for orders.js — a completed food order bills the room the
// same way an activity charge does.
export function chargeRoom(room, desc, qty, rate) {
  if (!room.pendingCharges) room.pendingCharges = [];
  room.pendingCharges.push({ desc, qty: String(qty), rate, value: qty * rate });
}

// ---- Activity charges (inside an occupied villa's detail sheet) ----
let currentActivitySelection = {}; // activityId -> qty, reset each time the panel is (re)built
let customActivityCharges = []; // [{ name, price }] one-off entries from the custom row

function renderActivitiesPanel() {
  currentActivitySelection = {};
  customActivityCharges = [];

  const activities = ACTIVITIES_BY_BRANCH[activeRoomRef.branch] || [];
  const rows = activities.map(a => `
    <div class="food-order-row">
      <div class="food-order-info">
        <span class="food-order-name">${escapeHtml(a.name)}</span>
        <span class="food-order-price">${fmtLKR(a.price)}</span>
      </div>
      <div class="food-order-qty-stepper">
        <button type="button" class="stepper-input-btn activity-qty-minus" data-activity-id="${a.id}" aria-label="Remove one ${escapeHtml(a.name)}">&minus;</button>
        <span class="food-order-qty-value" id="activity-qty-${a.id}">0</span>
        <button type="button" class="stepper-input-btn activity-qty-plus" data-activity-id="${a.id}" aria-label="Add one ${escapeHtml(a.name)}">+</button>
      </div>
    </div>
  `).join("");

  return `
    <div class="food-orders-panel">
      <h4>Add Activity Charge</h4>
      <div class="food-order-selected" id="activity-selected" style="display:none"></div>
      <div class="food-order-list">${rows}</div>
      <div class="activity-custom-row">
        <input type="text" id="activity-custom-name" placeholder="Other activity" autocapitalize="words" />
        <input type="number" id="activity-custom-price" placeholder="Price" min="0" step="1" inputmode="decimal" />
        <button type="button" class="stepper-input-btn" id="activity-custom-add" aria-label="Add custom activity">+</button>
      </div>
      <div class="food-order-total-row"><span>Total</span><span id="activity-total">${fmtLKR(0)}</span></div>
      <button type="button" class="primary-btn big" id="charge-activity-btn" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" /></svg>
        Charge to Room Bill
      </button>
    </div>
  `;
}

function renderActivitySelected() {
  const activities = ACTIVITIES_BY_BRANCH[activeRoomRef.branch] || [];
  const selected = document.getElementById("activity-selected");

  const presetEntries = Object.keys(currentActivitySelection)
    .map(id => ({ activity: activities.find(a => a.id === Number(id)), qty: currentActivitySelection[id] }))
    .filter(e => e.activity && e.qty > 0)
    .map(e => ({ label: `${e.activity.name} ×${e.qty}`, remove: () => { currentActivitySelection[e.activity.id] = 0; const el = document.getElementById("activity-qty-" + e.activity.id); if (el) el.textContent = "0"; } }));

  const customEntries = customActivityCharges.map((c, i) => ({
    label: c.name,
    remove: () => { customActivityCharges.splice(i, 1); },
  }));

  const entries = [...presetEntries, ...customEntries];
  if (!entries.length) {
    selected.style.display = "none";
    selected.innerHTML = "";
    return;
  }

  selected.style.display = "flex";
  selected.innerHTML = entries.map((e, i) => `
    <span class="food-order-chip">
      ${escapeHtml(e.label)}
      <button type="button" class="food-order-chip-remove" data-entry-index="${i}" aria-label="Remove ${escapeHtml(e.label)}">&times;</button>
    </span>
  `).join("");

  selected.querySelectorAll(".food-order-chip-remove").forEach((btn, i) => {
    btn.addEventListener("click", () => {
      entries[i].remove();
      updateActivityTotal();
    });
  });
}

function updateActivityTotal() {
  const activities = ACTIVITIES_BY_BRANCH[activeRoomRef.branch] || [];
  let total = 0;
  Object.keys(currentActivitySelection).forEach(id => {
    const qty = currentActivitySelection[id];
    if (qty > 0) {
      const activity = activities.find(a => a.id === Number(id));
      if (activity) total += activity.price * qty;
    }
  });
  customActivityCharges.forEach(c => { total += c.price; });

  document.getElementById("activity-total").textContent = fmtLKR(total);
  document.getElementById("charge-activity-btn").disabled = total <= 0;
  renderActivitySelected();
}

function adjustActivityQty(activityId, delta) {
  const current = currentActivitySelection[activityId] || 0;
  const next = Math.max(0, current + delta);
  currentActivitySelection[activityId] = next;
  document.getElementById("activity-qty-" + activityId).textContent = next;
  updateActivityTotal();
}

function wireActivitiesPanel() {
  document.querySelectorAll(".activity-qty-plus").forEach(btn => {
    btn.addEventListener("click", () => adjustActivityQty(btn.dataset.activityId, 1));
  });
  document.querySelectorAll(".activity-qty-minus").forEach(btn => {
    btn.addEventListener("click", () => adjustActivityQty(btn.dataset.activityId, -1));
  });
  document.getElementById("activity-custom-add").addEventListener("click", () => {
    const nameInput = document.getElementById("activity-custom-name");
    const priceInput = document.getElementById("activity-custom-price");
    const name = nameInput.value.trim();
    const price = parseFloat(priceInput.value) || 0;
    if (!name || price <= 0) return;
    customActivityCharges.push({ name, price });
    nameInput.value = "";
    priceInput.value = "";
    updateActivityTotal();
  });
  document.getElementById("charge-activity-btn").addEventListener("click", chargeActivities);
}

function chargeActivities() {
  const room = getActiveRoom();
  const activities = ACTIVITIES_BY_BRANCH[activeRoomRef.branch] || [];
  const branch = activeRoomRef.branch;
  const today = todayISO();
  let total = 0;

  Object.keys(currentActivitySelection).forEach(id => {
    const qty = currentActivitySelection[id];
    if (qty <= 0) return;
    const activity = activities.find(a => a.id === Number(id));
    if (!activity) return;
    chargeRoom(room, activity.name, qty, activity.price);
    ACTIVITY_RECORDS.push({ id: allocateActivityRecordId(), name: activity.name, qty, branch, date: today, revenue: activity.price * qty });
    total += activity.price * qty;
  });

  customActivityCharges.forEach(c => {
    chargeRoom(room, c.name, 1, c.price);
    ACTIVITY_RECORDS.push({ id: allocateActivityRecordId(), name: c.name, qty: 1, branch, date: today, revenue: c.price });
    total += c.price;
  });

  showToast(`Charged ${room.name} — ${fmtLKR(total)} added to bill`);
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
          <p class="field-error" id="nb-checkout-error">Check-out must be after check-in</p>
        </div>
      </div>
      <button type="submit" class="primary-btn big">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>
        Check In Guest
      </button>
    </form>
  `;

  const nbCheckin = document.getElementById("nb-checkin");
  const nbCheckout = document.getElementById("nb-checkout");
  nbCheckin.addEventListener("change", () => { nbCheckout.min = nbCheckin.value; });
  nbCheckout.min = nbCheckin.value;
  [nbCheckin, nbCheckout].forEach(input => {
    input.addEventListener("input", () => {
      document.getElementById("nb-checkout-error").classList.remove("show");
      nbCheckout.classList.remove("invalid");
    });
  });

  document.getElementById("new-booking-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (nbCheckout.value <= nbCheckin.value) {
      document.getElementById("nb-checkout-error").classList.add("show");
      nbCheckout.classList.add("invalid");
      nbCheckout.focus();
      return;
    }
    room.guest = document.getElementById("nb-guest").value.trim();
    room.phone = document.getElementById("nb-phone").value.trim();
    room.checkin = nbCheckin.value;
    room.checkout = nbCheckout.value;
    room.status = "occupied";
    BOOKINGS.push({ guest: room.guest, villa: room.name, branch: activeRoomRef.branch, checkin: room.checkin, checkout: room.checkout, status: "Checked In" });
    logRoomActivity(activeRoomRef.branch, room.name, room.guest, "Check In");
    showToast(`${room.guest} checked into ${room.name}`);
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

  // Food orders and activity charges placed during the stay ride along
  // onto the same invoice.
  (room.pendingCharges || []).forEach(c => {
    addItemRow(c.desc, c.qty, String(c.rate), String(c.value));
  });
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
    delete room.pendingCharges;
    checkoutRoomRef = null;
  }
});

document.getElementById("room-detail-close").addEventListener("click", closeRoomDetail);
document.getElementById("room-detail-overlay").addEventListener("click", (e) => {
  if (e.target.id === "room-detail-overlay") closeRoomDetail();
});
