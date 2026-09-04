// Counts, as counts rather than text boxes.
//
// "Adults" was a full-width field containing the character 2. To change it
// you selected the 2 and typed a 3 — on a phone, one-handed, with a guest
// in front of you. Every one of these is a small whole number that moves by
// one, which is a pair of buttons, not a text box.
//
// The input stays a real <input type="number"> underneath: `.value` reads
// and writes still work, `clampMoney` still sees what it expects, and the
// numeric keyboard is still there for the rare jump from 1 to 8.

const MINUS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14"/></svg>`;
const PLUS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;

export function enhanceNumber(input, { min = 0, max = 99 } = {}) {
  if (!input || input.dataset.numReady === "1") return null;
  input.dataset.numReady = "1";

  const lo = input.min !== "" ? Number(input.min) : min;
  const hi = input.max !== "" ? Number(input.max) : max;

  const wrap = document.createElement("div");
  wrap.className = "num-field";
  input.parentNode.insertBefore(wrap, input);

  const down = document.createElement("button");
  down.type = "button";
  down.className = "num-down";
  down.innerHTML = MINUS;
  down.setAttribute("aria-label", "One fewer");

  const up = document.createElement("button");
  up.type = "button";
  up.className = "num-up";
  up.innerHTML = PLUS;
  up.setAttribute("aria-label", "One more");

  wrap.appendChild(down);
  wrap.appendChild(input);
  wrap.appendChild(up);

  const read = () => {
    const n = parseInt(input.value, 10);
    return Number.isFinite(n) ? n : lo;
  };

  const write = (n, announce) => {
    const next = Math.max(lo, Math.min(hi, n));
    if (String(next) !== input.value) {
      input.value = String(next);
      // The forms listen for `input` (live totals, pax validation) and
      // `change` (derived fields). A person typing fires both; so does this.
      if (announce) {
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    sync();
  };

  function sync() {
    const n = read();
    down.disabled = n <= lo;
    up.disabled = n >= hi;
  }

  down.addEventListener("click", () => write(read() - 1, true));
  up.addEventListener("click", () => write(read() + 1, true));
  // Typing straight into the box stays possible — going from 1 to 8 by
  // pressing + seven times would be its own kind of silly.
  input.addEventListener("input", sync);
  input.addEventListener("blur", () => write(read(), true));

  // Same reason as the dropdown: a form reset changes the value silently,
  // and these forms reset on open. The +/- buttons would stay disabled
  // against a count that had moved underneath them.
  const form = input.form;
  if (form) form.addEventListener("reset", () => setTimeout(sync, 0));

  sync();
  return { sync };
}

export function enhanceNumbers(ids, opts) {
  ids.forEach(id => {
    const el = typeof id === "string" ? document.getElementById(id) : id;
    enhanceNumber(el, opts);
  });
}
