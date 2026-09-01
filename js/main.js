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
import "./data/error-log.js";
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
import { restoreSession } from "./auth.js";
import { initLock, lock, hasPin, startPinSetup } from "./lock.js";

// Derived inventory state (opening-stock snapshot, seeded costs, id
// counters) is computed here rather than at module load — with a backend
// the dataset won't have arrived yet when the modules first evaluate, so
// this is the single line that moves to "after the first snapshot".
initInventoryDerived();

// Wires the lock's listeners. It stays dormant until a PIN is set and
// somebody is signed in, so this is safe to call before either is true.
initLock();

// The header's lock button. Offers to set a PIN first if there isn't one,
// rather than doing nothing and looking broken.
document.getElementById("lock-now-btn").addEventListener("click", () => {
  if (hasPin()) lock();
  else startPinSetup();
});

restoreSession();
