# Walkthrough — 5 September 2026

Second pass, aimed at the paths the first walk skipped rather than the
reception spine it already covered.

Walked on **dev** (`leopard-inn-dev`, `isLive: false`) against `?v=199`,
confirmed deployed first. Signed in as **manager**. Viewport 375 × 812.

**One serious bug found and fixed: no travel agent invoice has ever been
saved, on dev or production.** It is fixed on dev; production still has the
faulty rule.

---

## 1. What was walked, and what was not

### Walked

| Path | Result |
|---|---|
| **Travel agent invoice, end to end** | **BUG — nothing was ever stored.** Fixed, verified |
| Void an invoice, and revenue after | works — revenue fell by exactly the invoice |
| Inventory restock | works — stock 10 → 17, derived correctly |
| Reports | all **9** types offered |
| Structural sweep, 35 screens | clean |
| Density, every screen holding inputs | measured |
| Accessible names on every control | clean |

### Not walked, and why

- **Interim bills** ("Bill this now, keep stay open") — reached the control,
  never exercised it.
- **Guest Charges screen** — still never opened, two walks running.
- **Inventory usage logging** — found the sheet, never submitted it.
- **Staff accounts**, **board menu editing**, **menu publish**.
- **Arugam Bay.** Wilpattu only, again. Every per-branch behaviour remains
  untested at the second property.
- **Staff-level permissions.** You could not sign a staff account in, so
  this was a manager throughout. A manager passing every rule proves
  nothing about what a receptionist is refused — that is the largest
  untested area in the app and it has now survived two walks.

---

## 2. Bug fixed — travel agent invoices could never be saved

`firestore.rules:124` collapsed create and update onto one line:

```
allow create, update: if mayWriteIncoming() && mayTouchExisting();
```

`mayTouchExisting()` asks about `resource` — the document **already
stored**. On a create there isn't one, so it is always false, and **every
create this collection has ever seen was refused.** Every other collection
in the file splits the two; this was the only one that did not.

### Why nothing looked wrong

The invoice rendered. It took a number from the device's block. It showed
the agent a finished, correct document with the right villa, nights and
total. The write was refused in the background, and the next snapshot
spliced the local array back to what the server held — taking the record
with it. No error on screen, nothing in the app to suggest anything had
happened.

Found by walking the path, not by reading the rules: the document said
`TRA-2026/27-301` and `PROFORMA_INVOICES.length` was `0`.

### Verified with the cleanest control this project has had

Two documents, one either side of the fix, on the server:

```
TRA-2026/27-301   generated BEFORE   →  absent from the server
TRA-2026/27-302   generated AFTER    →  present, and survives a reload
```

### Still to do — production

Rules are deployed to **dev only**. Production has the faulty rule, so any
agent invoice raised on the live system was never stored. Fixing it is one
command and it is your call:

```bash
firebase deploy --only firestore:rules --project leopard-inn
```

There is a second question underneath it, which is a business decision
rather than a code one: **agent invoices raised on production before today
do not exist as records.** Whether any need re-raising is not something a
walkthrough can answer.

---

## 3. UX findings — not changed

### F-F. Inventory opens with no stock levels visible — **medium**

The screen whose job is checking stock shows none of it on arrival. Items
sit behind a department row and a category row, both collapsed, so a
manager opening "Log Inventory" sees group headings and has to tap before a
single number appears.

Measured: **0 item rows visible on open**, 1 after a tap.

**Suggested fix:** open with the first department expanded, or remember the
last expanded state per device. Low-stock items in particular should
probably be visible without a tap, since they are the reason to open the
screen.

### F-G. Two "Save Restock" buttons exist in the document — **low**

The single-item restock sheet and the bulk restock sheet each have a button
with exactly that label. Harmless to a person, who only ever sees one — but
it is the same shape as the duplicate-`id` bug this project has already had,
and it cost this walk three failed attempts before I noticed I was pressing
the hidden one.

**Suggested fix:** distinct labels ("Save Restock" / "Restock All"), which
is also clearer for a screen reader listing the page's controls.

---

## 4. If only two things get done

1. **Deploy the rules fix to production.** Everything else here is comfort;
   this one means a document your staff hand to travel agents is not
   recorded anywhere.
2. **F-F — show some stock on the Inventory screen.** It is the one screen
   whose entire purpose is visible on arrival, and it isn't.

---

## 5. Verified working

- **Voiding an invoice.** Status → Void, reason and `voidedBy` recorded, the
  invoice **not deleted**, and active revenue fell by 36,968 — exactly the
  invoice total.
- **Restock.** Stock 10 → 17 after a +7, derived from the movement log
  rather than stored. The arithmetic checks out end to end: opening 10,
  +7 restocked, −7 used = 10 before this walk's restock.
- **All 9 report types** are offered.
- **Agent invoice figures.** Villa, nights and rate carried from the
  reservation exactly — Pool Villa 2, 2 nights, 10,500, 21,000 — and the
  totals panel agreed.
- **Structure**: 0 duplicate IDs, 0 unlabelled inputs, 0 unnamed controls,
  0 unenhanced selects, 0 native selects in the tab order.
- **No manager-facing policy is hardcoded** in `js/data/` — the constants
  there are timers, number-block sizes and internal status strings.

---

## 6. Method note: my probes were wrong far more often than the app

This walk produced **one real bug and roughly six false alarms of my own
making** — on top of five in the previous walk. Every one would have been a
fabricated finding.

| I reported | Actually |
|---|---|
| 3 dropdowns announce nothing | they carry `aria-labelledby`; my check never looked at it |
| Agent invoice totals read 0.00 | I read the **invoice screen's** `.live-summary`, not the proforma's |
| Restock does nothing | I was clicking a hidden duplicate of the button |
| Inventory groups will not expand | they do; the render replaces the row, so my second click hit a detached node |
| Void does nothing | a confirm dialog was open the whole time and I never answered it |
| Zero-sized stepper icons | the tick SVGs, `display:none` until a step is done |

Two patterns account for nearly all of them:

- **`getBoundingClientRect().height > 0` is not a visibility test here.**
  Sheets that are closed still report a height, so "the visible button"
  routinely selected a hidden one.
- **`document.querySelector` on a class is not screen-scoped** — the exact
  trap this audit checks the codebase for. `.live-summary` exists on two
  screens and I read the wrong one.

Worth folding into the skill: scope every query to the active screen, and
never trust a bounding box as proof something is on screen.

---

## 7. Not established

- **Printing.** Never sent to a printer, two walks running.
- **Staff permissions** — the largest untested area in the app.
- **Arugam Bay** — every per-branch behaviour.
- Real devices, real inboxes, behaviour at scale.
- Interim bills, Guest Charges, staff accounts, board menu, menu publish,
  usage logging.

---

## 8. Test residue on dev

- `TRA-2026/27-302` — agent invoice, ZZ AGENCY AFTER FIX, 21,000
- `INV-2026/27-301` — **voided**, reason "ZZ walkthrough test void"
- Chicken restocked +7 (stock now 17)
- `RES-2026/27-252` / `ZZ EMAIL CARRY` — still Confirmed

Nothing on production.
