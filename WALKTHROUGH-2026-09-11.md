# Walkthrough — 11 September 2026

Manager account, `leopard-inn-dev`, 375px, v=232 (deployed to dev hosting
before walking, so the version under test is the version deployed).

Guard: `projectId() === "leopard-inn-dev"`, `isLiveProject() === false`.
Production was not touched.

---

## 1. What was walked, and what was not

**Walked end to end, through the real controls:**

The reception spine, as one continuous stay:

| Step | Result |
|---|---|
| Reservation | `RES-2026/27-551` — Mr Walkthrough Trial, 3 nights, HB, Balcony Villa |
| Check-in from that reservation | `GRC-2026/27-551` — every field carried, total LKR 31,500 |
| Villa invoice at check-in | `INV-2026/27-601` — 28,500 + 3,000 HB, service 300, **31,800** |
| Villa stayed occupied | booking still open — the `kind: "villa"` guard holds |
| Food order | refused with no meal; placed as Lunch; billed `Papaya Juice — 11 Sept, Lunch` |
| Survived a full page reload | order still pending, villa still occupied |
| Activity | Night Safari 15,000, category `safari` |
| Checkout | `INV-2026/27-602` — 16,760 + 176 service = **16,936**, no villa lines |
| After checkout | villa `available`, tab 0 |
| Guest History | Card, Reservation, Villa, Food & Activities — all four reprint the right document |
| E-mail queue | both invoices Queued, PDFs attached (434KB / 433KB), `kind` villa and charges |
| Reports | both invoices listed Active; revenue 279,228 over 13, average 21,479 — consistent |

Also walked: Configure → Branch Details (loads and saves real values),
Reservations list and its four tabs, the printed-menu editor, screen
transition directions across all 36 screens.

**Not walked, and why:**

- **Arugam Bay.** Every step above is Wilpattu. A full stay at the other
  property has still never been walked, and it is the one with the
  cocktail-menu split and six villas.
- **Inventory restock and usage, staff accounts, travel-agent invoice,
  interim bills, Guest Charges.** Ran out of session before these. The
  agent invoice and interim bills remain the least-exercised paths in the
  app, as in previous walks.
- **Printing, real inboxes, real devices.** Queued is not sent, and a PDF
  in a queue is not a sheet of paper.
- **Menu publishing.** Parked; dev Storage CORS is still unconfigured and
  throws on every Menu screen visit.

---

## 2. Bugs found and fixed

### B1 — Seven screens animated backwards, in both directions

`screenOrder` in `js/navigation.js` is a depth list compared relatively. A
screen missing from it indexes as `-1` — shallower than everything — so
going *into* it played the back animation and pressing Back out of it
played the forward one.

Missing: `screen-manage-lists`, `screen-board-menu`, `screen-menu-docs`,
and four Configure rows — charges, times, invoice, grc — shipped for
months.

*Why nothing errored:* `indexOf` returning `-1` is a valid number. The
comparison succeeds, an animation plays, and it is simply the wrong one.

*Verified:* against a control. `configure→menu` and `menu→configure` are
both listed and animated correctly throughout. The three unlisted
transitions animated backwards before the fix and correctly after. Commit
`48cc935`.

### B2 — The remove-villa button on a reservation was an unstyled browser button

`reservation.js` builds a villa row with `class="remove-ingredient-btn"`,
but the only rule for that class is `.ingredient-row .remove-ingredient-btn`
in `css/menu-inventory.css`, and a villa row is a `.villa-rate-row`. The
selector never matched.

Measured before: `border: 2px outset rgb(0,0,0)`, `background: rgb(240,240,240)`,
**24×21px** — the raw browser default, in the middle of a maroon and cream
form. The identical control on the Menu screen was styled correctly, which
is what made it invisible as a bug.

*Fixed* by dropping the ancestor from the selector, so one rule serves both
screens rather than restating it in `reservation.css` — which would be the
same fact in two files.

*Verified:* reservation button now 38×38, transparent, danger-coloured, 8px
radius, and the ingredient row is unchanged at 38×38.

### B3 — Wilpattu's documents printed the old e-mail address

Every guest-facing document — reservation, registration card, both
invoices — carried `leopardinnwilpattu@gmail.com`. The default in
`js/data/branches.js` was corrected weeks ago; the saved
`Wilpattu__branchInfo` config row was not, and a saved row beats the code
default.

*Fixed through the real screen* (Configure → Branch Details → Save
Details), then verified by reprinting `INV-2026/27-601` from Guest History:
the header now reads `Email: leopardinnvillas@gmail.com`.

**This fix is dev-only.** Production almost certainly has the same stale
row and I could not check it — production was signed out and I do not enter
passwords.

---

## 3. UX findings — recorded, not changed

Ranked by cost to the user.

### U1 — The "Checked In" tab lists guests who left (bug-shaped; needs your decision)

Reservations → **Checked In** shows **7 reservations. Only 2 guests are
actually in the hotel.** The other 5 checked out — villa freed, final
invoice issued, booking closed — and their reservation still reads
"Checked In".

The same stay is described two ways on two screens: Guest History says
**CHECKED OUT**, the Reservations list says **Checked In**. That is one
fact stored twice and free to disagree, which is this codebase's signature
bug.

*Cost:* the list only ever grows. On four villas, after one season the
manager's "who is in the hotel" view is dozens of departed guests with the
two real ones buried among them.

*Why I did not fix it:* `RESERVATION_STATUS` has three values —
Confirmed, Cancelled, Checked In — and its own comment defines Checked In
as *fulfilled by the guest actually arriving*, not *currently here*. So
there are two defensible fixes and they are not the same product:

1. **Add `CHECKED_OUT`** and set it in `closeStay()` alongside the booking,
   mirroring what cancel-check-in already does. The tab then means "in the
   hotel now".
2. **Leave the status alone and filter the tab by real occupancy.** The
   status keeps meaning "fulfilled"; the tab means "in house".

Option 1 is the one I would take — it makes the record honest rather than
papering over it at the view, and `closeStay()` is already the single place
both checkout paths funnel through. But it changes what a stored status
means, so it is your call.

### U2 — A misnamed class is what caused B2, and it is still misnamed

The villa row's remove button is a `remove-ingredient-btn`. B2 is fixed, but
the next person to scope a rule or a selector to that name will reintroduce
it. Renaming it to something neutral (`row-remove-btn`) and updating the two
call sites would close it properly.

### U3 — Two dropdown buttons have no accessible name

`ml-picker-dd` (Manage Lists) and `pf-currency-dd` (Proforma form) expose no
name while in their placeholder state — no text, no `aria-label`, no
`title`. Every other button in all 36 screens has one. A screen reader
announces them as "button".

### U4 — The remove button is 38px where the app's standard is 44px

`.remove-ingredient-btn` is 38×38. Everything else built recently — the
board-menu dish rows, the printed-menu note rows, the sheet buttons — is
44px, the size the rest of the app treats as a tap target.

### U5 — The saved hotel name and the code default disagree

`Wilpattu__branchInfo` stores `Leopard Inn Wilpattu Hotel`; `branches.js`
ships `Leopard Inn Wilpattu Villa`. The saved row wins, so documents say
"Hotel". Harmless today, but it is the same divergence class as B3 and
nobody has decided which is right.

### U6 — The reservation form is 1.35 screens at 375px

Not bad, and noted only as a measurement: the home screen now fits in one
screen (660px of 812) since the dashboard work, the reservation form does
not quite.

---

## 4. If only three things get done

1. **U1 — the "Checked In" tab.** It is the only finding here that makes a
   manager mistrust the screen, and it gets worse every week. Pick option 1
   or 2 and it is a small change either way.
2. **B3 on production.** Dev is fixed; production is very likely still
   printing the old address on every Wilpattu document. Two minutes, once
   you are signed in.
3. **U3 — the two unnamed buttons.** Smallest job on the list and the only
   accessibility gap found in 36 screens.

---

## 5. Not established by this walk

- **Anything on production.** Untouched by design.
- **Arugam Bay.** Never walked, at all, in any walk so far.
- **Printing.** No document was sent to a printer. Margins, page breaks and
  what a registration card looks like on paper remain unverified.
- **Real e-mail delivery.** Both invoices reached the queue with PDFs
  attached. Whether Resend sent them, and what they look like in an inbox,
  was not checked.
- **Real devices.** 375px in a desktop browser is not a phone. Touch
  accuracy, on-screen keyboards covering fields, and actual scroll
  behaviour are all untested.
- **Behaviour at scale.** Ten reservations and eighteen invoices. Nothing
  here says how the lists behave at a thousand.
- **Offline.** Reload persistence was verified; a genuine offline stay
  (network off, then synced) was not re-run this time.

---

## 6. Six false alarms, caught before they were written down

Recorded because the ratio matters — six wrong readings against three real
bugs, and every one would have been a fabricated finding.

1. **~130 "zero-sized icons".** An SVG inside a `display:none` screen
   always reports a 0×0 box. Re-measured by activating each screen.
2. **"257 focusable controls in hidden areas".** Elements inside
   `display:none` are not in the tab order at all.
3. **Nine surviving zero-sized icons.** All deliberate hidden-state icons —
   `eye-hide` on the password toggle (its `eye-show` sibling is 19×19 in a
   44×44 button) and `stepper-check`, the completed-step tick.
4. **"The step form will not advance."** It was refusing correctly, with a
   visible message: *"Enter a Passport No or an NIC No — at least one is
   required"*. The test had not filled it.
5. **"Complete Order does nothing."** A confirm dialog was open and
   unanswered. My selector `[class*="confirm"]` had matched
   `grc-confirm-note` on a different screen — the document-wide selector
   trap, while looking for it.
6. **"The Reports screen renders nothing."** Reached via `showScreen()`
   directly, which skips the enter-handler that renders the data. Through
   the real button it renders fully.
