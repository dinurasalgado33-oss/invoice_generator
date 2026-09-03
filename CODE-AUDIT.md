# Leopard Inn — Code Audit: data routing and speed

Written 2026-09-02, against hosting `v=162`, commit `ea8d297`.
No code was changed. Companion to `QA-UX-AUDIT.md`, which covers the
screens; this one covers what is underneath them.

Two questions were asked: **is anything disrupting data routing**, and
**is anything making the app slow**. They have very different answers.

---

## The short version

**A pending food order is lost on reload, and the guest is never billed**
— §1.1. Verified: an LKR 880 order placed through the Orders screen was
gone after a page refresh, with no record anywhere. The kitchen may
already be cooking it. This is live today.

**The same event will also strand a stock deduction, once ingredients are
configured** — §1.2. Latent, not active: no dish currently has
ingredients, so the stock half does not fire yet. It arms itself the
first time a manager uses the Add Ingredient editor.

**The runtime is not slow.** Every derivation that runs on every database
change is sub-millisecond. Do not spend time optimising them.

**The startup is slow, and structurally so** — §2. 59 modules, 12 levels
deep, 444KB over the wire, two render-blocking CDN scripts, and a 163KB
font loaded on every visit for a feature most sessions never touch.

---

## 1. Data routing

### 1.1 A pending food order is lost on reload, unbilled — **HIGH, live today**

**Verified on the live app**, not inferred.

An order for one Papaya Juice, LKR 880, was placed through the Orders
screen the way reception places one. It appeared in the pending queue.
The page was then reloaded — the ordinary thing a phone does when its
battery is low, the browser reclaims the tab, or somebody pulls down too
far.

```
pending orders before reload : 1   (LKR 880, Walk-in, Papaya Juice)
pending orders after reload  : 0
completed order records      : unchanged
```

The order was not completed, not cancelled, not recorded. It was simply
gone. If the kitchen had already started cooking, the food is made, the
guest is served, and nothing in the system ever knew.

**Why.** `js/data/orders.js:8` declares `export const FOOD_ORDERS = []`
and nothing ever hydrates it. `sync.js` subscribes
`COLLECTIONS.FOOD_ORDERS` to `FOOD_ORDER_RECORDS` — a *different array*,
holding **completed** orders. The pending queue is memory in one tab, and
the tab is the only copy.

This is deliberate, and the reasoning is written down: `js/data/orders.js`
says *"currently pending" only ever means orders placed just now*, and
`PERSISTENCE-AUDIT.md` lists `FOOD_ORDERS` under "deliberately not
persisted". The reasoning holds for a *queue*. It does not hold for
**money owed by a guest**, which is what an unbilled order is.

It also means the kitchen tablet never sees an order the phone took —
worth deciding on separately, and probably wanted.

### 1.2 The same event will strand a stock deduction — **HIGH when armed, latent today**

The finding I originally reported, corrected after testing.

`js/orders.js:263` places an order in two steps that are not equal:

```js
deductIngredients(branch, dish, item.qty)   // → logStockMovement → add(STOCK_USAGE): persisted, synced, permanent
FOOD_ORDERS.push({ ... })                   // → memory in one tab, per §1.1
```

So the moment §1.1 happens, the stock movement survives and the order
that would have returned it does not. `restoreIngredients` can never run,
because there is nothing left to cancel. The shelf is short, permanently,
on every device, with nothing to say why — and unexplained stock
shortfalls read as theft.

**But it does not fire today.** Measured: **0 of 161 dishes have any
ingredients configured**, so `deductIngredients` iterates an empty list
and logs nothing. Confirmed in the same test — placing the order left the
stock-usage log unchanged.

That is a reprieve, not a fix. The Menu screen has a working **Add
Ingredient** editor (`js/menu.js:208`, saved through
`update(COLLECTIONS.MENU, dish, { … ingredients })`), so the first
manager who links a dish to its ingredients arms this — and they will
have no reason to expect that doing so introduces a way to lose stock.

**Directions, not prescriptions:**

- Persisting the pending queue fixes §1.1 and §1.2 together, and gets the
  kitchen tablet seeing orders as a side effect. It is the one change that
  addresses all three.
- Deferring the deduction to Complete fixes §1.2 alone, and loses the
  reservation that the shortage warning depends on.
- If neither is done soon, §1.2 at least deserves a note beside the
  Add Ingredient editor, so the person arming it knows.

### 1.3 Everything else routes correctly — **verified**

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

### 1.4 The config watcher is chatty — **MEDIUM, and mine**

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

### 1.5 Two import cycles — **LOW, worth knowing**

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

1. **Stop losing pending food orders** (§1.1, §1.2). One change — persisting
   the queue — closes an unbilled-guest hole that is live today and a
   stock-corruption hole that arms itself the first time somebody
   configures a dish's ingredients.
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
- **§1.2 firing for real.** The two halves are each verified — orders are
  lost on reload (observed), and `logStockMovement` persists (observed
  earlier today) — but they have not been seen failing *together*, because
  no dish has ingredients to deduct. Configuring one on a test dish would
  close that gap; I did not, to avoid arming it on live data.
