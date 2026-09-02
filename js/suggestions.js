import { rememberValue, getSuggestions, SUGGESTION_KEYS } from "./data/suggestions.js";

// The DOM half of suggestions. What is remembered, and where it is stored,
// lives in js/data/suggestions.js with the rest of the data layer — this
// file only wires a <datalist> onto an input.

export { SUGGESTION_KEYS, rememberValue, getSuggestions };

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
  // Refreshed on focus so a name another device learned, and this one
  // picked up at sign-in, is already in the list.
  input.addEventListener("focus", refresh);
}
