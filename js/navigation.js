export const screens = {
  login: document.getElementById("screen-login"),
  branch: document.getElementById("screen-branch"),
  home: document.getElementById("screen-home"),
  rooms: document.getElementById("screen-rooms"),
  menu: document.getElementById("screen-menu"),
  inventory: document.getElementById("screen-inventory"),
  dashboard: document.getElementById("screen-dashboard"),
  reports: document.getElementById("screen-reports"),
  form: document.getElementById("screen-form"),
  preview: document.getElementById("screen-preview"),
};

const screenOrder = [
  "screen-login", "screen-branch", "screen-home", "screen-rooms", "screen-menu",
  "screen-inventory", "screen-dashboard", "screen-reports", "screen-form", "screen-preview",
];

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
}

document.querySelectorAll(".back-btn").forEach(btn => {
  btn.addEventListener("click", () => showScreen(btn.dataset.back));
});
