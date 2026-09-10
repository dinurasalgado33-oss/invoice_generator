import { appState } from "./state.js";
import { showScreen } from "./navigation.js";
import { escapeHtml, showToast } from "./utils.js";
import { confirmAction } from "./confirm.js";
import { saveConfig, CONFIG_KINDS } from "./data/config-store.js";
import { BOARD_MENU, boardDishes, joinBoardDishes } from "./data/menu.js";

// The editor for the full/half-board sheet — what a board rate includes.
//
// It is the one menu with no dish numbers and no prices, because a guest
// on half board is not ordering from it; they are checking what they have
// already paid for. That shape — a course, a note, two options, sometimes
// a line about portion sizes — is why it never fitted the ordinary list
// editor and why it sat in a const long after everything else moved.
//
// Wilpattu only today. Stored per property rather than shared, so Arugam
// Bay can have one without inheriting Wilpattu's.

const el = id => document.getElementById(id);

// A block with no options prints as a heading with nothing under it, which
// on a printed sheet reads as a mistake rather than as a course with
// nothing included. Blocked at save rather than silently dropped, so the
// manager finds out while they can still fix it.
function problems() {
  const out = [];
  BOARD_MENU.forEach((block, i) => {
    if (!String(block.heading || "").trim()) out.push(`Course ${i + 1} has no name.`);
    if (!block.options.length) out.push(`"${block.heading || `Course ${i + 1}`}" has no options.`);
    block.options.forEach((opt, j) => {
      if (!String(opt.name || "").trim()) out.push(`Option ${j + 1} under "${block.heading}" has no name.`);
      // An option with no dishes prints as a bare name on the sheet — the
      // guest is told they get Fried Rice and nothing about what is in it.
      // Same reasoning as the empty course above: caught while the manager
      // is still standing in front of it.
      if (!boardDishes(opt.detail).length) {
        out.push(`"${opt.name || `Option ${j + 1}`}" under "${block.heading || `course ${i + 1}`}" has no dishes.`);
      }
    });
  });
  return out;
}

function showError(message) {
  const box = el("bm-error");
  box.textContent = message || "";
  box.classList.toggle("show", Boolean(message));
}

function persist() {
  const found = problems();
  showError(found.join(" "));
  if (found.length) return false;
  // A deep copy: BOARD_MENU is spliced in place on hydration, and handing
  // the live objects to the store would let a later edit mutate what was
  // already queued for writing.
  saveConfig(appState.selectedBranch, CONFIG_KINDS.BOARD_MENU, BOARD_MENU.map(b => ({
    heading: b.heading,
    note: b.note || "",
    foot: b.foot || "",
    options: b.options.map(o => ({ name: o.name, detail: o.detail || "" })),
  })));
  return true;
}

function render() {
  el("bm-scope").textContent =
    `${appState.selectedBranchLabel || appState.selectedBranch} — printed on the board sheet and sent in the welcome e-mail.`;

  const wrap = el("bm-blocks");
  if (!BOARD_MENU.length) {
    wrap.innerHTML = `<p class="room-detail-empty">No courses yet. Add one below.</p>`;
    return;
  }

  wrap.innerHTML = BOARD_MENU.map((block, bi) => `
    <div class="bm-block" data-block="${bi}">
      <div class="bm-block-head">
        <input type="text" class="bm-heading" data-block="${bi}"
               value="${escapeHtml(block.heading || "")}" placeholder="Course, e.g. Breakfast"
               aria-label="Course name" />
        <button type="button" class="secondary-btn bm-del-block" data-block="${bi}"
                aria-label="Remove ${escapeHtml(block.heading || "course")}">Remove</button>
      </div>
      <input type="text" class="bm-note" data-block="${bi}"
             value="${escapeHtml(block.note || "")}" placeholder="Note under the heading, e.g. one option included"
             aria-label="Note" />

      ${block.options.map((opt, oi) => {
        const dishes = boardDishes(opt.detail);
        return `
        <div class="bm-option">
          <input type="text" class="bm-opt-name" data-block="${bi}" data-opt="${oi}"
                 value="${escapeHtml(opt.name || "")}" placeholder="Option name" aria-label="Option name" />

          <p class="bm-dish-label">Included dishes</p>
          <div class="bm-dishes">
            ${dishes.length ? dishes.map((dish, di) => `
              <div class="bm-dish-row">
                <input type="text" class="bm-dish" data-block="${bi}" data-opt="${oi}" data-dish="${di}"
                       value="${escapeHtml(dish)}" aria-label="Dish ${di + 1} in ${escapeHtml(opt.name || "this option")}" />
                <button type="button" class="bm-dish-del" data-block="${bi}" data-opt="${oi}" data-dish="${di}"
                        aria-label="Remove ${escapeHtml(dish)} from ${escapeHtml(opt.name || "this option")}"
                        title="Remove ${escapeHtml(dish)}">&#10005;</button>
              </div>`).join("") : `<p class="bm-dish-empty">No dishes yet.</p>`}
          </div>

          <div class="bm-dish-add">
            <input type="text" class="bm-new-dish" data-block="${bi}" data-opt="${oi}"
                   placeholder="Add a dish" aria-label="Add a dish to ${escapeHtml(opt.name || "this option")}" />
            <button type="button" class="secondary-btn bm-add-dish" data-block="${bi}" data-opt="${oi}">Add</button>
          </div>

          <button type="button" class="secondary-btn bm-del-opt" data-block="${bi}" data-opt="${oi}"
                  aria-label="Remove ${escapeHtml(opt.name || "option")}">Remove option</button>
        </div>`;
      }).join("")}

      <button type="button" class="secondary-btn bm-add-opt" data-block="${bi}">Add an option</button>
      <input type="text" class="bm-foot" data-block="${bi}"
             value="${escapeHtml(block.foot || "")}" placeholder="Footnote, e.g. portion sizes"
             aria-label="Footnote" />
    </div>`).join("");

  wire();
}

// Written on blur rather than on every keystroke: a manager typing a
// portion note would otherwise be a write per character.
function bindText(selector, apply) {
  document.querySelectorAll(selector).forEach(input => {
    input.addEventListener("blur", () => {
      const bi = Number(input.dataset.block);
      const oi = input.dataset.opt === undefined ? null : Number(input.dataset.opt);
      apply(BOARD_MENU[bi], input.value, oi);
      persist();
    });
  });
}

// The three indexes a dish control carries. Read together so a handler
// cannot pick up a block from one dataset and an option from another.
function dishRef(node) {
  const block = BOARD_MENU[Number(node.dataset.block)];
  const opt = block && block.options[Number(node.dataset.opt)];
  return { block, opt, di: Number(node.dataset.dish) };
}

function setDishes(opt, dishes) {
  opt.detail = joinBoardDishes(dishes);
}

// After a re-render every node is new, so focus has to be taken again
// rather than kept. Adding several dishes in a row is the normal case —
// a course is six or seven of them — and re-tapping the field each time
// is the difference between a quick change and a chore.
function focusAdder(bi, oi) {
  const field = document.querySelector(`.bm-new-dish[data-block="${bi}"][data-opt="${oi}"]`);
  if (field) field.focus();
}

function addDish(bi, oi) {
  const field = document.querySelector(`.bm-new-dish[data-block="${bi}"][data-opt="${oi}"]`);
  if (!field) return;
  const name = field.value.trim();
  if (!name) { field.focus(); return; }
  const opt = BOARD_MENU[bi].options[oi];
  setDishes(opt, boardDishes(opt.detail).concat(name));
  persist();
  render();
  focusAdder(bi, oi);
}

function wireDishes() {
  // Renaming a dish in place. Emptying the field is how a dish is removed
  // by keyboard, and that shifts every index after it — so the screen is
  // rebuilt rather than left showing positions that no longer match the
  // data. Editing without emptying keeps the same indexes and does not
  // re-render, so the manager can tab straight to the next dish.
  document.querySelectorAll(".bm-dish").forEach(input => {
    input.addEventListener("blur", () => {
      const { opt, di } = dishRef(input);
      if (!opt) return;
      const dishes = boardDishes(opt.detail);
      if (di >= dishes.length) return;
      const emptied = !input.value.trim();
      dishes[di] = input.value;
      setDishes(opt, dishes);
      persist();
      if (emptied) render();
    });
  });

  // No confirm on a single dish. It is a manager-only screen, the row
  // disappears in front of them, and putting it back is one line of
  // typing — a dialog on every tap would make removing three dishes six
  // taps. The whole option and the whole course still ask, because those
  // take a course's worth of typing to undo.
  document.querySelectorAll(".bm-dish-del").forEach(btn => {
    btn.addEventListener("click", () => {
      const { opt, di } = dishRef(btn);
      if (!opt) return;
      const dishes = boardDishes(opt.detail);
      if (di >= dishes.length) return;
      dishes.splice(di, 1);
      setDishes(opt, dishes);
      persist();
      render();
    });
  });

  document.querySelectorAll(".bm-add-dish").forEach(btn => {
    btn.addEventListener("click", () => addDish(Number(btn.dataset.block), Number(btn.dataset.opt)));
  });

  document.querySelectorAll(".bm-new-dish").forEach(field => {
    // Enter adds, rather than doing nothing or submitting something else.
    field.addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      addDish(Number(field.dataset.block), Number(field.dataset.opt));
    });
    // Deliberately no commit-on-blur here. It would re-render the option
    // while the blur was still running, and a tap aimed at "Remove
    // option" would land on a node that no longer existed — the press
    // does nothing and nothing reports why. Text left in the field stays
    // on screen next to its own Add button instead, which is visible
    // rather than silent.
  });
}

function wire() {
  bindText(".bm-heading", (block, v) => { block.heading = v.trim(); });
  bindText(".bm-note", (block, v) => { block.note = v.trim(); });
  bindText(".bm-foot", (block, v) => { block.foot = v.trim(); });
  bindText(".bm-opt-name", (block, v, oi) => { block.options[oi].name = v.trim(); });
  wireDishes();

  document.querySelectorAll(".bm-add-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      BOARD_MENU[Number(btn.dataset.block)].options.push({ name: "", detail: "" });
      render();
    });
  });

  document.querySelectorAll(".bm-del-opt").forEach(btn => {
    btn.addEventListener("click", async () => {
      const block = BOARD_MENU[Number(btn.dataset.block)];
      const opt = block.options[Number(btn.dataset.opt)];
      const ok = await confirmAction({
        title: `Remove "${opt.name || "this option"}"?`,
        message: "It stops appearing on the board sheet and in the welcome e-mail.",
        confirmLabel: "Remove",
        tone: "danger",
      });
      if (!ok) return;
      block.options.splice(Number(btn.dataset.opt), 1);
      persist();
      render();
    });
  });

  document.querySelectorAll(".bm-del-block").forEach(btn => {
    btn.addEventListener("click", async () => {
      const block = BOARD_MENU[Number(btn.dataset.block)];
      const ok = await confirmAction({
        title: `Remove "${block.heading || "this course"}"?`,
        message: "The whole course and its options go. Guests already e-mailed keep what they were sent.",
        confirmLabel: "Remove",
        tone: "danger",
      });
      if (!ok) return;
      BOARD_MENU.splice(Number(btn.dataset.block), 1);
      persist();
      render();
    });
  });
}

el("bm-add-block").addEventListener("click", () => {
  BOARD_MENU.push({ heading: "", note: "", options: [{ name: "", detail: "" }], foot: "" });
  render();
  // Straight to the new heading — the field that has to be filled in.
  const inputs = document.querySelectorAll(".bm-heading");
  const last = inputs[inputs.length - 1];
  if (last) last.focus();
});

el("open-board-menu-btn").addEventListener("click", () => {
  showError("");
  render();
  showScreen("screen-board-menu");
});
