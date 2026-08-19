# Leopard Inn — Staff Portal

A mobile-friendly web app for Leopard Inn staff. Ships with an invoice generator, a reservation confirmation generator, a finance dashboard, a reports/export screen, a room booking map with a full guest lifecycle, food ordering, activity charges, and inventory management — for both branches.

## Project structure
No build step — plain ES modules and multiple stylesheets, loaded directly by the browser.

```
index.html          single HTML file, every screen, clearly commented per section
css/                 one file per feature area (base, brand-home, rooms, menu-inventory, invoice, dashboard, reports, reservation)
js/
  main.js            entry point — imports every feature module, then calls restoreSession() last
  state.js           shared mutable app state (selectedBranch, currentRole, etc.)
  utils.js           formatting/DOM helpers used across modules
  navigation.js       screens map + showScreen()
  confirm.js          styled confirm dialog, used in place of window.confirm() everywhere
  auth.js, branch.js, home.js, invoice.js, rooms.js, orders.js, menu.js, inventory.js, dashboard.js, reports.js, reservation.js
  data/               mock data per feature (no logic) — swap these for real API calls later
```

Each feature module wires its own DOM listeners as a side effect of being imported — importing a module *is* initializing it (same pattern the old single-file script used, just split up). The one exception is `restoreSession()` in `auth.js`, which is called explicitly last from `main.js` since it depends on every other screen already being wired.

Cache-busting: every `<link>`/`<script>` tag in `index.html` carries a `?v=N` query string, and so does every inter-module `import` statement inside `js/`. When you edit **any** file under `css/` or `js/`, bump the version number everywhere (a find-replace for the old `?v=N` is easiest) — GitHub Pages doesn't support custom cache headers, so this is the only lever against browsers serving a stale mix of old and new files.

HTML was deliberately **not** split into fetched partials — that would need async loading before any script could safely query the DOM, adding real race-condition risk for a static site with no build tooling. Splitting the ~800-line JS file (which mixed auth, rooms, menu, inventory, dashboard, invoice, and now reports in one IIFE) was the actual maintainability problem; the HTML/CSS split is straightforward file-per-concern with no runtime risk.

## How it works
1. Staff log in (see **Login & roles** below).
2. **Manager** accounts pick a branch (Wilpattu Forest Retreat / Arugam Bay Beachfront Hotel). **Staff** accounts are locked to one branch and skip straight to its home screen.
3. From the branch home screen's Quick Actions:
   - **Check In / Check Out** — check-in opens a short form (guest name, phone, check-in/out dates); check-out jumps straight to the invoice generator, pre-filled from that stay.
   - **Food Order** — a dedicated screen (not just a panel) to build and place/edit/complete orders per occupied room.
   - **Activities** — inside a villa's detail sheet, charge preset or custom activities straight to that guest's bill.
   - **Log Inventory** — stock levels per branch; add/edit items, restock (single or bulk).
   - **Reservation** — generates a Reservation Confirmation (a separate guest-facing document from the invoice), styled to match the printed slip.
4. Manager-only tools: **Reports & Export**, **Finance Dashboard**, **Menu Config**.

Destructive or state-changing actions (cancel check-in, delete an order/dish/item, logout) go through a styled confirm dialog (`js/confirm.js`), not the browser's native `confirm()`.

## Room lifecycle
Each villa is either **Available** (green — "Check In Guest" opens a short form) or **Occupied** (maroon — shows guest details, a "Cancel this check-in" undo link, and a "Check Out" button). Food orders and activity charges placed during a stay ride along on `room.pendingCharges` and land on the same invoice at checkout; checking out (or cancelling a check-in) clears them.

**Check Out** jumps to the invoice generator (`screen-form`) with guest name, phone, and check-in/out dates pre-filled, plus a `<Villa Name> — Room Charge` line (quantity = nights stayed, rate = that villa's nightly rate from `ROOMS_BY_BRANCH`). Generating the invoice frees the villa and pushes a real record into `INVOICES`, which is what Reports and the Finance Dashboard read from — checking guests out during a session is reflected in both immediately.

## Mock data
None of this is wired to a backend yet — everything lives in-memory in `js/data/*.js` and resets on page reload:
- `ROOMS_BY_BRANCH` (`js/data/rooms.js`) — villa list, status (`available`/`occupied`), guest details, and nightly `rate` per branch.
- `MENU_ITEMS` (`js/data/menu.js`) — each dish is scoped to one `branch` (the two hotels run entirely separate menus); `id` is a globally unique internal key, `number` is the branch-local number staff actually see and search by (each branch numbers its own dishes from #1).
- `INVENTORY_BY_BRANCH` (`js/data/inventory.js`) — stock item, category, current/min stock, and unit, per branch. Ingredient names in `MENU_ITEMS` must exactly match an item name here for Food Order to deduct from the right stock (most current dishes ship with an empty ingredient list, to be filled in gradually).
- `INVOICES`, `FOOD_ORDER_RECORDS`, `ACTIVITY_RECORDS`, `BOOKINGS` (`js/data/reports.js`) — a small seeded history plus whatever real checkouts/orders/activities/check-ins happen during the session, which is what Reports and the Finance Dashboard actually read from.

Swap these for a real data source later without touching the rendering/chart code.

## Offline-first requirements (for the backend build)

Both properties are in remote areas with poor, intermittent connectivity. That is a
hard design constraint, not a nice-to-have: the app must stay usable with no signal
and reconcile once a connection returns. Three decisions follow from it, and all
three are cheaper to make **before** the backend exists than after.

### 1. Data offline — Firestore local cache
Firestore caches reads in IndexedDB and queues writes locally, replaying them
automatically when the connection returns. **On web this is opt-in** (it's on by
default only on iOS/Android), so it must be enabled explicitly at init via
`persistentLocalCache` in the modular SDK — with `persistentMultipleTabManager()`
if staff might open the app in more than one tab.

Miss this line and the app silently becomes online-only.

### 2. The app shell offline — service worker
Firestore's cached data is useless if the app itself won't load. Served from GitHub
Pages with no signal, a refresh fetches `index.html`, `css/*`, and `js/*` from the
network and fails — the app never starts. A service worker caching the app shell is
what makes "open the app with no bars" work at all.

Note this interacts with the `?v=N` cache-busting scheme above: the service worker
becomes the thing that decides what's stale, so the two need to agree rather than
fight. Version the cache name alongside `?v=N`.

### 3. Invoice numbering — decide before the first real invoice
A transactional counter for sequential invoice numbers **requires the server**.
Offline, a device cannot reserve `#175`, because it can't know another device hasn't
just taken it. Options:

| Approach | Offline? | Cost |
|---|---|---|
| **Per-device prefix** (`W-175`, `A-88`) | Yes | Numbers aren't globally sequential |
| Assign on sync | No | Guest's printed copy shows a placeholder |
| Pre-allocated blocks | Partly | Device must go online to refill; leaves gaps |

**Leaning per-device prefix** — it's the only one that behaves identically online and
offline, and a prefix reads fine on a guest-facing bill. This is expensive to change
once real invoices exist, so settle it first.

### Conflict handling
Stock levels have the same shape of problem: two staff deducting the same item
offline would clobber each other under last-write-wins. Firestore's atomic
`increment()` handles this correctly — both deductions apply. Use it for stock
rather than reading, subtracting, and writing back.

Room status is the residual risk (two staff checking different guests into one villa
offline). Rare enough to accept, but worth surfacing in the UI rather than resolving
silently.

## Login & roles
Username/password is a **client-side gate only** — there's no backend, so the credentials live in plain text in `js/data/accounts.js` (the `ACCOUNTS` array). It keeps casual visitors out but is not real security: anyone with browser dev tools can read or bypass it. Don't reuse a password that matters elsewhere. Once logged in, a device stays signed in (via `localStorage`) until that flag is cleared.

Three accounts ship by default:

| Username | Password | Role    | Branch              |
|----------|----------|---------|----------------------|
| ashen    | 1234     | manager | picks any branch     |
| staffw   | 1234     | staff   | locked to Wilpattu    |
| staffa   | 1234     | staff   | locked to Arugam Bay  |

Manager sees every feature and can switch branches. Staff are locked to their assigned branch (no "Change branch" option) and don't see manager-only tools (Reports, Finance Dashboard, Menu Config). Add, remove, or re-role accounts by editing the `ACCOUNTS` array in `js/data/accounts.js` — set `branch: null` for an account that should pick its own branch, or a branch name to lock it.

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
