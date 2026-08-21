export const screens = {
  login: document.getElementById("screen-login"),
  branch: document.getElementById("screen-branch"),
  home: document.getElementById("screen-home"),
  rooms: document.getElementById("screen-rooms"),
  orders: document.getElementById("screen-orders"),
  menu: document.getElementById("screen-menu"),
  configure: document.getElementById("screen-configure"),
  configureVillas: document.getElementById("screen-configure-villas"),
  configureActivities: document.getElementById("screen-configure-activities"),
  configureBranch: document.getElementById("screen-configure-branch"),
  configureConditions: document.getElementById("screen-configure-conditions"),
  inventory: document.getElementById("screen-inventory"),
  dashboard: document.getElementById("screen-dashboard"),
  reports: document.getElementById("screen-reports"),
  form: document.getElementById("screen-form"),
  preview: document.getElementById("screen-preview"),
  guestHistory: document.getElementById("screen-guest-history"),
  guestCharges: document.getElementById("screen-guest-charges"),
  reservations: document.getElementById("screen-reservations"),
  proformaForm: document.getElementById("screen-proforma-form"),
  proformaPreview: document.getElementById("screen-proforma-preview"),
  configureProforma: document.getElementById("screen-configure-proforma"),
  configureCancellation: document.getElementById("screen-configure-cancellation"),
  configureNotices: document.getElementById("screen-configure-notices"),
  grcForm: document.getElementById("screen-grc-form"),
  grcPreview: document.getElementById("screen-grc-preview"),
  reservationForm: document.getElementById("screen-reservation-form"),
  reservationPreview: document.getElementById("screen-reservation-preview"),
};

const screenOrder = [
  "screen-login", "screen-branch", "screen-home", "screen-rooms", "screen-orders",
  "screen-configure", "screen-menu", "screen-configure-villas", "screen-configure-activities",
  "screen-configure-branch", "screen-configure-conditions",
  "screen-configure-proforma", "screen-configure-cancellation", "screen-configure-notices",
  "screen-guest-history", "screen-guest-charges",
  "screen-reservations", "screen-proforma-form", "screen-proforma-preview",
  "screen-grc-form", "screen-grc-preview",
  "screen-inventory", "screen-dashboard", "screen-reports", "screen-form", "screen-preview",
  "screen-reservation-form", "screen-reservation-preview",
];

// Screens that show live data need re-rendering when they are returned to,
// not just when they are first built. The home dashboard was rendered once
// on branch selection, so a villa checked out or a check-in cancelled left
// its card sitting on the home screen until the app was reloaded.
//
// A registry rather than a direct call: navigation is the lowest-level
// module here and must not import the screens it drives.
const screenEnterHandlers = {};
export function onScreenEnter(id, fn) {
  if (!screenEnterHandlers[id]) screenEnterHandlers[id] = [];
  screenEnterHandlers[id].push(fn);
}

export function showScreen(id) {
  const currentEl = document.querySelector(".screen.active");
  const fromIdx = currentEl ? screenOrder.indexOf(currentEl.id) : -1;
  const toIdx = screenOrder.indexOf(id);
  const direction = toIdx >= fromIdx ? "enter-forward" : "enter-back";

  Object.values(screens).forEach(s => s.classList.remove("active", "enter-forward", "enter-back"));

  const target = document.getElementById(id);
  target.classList.add("active");
  void target.offsetWidth; // restart animation
  target.classList.add(direction);

  window.scrollTo({ top: 0, behavior: "smooth" });

  // After the swap, so a handler can measure or focus what is now visible.
  // Wrapped because one screen's refresh failing must not stop navigation
  // itself — the user would be stranded on the previous screen.
  (screenEnterHandlers[id] || []).forEach(fn => {
    try { fn(); } catch (err) { console.error(`Refresh failed for ${id}:`, err); }
  });
}

document.querySelectorAll(".back-btn").forEach(btn => {
  btn.addEventListener("click", () => showScreen(btn.dataset.back));
});
