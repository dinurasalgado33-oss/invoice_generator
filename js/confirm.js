// Styled replacement for window.confirm() — every destructive or
// state-changing action in the app should go through this instead of the
// native OS popup, which clashes with the rest of the custom UI.
const overlay = document.getElementById("confirm-overlay");
const sheet = document.getElementById("confirm-sheet");
const titleEl = document.getElementById("confirm-title");
const messageEl = document.getElementById("confirm-message");
const okBtn = document.getElementById("confirm-ok-btn");
const cancelBtn = document.getElementById("confirm-cancel-btn");

let resolvePending = null;

function close(result) {
  overlay.classList.remove("open");
  if (resolvePending) {
    const resolve = resolvePending;
    resolvePending = null;
    resolve(result);
  }
}

okBtn.addEventListener("click", () => close(true));
cancelBtn.addEventListener("click", () => close(false));
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) close(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && overlay.classList.contains("open")) close(false);
});

// tone: "danger" (red confirm button, for deletes/undo) or "safe" (default
// gold/maroon, for confirming a normal action like completing an order).
export function confirmAction({ title = "Are you sure?", message = "", confirmLabel = "Confirm", tone = "danger" } = {}) {
  if (resolvePending) close(false); // a stray previous dialog shouldn't block a new one

  titleEl.textContent = title;
  messageEl.textContent = message;
  okBtn.textContent = confirmLabel;
  sheet.classList.toggle("tone-danger", tone === "danger");

  overlay.classList.add("open");

  return new Promise((resolve) => {
    resolvePending = resolve;
  });
}
