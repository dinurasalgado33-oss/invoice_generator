# Leopard Inn — QA and UI/UX Audit

Written 2026-09-02, against hosting `v=162`, live project `leopard-inn`.
No code was changed for this audit. Nothing here is fixed.

Priority is given to the **happy paths** — the handful of things
reception does every day — because a rough edge on the fifth-most-common
screen costs somebody a minute a month, and a rough edge on checkout
costs them a minute every single time.

---

## 1. How this was done, and what it is worth

Two kinds of finding, marked throughout:

- **Observed** — walked in the live app on a 375px viewport, the phone
  reception actually uses, and measured.
- **Read** — found in the source and not exercised today. Lower
  confidence by definition.

Walked today: sign-in, branch pick, home, villa list, the full
registration card (4 steps), card preview, checkout, the full invoice
form (4 steps), invoice preview, invoice PDF, Manage Lists, Board Menu,
Inventory, Reports, Configure → Branch, proforma and reservation forms.

**Not covered, and worth saying plainly:** the signed-in half of this
audit ran earlier in the day; the session had expired by the time the
later checks ran, so some screens are Read rather than Observed. A
second pass with a live session would upgrade those. Multi-device
behaviour and a real guest's inbox are also outside what one browser can
prove — see §6.

---

## 2. Verdict

**The app is in good shape.** The hygiene checks that usually turn up a
list of problems came back clean:

| Check | Result |
|---|---|
| Icon-only buttons with no accessible name | **0** of 162 buttons |
| Numeric inputs missing a mobile keyboard hint | **0** |
| Buttons inside forms with no explicit `type` | **0** |
| Raw UTC date slicing instead of `toDateISO()` | **0** |
| Silent `catch {}` that swallows a failure | **0** |
| Controls under a 44px touch target | **0** |
| Distinct gap values between form fields | **1** |

Twenty modules call `showToast`, twelve call `confirmAction` before
something destructive, and there are seventeen guards against
double-submission. Somebody has already done this work.

So the findings below are mostly about **friction**, not breakage. The
single most valuable one is §3.1.

---

## 3. Happy paths — highest priority

### 3.1 Checkout costs seven taps to change nothing — **Observed**

This is the most common action in the building and the clearest win.

A checkout prefills everything: the guest, the villa, the nights, the
rate, the charges on the tab, the staff name. In the ordinary case the
person at the desk agrees with all of it. They must still tap:

```
Check Out  →  villa  →  Check Out  →  Next  →  Next  →  Next  →  Generate Invoice
```

Three of those taps change nothing. The stepper circles at the top —
which look tappable, and are the obvious thing to reach for — are
display-only: `goToStep` is wired to the Next and Previous buttons and
nothing else.

**Worth considering:**

- Make the stepper circles navigable. They already show progress; letting
  them move it is the smallest possible change and matches what people
  expect from a stepper.
- Or surface **Generate Invoice** from step 1 whenever nothing on later
  steps needs attention, with the Next path still there for the cases
  that do. The button already knows how to validate.

Either would take the most-repeated action in the app from seven taps to
three or four.

### 3.2 Check-in is three screens before the form — **Observed**

```
Check In  →  villa  →  Check In Guest  →  [4 wizard steps]  →  Check In & Print Card
```

Only two fields are genuinely required — the guest's name, and a passport
**or** NIC number. Everything else has a default or is optional. So the
minimum real check-in is two fields spread over four steps.

The validation itself is good and worth keeping: refusing to continue
without passport-or-NIC, with the message *"Enter a Passport No or an NIC
No — at least one is required"*, is exactly right — it names the rule
rather than just marking a field red.

**Worth considering:** the same stepper change as §3.1. A walk-in with a
passport could then be checked in from step 1.

### 3.3 The wizards are honest about progress — **Observed, good**

Both wizards announce `Step 2 of 4: Stay` to assistive technology and
show a numbered stepper. Neither pretends the form is shorter than it is.
Keep this if the steps get collapsed.

---

## 4. QA findings

### 4.1 ~~Four lists render blank instead of saying they are empty~~ — **WITHDRAWN, this finding was wrong**

**Retracted 2026-09-04, while fixing it.** The empty states are there, and
were there when this audit was written.

`js/orders.js:309` renders "No pending orders right now." when nothing is
pending, and `js/orders.js:131` renders "No dishes match “…”." when a
search finds nothing. Both have existed since commit `c2365f1`
(2026-08-15) — three weeks before the commit this audit was run against.

**How it happened**, recorded because the shape will recur: the check was a
grep of `orders.js` for `list-empty`, the class the other five screens
use. It returned nothing. `orders.js` spells the same thing
`room-detail-empty`, so a different class name for a present feature was
indistinguishable from an absent feature — and the render was never read.

Worse, this section was tagged **"Read, confirmed in source"**. It was not.
The tag was applied to a grep result. **Every finding in this document
carrying that tag needs the same re-check before it is acted on** — read
the render, do not trust the count. §4.1 is the only one withdrawn so far,
but it is the only one that has been re-checked this way.

The one true residue is cosmetic: `orders.js` uses
`.room-detail-empty` where five other modules use `.list-empty`. Both
render correctly. Not worth a change.

### 4.2 Four of six search fields cannot be cleared — **Observed**

| Field | Clear button |
|---|---|
| Inventory search | ✅ |
| Menu search | ✅ |
| Order search | ❌ |
| Guest history search | ❌ |
| Reservations search | ❌ |
| Reports search | ❌ |

On a phone, clearing a field without a button means selecting the text
and deleting it, one-handed, usually while somebody is waiting. The
pattern already exists twice in this app; it is inconsistently applied.

**Severity: low, but cheap to fix and felt daily.**

### 4.3 There is no way to recover a forgotten password — **Observed**

No reset link on the login screen, and no `sendPasswordReset` anywhere in
the app or the Functions. A staff member who forgets their password must
find a manager, who must go into the Firebase console.

Firebase Auth provides this natively, and the Staff screen would be the
natural place for a manager to trigger it.

**Severity: moderate — it is a Sunday-morning problem.** Nobody notices
until somebody is locked out at 6am with a guest waiting.

### 4.4 The password field cannot be revealed — **Observed**

No show/hide toggle. Typing a password blind on a phone keyboard, on a
shared device, is where sign-in failures come from — and the app cannot
tell a typo from a wrong password, so the error message cannot help.

**Severity: low.** Pairs naturally with 4.3.

### 4.5 Neither login field takes focus on load — **Observed**

`document.activeElement` is `BODY`. Every sign-in starts with a tap that
carries no information.

**Severity: very low.** Worth doing only alongside 4.3 or 4.4.

---

## 5. UI/UX observations

### 5.1 What is already right, and should not be "improved"

Listed because the next person to touch this should know these were
decisions, not accidents.

- **The connection indicator in the header** (`Online · Fast` / `Offline`)
  is exactly the right thing for a property on bad signal. It tells staff
  whether what they just did has left the building.
- **The PIN lock with a 10-minute idle default** fits a shared tablet at a
  desk, and has a documented way out for somebody who has forgotten it.
- **Charges are remembered when an interim bill is abandoned.** The
  comment in `rooms.js` explains that clearing them lost a guest's food
  when staff pressed Back. That is the kind of fix that only comes from
  watching somebody use the thing.
- **Unpriced dishes are offered as unavailable with a reason** rather than
  silently billing zero.
- **Validation messages name the rule**, not the field.

### 5.2 The stepper looks interactive and is not — **Observed**

Covered in §3.1, repeated here because it is as much a UI honesty problem
as a speed one. A control that looks pressable and does nothing teaches
people to distrust the rest of the interface.

### 5.3 Two wizards, two different back labels — **Observed, FIXED 2026-09-04**

The registration card's first button is **Back**; the invoice form's is
**Previous**. Same control, same position, same job, two words. Small,
but this is the screen pair staff move between most.

**Fixed.** Both now say **Previous** and **Next**, with matching arrow
icons. "Previous" rather than "Back" on purpose: the registration card
screen already has a `← Back` in its header meaning something different —
leave the card, rather than go up a step. Two buttons both saying "Back",
doing different things, on one screen.

This finding was never given an F-number and so was not in the fix plan's
status table. It was found by re-reading the audit section by section
after every F-item was closed, which is the check worth repeating: a
finding that never became a task is invisible to a list of tasks.

### 5.4 The invoice PDF has a large blank middle — **Observed, still open — your call**

Signatures are pinned near the bottom of the page, so a one-line bill
leaves roughly a third of the page empty between the totals and the
signature lines. It reads as formal rather than broken, and a signature
block belongs at the foot of an invoice — but it is worth a deliberate
look, since most bills here will be short.

**Still open, deliberately.** The audit's own wording — "reads as formal
rather than broken", "a signature block belongs at the foot of an invoice"
— makes this a judgement about how the hotel wants its bills to look, not
a defect. It is also the one document a guest signs, so it should not be
changed on an assumption.

Note that the PDF has since been rewritten to capture the on-screen
preview 1:1, so the printed layout now follows the preview exactly;
whatever is decided here should be decided about the preview.

---

## 6. What this audit could not establish

Stated so the gaps are not mistaken for clean results.

- **Anything needing a live session, after the session expired.** The
  screens listed as Read in §4 were not re-walked signed in today.
- **Two genuinely separate devices.** Both "devices" available here are
  tabs of one browser, and tabs share Firestore's cache — a fact that
  already produced one false measurement in this project (see
  `EXECUTION-PLAN.md` §16). Multi-device timing claims need two real
  devices.
- **A real guest's inbox.** Welcome and invoice e-mails were confirmed
  `Sent` and confirmed to carry the right attachment, but how they render
  in the guest's own mail client — Outlook in particular, which is
  unkind to HTML e-mail — is untested.
- **Printing.** `window.print()` was never exercised against a real
  printer, and the printed invoice is the document the guest signs.
- **Anything under load.** Reports and the dashboard were seen with four
  invoices. Behaviour at four hundred is unknown.

---

## 7. If only three things get done

1. **Make the stepper navigable** (§3.1). It shortens the two most
   repeated flows in the app and removes a control that lies.
2. ~~**Give the four empty lists an empty state** (§4.1)~~ — withdrawn,
   the empty states were already there. Do **F3/F4** instead: persist the
   pending food-order queue. Today it lives only in memory, so a reception
   phone that reloads mid-service loses orders that were never billed —
   money out of the till, not seconds off a flow.
3. **Add password reset** (§4.3). Everything else on this list costs
   somebody seconds. This one costs somebody a morning.


---

# Second pass — the paths the first pass skipped

Added 2026-09-02, after walking reservation-to-check-in. Everything below
is **Observed** on the live app.

The first pass stopped at the paths I had already touched. That was the
wrong place to stop: the first unwalked path produced the most serious
findings in either audit.

## 8. One root cause, four broken hides — **HIGH**

`.field { display: flex }` in `base.css` **overrides the `hidden`
attribute.** A class selector beats the browser's own `[hidden]` rule, so
`element.hidden = true` sets the attribute and changes nothing on screen.

Four elements are affected. Each was tested by setting `hidden = true` and
checking `offsetParent`:

| Element | Class | Meant to hide when | Actually hides |
|---|---|---|---|
| `grc-reservation-picker` | `.field` | no reservation matches this villa | ❌ |
| `prev-vat-row` | `.totals-row` | VAT rate is 0 | ❌ |
| `exchange-rate-field` | `.field` | currency is LKR | ❌ |
| `history-more-btn` | `.secondary-btn` | nothing more to load | ❌ |

Six other uses of `hidden` were checked and work correctly — the void
banner, the lock overlay, the proforma notes, the reports filters. Those
elements' classes happen to set `display: none` themselves.

### 8.1 The check-in screen offers a reservation that belongs to another villa — **HIGH**

The worst consequence, and it is on the primary check-in path.

`grc.js:190` filters correctly: only `Confirmed` reservations whose villas
include the one being checked into. But:

```js
picker.hidden = matchingReservations.length === 0;
if (matchingReservations.length) {
  el("grc-reservation-select").innerHTML = …   // only rewritten when there ARE matches
}
```

When there are no matches the picker is "hidden" — which does nothing —
**and the dropdown is never cleared**, so the options from the last villa
stay in the DOM and on screen.

Observed, in order:

1. Created `RES-2026/27-251` for Pool Villa 1 and checked the guest in
   against it. Reservation correctly closed to `Checked In`.
2. Opened a check-in for **Pool Villa 2**. That villa has no reservation,
   so the picker should be hidden.
3. The picker was **visible**, still offering `RES-2026/27-251` — a
   reservation that is already used and belongs to a different villa.
4. Selecting it filled the form with no warning **and overwrote the villa
   field with "Pool Villa 1"** — the villa the guest is already in, while
   reception is standing at Pool Villa 2.

I stopped before submitting rather than create a duplicate booking on
live, so whether a second check-in completes is untested. Everything up to
that point is observed.

### 8.2 Every zero-VAT invoice prints a bare "VAT" line — **HIGH**

`invoice.js:440` carries this comment:

> *A rate of zero means the hotel is not registered for VAT — printing
> "VAT 0.00" would imply it is.*

The guard is `vatRow.hidden = !showVat`, and it does not work. Observed on
`INV-2026/27-201`, `vatRate: 0`:

```
Bill Total              LKR 9,500.00
Service charge for food LKR 0.00
Gross Amount            LKR 9,500.00
Net Amount              LKR 9,500.00
VAT                                     ← visible, no figure at all
Advance                 -
Grand Total             LKR 9,500.00
```

Worse than the "VAT 0.00" the comment feared: an empty line item on a
document the guest signs and keeps. The label and amount are only *filled
in* when VAT applies, so the row shows whatever markup shipped.

**The PDF is not affected.** `invoice-pdf.js` tests `Number(r.vatRate) > 0`
in JavaScript rather than relying on `hidden`, so the attached and
downloaded copies are correct. Only the on-screen and printed HTML is
wrong — which is the copy handed across the desk.

### 8.3 The exchange-rate field never hides — **MEDIUM**

`syncExchangeRateField()` hides it for LKR. It does not hide. Every
invoice, including the ordinary rupee ones, shows an exchange-rate box
staff must learn to ignore. The value is cleared correctly, so nothing is
mis-billed; it is clutter on the busiest form in the app.

## 9. The invoice number is labelled "Reservation No" — **HIGH**

Separate from §8, and on the same document.

```html
<p><span>Reservation No</span> <strong id="prev-number">INV-2026/27-201</strong></p>
```

The invoice number prints under the label **Reservation No**. The guest
block further down then has its own **Reservation No** row, showing
`N/A`.

So the printed invoice carries two fields with the same label, one holding
the invoice number and one holding the actual reservation number. A guest
querying a charge, or an agent reconciling a voucher, is being given the
wrong name for the number they will quote back.

## 10. Reservation to check-in works — **verified, no issues**

The path itself is sound, and worth recording as tested:

| Step | Result |
|---|---|
| Create reservation | ✅ `RES-2026/27-251`, status `Confirmed` |
| Villa rate auto-fills from config | ✅ LKR 9,500 |
| Offered on the matching villa's check-in | ✅ |
| Guest details carry across | ✅ name, phone, dates, pax, villa |
| Reservation number stamped on the card | ✅ |
| Reservation closes on check-in | ✅ → `Checked In` |
| Booking links back to the reservation | ✅ `reservationId` |
| Villa becomes occupied | ✅ |

Everything the flow is supposed to do, it does. The defect is in what
happens on the *next* check-in, per §8.1.

## 11. Revised priority

Replacing §7 of the first pass:

1. **Fix the `hidden` override** (§8). One CSS rule — `[hidden] { display:
   none !important }` — closes all four at once, including a wrong line on
   every zero-VAT invoice and a reservation picker that offers the wrong
   villa's booking. Cheapest fix in either audit, largest blast radius.
2. **Relabel the invoice number** (§9). One word on a document guests keep.
3. **Stop losing pending food orders** (`CODE-AUDIT.md` §1.1).
4. **Make the stepper navigable** (§3.1) — still the biggest daily
   time saving.

## 12. Paths still unwalked

Honest list, unchanged except where noted:

- **Reports and Finance** — the screens a manager uses to see what the
  hotel earned. Still untested with data, and still the largest gap.
- **Guest History reprint**, **Charge Activity**, **Guest Charges**,
  **interim bill**, **PIN lock**.
- **A second check-in against a used reservation** (§8.1 step 4) — stopped
  deliberately.
- **Printing**, **real devices**, **real inboxes**, **scale** — unchanged
  from the first pass.
