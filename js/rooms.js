import { appState } from "./state.js";
import { setPhone } from "./phone-field.js";
import { showScreen, onScreenEnter } from "./navigation.js";
import { escapeHtml, formatDate, fmtLKR, nightsBetween, showToast, todayISO, orDash, toDateISO, clampMoney } from "./utils.js";
import { ROOMS_BY_BRANCH, ROOM_STATUS_LABELS, logRoomActivity } from "./data/rooms.js";
import { ACTIVITIES_BY_BRANCH, clampHotelIncome } from "./data/activities.js";
import { resetForm, addItemRow, clearItems, onAfterGenerate, setCheckoutContext } from "./invoice.js";
import { confirmAction } from "./confirm.js";
import { ACTIVITY_RECORDS, allocateActivityRecordId, BOOKINGS, allocateBookingId, writeOffStayRecords } from "./data/reports.js";
import {
  CHARGE_CATEGORIES, CHARGE_CATEGORY_LABELS, DEFAULT_CHARGE_CATEGORY,
  isChargeCategory, bookingSourcesFor, DEFAULT_BOOKING_SOURCE,
  quotedMealPlanRate,
} from "./data/charges.js";
import { openGrcForm, reprintGrc } from "./grc.js";
import { findGrcByBookingId } from "./data/grc.js";
import { RESERVATIONS, findReservationById, RESERVATION_STATUS } from "./data/reservations.js";
import { refreshReservationsList } from "./reservations.js";
import {
  addGuestCharge, openChargesFor, tabTotal, markCharged, writeOffCharges,
} from "./data/guest-charges.js";
import { attachSuggestions, SUGGESTION_KEYS } from "./suggestions.js";
import { add, update, COLLECTIONS } from "./data/store.js";

// The villa sheet is rebuilt from scratch each time it opens, so the
// `data-role="manager"` gates applied once at login never reach it. Every
// manager-only control in there is guarded through this instead.
//
// It hides buttons; it is not the boundary. That lives in firestore.rules,
// where check-in, reservations and buying stock are manager-only whatever
// the screen happens to be showing.
function isStaffUser() {
  return appState.currentRole === "staff";
}

let activeRoomRef = null; // { branch, index } — the villa the detail sheet is currently showing
let checkoutRoomRef = null; // villa currently mid-checkout, reset to available once the invoice is generated

export function updateRoomsCardAvailability() {
  const hasData = Boolean(ROOMS_BY_BRANCH[appState.selectedBranch]);
  document.getElementById("qa-checkin-btn").disabled = !hasData;
  document.getElementById("qa-checkout-btn").disabled = !hasData;
}

// What the current view is filtered to, so the banner and the "show all"
// escape can describe it — and so re-rendering after a check-in keeps the
// same filter instead of silently reverting to everything.
let activeFilter = { statusFilter: null, mode: null };

// Re-render in place after a state change (check-in, cancel, checkout).
// Calling renderRooms() bare would drop whatever filter the staff member
// arrived with, so the villa they just acted on stays gone but five
// unrelated ones appear — which reads as the screen losing its place.
function rerenderRooms() {
  renderRooms(activeFilter.statusFilter, activeFilter.mode);
}

function renderFilterBanner(statusFilter, mode, shownCount, totalCount) {
  const banner = document.getElementById("rooms-filter-banner");
  if (!statusFilter && !mode) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  const what = mode === "activity"
    ? "occupied villas — pick one to add an activity charge"
    : `${ROOM_STATUS_LABELS[statusFilter].toLowerCase()} villas`;
  document.getElementById("rooms-filter-text").textContent =
    `Showing ${shownCount} of ${totalCount} · ${what}`;
}

export function renderRooms(statusFilter = null, mode = null) {
  activeFilter = { statusFilter, mode };
  const grid = document.getElementById("rooms-grid");
  const rooms = ROOMS_BY_BRANCH[appState.selectedBranch] || [];
  grid.innerHTML = "";

  const shown = statusFilter ? rooms.filter(r => r.status === statusFilter) : rooms;
  renderFilterBanner(statusFilter, mode, shown.length, rooms.length);

  if (!rooms.length) {
    grid.innerHTML = `<p class="room-detail-empty">No villas set up for this branch yet. A manager can add them in Configure.</p>`;
    return;
  }

  if (statusFilter && !shown.length) {
    // Was a dead end: staff had to guess that the list was filtered and
    // use the browser back button to escape it.
    grid.innerHTML = `
      <div class="rooms-empty-state">
        <p class="room-detail-empty">No ${ROOM_STATUS_LABELS[statusFilter].toLowerCase()} villas right now.</p>
        <button type="button" class="secondary-btn" id="rooms-empty-show-all">Show all villas</button>
      </div>
    `;
    document.getElementById("rooms-empty-show-all").addEventListener("click", () => renderRooms(null, null));
    return;
  }

  rooms.forEach((room) => {
    if (statusFilter && room.status !== statusFilter) return;
    grid.appendChild(buildRoomCard(room, { mode, showStatus: !statusFilter }));
  });
}

// One villa card, used by the Room Map and by the staff home. Shared rather
// than copied: they are the same object on two screens, and a card that
// drifted between them would be this codebase's favourite kind of bug.
//
// `showTab` is the one thing the home screen adds — what the guest owes so
// far. It belongs there because that is the question reception is asked
// most, and it is left off the Room Map, where the job in hand is finding a
// villa rather than reading a bill.
function buildRoomCard(room, { mode = null, showStatus = true, showTab = false } = {}) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "room-card " + room.status;

  const hasStay = room.status === "occupied";
  const ribbon = hasStay
    ? `<span class="room-card-ribbon">${formatDate(room.checkin)} &rarr; ${formatDate(room.checkout)}</span>`
    : "";
  const guestLine = hasStay ? `<span class="room-card-guest">${escapeHtml(orDash(room.guest))}</span>` : "";
  // When a status filter is active every card shares the same status —
  // showing the badge on each one is just noise, so skip it then.
  const statusBadge = showStatus
    ? `<span class="room-card-status"><span class="room-card-status-dot"></span>${ROOM_STATUS_LABELS[room.status]}</span>`
    : "";
  const tab = showTab && hasStay ? tabTotal(room.bookingId) : 0;
  const tabLine = tab > 0 ? `<span class="room-card-tab">${fmtLKR(tab)}</span>` : "";

  card.innerHTML = `
    ${ribbon}
    <svg class="room-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
    <span class="room-card-name">${escapeHtml(room.name || "Unnamed villa")}</span>
    ${guestLine}
    ${tabLine}
    ${statusBadge}
  `;

  card.addEventListener("click", () => openRoomDetail(appState.selectedBranch, room.id, mode));
  return card;
}

// The same cards, rendered wherever they are asked for. The staff home uses
// this so its grid cannot drift from the Room Map's.
export function renderRoomCardsInto(container, { showTab = false } = {}) {
  const rooms = ROOMS_BY_BRANCH[appState.selectedBranch] || [];
  container.innerHTML = "";
  if (!rooms.length) {
    container.innerHTML = `<p class="room-detail-empty">No villas set up for this property yet.</p>`;
    return;
  }
  rooms.forEach(room => container.appendChild(buildRoomCard(room, { showTab })));
}

export function openRoomDetail(branch, roomId, mode = null) {
  // A villa that no longer exists (renamed branch, stale row on screen,
  // a caller passing the wrong key) must not open an empty sheet or throw
  // halfway through rendering it — say so and stay put instead.
  const room = (ROOMS_BY_BRANCH[branch] || []).find(r => r.id === roomId);
  if (!room) {
    showToast("That villa is no longer available");
    return;
  }
  activeRoomRef = { branch, roomId, mode };
  renderRoomDetailBody();
  document.getElementById("room-detail-overlay").classList.add("open");
}

function closeRoomDetail() {
  document.getElementById("room-detail-overlay").classList.remove("open");
}

function getActiveRoom() {
  return (ROOMS_BY_BRANCH[activeRoomRef.branch] || []).find(r => r.id === activeRoomRef.roomId);
}

function renderRoomDetailBody() {
  const room = getActiveRoom();
  // The villa can disappear between opening the sheet and a later re-render
  // (charging an activity while another device checks the guest out).
  if (!room) {
    closeRoomDetail();
    showToast("That villa is no longer available");
    return;
  }

  document.getElementById("room-detail-name").textContent = room.name || "Unnamed villa";
  const statusEl = document.getElementById("room-detail-status");
  statusEl.textContent = ROOM_STATUS_LABELS[room.status];
  statusEl.className = "room-detail-status " + room.status;

  const body = document.getElementById("room-detail-body");

  if (room.status === "available") {
    // This sheet is built fresh every time it opens, so the login-time role
    // gates never see it — the check has to happen here, at render.
    body.innerHTML = `
      <div class="room-detail-row"><span>Rate</span><span>LKR ${room.rate.toLocaleString("en-US")} / night</span></div>
      <p class="room-detail-empty">This villa is free right now.</p>
      ${isStaffUser() ? `<p class="room-detail-empty">A manager checks guests in.</p>` : `
      <button type="button" class="primary-btn big" id="new-booking-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>
        Check In Guest
      </button>`}
    `;
    const newBookingBtn = document.getElementById("new-booking-btn");
    if (newBookingBtn) newBookingBtn.addEventListener("click", showNewBookingForm);
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
        <div class="room-detail-row"><span>Guest</span><span>${escapeHtml(room.guest)}</span></div>
        <div class="room-detail-row"><span>Contact</span><span>${escapeHtml(room.phone || "-")}</span></div>
        <div class="room-detail-row"><span>Booked via</span><span>${escapeHtml(room.source || "-")}</span></div>
        <div class="room-detail-row"><span>Check-in</span><span>${formatDate(room.checkin)}</span></div>
        <div class="room-detail-row"><span>Check-out</span><span>${formatDate(room.checkout)}</span></div>
        ${renderRunningTab(room)}
        <!-- Staff get two things here: charge something, or close the stay.
             The registration card, ordering food and billing the tab early
             are all a manager's, or reached another way — food from the
             Food Order row on their home screen, and the tab from Check Out
             itself, which bills exactly the same charges. -->
        <button type="button" class="secondary-btn" id="charge-activity-open-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0" /><path d="M2 12c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0" /><path d="M2 18c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0" /></svg>
          Charge Activity
        </button>
        ${isStaffUser() ? "" : `
        <button type="button" class="secondary-btn" id="view-grc-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
          Registration Card
        </button>
        <button type="button" class="secondary-btn" id="villa-food-order-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z" /><path d="M6 1v3M10 1v3M14 1v3" /></svg>
          Food Order
        </button>
        <button type="button" class="secondary-btn" id="villa-invoice-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /></svg>
          Villa Invoice
        </button>`}
        <button type="button" class="primary-btn big" id="check-out-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
          Check Out
        </button>
        ${roomsOnStay(activeRoomRef.branch, room).length > 1 ? `
        <button type="button" class="secondary-btn" id="release-villa-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M15 20v-6H9v6" /></svg>
          Release just this villa
        </button>` : ""}
        ${isStaffUser() ? "" : `<button type="button" class="sheet-text-danger-btn" id="cancel-checkin-btn">Cancel this check-in</button>`}
      `;
      document.getElementById("check-out-btn").addEventListener("click", startCheckout);
      // Reopens this same sheet in activity mode. Staff have no Charge
      // Activity tile any more — their home is the villa list — so without
      // this there is no way for them to charge one at all.
      document.getElementById("charge-activity-open-btn").addEventListener("click", () => {
        openRoomDetail(activeRoomRef.branch, room.id, "activity");
      });
      // Ordering for the guest whose sheet is already open. Imported here
      // rather than at the top because orders.js imports chargeRoom from
      // this module — a static import would close the cycle at load time.
      const foodBtn = document.getElementById("villa-food-order-btn");
      if (foodBtn) foodBtn.addEventListener("click", async () => {
        const roomId = room.id;
        closeRoomDetail();
        const { openOrdersScreen } = await import("./orders.js");
        openOrdersScreen({ roomId });
      });
      const villaInvBtn = document.getElementById("villa-invoice-btn");
      if (villaInvBtn) villaInvBtn.addEventListener("click", raiseVillaInvoiceForRoom);
      const cancelBtn = document.getElementById("cancel-checkin-btn");
      if (cancelBtn) cancelBtn.addEventListener("click", cancelCheckIn);
      const releaseBtn = document.getElementById("release-villa-btn");
      if (releaseBtn) releaseBtn.addEventListener("click", releaseVilla);
      // Reopens the signed card for this stay. Deliberately here rather
      // than on the villa card in the grid — that card is itself a
      // <button>, and a button inside a button is invalid markup with
      // unreliable click handling.
      const grcBtn = document.getElementById("view-grc-btn");
      if (grcBtn) grcBtn.addEventListener("click", () => {
        closeRoomDetail();
        reprintGrc(room.bookingId ?? null);
      });
      const interimBtn = document.getElementById("interim-invoice-btn");
      if (interimBtn) interimBtn.addEventListener("click", startInterimInvoice);
    }
  }
}

// The stay's running tab — food orders and activity charges run up so far.
// Shown on the occupied villa sheet so staff can see what's accumulated
// without waiting for checkout, and bill part of it early if the guest
// wants to settle (their paper records routinely split one stay across
// several invoice numbers, usually food onto its own bill).
function renderRunningTab(room) {
  // Keyed on the stay, not the villa: a party in two villas has one tab,
  // and a charge follows the guest rather than the room it was sent to.
  const charges = openChargesFor(room.bookingId);
  if (!charges.length) return "";
  const total = charges.reduce((sum, c) => sum + c.value, 0);
  return `
    <div class="running-tab">
      <div class="running-tab-head">
        <span>Running tab</span>
        <span class="running-tab-total">${fmtLKR(total)}</span>
      </div>
      <ul class="running-tab-list">
        ${charges.map(c => `
          <li>
            <span class="running-tab-desc">${escapeHtml(c.qty)}× ${escapeHtml(c.desc)}</span>
            <span class="running-tab-value">${fmtLKR(c.value)}</span>
          </li>
        `).join("")}
      </ul>
      ${isStaffUser() ? "" : `<button type="button" class="secondary-btn" id="interim-invoice-btn">Bill this now (keep stay open)</button>`}
    </div>
  `;
}

// Bills whatever is on the tab right now without ending the stay — the
// villa stays occupied and the tab resets, so later charges land on a
// second invoice. This is the "one guest, invoices 60/61/62" pattern from
// the staff's own books, which a single checkout invoice can't express.
async function startInterimInvoice() {
  const room = getActiveRoom();
  const charges = openChargesFor(room.bookingId);
  if (!charges.length) return;
  const total = charges.reduce((sum, c) => sum + c.value, 0);

  const ok = await confirmAction({
    title: "Bill the running tab?",
    // No escapeHtml here — confirmAction sets this via textContent, so
    // escaping would render a guest like "Mr. & Mrs. Silva" as "&amp;".
    // No longer "the room charge is still billed at checkout" — it was
    // billed on arrival. Checkout now bills whatever is on the tab at the
    // time, so an interim bill is the same document raised early.
    message: `Invoice ${fmtLKR(total)} to ${room.guest} now? ${room.name} stays occupied and the tab starts fresh — anything ordered after this is billed when they leave.`,
    confirmLabel: "Create Invoice",
    tone: "safe",
  });
  if (!ok) return;

  checkoutRoomRef = null; // an interim bill must NOT free the villa
  closeRoomDetail();
  resetForm();
  setCheckoutContext({ roomId: room.id, bookingId: room.bookingId ?? null, source: room.source ?? null, interim: true });
  document.getElementById("guest-name").value = room.guest || "";
  setPhone("guest-country-code", "guest-phone", room.phone);
  document.getElementById("checkin-date").value = room.checkin || "";
  document.getElementById("checkout-date").value = room.checkout || "";
  prefillFromRegistrationCard(room);

  clearItems();
  charges.forEach(c => addItemRow(c.desc, c.qty, String(c.rate), String(c.value), c.category));
  // The tab is NOT cleared here. It used to be, on the reasoning that these
  // charges were "now on an invoice" — but at this point they are only on a
  // *form*. Pressing Back, which the form itself invites, wiped the tab and
  // raised no invoice: the guest's food simply vanished from their bill.
  // The charges are remembered instead, and removed once an invoice for
  // this villa actually exists.
  interimRef = { branch: activeRoomRef.branch, roomId: room.id, charges: charges.slice() };

  showScreen("screen-form");
}

// Which villa's tab is sitting on the invoice form, waiting to find out
// whether it becomes an invoice or gets abandoned.
let interimRef = null;

// A party booked two villas and halfway through only needs one. Frees the
// villa for someone else while the rest of the stay carries on untouched.
//
// The nights already used go onto the party's running tab rather than
// producing an invoice now, so they still leave with a single bill — one
// guest, one document, which is what checkout already promises.
async function releaseVilla() {
  const room = getActiveRoom();
  const stay = roomsOnStay(activeRoomRef.branch, room);
  if (stay.length < 2) return;

  // Charged to the villas the party keeps, so releasing this one can't
  // take its own charges with it.
  const remaining = stay.filter(r => r.id !== room.id);
  const nightsUsed = Math.max(1, nightsBetween(room.checkin, todayISO()));
  const charge = clampMoney(nightsUsed * (room.rate || 0));

  const ok = await confirmAction({
    title: `Release ${room.name}?`,
    message: `${room.name} becomes available for other guests. ${nightsUsed} night${nightsUsed === 1 ? "" : "s"} already used (${fmtLKR(charge)}) goes onto ${room.guest}'s bill, and ${remaining.map(r => r.name).join(", ")} carr${remaining.length === 1 ? "ies" : "y"} on as normal.`,
    confirmLabel: "Release Villa",
    tone: "safe",
  });
  if (!ok) return;

  const booking = BOOKINGS.find(b => b.id === room.bookingId);
  const keeper = remaining[0];
  if (charge > 0) {
    chargeRoom(keeper, `${room.name} — ${nightsUsed} night${nightsUsed === 1 ? "" : "s"} (released ${formatDate(todayISO())})`,
      nightsUsed, room.rate || 0, "villa");
  }

  // The booking has to stop claiming this villa, or checkout would sweep
  // it back in and free a villa somebody else has since been given.
  //
  // Written through update(), not assigned in place: assigning only changed
  // the copy in this tab's memory, so the release survived until the next
  // reload and was never visible to the other device at all — which is
  // exactly the sweep-it-back-in case this block exists to prevent.
  if (booking && Array.isArray(booking.roomIds)) {
    update(COLLECTIONS.BOOKINGS, booking, {
      roomIds: booking.roomIds.filter(id => id !== room.id),
      villa: remaining.map(r => r.name).join(" + "),
    });
  }

  // Nothing to carry across any more: charges belong to the stay, not to
  // the villa, so releasing one of a party's villas leaves their tab
  // untouched. This used to need charges moved by hand, and getting that
  // wrong silently wiped what the guest had run up.
  logRoomActivity(activeRoomRef.branch, room, room.guest, "Villa Released");
  room.status = "available";
  delete room.guest;
  delete room.phone;
  delete room.checkin;
  delete room.checkout;
  delete room.source;
  delete room.bookingId;

  showToast(`${room.name} released — ${fmtLKR(charge)} added to the bill`);
  closeRoomDetail();
  rerenderRooms();
}

// Undo a mistaken check-in — clears the room back to available without
// generating an invoice, discarding whatever was on the tab.
async function cancelCheckIn() {
  const room = getActiveRoom();
  const rooms = roomsOnStay(activeRoomRef.branch, room);
  // Says how many villas are being released, since the stay may cover more
  // than the one on screen and undoing all of them is not obvious.
  const scope = rooms.length > 1
    ? `${room.guest}'s check-in across ${rooms.length} villas (${rooms.map(r => r.name).join(", ")})`
    : `${room.guest}'s check-in for ${room.name}`;

  // The sheet shows the running tab directly above this button, and the
  // warning used to say only "this can't be undone" — never that the money
  // on screen was about to be written off. Staff were being asked to
  // approve a write-off without being told there was one.
  const unbilled = tabTotal(room.bookingId);
  const moneyWarning = unbilled > 0
    ? ` ${fmtLKR(unbilled)} on the running tab will be written off and billed to nobody.`
    : "";

  const ok = await confirmAction({
    title: "Cancel check-in?",
    message: `Cancel ${scope}?${moneyWarning} This can't be undone.`,
    confirmLabel: unbilled > 0 ? "Cancel & Write Off" : "Cancel Check-In",
    tone: "danger",
  });
  if (!ok) return;

  const booking = BOOKINGS.find(b => b.id === room.bookingId);
  if (booking) update(COLLECTIONS.BOOKINGS, booking, { status: "Cancelled" });

  // Check-in marks the reservation fulfilled and points it at the booking.
  // Cancelling the check-in has to undo both, or the reservation is
  // stranded: still reading "Checked In", still naming a booking that is
  // now Cancelled, and — because only Confirmed reservations are offered
  // at check-in — no longer available to check the guest in against.
  // Reception's only way out was to key the whole reservation again, under
  // a new number, while the guest holds a confirmation quoting the old one.
  //
  // Cancelled is wrong here: the guest has not cancelled anything. The
  // check-in was the mistake, so the reservation goes back to being an
  // outstanding promise, which is what it was a minute ago.
  const reservation = findReservationById(booking ? booking.reservationId : null)
    || RESERVATIONS.find(r => r.bookingId === room.bookingId);
  if (reservation && reservation.status === RESERVATION_STATUS.CHECKED_IN) {
    update(COLLECTIONS.RESERVATIONS, reservation, {
      status: RESERVATION_STATUS.CONFIRMED,
      bookingId: null,
    });
    refreshReservationsList();
  }
  // The charges are gone from the tab, so no invoice will ever carry them.
  // Left untouched they'd go on counting as revenue in the Food Orders and
  // Activities reports — money the hotel never billed and never took.
  writeOffStayRecords(room.bookingId, `Check-in cancelled for ${room.guest}`);
  writeOffCharges(room.bookingId, `Check-in cancelled for ${room.guest}`);

  rooms.forEach(r => {
    logRoomActivity(activeRoomRef.branch, r, r.guest, "Check-In Cancelled");
    r.status = "available";
    delete r.guest;
    delete r.phone;
    delete r.checkin;
    delete r.checkout;
    delete r.source;
    delete r.bookingId;
  });

  showToast(rooms.length > 1
    ? `Check-in cancelled — ${rooms.length} villas freed`
    : `Check-in cancelled for ${room.name}`);
  closeRoomDetail();
  rerenderRooms();
}

// Appends a line item to a room's running bill — picked up by
// prefillInvoiceForCheckout() whenever that villa is checked out, so
// whatever was ordered/charged during the stay lands on the invoice.
// Exported for orders.js — a completed food order bills the room the
// same way an activity charge does.
//
// `category` decides which money column the charge lands in and whether
// service charge applies to it (food only), so it travels with the line
// from the moment it's created rather than being guessed at billing time.
export function chargeRoom(room, desc, qty, rate, category = DEFAULT_CHARGE_CATEGORY) {
  return addGuestCharge({
    bookingId: room.bookingId ?? null,
    roomId: room.id,
    branch: appState.selectedBranch,
    desc, qty, rate, category,
  });
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
        <input type="text" id="activity-custom-name" placeholder="Other charge" autocapitalize="words" />
        <input type="number" id="activity-custom-price" placeholder="Price" min="0" step="1" inputmode="decimal" />
        <button type="button" class="stepper-input-btn" id="activity-custom-add" aria-label="Add custom charge">+</button>
      </div>
      <div class="activity-custom-row secondary">
        <select id="activity-custom-category" aria-label="Charge type">
          ${CHARGE_CATEGORIES.map(c => `<option value="${c}" ${c === DEFAULT_CHARGE_CATEGORY ? "selected" : ""}>${CHARGE_CATEGORY_LABELS[c]}</option>`).join("")}
        </select>
        <input type="number" id="activity-custom-income" placeholder="Hotel keeps" min="0" step="1" inputmode="decimal" />
      </div>
      <div class="field activity-guide-field">
        <label for="activity-guide">Guide / Driver <span class="label-optional">(optional)</span></label>
        <input type="text" id="activity-guide" placeholder="Who is running it" autocapitalize="words" />
      </div>
      <div class="food-order-total-row"><span>Total</span><span id="activity-total">${fmtLKR(0)}</span></div>
      <div class="food-order-total-row subtle" id="activity-payout-row" style="display:none">
        <span>Payable to provider</span><span id="activity-payout">${fmtLKR(0)}</span>
      </div>
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
  let payout = 0;
  Object.keys(currentActivitySelection).forEach(id => {
    const qty = currentActivitySelection[id];
    if (qty > 0) {
      const activity = activities.find(a => a.id === Number(id));
      if (activity) {
        total += activity.price * qty;
        const income = clampHotelIncome(activity.price, activity.hotelIncome ?? activity.price);
        payout += (activity.price - income) * qty;
      }
    }
  });
  customActivityCharges.forEach(c => {
    total += c.price;
    payout += c.price - clampHotelIncome(c.price, c.hotelIncome ?? c.price);
  });

  document.getElementById("activity-total").textContent = fmtLKR(total);
  // Only worth showing when money actually leaves the hotel — for in-house
  // activities a permanent "LKR 0.00" line is just noise.
  const payoutRow = document.getElementById("activity-payout-row");
  payoutRow.style.display = payout > 0 ? "" : "none";
  document.getElementById("activity-payout").textContent = fmtLKR(payout);
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
    const incomeInput = document.getElementById("activity-custom-income");
    const categorySelect = document.getElementById("activity-custom-category");
    const name = nameInput.value.trim();
    const price = parseFloat(priceInput.value) || 0;
    if (!name || price <= 0) return;
    // Blank income means the hotel keeps all of it — the common case for a
    // one-off. A hired car or outside guide is where it gets filled in.
    const hotelIncome = incomeInput.value === ""
      ? price
      : clampHotelIncome(price, parseFloat(incomeInput.value) || 0);
    customActivityCharges.push({ name, price, hotelIncome, category: categorySelect.value });
    nameInput.value = "";
    priceInput.value = "";
    incomeInput.value = "";
    categorySelect.value = DEFAULT_CHARGE_CATEGORY;
    updateActivityTotal();
  });
  // Same list the registration card uses — a guide named here is the same
  // person as the guide named there.
  attachSuggestions(document.getElementById("activity-guide"), SUGGESTION_KEYS.GUIDE, ["Ashen", "Pradeep", "Shalika", "Sanjula", "Ashik"]);
  document.getElementById("charge-activity-btn").addEventListener("click", chargeActivities);
}

// Confirmed, like completing a food order is. It was the odd one out, and
// backwards: a 2,740 dinner asked before billing, while a 33,000 full-day
// safari went straight onto the guest's bill on one tap. That is also the
// charge with a payout attached, so a mis-tap owes an outside provider
// money the hotel never took.
//
// The dialog names the total and lists what is about to be charged, since
// "are you sure" on its own tells reception nothing they can check.
async function chargeActivities() {
  const room = getActiveRoom();
  const activities = ACTIVITIES_BY_BRANCH[activeRoomRef.branch] || [];
  const branch = activeRoomRef.branch;
  const today = todayISO();
  const guide = (document.getElementById("activity-guide").value || "").trim();
  let total = 0;

  const lines = [];
  Object.keys(currentActivitySelection).forEach(id => {
    const qty = currentActivitySelection[id];
    if (qty <= 0) return;
    const activity = activities.find(a => a.id === Number(id));
    if (activity) lines.push({ label: `${qty}× ${activity.name}`, value: activity.price * qty });
  });
  customActivityCharges.forEach(c => lines.push({ label: c.name, value: c.price }));
  if (!lines.length) return;

  const preview = lines.reduce((s, l) => s + l.value, 0);
  const ok = await confirmAction({
    title: "Charge these to the room?",
    // No escapeHtml — confirmAction sets this with textContent, so escaping
    // would print "Mr. &amp; Mrs. Silva".
    message: `${lines.map(l => l.label).join(", ")} — ${fmtLKR(preview)} to ${room.guest}. This goes on their bill at checkout.`,
    confirmLabel: "Charge to Bill",
    tone: "safe",
  });
  if (!ok) return;

  Object.keys(currentActivitySelection).forEach(id => {
    const qty = currentActivitySelection[id];
    if (qty <= 0) return;
    const activity = activities.find(a => a.id === Number(id));
    if (!activity) return;
    const category = isChargeCategory(activity.category) ? activity.category : DEFAULT_CHARGE_CATEGORY;
    const income = clampHotelIncome(activity.price, activity.hotelIncome ?? activity.price);
    chargeRoom(room, activity.name, qty, activity.price, category);
    // `revenue` stays the gross billed to the guest (it has to reconcile
    // with the invoice line), while `income`/`payout` carry the split so
    // the dashboard can report what the hotel actually kept.
    add(COLLECTIONS.ACTIVITY_CHARGES, ACTIVITY_RECORDS, {
      id: allocateActivityRecordId(),
      activityId: activity.id,
      roomId: room.id,
      bookingId: room.bookingId ?? null,
      at: new Date().toISOString(),
      name: activity.name,
      qty,
      branch,
      date: today,
      category,
      revenue: activity.price * qty,
      income: income * qty,
      payout: (activity.price - income) * qty,
      guide: guide || null,
    });
    total += activity.price * qty;
  });

  customActivityCharges.forEach(c => {
    const category = isChargeCategory(c.category) ? c.category : DEFAULT_CHARGE_CATEGORY;
    const income = clampHotelIncome(c.price, c.hotelIncome ?? c.price);
    chargeRoom(room, c.name, 1, c.price, category);
    // One-off charges have no catalogue entry, so activityId is null — but
    // they can still carry a payout (a hired car, an outside guide).
    add(COLLECTIONS.ACTIVITY_CHARGES, ACTIVITY_RECORDS, {
      id: allocateActivityRecordId(),
      activityId: null,
      roomId: room.id,
      bookingId: room.bookingId ?? null,
      at: new Date().toISOString(),
      name: c.name,
      qty: 1,
      branch,
      date: today,
      category,
      revenue: c.price,
      income,
      payout: c.price - income,
      guide: guide || null,
    });
    total += c.price;
  });

  showToast(`Charged ${room.name} — ${fmtLKR(total)} added to bill`);
  renderRoomDetailBody();
}

// Check-in now runs through the Guest Registration Card. Filling in the
// card is a legal requirement for every guest, so it isn't a step that
// follows check-in — it *is* the check-in, and there is deliberately no
// path that books a villa without one. The old four-field form that lived
// here would have been that path.
//
// The booking is created inside this callback, which the GRC form calls
// only once the card is complete and valid. Returning the booking id lets
// the card record store what stay it belongs to.
function showNewBookingForm() {
  const room = getActiveRoom();
  if (!room) return;
  const branch = activeRoomRef.branch;
  closeRoomDetail();

  openGrcForm({
    branch,
    room,
    onComplete: (card, reservation) => {
      const all = ROOMS_BY_BRANCH[branch] || [];

      // A party that reserved several villas is one stay, not several.
      // Checking them in villa by villa produced a separate booking, card
      // and invoice for each — so one group appeared as two guests in the
      // history and got two bills. Every villa on their reservation is
      // taken together, from whichever one staff started on.
      let rooms = [room];
      if (reservation) {
        const reserved = (reservation.villas || [])
          .map(v => all.find(r => r.id === v.roomId))
          .filter(Boolean);
        // Only villas actually free right now. One already occupied
        // belongs to somebody else and can't be handed over silently.
        const free = reserved.filter(r => r.id === room.id || r.status === "available");
        const taken = reserved.filter(r => r.id !== room.id && r.status !== "available");
        rooms = [room, ...free.filter(r => r.id !== room.id)];
        if (taken.length) {
          showToast(`${taken.map(r => r.name).join(", ")} already occupied — checked in to the rest`);
        }
      }

      const source = bookingSourcesFor(branch).includes(card.reservationMadeBy)
        ? card.reservationMadeBy
        : DEFAULT_BOOKING_SOURCE;

      // One booking covering every villa on the stay. `roomId` stays as the
      // villa staff started from, so anything joining on it still resolves;
      // `roomIds` is what checkout and cancellation actually work through.
      const booking = {
        id: allocateBookingId(),
        roomId: room.id,
        roomIds: rooms.map(r => r.id),
        guest: card.guestName,
        villa: rooms.map(r => r.name).join(" + "),
        branch,
        checkin: card.arrivalDate,
        checkout: card.departureDate,
        source,
        // The guest's number, on the booking rather than only on the card.
        //
        // deriveOccupancy() rebuilds every villa from its booking and has
        // always been ready for this — `if (booking.phone != null)
        // room.phone = booking.phone`. Check-in set r.phone directly and
        // never wrote it here, so the first re-derive after check-in
        // deleted it and nothing put it back: the villa detail sheet's
        // Contact row read "-" for every occupied villa at both properties,
        // permanently, while the number sat on the registration card one
        // lookup away. Reception looking at a villa is exactly who needs to
        // ring the guest in it.
        phone: card.phone || "",
        reservationId: reservation ? reservation.id : null,
        status: "Checked In",
      };
      add(COLLECTIONS.BOOKINGS, BOOKINGS, booking);

      rooms.forEach(r => {
        r.guest = card.guestName;
        r.phone = card.phone;
        r.checkin = card.arrivalDate;
        r.checkout = card.departureDate;
        r.source = source;
        r.status = "occupied";
        r.bookingId = booking.id;
        logRoomActivity(branch, r, r.guest, "Check In");
      });

      if (rooms.length > 1) {
        showToast(`${card.guestName} checked into ${rooms.length} villas`);
      }

      // The villa invoice is raised next, from the card preview that is
      // about to open. Held as the villa staff started from — the stay's
      // other villas come back out of the booking when the invoice is
      // built, so one bill still covers the whole party.
      pendingVillaInvoice = { branch, roomId: room.id };

      rerenderRooms();
      return booking.id;
    },
  });
}

// The stay just checked in, waiting for its villa invoice to be raised.
// Set as the booking is created and read once, by the registration card
// preview that opens immediately afterwards.
let pendingVillaInvoice = null;

// Read and consumed on the way in, so the button appears on the card that
// has just been filled in and not on a reprint of one from last week —
// where the invoice was raised long ago and offering to raise it again
// would invite a duplicate bill.
onScreenEnter("screen-grc-preview", () => {
  const btn = document.getElementById("grc-villa-invoice-btn");
  if (!btn) return;
  btn.hidden = !pendingVillaInvoice;
});

document.getElementById("grc-villa-invoice-btn").addEventListener("click", () => {
  const pending = pendingVillaInvoice;
  pendingVillaInvoice = null;
  if (!pending) return;
  const room = (ROOMS_BY_BRANCH[pending.branch] || []).find(r => r.id === pending.roomId);
  if (!room || !room.bookingId) {
    showToast("That stay is no longer open");
    return;
  }
  prefillVillaInvoiceForCheckIn(pending.branch, room);
  showScreen("screen-form");
});

// Raising the villa invoice later: the manager pressed Done on the card, or
// voided the first one and needs another. Reached from the villa itself,
// which is where somebody looking for a stay's paperwork already goes.
function raiseVillaInvoiceForRoom() {
  const room = getActiveRoom();
  const branch = activeRoomRef.branch;
  closeRoomDetail();
  prefillVillaInvoiceForCheckIn(branch, room);
  showScreen("screen-form");
}

async function startCheckout() {
  const room = getActiveRoom();
  const branch = activeRoomRef.branch;
  const charges = openChargesFor(room.bookingId);

  // A guest who ordered nothing has nothing left to bill: their villa was
  // invoiced when they arrived. Sending reception to an invoice form with
  // no lines on it would either produce a zero-value document or, worse,
  // invite somebody to type one — so the stay simply closes.
  //
  // Said out loud rather than done silently, because "Check Out" leading
  // straight back to the room map with no paperwork is exactly the kind of
  // thing that reads as a failed tap.
  if (!charges.length) {
    const ok = await confirmAction({
      title: "Check out with no bill?",
      message: `${room.guest} has nothing on their tab — no food and no activities. Their villa was invoiced at check-in, so there is nothing left to charge. Check them out?`,
      confirmLabel: "Check Out",
      tone: "safe",
    });
    if (!ok) return;

    closeRoomDetail();
    closeStay(branch, room, null);
    showToast(`${room.name} checked out — nothing to bill`);
    rerenderRooms();
    return;
  }

  checkoutRoomRef = { branch, roomId: room.id };
  closeRoomDetail();
  prefillInvoiceForCheckout(room);
  showScreen("screen-form");
}

// Every villa on the stay, not just the one staff tapped. A party in two
// villas gets one bill covering both — billing the villa you happened to
// open would leave the other one unbilled and still occupied.
function roomsOnStay(branch, room) {
  const all = ROOMS_BY_BRANCH[branch] || [];
  const booking = BOOKINGS.find(b => b.id === room.bookingId);
  if (!booking || !Array.isArray(booking.roomIds) || booking.roomIds.length < 2) return [room];
  const rooms = booking.roomIds.map(id => all.find(r => r.id === id)).filter(Boolean);
  return rooms.length ? rooms : [room];
}


// Everything the invoice form asks for that this stay already answered.
//
// The registration card carries the guest's reservation number, voucher
// code and head count; reception typed all three again at checkout, from a
// card sitting one screen away. Retyping is where a bill and a card start
// to disagree.
//
// The reservation number and voucher are locked when they come from a
// reservation: they identify a document that already exists, and nothing
// good comes of a bill quoting a different one. A walk-in has no
// reservation, so both stay editable — a walk-in can still hand a voucher
// over at the desk.
function prefillFromRegistrationCard(room) {
  const card = room.bookingId ? findGrcByBookingId(room.bookingId) : null;

  const resvField = document.getElementById("reg-card-no");
  const voucherField = document.getElementById("voucher-no");
  const countField = document.getElementById("guest-count");

  // Unlocked every time. resetForm() clears values but not this flag, so a
  // previous guest's readonly state would otherwise survive onto the next
  // bill and refuse to be corrected.
  [resvField, voucherField].forEach(f => {
    f.readOnly = false;
    f.removeAttribute("title");
  });

  if (!card) return;

  const heads = (card.adults || 0) + (card.children || 0) + (card.kids || 0);
  if (heads > 0) countField.value = String(heads);

  if (card.reservationNo) {
    resvField.value = card.reservationNo;
    resvField.readOnly = true;
    resvField.title = "From the reservation this stay was checked in against";
  }
  if (card.voucherNo) {
    voucherField.value = card.voucherNo;
    voucherField.readOnly = true;
    voucherField.title = "From the registration card";
  }
}
// The stay's own bill, raised on arrival: the villa and whatever the
// booking type adds, and nothing else. The guest gets this by e-mail
// before they have ordered so much as a coffee.
//
// It is billed for the nights the booking says, so it commits to the stay
// before the stay has happened. A guest who leaves early or extends means
// this document is wrong, and the answer is to void it and raise another —
// which is a manager's job, and check-in is a manager's job, so the person
// who can fix it is the person who was already standing there.
export function prefillVillaInvoiceForCheckIn(branch, room) {
  const rooms = roomsOnStay(branch, room);

  resetForm();
  setCheckoutContext({
    roomId: room.id,
    bookingId: room.bookingId ?? null,
    source: room.source ?? null,
    kind: "villa",
  });
  document.getElementById("guest-name").value = room.guest || "";
  setPhone("guest-country-code", "guest-phone", room.phone);
  document.getElementById("checkin-date").value = room.checkin || "";
  document.getElementById("checkout-date").value = room.checkout || "";
  prefillFromRegistrationCard(room);

  const nights = nightsBetween(room.checkin, room.checkout);
  clearItems();
  addStayLines(branch, room, rooms, nights);
}

// The villa and board lines, shared by the check-in invoice and by nothing
// else. Kept as one function because the two of them have to move together
// — a stay billed for the room without its meal plan, or the other way
// round, is the disagreement this codebase keeps producing.
function addStayLines(branch, room, rooms, nights) {
  // One room-charge line per villa, each at its own nightly rate — the
  // villas on a stay are often different sizes and prices.
  rooms.forEach(r => {
    const rate = r.rate || 0;
    addItemRow(r.name + " — Room Charge", String(nights), String(rate), String(nights * rate), "villa", { locked: true });
  });

  // The booking type, as its own line rather than folded into the room
  // rate. A guest should be able to see what the villa cost and what the
  // meals cost; a single blended figure hides both.
  //
  // Still categorised `food`, so it still attracts the service charge and
  // still reports as F&B — the split moved which document it prints on,
  // not what kind of money it is.
  const card = room.bookingId ? findGrcByBookingId(room.bookingId) : null;
  const plan = card ? (card.bookingType || card.mealPlan) : null;
  const planRate = quotedMealPlanRate(card, branch, plan);
  if (planRate > 0) {
    rooms.forEach(r => {
      addItemRow(`${r.name} — ${plan}`, String(nights), String(planRate), String(nights * planRate), "food", { locked: true });
    });
  }
}

// Checkout bills what the guest consumed, and nothing else — the villa was
// invoiced on arrival. If they consumed nothing there is no second
// document at all; see the empty-tab path in the Check Out handler.
function prefillInvoiceForCheckout(room) {
  const branch = activeRoomRef ? activeRoomRef.branch : appState.selectedBranch;

  resetForm();
  setCheckoutContext({
    roomId: room.id,
    bookingId: room.bookingId ?? null,
    source: room.source ?? null,
    kind: "charges",
  });
  document.getElementById("guest-name").value = room.guest || "";
  setPhone("guest-country-code", "guest-phone", room.phone);
  document.getElementById("checkin-date").value = room.checkin || "";
  document.getElementById("checkout-date").value = room.checkout || "";
  prefillFromRegistrationCard(room);

  clearItems();

  // One room-charge line per villa, each at its own nightly rate — the
  // villas on a stay are often different sizes and prices.
  // Food orders and activity charges placed during the stay. One read for
  // the whole stay — they are the party's charges, not any one villa's, so
  // no sweeping across villas and no risk of missing one.
  //
  // No room charge and no board supplement here any more: both were billed
  // on the villa invoice when the guest arrived. Billing them again at
  // checkout would charge the stay twice.
  openChargesFor(room.bookingId).forEach(c => {
    addItemRow(c.desc, c.qty, String(c.rate), String(c.value), c.category);
  });
}

// If an invoice was generated from a Room Map checkout, the villa is free again.
onAfterGenerate((record) => {
  // An interim bill only clears the tab once the invoice is real, and only
  // the exact charges it billed — anything ordered while the form was open
  // stays on the tab rather than being swept away with them.
  if (interimRef) {
    const billedThisVilla = record && record.interim && record.roomId === interimRef.roomId;
    if (billedThisVilla) {
      // Only the charges this invoice actually carried. Anything ordered
      // while the form was open stays on the tab rather than being marked
      // billed along with them.
      markCharged(interimRef.charges, record.id);
    }
    interimRef = null;
  }

  if (checkoutRoomRef) {
    const room = (ROOMS_BY_BRANCH[checkoutRoomRef.branch] || []).find(r => r.id === checkoutRoomRef.roomId);

    // Only the invoice this checkout actually produced may close the stay.
    //
    // Nothing cleared checkoutRoomRef when staff backed out of the form, and
    // this ran on *any* later invoice — so: tap Check Out, guest says "one
    // more night", back out, then bill an unrelated walk-in food order, and
    // that walk-in's invoice checked the resident out. Their villas were
    // freed while they were still in them, their booking was marked Checked
    // Out, and their whole open tab was marked billed against a stranger's
    // bill. Reproduced end to end before fixing.
    //
    // The interim branch above has always carried a guard of this shape;
    // this one never did. Matching on the stay rather than only the villa,
    // because a villa can be re-let the same day.
    // `kind === "villa"` is the arrival invoice, raised while the guest is
    // moving in. Without this it would satisfy every other test here — same
    // villa, same booking, not interim, not a walk-in — and check the guest
    // out of the room they had just been given.
    const isThisCheckout = Boolean(room) && Boolean(record)
      && !record.interim
      && !record.walkin
      && record.kind !== "villa"
      && record.roomId === checkoutRoomRef.roomId
      && (record.bookingId ?? null) === (room.bookingId ?? null);

    // Cleared either way: an invoice that was not this checkout means the
    // checkout was abandoned, so the pending reference is stale.
    if (!isThisCheckout) { checkoutRoomRef = null; return; }

    closeStay(checkoutRoomRef.branch, room, record && record.id);
    checkoutRoomRef = null;
  }
});

// Ends a stay: the booking is closed, whatever is left on the tab is
// settled against the bill that just paid for it, and every villa the
// party held goes back on the market.
//
// Extracted from the checkout callback because a stay can now end without
// producing an invoice at all — a guest who ordered nothing has nothing to
// bill at checkout, their villa having been invoiced on arrival. Both
// paths have to free the villas identically, and the way to guarantee that
// is for there to be one of them.
function closeStay(branch, room, invoiceId) {
  const booking = BOOKINGS.find(b => b.id === room.bookingId);
  if (booking) update(COLLECTIONS.BOOKINGS, booking, { status: "Checked Out" });

  // Anything still open is settled by the bill just raised. On the
  // nothing-to-bill path there is nothing here to mark, which is the point.
  markCharged(openChargesFor(room.bookingId), invoiceId || null);

  // Frees every villa on the stay, not just the one on screen — leaving the
  // others occupied would strand them with no bill left to raise.
  roomsOnStay(branch, room).forEach(r => {
    logRoomActivity(branch, r, r.guest, "Check Out");
    r.status = "available";
    delete r.guest;
    delete r.phone;
    delete r.checkin;
    delete r.checkout;
    delete r.source;
    delete r.bookingId;
  });
}

document.getElementById("rooms-filter-clear").addEventListener("click", () => renderRooms(null, null));

document.getElementById("room-detail-close").addEventListener("click", closeRoomDetail);
document.getElementById("room-detail-overlay").addEventListener("click", (e) => {
  if (e.target.id === "room-detail-overlay") closeRoomDetail();
});
