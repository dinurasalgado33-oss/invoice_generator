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

### 4.1 Four lists render blank instead of saying they are empty — **Read, confirmed in source**

`orders.js` builds its pending list as `pending.map(...)` with no
fallback, and its dish search as `matches.map(...)` with the same. So:

- **No pending food orders** → a blank area, not "nothing waiting".
- **A dish search with no match** → a blank area, not "no dish matches
  that number".

The second is the worse one, because it happens during service and the
natural reading is "the app is broken" or "still loading", not "type
something else".

`history.js`, `inventory.js`, `menu.js`, `reservations.js` and
`rooms.js` all have proper empty states — the pattern exists, these two
lists just missed it. `proforma.js` and `dashboard.js` also show none,
though both may never legitimately render empty; unverified.

**Severity: moderate.** Nothing breaks; staff lose confidence in the
screen.

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

### 5.3 Two wizards, two different back labels — **Observed**

The registration card's first button is **Back**; the invoice form's is
**Previous**. Same control, same position, same job, two words. Small,
but this is the screen pair staff move between most.

### 5.4 The invoice PDF has a large blank middle — **Observed**

Signatures are pinned near the bottom of the page, so a one-line bill
leaves roughly a third of the page empty between the totals and the
signature lines. It reads as formal rather than broken, and a signature
block belongs at the foot of an invoice — but it is worth a deliberate
look, since most bills here will be short.

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
2. **Give the four empty lists an empty state** (§4.1). The pattern is
   already written in five other modules; this is copying, not designing.
3. **Add password reset** (§4.3). Everything else on this list costs
   somebody seconds. This one costs somebody a morning.
