# Walkthrough — 4 September 2026

Walked on **dev** (`leopard-inn-dev`, `isLive: false`), against `?v=190`,
confirmed deployed before starting. Signed in as **manager**. Viewport
**375 × 812**.

One bug found and fixed. Five UX findings recorded and not touched. Five of
my own checks reported failures that turned out to be the probe, not the
app — listed at the end, because that ratio is the point.

---

## 1. What was walked, and what was not

### Walked, end to end

The reception spine, as one continuous job on one guest (`ZZ WALK GUEST`):

| Step | Result |
|---|---|
| Take a reservation | `RES-2026/27-251`, Confirmed, Pool Villa 1 @ 9,500 × 2 |
| Check in from that reservation | `GRC-2026/27-251`, villa occupied, reservation → Checked In |
| Food order on the villa | placed, **survived a reload**, completed |
| Charge an activity | Half Day Safari, 17,000 |
| Check out → invoice | `INV-2026/27-301`, 36,968 |
| Invoice e-mail | Queued to the address on the card |
| Reprint all three from Guest History | Card ✓ Reservation ✓ Invoice ✓ |
| Finance | revenue reads 36,968 — the same invoice |

Plus a structural sweep of all 35 screens and a density measurement of the
ten form-shaped ones.

### Not walked

- **Arugam Bay.** Wilpattu only. Every per-branch behaviour is untested at
  the other property.
- **Staff (non-manager) permissions.** Walked as a manager throughout, so
  every rule that refuses a receptionist is unexercised here.
- **Interim bills** and the **Guest Charges** screen.
- **Travel agent invoice, end to end.** Measured, never generated.
- **Inventory restock and usage**, **Staff accounts**, **board menu editing**.
- **Menu publish.** Not run — it uploads ~1 MB per menu and the dev bucket
  has no CORS policy.

---

## 2. Bug fixed

### Every dropdown was a tab stop on something invisible — **fixed**

`js/dropdown.js`. The native `<select>` behind each custom dropdown is only
*invisible* — `opacity: 0`, `pointer-events: none` — deliberately, because
`display:none` and `hidden` both remove a field from constraint validation
and would quietly stop `required` working.

But invisible is not gone. All **21** enhanced selects still had
`tabIndex: 0` and no `aria-hidden`, so:

- a keyboard user tabbed onto a control they could not see, once per
  dropdown;
- a screen reader met every dropdown **twice** — once as the select, once
  as the button.

Nothing errored. Nothing looked wrong. It is only visible if you tab.

**Fix:** `tabindex="-1"` and `aria-hidden="true"` on the native element.
Both do exactly the two things wanted and neither touches validation.

**Verified with a failing-first check** on `?v=191`:

```
enhanced selects        20
still in tab order       0
aria-hidden             20
when I break one         1   ← the check can fail
after restoring          0
```

No select in the app is currently `required`, so the related hazard — a
hidden `required` field failing validation and throwing "not focusable" —
does not fire today. It would the first time someone adds `required` to
one. Worth knowing.

---

## 3. UX findings — not changed, awaiting your decision

### F-A. The reservation confirmation prints no reservation number — **high**

The document the guest receives has 27 fields — hotel, guest, dates,
villas, bank details, conditions — and **no element for the reservation
number anywhere**. Verified twice by different routes: a scan of every
`resv-prev-*` element found no candidate, and reprinting from Guest History
produced a document containing no `RES-…` string.

The other two documents do print theirs:

| Document | Number printed |
|---|---|
| Registration card | `GRC-2026/27-251` |
| Invoice | `INV-2026/27-301` |
| **Reservation confirmation** | **none** |

**What it costs.** The guest cannot quote a reference. Reception's own
search offers "Guest name or reservation no" — a number the guest was never
given. The invoice form has a "Reservation No" field for staff to type in,
which they can only do from the app, never from the guest's copy.

**Suggested fix:** print it beside the date in the confirmation header,
where the invoice prints its own. Not done here because it changes a
guest-facing document, which is your call.

### F-B. The travel agent invoice is the tallest screen in the app — **medium**

1.57 screenfuls for **six inputs** — and measured with an *empty* villa
list, so real use is worse.

The cause is measured, not guessed: three `.section-title` headings cost
**183px** between them (33px each plus a 28px margin and a border rule).

The reservation and check-in forms were moved to a lighter `.group-title`
(small, uppercase, 8px margin) during the redesign. This form was never
brought along, so the app now has **two heading systems doing the same
job**.

| Screen | Screenfuls | Inputs |
|---|---|---|
| **Travel agent invoice** | **1.57** | 6 |
| Configure | 1.50 | 0 (12 rows) |
| Invoice | 1.32 | 17 |
| Reservation | 1.24 | 11 |
| Hotel & bank details | 1.23 | 8 |
| Registration card | 1.17 | 34 (wizard) |

**Suggested fix:** same treatment the reservation form got — `.group-title`
headings and `.field-row` pairs. Should take it near 1.0.

### F-C. Fifteen controls are under the 44px touch minimum — **medium**

Measured at 375px across all screens:

```
add-condition-btn / add-activity-btn / add-notice-btn / add-cancellation-btn   38 × 38
report-tab  (Orders, Reservations — 6 tabs)                                    37 tall
open-board-menu-btn                                                            141 × 39
bm-add-block                                                                   120 × 39
resv-add-villa-btn                                                             119 × 42
cfg-invoice-goto-charges                                                       159 × 39
login-reset-btn                                                                159 × 32
```

The last two are mine, added this week.

**Note for the record:** `QA-UX-AUDIT.md` states *"Touch targets — 0
controls under 44 px"*. That claim is now wrong. Either it was measured
differently or it was wrong when written.

### F-D. Two number-control designs coexist — **low**

The reservation and registration card use `.num-field` (the new compact
±). Room activities and food orders still use `.stepper-input`. Same job,
two appearances, on screens reception moves between constantly.

**Suggested fix:** migrate `.stepper-input` call sites to `.num-field` and
delete the older CSS.

### F-E. The guest's e-mail is typed fresh at check-in — **low**

The reservation form collects a phone number but **no e-mail**. The
registration card collects an e-mail but has nothing to prefill it from.
The welcome e-mail — which carries the menu — depends entirely on that
field being typed correctly at the desk, with a guest waiting.

The phone number *does* carry (`card.phone` = `+94 771234567`), so the
plumbing exists; only e-mail is missing at the reservation end.

**Suggested fix:** an optional e-mail field on the reservation form,
prefilling the card the way the phone already does.

---

## 4. If only three things get done

1. **F-A — print the reservation number on the confirmation.** One field.
   Every other document already does it, and staff search by a number the
   guest has never seen.
2. **F-B — give the agent invoice the density pass.** It is the tallest
   screen in the app for the fewest inputs, and the fix is a pattern that
   already exists and is already proven on two other forms.
3. **F-C — the four 38×38 add buttons.** They are the primary action on
   their screens and they are the smallest controls in the app.

---

## 5. Verified working — do not spend time here

- **Charges are billed by booking, not by room.** Villa 8 carried two
  orphan charges from earlier bookings (1,000 and 4,500). The checkout
  invoice contained exactly three lines — room 19,000, Papaya Juice 880,
  Safari 17,000 — and **neither orphan**. This is the most important
  correctness property in the app and it holds.
- Service charge arithmetic: 880 of food × 10% = 88; grand total 36,968.
- Finance revenue equals the invoice, to the rupee.
- A pending food order survives a reload (F3, in a real journey this time).
- The check-in reservation picker offers only *that villa's* reservation
  (F1b).
- Custom dropdowns work through real interaction — open, options, choose,
  the value reaching the record.
- 0 duplicate element IDs across 35 screens; 0 unenhanced `<select>`; no
  cross-screen class selectors.

---

## 6. Five checks that failed and should not have

Recorded because the ratio matters — one real bug against five bad probes.

| My check said | Actually |
|---|---|
| 8 zero-sized icons in the steppers | the tick SVGs, `display:none` until a step is done |
| The registration card has no number | the field is `grcNo`, not `no` — `GRC-2026/27-251` |
| No welcome e-mail was queued | it was; I filtered on a field the record does not have |
| The invoice was not created | the field is `guest`, not `guestName` |
| The reservation's phone did not carry | it did — `card.phone` = `+94 771234567` |

Every one would have been a false finding in this document. The rule that
caught them all: **check your own probe's assumptions before reporting a
failure.**

---

## 7. Not established by a walk

- **Printing.** `window.print()` was never sent to a printer, and the
  printed invoice is the document a guest signs.
- **Real devices.** One browser at an emulated 375px is not a phone on
  Sri Lankan mobile data.
- **Real inboxes.** Two e-mails reached `Queued`. Neither was opened.
- **Scale.** Four invoices, 68 dishes. Reports at four hundred invoices is
  unknown.
- **The other property**, **staff permissions**, and the paths listed as
  not walked in §1.

---

## 8. Test residue left on dev

All under `ZZ WALK GUEST`, nothing on production.

- `RES-2026/27-251` — Checked In → checked out
- `GRC-2026/27-251`
- `INV-2026/27-301`, 36,968, Active
- Two guest charges and one food sale against booking `47757532`
- One queued welcome e-mail and one queued invoice e-mail to
  `zz-walk@example.test`

Financial records are undeletable by design, which is correct. They are
inert and clearly named.

---

# Fix phase — 4 September 2026

All five findings built and verified on dev at `?v=199`. **Not yet on
production**, which is still `?v=190`.

| | Finding | State |
|---|---|---|
| **F-A** | Confirmation printed no reservation number | ✅ prints it |
| **F-B** | Agent invoice tallest screen | ✅ 1.57 → 1.39 screenfuls |
| **F-C** | 15 controls under 44px | ✅ 0 — plus 2 the first sweep missed |
| **F-D** | Two number-control designs | ✅ appearance converged, classes still two — see below |
| **F-E** | E-mail typed fresh at check-in | ✅ taken at reservation, carried to the card |
| *(bug)* | Dropdowns in the tab order | ✅ fixed during the walk, ships with this batch |

## What each was verified against

- **F-A** — reprinted from Guest History, not a freshly created document, so
  it survives the whole lifecycle. `RES-2026/27-251` printed, no overflow,
  no sideways scroll. **The first attempt overflowed** the right edge at
  375px and cut the number in half — the whole point of the change. It
  wraps below the title on narrow screens now.
- **F-B** — three `.section-title` headings swapped for `.group-title`,
  saving 144px. None left on the screen.
- **F-C** — 15 → 0 across all 35 screens, with a shrink-it-back check to
  prove the measurement could fail.
- **F-D** — appearance matched on the real Orders screen; +/- still adds and
  removes.
- **F-E** — made `RES-2026/27-252` with an address, checked in from it, and
  watched the card go blank → that address with "no e-mail" unticked. Both
  branches of the guard proven separately.

## Two things I got wrong, corrected

**F-C's "15 → 0" was measured against a screen that had not finished
existing.** The food-order quantity buttons are 34×34 — the smallest
controls in the app and the most pressed, one per dish line — and the sweep
never saw them, because the dish list only renders once a villa is chosen.
Found while doing F-D. They are 44×44 now, verified with the list rendered.

**F-D was not the change the finding described.** It assumed one control
with two styles. It is two different controls: `.num-field` wraps an
`<input>`; the food-order quantity is a `<span>` between two buttons.
Merging them means converting reception's most-tapped control from a span
to an input, which risks more than the inconsistency costs. The appearance
is converged, which is the part anybody notices; the classes remain two,
deliberately, with a note in the CSS saying why.

## Density, honestly

Two of these findings pull against each other: bigger touch targets make
screens taller.

| Screen | Before the walk | After all five |
|---|---|---|
| Agent invoice | 1.57 | **1.39** |
| Reservation | 1.24 | **1.34** |
| Invoice | 1.32 | 1.35 |
| Registration card | 1.17 | 1.17 |

The agent invoice went 1.57 → 1.30 on the heading change alone, then back
to 1.39 once every control cleared 44px. I predicted "near 1.0" in the
finding; that was optimistic, and the rest is the live totals summary
(209px) and the charges table, neither of which is a heading problem.

The reservation form is up 0.10 for the e-mail field. **My first version
cost 0.26** — a two-line hint under the field took it to 1.50, nearly back
to where the agent invoice started. The hint is folded into the label now.

## Still open

- **§F-B's remainder.** Getting the agent invoice under 1.2 means
  reconsidering the 209px live totals summary. Not attempted; it is a
  design decision, not a cleanup.
- Everything in §7, unchanged: printing, real devices, real inboxes, scale,
  the other property, staff permissions.

## Test residue added by the fix phase

`ZZ EMAIL CARRY` / `RES-2026/27-252` on dev, Confirmed, never checked in.
Nothing on production.
