# Leopard Inn — Staff Portal

A mobile-friendly web app for Leopard Inn staff. Ships with an invoice generator, a finance dashboard, and a room booking map (both branches now); Inventory Management and Food Orders are "Coming Soon" placeholders on the home screen.

## How it works
1. Staff log in (see **Login & roles** below).
2. **Manager** accounts pick a branch (Wilpattu Forest Retreat / Arugam Bay Beachfront Hotel). **Staff** accounts are locked to one branch and skip straight to its home screen.
3. From the branch home screen:
   - **New Invoice** — fill in guest details and itemized charges, matching Leopard Inn's real invoice format (Reservation No, Reg. Card No, Voucher No, itemized charges, Service Charge, Gross/Advance/Grand Total, remarks, signature lines). Generate a preview styled like the printed invoice, then **Print / Save PDF**, **Save as Image**, or start a **New Invoice**.
   - **Finance Dashboard** (manager only) — KPI tiles, a revenue-by-category chart, and a monthly revenue trend, with an **Export PDF Report** button. Currently mock data (see below).
   - **Room Bookings & Info** — a theater-style map of villas (3 per row), booked ones show a date-range ribbon and open a detail sheet on tap. Currently mock data, both branches.

## Mock data
The Finance Dashboard and Room Bookings screens are front-end only right now — no backend. Their data lives in `script.js`:
- `DASHBOARD_DATA` — revenue, invoice counts, occupancy, and monthly trend per branch.
- `ROOMS_BY_BRANCH` — villa list and booking status per branch. A branch's Room Bookings card only enables once it has an entry here.

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
