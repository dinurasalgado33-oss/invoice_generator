// Puts a clear button in a search field.
//
// Six search fields, and only Menu and Inventory had one — those two wired
// it by hand, each with its own show/hide and its own re-render call. Doing
// that four more times would be four more copies of the same six lines, so
// this attaches the button and drives the screen's *existing* listener
// instead of needing to know how any of them redraw.
//
// Clearing a search by holding backspace on a phone, one-handed, at a desk
// with a guest waiting, is the kind of small friction nobody reports and
// everybody feels.

const CROSS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>`;

export function attachSearchClear(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return null;

  const host = input.parentElement;
  if (!host) return null;
  if (host.querySelector(".search-clear-btn")) return null;   // already attached

  const button = document.createElement("button");
  button.type = "button";
  button.className = "search-clear-btn";
  button.setAttribute("aria-label", "Clear search");
  button.innerHTML = CROSS;
  button.hidden = true;
  host.appendChild(button);

  const sync = () => { button.hidden = !input.value; };

  button.addEventListener("click", () => {
    input.value = "";
    sync();
    // The screen already knows how to redraw itself when the field
    // changes — say the field changed rather than reaching into five
    // different render functions. `change` as well as `input` because not
    // every screen listens for the same one.
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
  });

  input.addEventListener("input", sync);
  // A screen that fills the box programmatically — a remembered filter, a
  // reset button elsewhere — must not leave a stale cross behind.
  input.addEventListener("change", sync);
  sync();

  return button;
}

export function attachSearchClears(ids) {
  ids.forEach(attachSearchClear);
}
