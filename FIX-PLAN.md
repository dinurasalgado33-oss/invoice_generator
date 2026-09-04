# Leopard Inn — Fix Plan

## Status — 2026-09-04

Deployed to **dev** (`leopard-inn-dev`, `?v=174`) and verified there.
**Not yet on live** (`leopard-inn`, still `?v=169`).

| | Fix | State |
|---|---|---|
| **F1** | `[hidden]` beaten by class selectors | ✅ done, verified — and the check was made to fail first |
| **F2** | Invoice top line said "Reservation No" | ✅ done, verified |
| **F3** | Pending orders lost on reload, unbilled | ✅ done, **whole lifecycle verified against the server** |
| **F4** | Stranded stock deduction | ✅ closed by F3 |
| **F5** | Stepper looked pressable and was not | ✅ done, verified on both wizards |
| **F6** | ~~Lists render blank~~ | ❌ **withdrawn — the audit was wrong**, see below |
| **F7** | CDN scripts loaded on every visit | ✅ done properly — all four now on demand, DCL **29.4s → 8.2s** |
| **F8** | 163 KB font on every visit | ✅ done, verified — 0 requests before a PDF is built |
| **F9** | 59 modules, deep waterfall, no preload hints | ✅ done — 8 boot waves → 6 |
| **F10–F15** | P3 items | ⬜ not started |
| **F16** | Staging site wrote to the **production** database | ✅ found while testing F3, fixed, verified |

**One bug was found while fixing, not by the audit:** `js/invoice.js`
selected `.form-step` and `.stepper-item` document-wide, and the
registration card uses the same class names. Every invoice step change was
silently repainting the check-in card's stepper and toggling its form
steps. Invisible today, because the card repaints itself on open — but it
would have nested a button inside a button the moment F5 landed. Both
selectors are scoped to `#screen-form` / `#stepper` now.

---


> ## ⚠ Read this before you touch anything
>
> ### 1. Committing is not deploying
>
> This has gone wrong **three times** in this project. Each time something
> was fixed, committed, reported as done — and the live app was still
> running the old code. Twice it was then "re-fixed".
>
> Every hosting change needs the cache-busting version bumped in
> `index.html` (`?v=NNN` appears on ~12 lines) and a deploy:
>
> ```bash
> firebase deploy --only hosting --project leopard-inn
> ```
>
> Then **prove it is live** before believing any test result:
>
> ```bash
> curl -s "https://leopard-inn.web.app/?cb=$(date +%s)" | grep -o 'v=1[0-9][0-9]' | head -1
> ```
>
> The `?cb=` is not optional — a plain `curl` has returned a cached copy
> and shown the *previous* version number, in this project, today.
>
> Rules and Functions deploy separately and are easy to forget:
>
> ```bash
> firebase deploy --only firestore:rules --project leopard-inn
> firebase deploy --only functions:<name> --project leopard-inn
> ```
>
> A Function does not pick up a changed secret until it is redeployed.
>
> ### 2. Make the check fail before you trust it
>
> **Three** green results in this project came from checks that could not
> have gone red: `node --check` passing a malformed ES import, a `.map`
> over arrays nothing had loaded into, and two browser tabs "proving"
> cross-device sync while sharing one cache.
>
> Before believing a test: remove the thing it depends on and confirm it
> goes red. Two browser tabs are **not** two devices.
>
> ### 3. Verify against the server, not the cache
>
> Firestore's local cache will happily confirm a write that never left the
> device. Use `getDocFromServer` / `getDocsFromServer` and check
> `metadata.fromCache === false` when it matters.

---

Written 2026-09-02 against hosting `v=162`, commit `6fd2c7e`, live project
`leopard-inn`. **No code has been changed.** Every item below is an open
piece of work.

This document is meant to be picked up cold. It does not assume you have
read `QA-UX-AUDIT.md` or `CODE-AUDIT.md`, though both hold the longer
reasoning if you want it.

---

## How to use this

Each item is self-contained: what is wrong, where, what was observed, how
to check you fixed it. **The "how to verify" line is the important part** —
several findings in this project were originally reported wrong, in both
directions, because they were reasoned about rather than run.

Severity is about consequence, not effort:

- **P1** — wrong information on a document a guest keeps, or data loss.
- **P2** — daily friction, or a performance cost every user pays.
- **P3** — worth doing, nobody is suffering.

---

## Do not "fix" these — they are deliberate

Listed first because the fastest way to damage this app is to tidy one of
them away.

| Thing | Why it is like that |
|---|---|
| Occupancy derived from bookings, never stored | Storing it put "is this villa occupied" in two places; that bug is fixed and must not return |
| Stock derived from its movement logs | Same reason. Both derivations measured at **0.01–0.03 ms** — they are not a performance problem |
| Villa config storing only `id`, `name`, `rate` | Persisting occupancy alongside would undo the above |
| `allow delete: if false` on financial collections | Invoices are voided, charges written off. Never deleted |
| Firestore writes fire-and-forget | This is what makes the app work offline and feel instant |
| Numbering blocks reserved per device | The whole point of block allocation |
| Record IDs are UUIDs; config IDs are numeric | Guests read dish numbers off a menu; records must not collide between offline devices |
| Invoice `id` contains a slash (`INV-2026/27-001`) | Safe — the adapter stores a separate `__docId`. Do not "sanitise" it |

---

# P1 — wrong information, or data loss

## F1. The `hidden` attribute does nothing on four elements

**One CSS rule causes all four.** Fixing it is the highest
value-per-minute change in this document.

### Root cause

`css/base.css:132` — `.field { display: flex; }`

An author class selector beats the browser's built-in `[hidden]` rule, so
`element.hidden = true` sets the attribute and changes nothing visually.
Any element whose class sets `display` has the same problem.

### Suggested fix

Add, high in `css/base.css`:

```css
[hidden] { display: none !important; }
```

This is the standard guard for exactly this situation. Six other uses of
`hidden` in the app already work (their classes happen to set
`display: none`), and this rule does not change those.

### The four affected, in severity order

#### F1a — every zero-VAT invoice prints a bare "VAT" line — **P1**

`js/invoice.js:440` — `vatRow.hidden = !showVat;`

The code's own comment says why this matters:

> *A rate of zero means the hotel is not registered for VAT — printing
> "VAT 0.00" would imply it is.*

**Observed** on `INV-2026/27-201`, `vatRate: 0`:

```
Net Amount     LKR 9,500.00
VAT                              ← visible, no figure at all
Advance        -
Grand Total    LKR 9,500.00
```

Worse than the case the comment feared — an empty line item on a document
the guest signs and keeps.

**Not affected:** the PDF. `js/invoice-pdf.js` tests
`Number(r.vatRate) > 0` in JavaScript. Only the on-screen and printed HTML
is wrong.

**Verify:** open any invoice with `vatRate: 0` in Guest History. The VAT
row must be absent from the totals block, not merely blank.

#### F1b — check-in offers a reservation belonging to another villa — **P1**

`js/grc.js:190-198`

```js
matchingReservations = openReservations(branch).filter(r =>
  (r.villas || []).some(v => v.roomId === room.id));
const picker = el("grc-reservation-picker");
picker.hidden = matchingReservations.length === 0;   // ← does nothing
if (matchingReservations.length) {
  el("grc-reservation-select").innerHTML = …          // ← only rewritten when there ARE matches
}
```

Two faults compound. The hide fails, **and** the dropdown is never
cleared, so options from the previously opened villa survive in the DOM.

**Observed, in order:**

1. Created `RES-2026/27-251` for Pool Villa 1, checked the guest in
   against it. Reservation correctly closed to `Checked In`.
2. Opened a check-in for **Pool Villa 2**, which has no reservation.
3. The picker was **visible**, still offering `RES-2026/27-251` — already
   used, different villa.
4. Selecting it filled the form with no warning **and overwrote the villa
   field with "Pool Villa 1"**.

Stopped before submitting rather than create a duplicate booking on live,
so whether a second check-in completes is **untested**. Worth establishing
while fixing.

**Fix needs both halves:** the `[hidden]` rule (F1), *and* clearing
`innerHTML` when there are no matches — otherwise stale options remain
reachable by keyboard and by screen readers even once hidden.

**Verify:** check in against a reservation, then open a check-in for a
different villa. No picker should appear. Inspect the select's options —
it must be empty, not merely hidden.

#### F1c — the exchange-rate field never hides — **P2**

`js/invoice.js:97` and `js/invoice.js:507`

`syncExchangeRateField()` hides it for LKR. It does not hide, so every
ordinary rupee invoice shows an exchange-rate box staff learn to ignore.
The value *is* cleared correctly, so nothing is mis-billed.

**Verify:** open a new invoice with currency LKR. No exchange-rate field.

#### F1d — Guest History "load more" stays visible with nothing to load — **P3**

`js/history.js:222` and `js/history.js:269`

**Verify:** open Guest History with fewer stays than one page. No button.

---

## F2. The invoice number is labelled "Reservation No" — **P1**

`index.html:1474`

```html
<p><span>Reservation No</span> <strong id="prev-number"></strong></p>
```

`prev-number` holds the **invoice** number. The same document then has a
genuine reservation row at `index.html:1483`:

```html
<div class="reservation-row"><span>Reservation No</span><strong id="prev-reg-card"></strong></div>
```

So the printed invoice carries two fields with the same label — one
holding the invoice number, one holding the registration card number. A
guest querying a charge, or an agent reconciling a voucher, is given the
wrong name for the number they will quote back.

**Observed** on `INV-2026/27-201`: top line read `Reservation No
INV-2026/27-201`, guest block read `Reservation No: N/A`.

**Suggested fix:** label `prev-number` as **Invoice No**. Check
`index.html:1767` (`pf-prev-resno`, the proforma) for the same pattern
before changing anything, and check `js/invoice-pdf.js`, which already
labels it `INVOICE`.

**Verify:** open any invoice. The number at the top reads "Invoice No",
and only the guest block says "Reservation No".

---

## F3. Pending food orders are lost on reload, unbilled — **P1**

`js/data/orders.js:8` — `export const FOOD_ORDERS = [];`

Nothing ever hydrates this array. `js/data/sync.js:55` subscribes
`COLLECTIONS.FOOD_ORDERS` to `FOOD_ORDER_RECORDS` — a **different array**,
holding completed orders. The pending queue is memory in one browser tab.

**Observed:** placed one Papaya Juice, LKR 880, through the Orders screen,
then reloaded.

```
pending orders before reload : 1
pending orders after reload  : 0
completed order records      : unchanged
```

Not completed, not cancelled, not recorded. If the kitchen had started
cooking, the guest is served and never billed.

**This is deliberate and documented** — `js/data/orders.js:2` says
*"currently pending" only ever means orders placed just now*, and
`PERSISTENCE-AUDIT.md` lists `FOOD_ORDERS` under "deliberately not
persisted". That reasoning holds for a queue. It does not hold for money a
guest owes.

It also means the kitchen tablet never sees an order the phone took —
probably wanted, worth deciding separately.

**Suggested direction:** persist the pending queue like every other
collection. It closes F3 and F4 together and gets cross-device visibility
as a side effect. Needs a `foodOrdersPending` collection, a rule matching
`foodOrders`, and a `COLLECTION_MAP` entry.

**Verify:** place an order, reload, confirm it is still pending. Then
complete it and confirm exactly one record reaches `FOOD_ORDER_RECORDS`.

---

## F4. A stranded stock deduction — **P1 when armed, dormant today**

`js/orders.js:263-265`

```js
deductIngredients(appState.selectedBranch, dish, item.qty)  // → persisted, synced, permanent
FOOD_ORDERS.push({ … })                                     // → memory in one tab (F3)
```

`deductIngredients` → `logStockMovement` → `add(COLLECTIONS.STOCK_USAGE, …)`.
That write is permanent and reaches every device. So whenever F3 happens,
the stock movement survives and the order that would have returned it does
not — `restoreIngredients` can never run. The shelf is short, everywhere,
with nothing to say why. Unexplained stock shortfalls read as theft.

**It does not fire today.** Measured: **0 of 161 dishes have any
ingredients configured**, so `deductIngredients` iterates an empty list.
Confirmed in the same test — the usage log did not move.

**It arms itself** the first time a manager uses the working **Add
Ingredient** editor (`js/menu.js:208`). They will have no reason to expect
that linking a dish to its ingredients introduces a way to lose stock.

**Fixing F3 fixes this.** If F3 is deferred, consider deferring the
deduction to Complete instead — that loses the reservation the shortage
warning depends on, so it is a real trade.

**Verify:** configure an ingredient on a test dish, place an order,
reload, and confirm the stock returns or the order survives. Undo the
ingredient afterwards.

---

# P2 — daily friction and speed

## F5. Checkout costs seven taps to change nothing — **P2, highest daily value**

`js/invoice.js:351` — `goToStep` is wired only to Next and Previous. The
stepper circles are display-only.

A checkout prefills the guest, villa, nights, rate, charges and staff
name. In the ordinary case the person at the desk agrees with all of it
and still taps:

```
Check Out → villa → Check Out → Next → Next → Next → Generate Invoice
```

Three taps change nothing, on the most repeated action in the building.
The stepper *looks* pressable, which is its own problem — a control that
looks interactive and is not teaches people to distrust the interface.

**Same applies to check-in** (`js/grc.js:257`), where only two fields are
genuinely required: guest name, and passport **or** NIC.

**Suggested direction:** make the stepper circles navigable, reusing the
existing per-step validation. Or surface **Generate Invoice** from step 1
when nothing later needs attention.

**Verify:** from step 1 of a prefilled checkout, reach Generate in one
tap, and confirm validation still refuses an incomplete form.

## F6. ~~Two lists render blank instead of saying they are empty~~ — **withdrawn, the audit was wrong**

**There is no bug here. Do not fix this.** Both empty states exist and have
existed since commit `c2365f1` (2026-08-15), well before the audit commit
`ea8d297` that reported them missing.

`js/orders.js` renders `.room-detail-empty` in both places:

- no pending orders → "No pending orders right now." `js/orders.js:309`
- a dish search with no match → "No dishes match “…”." `js/orders.js:131`

**How the audit got it wrong**, because the shape will recur: it grepped
`orders.js` for `list-empty` — the class the *other* five screens use —
got zero hits, and concluded the empty state was missing. It never read the
render. A different class name for the same thing looked identical to the
thing being absent.

The lesson is the one already in `CLAUDE.md` about tracing a whole
lifecycle: a count of matches is not a reading of the code. A finding that
says "X is missing" has to be backed by having looked at the place X would
be, not by a grep for one spelling of X.

The only real observation left is cosmetic and not worth a change on its
own: `orders.js` spells its empty state `.room-detail-empty` while five
other screens spell it `.list-empty`. Both render. Left alone.

## F7. Two render-blocking CDN scripts — **P2, one line**

`index.html:2576-2577`

```html
<script src="…/html2canvas.min.js"></script>   <!-- 37 KB, blocking -->
<script src="…/chart.umd.min.js"></script>     <!-- 69 KB, blocking -->
```

jsPDF and qrcode above them already have `defer`; these two were missed.
**106 KB blocking render** for a Save Image button and the Finance charts,
neither of which is on the screen reception opens.

Both are only used from event handlers, and both are already guarded by
`typeof … !== "function"` checks for the case where they failed to load.
Adding `defer` carries no behavioural risk.

**Verify:** `performance.getEntriesByType('navigation')[0].domInteractive`
falls, and Save Image plus the Finance charts still work.

**Done, and measured on a deliberately slow link** (0.15 Mbps, 250 ms RTT —
close to what reception actually has). `domInteractive` is **568 ms**, and
all four CDN scripts now report `defer`.

**But `defer` only solves half of it, and the other half is worse.** On
that link the load looked like this:

| | |
|---|---|
| modules requested in **9 sequential waves** | t=567ms → t=28568ms |
| chart.umd.min.js, 70 KB | **28.7 s** to arrive |
| html2canvas.min.js, 37 KB | **28.6 s** |
| gap between wave 5 and wave 6 | **17 seconds**, with no module in flight |

That 17-second hole is the two CDN scripts eating the whole pipe while 50
application modules wait behind them. `defer` stopped them blocking
*render*; it did nothing about them competing for *bandwidth*, and 107 KB
is 5.7 s of a 0.15 Mbps link before contention.

**The real fix is the F8 treatment, not `defer`:** load both on demand.
`chart.umd.min.js` is needed only on the Finance screen and
`html2canvas.min.js` only when Save Image or a PDF is pressed — neither
is on the screen reception opens. Both call sites already guard with
`typeof … !== "function"`, so the guard becomes "not loaded yet, load it"
instead of "give up".

Worth doing **before** F9: preload hints reorder a queue, but these two
should not be in the queue at all.

## F8. A 163 KB font loads on every visit — **P2, one line**

`js/invoice-pdf.js:4` and `js/menu-pdf.js:2` both statically import
`./data/font-cinzel.js` — **163 KB raw, 66 KB over the wire**, 22% of all
application JavaScript. Both files are reachable from `main.js`, so it
downloads and parses on every page load, including every reception phone
that never builds a PDF.

It is needed only inside `buildInvoicePdf()` and `buildMenuPdf()`.

**Suggested fix:** `const { CINZEL_REGULAR_B64 } = await
import("./data/font-cinzel.js")` at the point of use. Both builders are
already called from async paths, and both already tolerate the PDF library
being absent.

**Verify:** the font no longer appears in the network log on first paint,
and both Download PDF and the menu PDFs still embed Cinzel.

## F9. 59 modules, 12 levels deep, no preload hints — **P2, biggest startup win**

`index.html` contains **zero `modulepreload`** hints. The browser cannot
discover level *n+1* of the import graph until level *n* has arrived and
been parsed. Measured: **59 static modules, deepest chain 12 levels**.

On a Sri Lankan mobile connection at 300 ms round trip that is **~3.6
seconds of pure latency**, independent of bandwidth.

A bundler normally solves this and `CLAUDE.md` rules bundlers out for good
reasons. `<link rel="modulepreload">` is the no-build-step answer: a flat
list in `index.html` lets the browser fetch all 59 in parallel
immediately. It needs nothing in the serving path.

**Verify:** `domInteractive` falls; the network waterfall flattens from a
staircase to a block.

---

# P3 — worth doing

| ID | Finding | Location |
|---|---|---|
| **F10** | No password reset anywhere. A locked-out staff member needs a manager and the Firebase console. Firebase Auth provides this natively; the Staff screen is the natural place | app-wide |
| **F11** | Four of six search fields have no clear button — Order, Guest History, Reservations, Reports. Inventory and Menu have one | various |
| **F12** | Login has no show-password toggle and no autofocus | `screen-login` |
| **F13** | The config watcher re-reads all 29 config documents on every config write. Manage Lists writes once per add/remove, so six edits = 174 reads on every open device. Cached and cheap, but it will not scale | `js/data/config-store.js:151` |
| **F14** | Two import cycles: `reservations → reservation → reservations`, `reservations → proforma → reservations`. Harmless today; cycles decide initialisation order | `js/reservations.js` |
| **F15** | A record missing its `id` renders an **enabled** reprint button with `data-id="undefined"`. Triggered by malformed data, not by the app — but the guard is missing | `js/history.js` |

---

# Verified working — do not spend time here

All **observed on live**, not inferred.

| Area | Result |
|---|---|
| Reservation → check-in | Details carry, reservation closes to `Checked In`, booking links back, villa occupies |
| Check-in → welcome e-mail | Card numbered from the block, e-mail `Sent` to the typed address |
| Checkout → invoice → e-mail | `INV-2026/27-201`, PDF attached, 17,164 bytes |
| Invoice reprint from Guest History | Correct number, guest, total, void banner state |
| **Revenue excludes voided invoices** | Reports and Finance both show LKR 9,500 against 3 Active / 3 Void |
| All 9 report types | Render, with proper empty states where there is no data |
| Staff permissions | 17 assertions: 9 correctly allowed, 8 correctly refused |
| Offline config editing | Applied, cached, landed on the server after reconnect |
| Config propagation between devices | Works (timing figure retracted — see below) |
| Suggestions shared across devices | Written, recovered on a wiped device |
| Menu add / update / delete | Server-confirmed at each step |
| Derivation performance | `deriveOccupancy` 0.01 ms, `deriveStock` 0.03 ms |
| Accessibility hygiene | 0 nameless icon buttons of 162, 0 missing keyboard hints, 0 untyped form buttons |
| Touch targets | 0 controls under 44 px |
| Date handling | 0 raw UTC dates; all through `toDateISO()` |
| Error handling | 0 silent `catch {}` |

---

# Still untested

Do not read the list above as "everything else is fine".

- **A second check-in against an already-used reservation** (F1b step 4) —
  stopped deliberately to avoid a duplicate booking on live.
- **Guest Charges screen** and **interim bills** — never exercised.
- **PIN lock** — no PIN is set on the live device, so the shared-tablet
  protection is currently dormant. Worth knowing operationally.
- **Printing** — `window.print()` never sent to a real printer, and the
  printed invoice is the document the guest signs. F1a and F2 both affect
  exactly that document.
- **Real devices.** Two browser tabs share one Firestore cache, which
  already produced one retracted measurement in this project. Cross-device
  timing needs two real devices.
- **Real inboxes.** E-mails confirmed `Sent` with correct attachments;
  never opened in a guest's own mail client.
- **Scale.** Everything measured against 4 invoices, 161 dishes, 84 stock
  items. Reports at four hundred invoices is unknown.

---

# Test residue to clean up

Left on live by this audit, all clearly marked, none counting as revenue.

- Guest History shows stays named `ZZ Staff Probe`, `ZZ TEST`,
  `ZZ INVOICE TEST`, `ZZ RESERVATION TEST`. All checked out or cancelled.
- One malformed invoice record with no `id` or `grandTotal` field, status
  `Void` — written by raw SDK, and the cause of F15's symptom.
- `RES-2026/27-251`, status `Checked In`.
- Several `guestEmails` and one `invoiceEmails` row against test bookings.

Nothing here is deletable by design (`allow delete: if false`), which is
correct. They are inert.

---

## F16. The staging site was writing to the production database — **P0, fixed**

Not from the audit. Found while testing F3, because the new collection's
rules were deployed to the dev project and the app — reading live — was
refused.

`js/data/firebase-config.js` chose the project by hostname: **localhost →
DEV, every other address → LIVE.** `leopard-inn-dev.web.app` is every other
address.

| | Before |
|---|---|
| Hosting | `leopard-inn-dev` |
| Firestore + Auth | **`leopard-inn` — production** |
| What it could read | real invoices, real guest passport numbers |
| What it could write | anything reception can write |

The file's own comment said *"a mistake while building therefore cannot
land in a real guest's records."* True of localhost. The existence of a
`-dev` **hosting site** was never accounted for, so the one URL that looks
safest was the least safe thing in the project.

Nothing was damaged: the only write attempted during testing was to
`foodOrdersPending`, which production has no rule for, so it was refused.
Production stayed clean because a *different* fix was incomplete.

### Fixed

- `isTestHost()` replaces the bare `isLocal()` check: localhost, the dev
  project's two hosting domains, and Firebase preview channels
  (`<site>--<channel>-<hash>.web.app`) all resolve to DEV.
- **Unknown hosts still resolve to LIVE.** This is deliberate and is the
  conservative direction: the file cannot know every domain the portal
  might one day be served from, and sending real reception staff to a
  throwaway database would be worse than the bug being fixed. The rule
  names what is known to be test, not what is guessed to be live.
- A **strip across the top of the page** whenever the test database is in
  use. The `usingTestDatabase` flag was already being set and nothing had
  ever rendered it, which is precisely why this went unnoticed — a badge in
  a corner is something you stop seeing by the second day.

**Verified** against the shipped source, all eleven hosts:

```
leopard-inn.web.app               -> LIVE     leopard-inn-dev.web.app            -> TEST
leopard-inn.firebaseapp.com       -> LIVE     leopard-inn-dev.firebaseapp.com    -> TEST
leopardinnvillas.com              -> LIVE     localhost / 127.0.0.1 / 192.168.*  -> TEST
portal.leopardinnvillas.com       -> LIVE     leopard-inn--pr-12-a1b2c3.web.app  -> TEST
                                              (file://)                          -> TEST
```

### Still outstanding

`firestore.rules` gained the `foodOrdersPending` block for F3. It is
deployed to **dev only**. Promoting F3 to live needs:

```bash
firebase deploy --only firestore:rules --project leopard-inn
```

Without it, F3's code runs against production and every order write is
refused — the queue would look exactly as broken as before the fix.


---

## F7 — done, and it went further than `defer`

`defer` was the first attempt and it only solved half the problem: it
stopped the CDN scripts blocking *render* and did nothing about them
competing for *bandwidth*. All four are fetched on demand now
(`js/cdn.js`), and one of them turned out never to have been needed at all.

| Script | Decoded | Needed by | Now |
|---|---|---|---|
| `jspdf.umd.min.js` | 356 KB | Download PDF, e-mailed invoice, menu PDFs | on first PDF |
| `chart.umd.min.js` | 201 KB | the Finance screen only | on opening Finance |
| `html2canvas.min.js` | 194 KB | Save Image, PDF capture | on first use |
| `qrcode.js` | 55 KB | **nothing — zero references in the project** | **deleted** |

**806 KB decoded, on every visit, for a screen none of it appears on.**
The qrcode one is the clearest: 55 KB downloaded every time since whenever
it was added, for a global no file has ever called.

Measured on the same 0.15 Mbps link as before:

| | Before | After |
|---|---|---|
| `domInteractive` | 568 ms | 721 ms |
| `DOMContentLoaded` | **29,368 ms** | **8,173 ms** |
| CDN scripts at startup | 4 | **0** |

The 17-second hole in the middle of startup is gone, because the thing
filling it was 107 KB of library the page had no use for yet.

Verified that on-demand actually works, rather than assuming: `Chart`,
`html2canvas` and `window.jspdf` are all `undefined` on load and defined
after the matching `ensure…()` call, and a second call returns from cache
in 0 ms without a new request.

Every guard that used to read `typeof Chart === "function"` against a
script tag now awaits its loader — `dashboard.js`, `invoice.js`,
`invoice-pdf.js`, `menu-pdf.js`, `proforma.js` and `reservation.js`.
Missing one would have left that feature silently dead, since the tag it
was checking for no longer exists.

**F9's preload hints are still worth doing**, but they are now the only
remaining startup item rather than the biggest one.

---

## F3 — verified end to end, against the server

Run on dev as manager, Wilpattu, through the real screens:

| Step | Result |
|---|---|
| Place 1× Papaya Juice on Balcony Villa | `pending`, LKR 880, written with a doc id |
| **Reload** | **still pending** — this is what used to return 0 |
| Read `foodOrdersPending` with `getDocsFromServer` | 1 doc — on the **server**, not just the local cache |
| Complete it | exactly **1** `foodOrders` sale record, tied to room 7 and its booking id |
| Guest charge | `Papaya Juice qty=1 LKR880 room=7 cat=food` |
| Queue after | 0 on the server, "No pending orders right now." on screen |

`getDocsFromServer` rather than a plain read on purpose: this browser's
Firestore cache would have answered a normal query happily whether or not
anything had ever left the device, which is exactly the mistake that made
an earlier "config propagates in under a second" result meaningless.

### F6's withdrawal, confirmed in the running app

Both empty states render, and the check was given a control so a pass
means something:

| | Renders |
|---|---|
| no pending orders | "No pending orders right now." |
| search matching nothing | "No dishes match “zzzz-no-such-dish”." |
| **search matching something** | **no empty state** — so the check above can fail |


---

## F9 — done

ES modules are only discovered by parsing whoever imports them, so the
Firebase boot path (`main → sync → firestore-adapter → …`) was found four
levels deep and cost four sequential round trips. On the 0.15 Mbps link
the last five modules alone spanned 2.2 seconds with the connection
mostly idle.

Eight `<link rel="modulepreload">` hints in `index.html`, for exactly the
modules that were arriving late and are always needed:
`firebase-config`, `firebase`, `session`, `sync`, `firestore-adapter`,
`seed-config`, `occupancy`, `suggestions`.

| | Before | After |
|---|---|---|
| boot waves | 8 | **6** |
| first wave | 1 module | **9 modules** |
| last module arrives | 5,517 ms | **4,908 ms** |
| modules fetched twice | — | **0** |

The last row is the one that mattered to check. A `modulepreload` href has
to match the URL the import actually resolves to, and an import inside a
module carries no `?v=` — so a hint written as `js/data/sync.js?v=174`
would not error, it would silently download the whole boot chain twice.
Hence no version marker on those eight lines, and a duplicate-fetch count
in the verification rather than a glance at the timings.

**Startup, end to end, on the same slow link:**

| | Start of session | Now |
|---|---|---|
| `domInteractive` | 568 ms | 464 ms |
| `DOMContentLoaded` | **29,368 ms** | **4,923 ms** |
| CDN scripts at startup | 4 (806 KB decoded) | **0** |
| boot waves | 9 | **6** |
