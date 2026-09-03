# Leopard Inn — Code Audit: data routing and speed

Written 2026-09-02, against hosting `v=162`, commit `ea8d297`.
No code was changed. Companion to `QA-UX-AUDIT.md`, which covers the
screens; this one covers what is underneath them.

Two questions were asked: **is anything disrupting data routing**, and
**is anything making the app slow**. They have very different answers.

---

## The short version

**One serious data-routing defect** — §1.1. Placing a food order deducts
stock permanently and everywhere, while the order itself lives only in
that one browser tab. Refresh the phone and the stock stays gone with
nothing left to complete, bill or cancel. This is the finding to act on.

**The runtime is not slow.** Every derivation that runs on every database
change is sub-millisecond. Do not spend time optimising them.

**The startup is slow, and structurally so** — §2. 59 modules, 12 levels
deep, 444KB over the wire, two render-blocking CDN scripts, and a 163KB
font loaded on every visit for a feature most sessions never touch.

---

## 1. Data routing

### 1.1 A pending food order deducts stock permanently, then can vanish — **HIGH**

The clearest defect in the codebase.

**What happens.** `js/orders.js:263` places an order:

```js
deductIngredients(appState.selectedBranch, dish, item.qty)   // ← persists
FOOD_ORDERS.push({ ... })                                    // ← does not
```

- `deductIngredients` → `logStockMovement` → `add(COLLECTIONS.STOCK_USAGE, …)`.
  That is a **real, persisted, synced** write. Every device sees the stock
  drop within seconds, and it survives everything.
- `FOOD_ORDERS` is declared in `js/data/orders.js` as `export const
  FOOD_ORDERS = []` and is **never hydrated**. `sync.js` subscribes
  `COLLECTIONS.FOOD_ORDERS` to `FOOD_ORDER_RECORDS` — a *different array*,
  holding completed orders. The pending queue is memory in one tab.

**The consequence.** Between placing an order and pressing Complete or
Delete, the two halves are unequal: one is permanent and global, the
other is local and fragile. If the device reloads, signs out, runs out of
battery, or the browser reclaims the tab:

- the ingredients stay consumed, on every device;
- the order is gone, so nobody can Complete it (no bill) or Delete it
  (`restoreIngredients` never runs);
- nothing anywhere says why the shelf is short.

Stock discrepancies with no explanation read as theft. That is the real
cost here, not the rupees.

**Why it is not simply a bug.** The session-scoped queue is deliberate and
documented — `js/data/orders.js:2` explains that *"currently pending" only
ever means orders placed just now*, and `PERSISTENCE-AUDIT.md` lists
`FOOD_ORDERS` under "deliberately not persisted". That reasoning is sound
on its own. What was not considered is that the **stock movement attached
to it is not session-scoped**, so the pair cannot both be right.

**Directions, not prescriptions:**

- Persist the pending queue like everything else. It stops being a special
  case, and the kitchen tablet sees orders the phone took — which is
  probably wanted anyway.
- Or defer the stock deduction to Complete, so the persisted half only
  happens when the order becomes permanent. Loses the reservation, which
  is what the shortage warning depends on.
- Or, cheapest: on startup, look for `stockUsage` rows of `kind: "order"`
  whose order never completed, and surface them for review rather than
  letting them sit silently.

### 1.2 Everything else routes correctly — **verified**

I went looking for writes that bypass the store and found none. The
`FOOD_ORDERS.push` and `.splice` calls in `orders.js` look like bypasses
and are not — they act on the session queue, and the completed record is
written properly at `orders.js:390` through
`add(COLLECTIONS.FOOD_ORDERS, FOOD_ORDER_RECORDS, …)`.

Also checked and clean:

| | |
|---|---|
| Record writes going through `store.js` | all of them |
| Raw UTC dates instead of `toDateISO()` | none |
| Silent `catch {}` swallowing a failure | none |
| Collection names hard-coded at call sites | none — `guard()` throws on an unknown one |

### 1.3 The config watcher is chatty — **MEDIUM, and mine**

I added this today, so I am flagging my own work.

`hydrateConfig` issues **29 `getDoc` calls** for a manager (13 per branch
× 2, plus 3 shared). The live watcher I added re-runs the whole of it on
*every* change to *any* document in `config`.

Manage Lists calls `persist()` on every single add and remove. So a
manager adding six inventory categories produces six config writes, and
therefore **six × 29 = 174 reads on every open device**.

They are cached reads, they are cheap, and config changes are rare — this
is not an outage. But it is wasteful in a way that will get worse as
config kinds are added, and it is the kind of thing that looks fine at
ten villas and does not at fifty.

The snapshot already carries the changed documents. Applying just those,
rather than re-reading all 29, would be strictly better. I chose the
re-read deliberately so live updates and sign-in hydration could not
drift apart, and I would make that trade again — but it should be a
known trade, not a surprise.

### 1.4 Two import cycles — **LOW, worth knowing**

```
js/reservations.js  →  js/reservation.js   →  js/reservations.js
js/reservations.js  →  js/proforma.js      →  js/reservations.js
```

Nothing is broken today: ES modules tolerate cycles, and `invoice.js`
already dodges a third one with a deliberate dynamic import and a comment
saying why. But a cycle means module evaluation order decides whether a
binding is initialised when it is first touched, and that is exactly the
class of failure that appears once, in production, after an unrelated
edit reorders imports.

---

## 2. Speed

### 2.1 The runtime is not the problem — **measured**

Everything that runs on every database change, timed over 50 iterations
on the live app:

| Operation | Cost |
|---|---|
| `deriveOccupancy()` — rebuilds all villa occupancy | **0.01 ms** |
| `deriveStock()` — rebuilds 84 items from their movement logs | **0.03 ms** |
| `departmentsWithCategories()` | **0.02 ms** |
| Filtering 161 dishes by name (runs per keystroke) | **0.02 ms** |

**Nothing here needs optimising.** "Derive, don't store" cost essentially
nothing and bought correctness. If anyone proposes caching these, the
answer is no.

### 2.2 Startup is the whole cost — **measured**

On the live app at a 375px viewport:

| | |
|---|---|
| JS files requested | **68** |
| Total requests | **82** |
| JS over the wire | **444 KB** |
| CSS over the wire | **31 KB** |
| `domInteractive` | **18.2 s** |
| `domComplete` | **27.6 s** |

Those seconds are from a throttled preview pane, so treat them as a shape
rather than a number a guest would see. The shape is what matters, and
the shape is round trips.

### 2.3 The module graph is 12 levels deep with no preload hints — **the root cause**

59 static ES modules reachable from `main.js`, and the **deepest import
chain is 12 levels**. `index.html` contains **zero `modulepreload`
hints**, so the browser cannot discover level *n+1* until level *n* has
arrived and been parsed.

On a Sri Lankan mobile connection at 300ms round trip, twelve sequential
levels is **~3.6 seconds of pure latency** before the last module starts
downloading — independent of file size or bandwidth.

This is normally what a bundler fixes, and `CLAUDE.md` rules bundlers out
for good reasons. **`<link rel="modulepreload">` is the no-build-step
answer**: a flat list of the module graph in `index.html` lets the browser
fetch all 59 in parallel immediately. It is generated once, costs nothing
at runtime, and needs no tooling in the serving path.

### 2.4 Two CDN scripts block rendering — **easy, certain**

```html
<script src="…/jspdf.umd.min.js" defer></script>          ✅
<script src="…/qrcode.js" defer></script>                 ✅
<script src="…/html2canvas.min.js"></script>              ❌  37 KB, blocking
<script src="…/chart.umd.min.js"></script>                ❌  69 KB, blocking
```

Two of the four already have `defer`; two were missed. **106 KB of
render-blocking script**, for a "Save Image" button and the Finance
charts — neither of which exists on the screen a receptionist opens.

`defer` on both is a one-line change with no behavioural risk: both are
only touched from event handlers, and both are already guarded by
`typeof … !== "function"` checks for the case where they failed to load.

### 2.5 A 163 KB font loads on every visit for a feature most sessions never use — **the biggest single win**

`js/data/font-cinzel.js` is **163 KB raw, 66 KB over the wire** — 22% of
all application JavaScript. It reaches startup through two static chains:

```
main.js → invoice.js      → invoice-pdf.js → font-cinzel.js
main.js → menu-publish.js → menu-pdf.js    → font-cinzel.js
```

Both are static, so it is downloaded, parsed and held in memory on every
page load — including every reception phone that never builds a PDF all
day.

It is needed only inside `buildInvoicePdf()` and `buildMenuPdf()`, both of
which already tolerate the PDF library being absent. A dynamic
`await import("./data/font-cinzel.js")` at the point of use would remove
66 KB from every cold start and cost a few hundred milliseconds the first
time somebody actually presses Download PDF.

**I made this worse today.** Before `invoice-pdf.js` there was one static
path to the font; now there are two. It was already on the startup path,
so the download did not change — but I added a second reason for it to
stay there, and I should have used a dynamic import.

### 2.6 What is already right

- `firebase.json` sets `Cache-Control: no-cache` on HTML/JS/CSS and
  `immutable, max-age=31536000` on `assets/**`. Correct: code must never
  be stale, artwork never re-fetched.
- Every JS and CSS URL carries `?v=NNN`, so a deploy is atomic from the
  browser's point of view.
- Firestore writes are fire-and-forget by design, so no screen waits on a
  round trip — the reason the app feels immediate once loaded, and the
  reason it works offline at all.

---

## 3. If only four things get done

1. **Fix the food-order stock split** (§1.1). It is the only finding here
   that silently corrupts data.
2. **Add `defer` to `html2canvas` and `chart.js`** (§2.4). One line,
   106 KB off the blocking path.
3. **Dynamic-import the Cinzel font** (§2.5). One line, 66 KB off every
   cold start.
4. **Generate `modulepreload` hints** (§2.3). The largest startup win, and
   the only one that needs any thought — but it is a static list in
   `index.html`, not a build step.

Two, three and four are roughly an hour and would change how the app feels
on a phone at the desk. One is the one that matters.

---

## 4. What this audit did not establish

- **Real-world load times.** The numbers in §2.2 come from a throttled
  preview pane. A real phone on a real Sri Lankan connection would give a
  different figure and the same ranking.
- **Behaviour at scale.** All timings are against 4 invoices, 161 dishes,
  84 stock items. Reports at four hundred invoices is unmeasured.
- **The food-order failure end to end.** §1.1 is established from the
  source and from `logStockMovement` demonstrably persisting; I did not
  place an order and reload the device to watch the stock stay gone.
  That is the one confirmation I would want before anyone spends a day on
  the fix — and it takes about two minutes.
