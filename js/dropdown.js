// Our own dropdown, because the open state of a native <select> is drawn by
// the operating system and no stylesheet can touch it. The closed field was
// already styled to match the app; the moment it was pressed, reception got
// a grey OS list in a different typeface. Seventeen of them, on every screen.
//
// The native <select> stays in the DOM and stays the source of truth.
// Everything already written against it keeps working untouched: `.value`
// reads and writes, `.innerHTML = options`, `change` listeners, form
// submission, validation. This only replaces how it *looks* and how it is
// operated. That mattered more than elegance — there are seventeen of them
// across eleven screens, several rebuilt from JS while the app runs, and a
// component that required rewriting each call site would have been a much
// larger change with much more to get wrong.
//
// Two things keep the button's label honest, because a <select> can change
// in two ways that fire no event:
//   - options replaced wholesale (`innerHTML = …`)  → MutationObserver
//   - value assigned in code (`el.value = "LKR"`)   → a property override
// Without the second the button would confidently show the old label while
// the form submitted the new value, which is the worst of both.

const nativeValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
const nativeIndex = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");

let openDropdown = null;
let anonCount = 0;

const CHEVRON = `<svg class="dd-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
const TICK = `<svg class="dd-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;

export function enhanceSelect(select) {
  if (!select || select.dataset.ddReady === "1") return null;
  select.dataset.ddReady = "1";

  const wrap = document.createElement("div");
  wrap.className = "dd";
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "dd-button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  wrap.appendChild(button);

  const list = document.createElement("div");
  list.className = "dd-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  document.body.appendChild(list);   // body, so no overflow container can clip it

  // The <select> keeps doing its job; it just stops being seen. Not
  // `display:none` and not `hidden`: a hidden field is skipped by
  // constraint validation, so `required` would stop working and the form
  // would submit a blank booking type without complaint.
  select.classList.add("dd-native");

  // Out of the tab order and out of the accessibility tree.
  //
  // The element is only invisible — opacity 0, pointer-events none — because
  // `display:none` and `hidden` both remove a field from constraint
  // validation, which would quietly stop `required` working. But invisible
  // is not the same as gone: every one of these was still a tab stop, so a
  // keyboard user tabbed onto a control they could not see, and a screen
  // reader met each dropdown twice — once as the native select, once as the
  // button. Twenty-one of them.
  //
  // tabindex="-1" and aria-hidden do exactly the two things wanted here and
  // neither touches validation.
  select.setAttribute("tabindex", "-1");
  select.setAttribute("aria-hidden", "true");

  // Some selects are built by a screen and never given an id — the
  // reservation's villa rows, for one. They still need a stable unique
  // handle, because the option rows below take their ids from it and
  // aria-activedescendant has to point at exactly one element. Without
  // this, every id-less dropdown on the page would emit "dd-opt-0".
  const key = select.id || `dd-${++anonCount}`;
  button.id = key + "-dd";
  const label = select.labels && select.labels[0];
  if (label) button.setAttribute("aria-labelledby", label.id || (label.id = (select.id || "dd") + "-label"));

  let active = -1;

  const options = () => [...select.options];
  // The button can say something shorter than the list row does — "+94"
  // where the list reads "Sri Lanka  +94". Without it the country code
  // field has to be wide enough for the longest country name, which is the
  // opposite of what it is for.
  const label_ = () => {
    const o = select.options[select.selectedIndex];
    if (!o) return "";
    return (o.dataset.short || o.textContent).trim();
  };

  function paintButton() {
    const text = label_();
    button.innerHTML = `<span class="dd-value">${escape(text)}</span>${CHEVRON}`;
    button.classList.toggle("dd-placeholder", !text);
    button.disabled = select.disabled;
  }

  function paintList() {
    list.innerHTML = options().map((o, i) => `
      <div class="dd-option" role="option" data-i="${i}"
           aria-selected="${i === select.selectedIndex}"
           ${o.disabled ? 'aria-disabled="true"' : ""}>
        <span>${escape(o.textContent.trim())}</span>${i === select.selectedIndex ? TICK : ""}
      </div>`).join("") || `<div class="dd-empty">Nothing to choose from</div>`;
  }

  function place() {
    const r = button.getBoundingClientRect();
    list.style.minWidth = r.width + "px";
    list.style.left = Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)) + "px";
    // Flip above when there is more room there — on a phone in landscape a
    // field near the bottom would otherwise open into nothing.
    const below = window.innerHeight - r.bottom;
    const wanted = Math.min(list.scrollHeight, 300);
    if (below < wanted && r.top > below) {
      list.style.top = "";
      list.style.bottom = (window.innerHeight - r.top + 6) + "px";
      list.style.maxHeight = Math.min(300, r.top - 16) + "px";
    } else {
      list.style.bottom = "";
      list.style.top = (r.bottom + 6) + "px";
      list.style.maxHeight = Math.min(300, below - 16) + "px";
    }
  }

  function open() {
    if (select.disabled || !options().length) return;
    if (openDropdown && openDropdown !== close) openDropdown();
    paintList();
    list.hidden = false;
    place();
    button.setAttribute("aria-expanded", "true");
    wrap.classList.add("dd-open");
    setActive(select.selectedIndex >= 0 ? select.selectedIndex : 0);
    openDropdown = close;
  }

  function close({ focus = false } = {}) {
    list.hidden = true;
    button.setAttribute("aria-expanded", "false");
    wrap.classList.remove("dd-open");
    active = -1;
    if (openDropdown === close) openDropdown = null;
    if (focus) button.focus();
  }

  function setActive(i) {
    const rows = [...list.querySelectorAll(".dd-option")];
    if (!rows.length) return;
    active = Math.max(0, Math.min(i, rows.length - 1));
    rows.forEach((r, n) => r.classList.toggle("dd-active", n === active));
    const row = rows[active];
    if (row) {
      row.scrollIntoView({ block: "nearest" });
      if (row.id || (row.id = `${key}-opt-${active}`)) list.setAttribute("aria-activedescendant", row.id);
    }
  }

  function choose(i) {
    const o = select.options[i];
    if (!o || o.disabled) return;
    if (select.selectedIndex !== i) {
      nativeIndex.set.call(select, i);
      // The whole app listens for `change`, not `input` — and a real user
      // picking from a native select fires exactly this.
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    paintButton();
    close({ focus: true });
  }

  button.addEventListener("click", () => (list.hidden ? open() : close()));

  button.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (list.hidden) open();
      else setActive(active + (e.key === "ArrowUp" ? -1 : 1));
      return;
    }
    if (!list.hidden && e.key === "Escape") { e.preventDefault(); close({ focus: true }); }
  });

  list.addEventListener("mousedown", (e) => e.preventDefault());   // keep focus on the button
  list.addEventListener("click", (e) => {
    const row = e.target.closest(".dd-option");
    if (row) choose(Number(row.dataset.i));
  });
  list.addEventListener("mousemove", (e) => {
    const row = e.target.closest(".dd-option");
    if (row) setActive(Number(row.dataset.i));
  });

  document.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); close({ focus: true }); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); return; }
    if (e.key === "Home") { e.preventDefault(); setActive(0); return; }
    if (e.key === "End") { e.preventDefault(); setActive(options().length - 1); return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); return; }
    if (e.key === "Tab") { close(); return; }
    // Type-ahead, the one native behaviour people genuinely rely on: press
    // "d" in a currency list and land on the dollars.
    if (e.key.length === 1) {
      const from = active + 1;
      const all = options();
      const hit = all.findIndex((o, i) => i >= from && o.textContent.trim().toLowerCase().startsWith(e.key.toLowerCase()));
      const wrapped = hit === -1
        ? all.findIndex(o => o.textContent.trim().toLowerCase().startsWith(e.key.toLowerCase()))
        : hit;
      if (wrapped !== -1) setActive(wrapped);
    }
  });

  document.addEventListener("pointerdown", (e) => {
    if (list.hidden) return;
    if (!list.contains(e.target) && !wrap.contains(e.target)) close();
  });
  window.addEventListener("resize", () => { if (!list.hidden) place(); });
  window.addEventListener("scroll", () => { if (!list.hidden) place(); }, true);

  // ---- keeping the label honest ----

  // Options replaced wholesale — grc-reservation-select, order-room-select,
  // the currency lists, every Manage Lists picker.
  new MutationObserver(() => { paintButton(); if (!list.hidden) { paintList(); place(); } })
    .observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "value"] });

  // `el.value = "LKR"` fires nothing at all. Overriding the property on
  // this one element — not on the prototype — keeps that working without
  // asking twelve call sites to remember to repaint.
  Object.defineProperty(select, "value", {
    configurable: true,
    get() { return nativeValue.get.call(this); },
    set(v) { nativeValue.set.call(this, v); paintButton(); },
  });
  Object.defineProperty(select, "selectedIndex", {
    configurable: true,
    get() { return nativeIndex.get.call(this); },
    set(v) { nativeIndex.set.call(this, v); paintButton(); },
  });

  select.addEventListener("change", paintButton);

  // form.reset() puts the select back to its default and fires no change
  // event at all — and the registration card resets its form every time it
  // is opened. Without this the button would keep showing whatever the last
  // guest was checked in with. The event fires before the reset is applied,
  // so repaint on the next tick.
  const form = select.form;
  if (form) form.addEventListener("reset", () => setTimeout(paintButton, 0));

  paintButton();
  return { paint: paintButton };
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Every <select> in the document, plus any added later.
export function enhanceAllSelects(root = document) {
  root.querySelectorAll("select:not([data-dd-ready])").forEach(enhanceSelect);
}

// Screens build markup while the app runs — the reservation's villa rows,
// order lines, ingredient pickers. Those selects never existed when the
// page loaded, so a one-time sweep would leave them native and the app
// would have two different dropdowns depending on where you were.
export function watchForSelects() {
  const sweep = () => enhanceAllSelects();
  new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === "SELECT" || node.querySelector?.("select:not([data-dd-ready])")) {
          sweep();
          return;
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
