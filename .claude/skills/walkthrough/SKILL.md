---
name: walkthrough
description: Walk the Leopard Inn portal the way reception and managers actually use it, on a phone-sized screen, against the dev database. Fix bugs found on the way, record UX findings without changing them, and write everything to a dated WALKTHROUGH file for review. Use when asked to audit the front end, hunt for bugs, or look for UX improvements.
---

# Walk the portal like the people who use it

Not a screen-by-screen inspection. A screen renders fine and the app is
still wrong — every bug this project has had was **silent**: nothing threw,
nothing reached the error log, and the app looked correct. Rendering is not
the test. Completing somebody's actual job is.

## Before anything else — the guard

```js
const cfg = await import('/js/data/firebase-config.js');
cfg.projectId();        // must be "leopard-inn-dev"
cfg.isLiveProject();    // must be false
```

**If it says `leopard-inn`, stop and tell the user.** The dev *hosting* site
once served code pointed at the *production* database, and every "safe" test
was hitting real guest records. Check the project, never the URL.

Then confirm the version you are testing is the version that is deployed:

```bash
curl -s "https://leopard-inn-dev.web.app/?cb=$(date +%s)" | grep -o 'v=1[0-9][0-9]' | head -1
```

Committing is not deploying. A pass against stale code is worth nothing.

**Walk at 375px.** `resize_window` to mobile first. Reception works
one-handed on a phone; a desktop pane hides every density problem there is.

## The journeys

Do the whole job through the real controls — real clicks, real typing, real
submits. Not by calling functions. A path is only walked if it ends in the
thing the person came for.

**Reception, front to back.** This is the spine; walk it first.
1. Take a reservation → confirmation exists and prints
2. Check that guest in from the reservation → card numbered, villa occupied
3. Put a food order on the villa → reload → it survives → complete it
4. Charge an activity
5. Check out → invoice → e-mail queued with its PDF
6. Find that stay again in Guest History and reprint each document

**Manager.** Configure sweep — every row opens, every field loads its real
value, every save persists and survives a reload. Publish a menu. Read
Reports and Finance and check a figure against a document you just made.

**Back office.** Inventory restock and usage. Staff accounts. Travel agent
invoice. Interim bills and Guest Charges — historically never exercised.

At each step ask the question that catches real bugs: **does this document
still say the same thing three screens later?** One fact stored twice is the
bug shape this codebase keeps producing.

## Two kinds of finding, handled differently

**A bug — fix it now.** Something is broken, invisible, or lying: a control
that does nothing, a value that disagrees with itself, a button with no
icon, a figure that is wrong. Fix it, verify it, record it.

**A UX finding — write it down and change nothing.** It works, it just costs
the user: too much scrolling, a field far wider than its content, an
unnecessary tap, a confusing label. **Do not fix these during the walk.**
The user reviews them and decides. Changing them unasked is how a walk turns
into an unreviewed redesign.

## Evidence standard

- **Make the check fail first.** Break the fix, watch the test go red,
  restore it. A test that cannot fail proves nothing. A promise cache that
  looked correct and changed nothing shipped past a passing check this way.
- **Measure, don't assume.** Count network requests, read
  `getBoundingClientRect`, read computed styles. "It looks right" is not a
  result.
- **A grep count is not a reading of the code.** A finding that says "X is
  missing" needs you to have looked at the place X would be. One finding was
  reported, and tagged "confirmed in source", from a zero grep count against
  a different class name. The feature had worked for three weeks.
- **Screenshot anything visual, at 375px.**
- **Check your own test's assumptions before reporting a failure.** Two
  walks produced eleven false alarms against three real bugs. Every one
  would have been a fabricated finding. Two causes account for nearly all
  of them, so check both before writing anything down:

  - **A bounding box is not a visibility test.** Closed sheets and inactive
    screens still report a height here, so "the visible button" routinely
    selects a hidden one. Three separate "this control does nothing"
    findings were pressing a hidden duplicate. Scope to the active screen
    and confirm the element is the one a person would touch.
  - **`document.querySelector` on a class is not screen-scoped** — the exact
    trap this audit checks the codebase for. `.live-summary` exists on two
    screens; reading the wrong one produced a confident report that the
    agent invoice totalled zero. Always `#screen-x .thing`.

  Two more that recur: a field name guessed rather than read (`grcNo` not
  `no`, `guest` not `guestName`) and a confirm dialog left unanswered while
  concluding the action did nothing.

## What to look for

Grounded in what has actually gone wrong here, not a generic checklist.

- **Silent failure.** Nothing errors and the app is wrong. Set a value, then
  read back what the screen shows *and* what the record stores.
- **One fact in two places.** The same number, list or sentence maintained
  in two spots, free to disagree.
- **Controls that look pressable and are not**, and controls that are
  pressable and look decorative.
- **0×0 icons, missing CSS rules, duplicate element IDs.**
- **Document-wide selectors on shared class names** — `.field`, `.stepper-item`
  and `.form-step` exist on several screens at once.
- **Anything hardcoded a manager would want to change** — see
  `HARDCODED-AUDIT.md`.

For anything form-shaped, judge against the standing laws: **Hick** (fewer
choices per screen, progressive disclosure), **Miller** (groups under five),
**Proximity** (labels bound tight to inputs), **Fitts** (a prominent primary
action), and **single-column vertical flow** — no zigzag. Count the screens
of scrolling and report the number.

## Output

Write `WALKTHROUGH-YYYY-MM-DD.md` at the repo root:

1. **What was walked, and what was not.** Be explicit about paths skipped
   and why. An audit that implies full coverage it does not have is worse
   than a short one.
2. **Bugs fixed** — what it was, why nothing errored, how it was verified.
3. **UX findings** — each with its cost to the user, in taps, seconds or
   scrolling, and a suggested fix. Ranked, most expensive first.
4. **If only three things get done** — the three with the best
   value-per-minute.
5. **Not established** — what a walk cannot tell you: printing, real
   devices, real inboxes, behaviour at scale.

Then summarise in chat and **stop**. Do not start fixing the UX findings —
wait to be told which ones.

## Never

- Touch the production database, or deploy to `leopard-inn`.
- Create or complete financial records anywhere but dev.
- Delete anything financial. Invoices are voided, charges written off.
- Enter a password. Ask the user to sign in; the session persists.
- Report something as working without having watched it work.
