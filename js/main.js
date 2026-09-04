// Entry point. Each feature module wires its own DOM listeners as a
// side effect of being imported (same pattern the old single-file
// script.js used) — importing a module IS initializing it. ES modules
// only evaluate once no matter how many times they're imported, and all
// of a module's static imports are fully evaluated before its own body
// runs, so import order here mostly just needs to avoid cycles, not be
// perfectly sequenced. `restoreSession()` is the one exception: it must
// run only after every screen has finished wiring itself up, so it's
// called explicitly, last.
// First, so it is already listening before any other module evaluates.
import { logError } from "./data/error-log.js";
import { attachSearchClears } from "./search-clear.js";
import { enhanceAllSelects, watchForSelects } from "./dropdown.js";
import { enhanceNumbers } from "./number-field.js";
import { initInventoryDerived } from "./data/inventory.js";
import "./navigation.js";
import "./invoice.js";
import "./grc.js";
import "./rooms.js";
import "./orders.js";
import "./home.js";
import "./menu.js";
import "./menu-publish.js";
import "./configure.js";
import "./inventory.js";
import "./dashboard.js";
import "./reports.js";
import "./reservation.js";
import "./reservations.js";
import "./proforma.js";
import "./history.js";
import "./branch.js";
import "./staff.js";
import "./manage-lists.js";
import "./board-menu.js";
import { restoreSession } from "./auth.js";

// Two elements sharing an id is silent, and it is not harmless.
// `getElementById` returns whichever comes first in the document, so the
// second one becomes unreachable — every read and write goes to the other
// screen's field instead. That happened for real: the invoice's "Your
// Name" input and the Staff Accounts "Name" input were both `staff-name`,
// so reception editing the invoice field changed nothing and the name
// recorded on the bill came from a form on a different screen.
//
// Nothing about that shows up as an error, which is why it is checked
// here. Costs one pass over the DOM at startup, once.
(function assertUniqueIds() {
  const seen = new Set();
  const clashes = new Set();
  document.querySelectorAll("[id]").forEach(el => {
    if (seen.has(el.id)) clashes.add(el.id);
    seen.add(el.id);
  });
  if (clashes.size) {
    logError(`Duplicate element ids: ${[...clashes].join(", ")}`, { source: "dom" });
  }
})();

// Derived inventory state (opening-stock snapshot, seeded costs, id
// counters) is computed here rather than at module load — with a backend
// the dataset won't have arrived yet when the modules first evaluate, so
// this is the single line that moves to "after the first snapshot".
initInventoryDerived();


// The four search fields that had no way to clear them. Menu and Inventory
// already have their own, wired by hand before this helper existed; they
// are left alone rather than migrated for the sake of it.
attachSearchClears([
  "order-search",
  "reports-search",
  "history-search",
  "reservations-search",
]);

// Every <select> in the document gets our own dropdown instead of the
// operating system's. The native element stays underneath and stays the
// source of truth, so nothing else in the app had to change — see
// js/dropdown.js. Run after every screen module has built its markup.
enhanceAllSelects();
watchForSelects();

// Counts that move by one, as a pair of buttons rather than a text box you
// have to select and retype one-handed on a phone.
enhanceNumbers([
  "resv-adults", "resv-children",
  "guest-count",
  "grc-adults", "grc-children", "grc-kids", "grc-guide-pax",
]);

restoreSession();
