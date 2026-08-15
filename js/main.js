// Entry point. Each feature module wires its own DOM listeners as a
// side effect of being imported (same pattern the old single-file
// script.js used) — importing a module IS initializing it. ES modules
// only evaluate once no matter how many times they're imported, and all
// of a module's static imports are fully evaluated before its own body
// runs, so import order here mostly just needs to avoid cycles, not be
// perfectly sequenced. `restoreSession()` is the one exception: it must
// run only after every screen has finished wiring itself up, so it's
// called explicitly, last.
import "./navigation.js";
import "./invoice.js";
import "./rooms.js";
import "./orders.js";
import "./home.js";
import "./menu.js";
import "./inventory.js";
import "./dashboard.js";
import "./reports.js";
import "./reservation.js";
import "./branch.js";
import { restoreSession } from "./auth.js";

restoreSession();
