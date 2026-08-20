import { safeStorage } from "./utils.js";

// Several fields in this app take the same handful of answers over and
// over: the same three or four safari guides, the same drivers, the same
// travel agents, the same two countries most guests arrive from. They were
// all free text, so every entry was retyped — and "Pradeep", "pradeep" and
// "Pradeeep" became three different people in the records.
//
// This remembers what has actually been typed into a field and offers it
// back as a native <datalist>, which suggests without restricting: the
// fifth guide can still be typed in, and becomes a suggestion afterwards.
// That matters because these lists can't be configured up front the way
// villas and activities can — nobody knows the full set in advance.

const STORE_KEY = "leopardinn-suggestions";

function loadAll() {
  try {
    const raw = safeStorage.get(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // Corrupt or hand-edited storage shouldn't take a form down — these
    // are conveniences, not data.
    return {};
  }
}

let store = loadAll();

function persist() {
  try {
    safeStorage.set(STORE_KEY, JSON.stringify(store));
  } catch {
    // Suggestions are the first thing worth losing if storage is full.
  }
}

// Case-insensitive match, so "pradeep" doesn't get remembered alongside
// "Pradeep" — the first spelling used wins and is offered from then on,
// which is what stops the same person becoming three records.
export function rememberValue(key, value) {
  const clean = (value || "").trim();
  if (clean.length < 2) return;
  if (!store[key]) store[key] = [];
  const existing = store[key].find(v => v.toLowerCase() === clean.toLowerCase());
  if (existing) {
    // Move to front so the most recently used sits at the top of the list.
    store[key] = [existing, ...store[key].filter(v => v !== existing)];
  } else {
    store[key] = [clean, ...store[key]];
  }
  // Capped so a year of typos can't grow an unbounded list.
  store[key] = store[key].slice(0, 25);
  persist();
}

export function getSuggestions(key, seed = []) {
  const remembered = store[key] || [];
  const merged = [...remembered];
  seed.forEach(s => {
    const clean = (s || "").trim();
    if (clean && !merged.some(v => v.toLowerCase() === clean.toLowerCase())) merged.push(clean);
  });
  return merged;
}

// Attaches a datalist to an input and keeps it fed. `seed` supplies
// sensible starting values before anyone has typed anything, so the very
// first use is still useful rather than an empty dropdown.
export function attachSuggestions(input, key, seed = []) {
  if (!input) return;
  const listId = `suggest-${key}`;
  let list = document.getElementById(listId);
  if (!list) {
    list = document.createElement("datalist");
    list.id = listId;
    document.body.appendChild(list);
  }
  input.setAttribute("list", listId);

  const refresh = () => {
    const values = getSuggestions(key, seed);
    list.innerHTML = values.map(v => {
      const opt = document.createElement("option");
      opt.value = v;
      return opt.outerHTML;
    }).join("");
  };
  refresh();

  // Remembered on blur rather than on every keystroke, so half-typed
  // fragments never become suggestions.
  input.addEventListener("blur", () => {
    rememberValue(key, input.value);
    refresh();
  });
  input.addEventListener("focus", refresh);
}

// Keys are shared where the field means the same thing in two places — a
// guide named on an activity charge is the same person as the guide named
// on a registration card, so they draw from one list.
export const SUGGESTION_KEYS = {
  GUIDE: "guide",
  TRAVEL_AGENT: "travel-agent",
  COUNTRY: "country",
  NATIONALITY: "nationality",
  VEHICLE: "vehicle",
  RESERVED_BY: "reserved-by",
};
