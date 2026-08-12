# Leopard Inn — Staff Portal

A mobile-friendly web app for Leopard Inn staff. Ships with an invoice generator, a finance dashboard, a reports/export screen, a room booking map with a full guest lifecycle, food ordering, and inventory management (all branches now).

## Project structure
No build step — plain ES modules and multiple stylesheets, loaded directly by the browser.

```
index.html          single HTML file, every screen, clearly commented per section
css/                 one file per feature area (base, brand-home, rooms, menu-inventory, invoice, dashboard, reports)
js/
  main.js            entry point — imports every feature module, then calls restoreSession() last
  state.js           shared mutable app state (selectedBranch, currentRole, etc.)
  utils.js           formatting/DOM helpers used across modules
  navigation.js       screens map + showScreen()
  auth.js, branch.js, home.js, invoice.js, rooms.js, menu.js, inventory.js, dashboard.js, reports.js
  data/               pure mock data per feature (no logic) — swap these for real API calls later
```

Each feature module wires its own DOM listeners as a side effect of being imported — importing a module *is* initializing it (same pattern the old single-file script used, just split up). The one exception is `restoreSession()` in `auth.js`, which is called explicitly last from `main.js` since it depends on every other screen already being wired.

Cache-busting: every `<link>`/`<script>` tag in `index.html` carries a `?v=N` query string, and so does every inter-module `import` statement inside `js/`. When you edit **any** file under `css/` or `js/`, bump the version number everywhere (a find-replace for the old `?v=N` is easiest) — GitHub Pages doesn't support custom cache headers, so this is the only lever against browsers serving a stale mix of old and new files.

HTML was deliberately **not** split into fetched partials — that would need async loading before any script could safely query the DOM, adding real race-condition risk for a static site with no build tooling. Splitting the ~800-line JS file (which mixed auth, rooms, menu, inventory, dashboard, invoice, and now reports in one IIFE) was the actual maintainability problem; the HTML/CSS split is straightforward file-per-concern with no runtime risk.

## How it works
1. Staff log in (see **Login & roles** below).
2. **Manager** accounts pick a branch (Wilpattu Forest Retreat / Arugam Bay Beachfront Hotel). **Staff** accounts are locked to one branch and skip straight to its home screen.
3. From the branch home screen:
   - **New Invoice** — fill in guest details and itemized charges, matching Leopard Inn's real invoice format (Reservation No, Reg. Card No, Voucher No, itemized charges, Service Charge, Gross/Advance/Grand Total, remarks, signature lines). Generate a preview styled like the printed invoice, then **Print / Save PDF**, **Save as Image**, or start a **New Invoice**.
   - **Finance Dashboard** (manager only) — KPI tiles, a revenue-by-category chart, and a monthly revenue trend, with an **Export PDF Report** button. Currently mock data (see below).
   - **Room Bookings & Info** — a theater-style map of villas (3 per row), a full guest lifecycle including food ordering, both branches. See **Room lifecycle** below.
   - **Menu Config** (manager only) — add, edit, or delete dishes and their ingredient lists.
   - **Inventory Management** — stock levels per branch; manager can adjust, staff get a read-only view. A red badge on the home card shows how many items are currently low.

## Room lifecycle
Each villa is in one of three states, each with its own color and action on the detail sheet (tap any villa card to open it):
- **Available** (green) — "New Booking" button opens a short form (guest name, phone, check-in/out); saving moves the villa to Booked.
- **Booked** (gold/amber) — an upcoming reservation, guest not on-site yet. Shows guest details + a "Check In" button, which moves the villa to Occupied.
- **Occupied** (maroon) — guest is checked in. Shows guest details, a live **Food Orders** panel, and a "Check Out" button.

**Food Orders** (occupied villas only): lists every dish from Menu Config with a +/- stepper and a running total. "Place Order" deducts each dish's ingredients from that branch's inventory (e.g. 2× Fish Curry pulls 0.8kg Fish, 0.3kg Coconut, 0.4kg Rice), shows a brief confirmation toast, and updates the Inventory low-stock badge immediately if anything crosses its minimum.

**Check Out** jumps straight to the invoice generator (screen-form) with the guest name, phone, and check-in/out dates pre-filled, plus one charge line already added: `<Villa Name> — Room Charge`, quantity = nights stayed, rate = that villa's nightly rate (from `ROOMS_BY_BRANCH`), value calculated automatically. Generating the invoice from there resets the villa back to Available.

## Mock data
None of this is wired to a backend yet — everything lives in-memory in `script.js` and resets on page reload:
- `DASHBOARD_DATA` — revenue, invoice counts, occupancy, and monthly trend per branch.
- `ROOMS_BY_BRANCH` — villa list, status (`available`/`booked`/`occupied`), guest details, and nightly `rate` per branch. A branch's Room Bookings card only enables once it has an entry here.
- `MENU_ITEMS` — dishes, price, and ingredient list (shared across both branches). Managed via the Menu Config screen.
- `INVENTORY_BY_BRANCH` — stock item, category, current/min stock, and unit, per branch. Ingredient names in `MENU_ITEMS` must exactly match an item name here, or a Food Order can't find anything to deduct from.

Swap these for a real data source later without touching the rendering/chart code.

## Login & roles
Username/password is a **client-side gate only** — there's no backend, so the credentials live in plain text in `script.js` (the `ACCOUNTS` array). It keeps casual visitors out but is not real security: anyone with browser dev tools can read or bypass it. Don't reuse a password that matters elsewhere. Once logged in, a device stays signed in (via `localStorage`) until that flag is cleared.

Two accounts ship by default:

| Username | Password | Role    | Branch              |
|----------|----------|---------|----------------------|
| ashen    | 1234     | manager | picks any branch     |
| staff    | 1234     | staff   | locked to Wilpattu    |

Manager sees every feature and can switch branches. Staff are locked to their assigned branch (no "Change branch" option) and don't see the Finance Dashboard card. Add, remove, or re-role accounts by editing the `ACCOUNTS` array near the top of the login logic in `script.js` — set `branch: null` for an account that should pick its own branch, or a branch key to lock it.

## Logo files
Three files live in `assets/`:

```
assets/logo-wilpattu.png       branch home screen + form header (Wilpattu)
assets/logo-arugambay.png      branch home screen + form header (Arugam Bay)
assets/watermark.png           transparent gold logo, faded behind the invoice item list
```

The two branch logos have a maroon background baked in, so they blend into the maroon UI panels. `watermark.png` must be a transparent PNG (gold artwork, no background) — that's what lets it fade cleanly into the white invoice paper the way it does on the printed original.

## Charges table behavior
- **Qty** is free text (e.g. `2 nights`, `12`, `1`) to match real package pricing.
- **Value** auto-fills as Qty × Rate only when Qty is a plain number — for text quantities like "2 nights", type the Value manually (matches how package rates are billed).

## Run it locally
Just open `index.html` in any browser — no install needed.

## Publish to GitHub Pages
1. Create a new GitHub repository and push this folder to it.
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`.
4. Save — GitHub will give you a URL like `https://<username>.github.io/<repo-name>/`.
5. Share that link with staff — it works on phones, tablets, and PCs.

## Editing branches
Branches are defined in `index.html` in the `#screen-branch` section — each is a `<button class="branch-btn" data-branch="..." data-label="..." data-logo="...">`. Add, remove, or rename buttons there (and their matching logo file) to change the branch list.
