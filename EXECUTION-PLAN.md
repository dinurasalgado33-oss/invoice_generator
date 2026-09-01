# Leopard Inn — Merged Execution Plan

The single ordered list for closing both audits. Nothing new is
identified here; this decides *sequence*.

Written 2026-08-30, against commit `b6b7684`.

Sources:
- `PERSISTENCE-AUDIT.md` — items `[A]`–`[K]`. Does a change reach the database?
- `HARDCODED-AUDIT.md` — items `H1`–`H14`. Can a manager make the change at all?

---

## 1. The two rules this order follows

**Correctness before features.** Three items are bugs in behaviour that
already exists, with no configurable counterpart. They ship first because
one of them can double-book an occupied villa, and none of them depend on
anything else.

**Then one pass per item, never two phases.** For everything that is both
hardcoded *and* unpersisted, "make it editable" and "make it save" are the
same job. Splitting them means touching every Configure screen twice and
leaves a window where a manager changes a rate that silently reverts —
which is worse than either bug alone, because it looks like it worked.

So: each item below is finished — editable, persisted, hydrated,
verified — before the next begins.

---

## 2. Stage 1 — correctness ✅ COMPLETE

Independent of each other and of everything below. Any can ship alone.

| Step | Item | Change | Verify by |
|---|---|---|---|
| 1.1 | ~~`[J]` Menu delete~~ **done** `8bc11d5` | Routed through `remove()` | Verified: adapter received `remove:menuItems`, array 161→160 |
| 1.2 | ~~`[A]` Villa occupancy~~ **done** `4227835` | Derived from bookings; rebuilt on every bookings snapshot, not just at startup | Verified end to end on dev: check in → reload → still occupied, tab reachable; checkout → reload → stays free |
| 1.3 | ~~`[I-1]` Stock adjustments~~ **done** `472d159` | All four stock paths go through one logStockMovement(); every row records `by` | Verified: decrease→usage, increase→restocks, corrections cost 0, purchase costs 6000, zero writes nothing |
| 1.4 | ~~`[I-2]` Order stock movement~~ **done** `472d159` | Reserve and return both logged | Verified on a real order: `Kitchen — Papaya Juice` −0.5kg, then `order-return` +0.5kg at zero cost |

**1.2 is the most valuable single change in either audit.** It is also
the one to resist "fixing" by writing `room.status` to Firestore — that
creates a second copy of "is this villa occupied", free to disagree with
the bookings. Derivation keeps one fact stored once. Reasoning in
`PERSISTENCE-AUDIT.md` §3.

**1.3 and 1.4 must both land before Stage 3.** Stock cannot be derived
from logs while two of the four things that move it write no log.

---

## 3. Stage 2 — money ✅ COMPLETE

Highest value: these change what a guest is billed.

| Step | Items | Change |
|---|---|---|
| 2.1 | ~~`H1` Service charge~~ **done** `e57b15b` | Per property, persisted, remark derived from the rate. Verified: 10→12.5% moved the charge 400→500 and the printed sentence with it |
| 2.2 | ~~`[B]` Villa name and rate~~ **done** `7080cb1` | Only id/name/rate saved — never occupancy; hydration merges rather than replaces |
| 2.3 | ~~`[C]` Activities~~ **done** `7080cb1` | Add *and* edit both persist — the first pass saved only on add |
| 2.4 | ~~`H2` + `[K]` VAT~~ **done** | Field built, dead setter wired, persisted. Verified: 18% reached a new bill (1,908 on 10,600) while an existing invoice kept vatRate 0 |

2.1 comes first because it is the only Tier 1 item that is *silently*
wrong rather than merely absent — the printed promise and the charged
amount can disagree.

**Prerequisite for all of Stage 2:** the `config` collection needs a
Firestore rule (readable by signed-in, writable by manager) and a deploy.
None exists; the catch-all denies it today.

---

## 4. Stage 3 — the rest of config ✅ COMPLETE

Mechanical once Stage 2 has established the pattern. Grouped by screen so
each pass finishes one place a manager visits.

| Step | Items | Screen |
|---|---|---|
| 3.1 | ~~Branch details, bank account~~ **done** `ba05564` | Configure → Branch |
| 3.2 | ~~Conditions · Cancellation · Notices~~ **done** `ba05564` | Verified via the *edit* path, not just add |
| 3.3 | ~~Inventory items~~ **done** `6928f66` | Config saved; stock deliberately excluded |
| 3.4 | ~~Derive stock from logs~~ **done** `6928f66` | 10 + 5 − 2 = 13, rebuilt from Firestore after reload |
| 3.5 | ~~Check-in / checkout times~~ **done** | 15:00 prints as 03.00pm; killed a duplicate pair of constants |
| 3.6 | ~~Booking sources · Currencies~~ **done** | Sources per-property (Airbnb at Wilpattu only), currencies shared |
| 3.7 | ~~GRC liability notice~~ **done** | Per property, survives reload |

---

## 5. Stage 4 — list management ✅ COMPLETE

`H8`–`H14`: room types, meal plans, menu categories, inventory
categories, units, departments, usage reasons.

All the same mechanism repeated. Nothing breaks while they wait.

**`H14` (usage reasons) is promoted out of this stage if 1.3 lands
first** — once stock movements are logged, the reason list becomes the
vocabulary of the audit trail, and a fixed list of four starts costing
something.

**Decided:** one generic **Manage Lists** screen — pick the list from a
dropdown, then add/edit/remove. Seven screens for seven rarely-touched
settings is a lot of navigation, and one screen is one piece of code
rather than seven near-identical ones.

Currencies and inventory units are **shared across both properties**; a
euro is a euro and a kilogram is a kilogram. Everything else on this
screen stays per-property. That split matters for the document key: the
shared ones drop the branch prefix.

---

## 6. Stage 5 — closing out the live app 🟡 ONE ITEM LEFT

Not from either audit; outstanding from earlier work.

| Step | What | Whose |
|---|---|---|
| 5.1 | ~~Void the two test invoices~~ **done** | Both voided with a stated reason, attributed to Ashen, `reissued: false` so the money stays closed. Dinura's own `d` / `dinu` test invoices left alone |
| 5.2 | Confirm a welcome e-mail actually sends | First real check-in with an address |
| 5.3 | ~~Exercise the staff screen on live~~ **done** | Created and disabled a throwaway account; confirmed it is disabled in Auth as well as the profile, so an open session stops immediately. Guards verified against live: a lowercase branch, a short password, and a manager disabling themselves are all refused |
| 5.4 | ~~Flag malformed profiles~~ **done** `5d3e468` | Names the exact fault: stray whitespace in a key, `active` stored as text, a branch that is not one of the two exact strings. Verified against all seven shapes including the real `"role "` bug |
| 5.5 | Full QA sweep after all of the above | Fresh session — the one item still open |

---

## 7. Decisions — settled

1. **Tier 3 lists** — one generic **Manage Lists** screen, not seven.
2. **Scope** — currencies and inventory units shared across both
   properties; everything else per-property.
3. **If occupancy will not derive cleanly (1.2)** — **stop and ask**, do
   not fall back to persisting `room.status` unilaterally. This is the
   item most likely to cause a double-booking if it is subtly wrong, and
   it touches check-in, checkout and the dashboard at once.
4. **Test invoices (5.1)** — Dinura voids them himself, walked through.
   Voided with a stated reason is a cleaner record than quietly removed.

Outstanding input, blocking nothing:

5. **VAT percentages and what they apply to.** Not needed to build 2.4:
   the field ships at 0 and is set later, which is the entire point of
   making it configurable.

---

## 8. Estimate

| Stage | Work | Notes |
|---|---|---|
| 1 — correctness | ~2 hrs | 1.2 is most of it |
| 2 — money | ~2.5 hrs | Includes the `config` rule and first deploy |
| 3 — rest of config | ~2.5 hrs | Mechanical once 2 is done |
| 4 — lists | ~1.5 hrs | Blocked on a decision |
| 5 — live close-out | ~1 hr | Mostly Dinura's |
| | **~9.5 hrs** | 3 sessions |

Dinura's own time across all of it: **under an hour** — deploys,
sign-ins, and the two decisions in §7.

**Read this estimate with the project's history in mind.** Every estimate
here has been wrong in the same direction, because auditing properly
keeps surfacing things: a slash breaking Firestore document ids, two
screens rendering on top of each other, a reservation that reserves
nothing, a profile key with a trailing space. That is the process
working, not failing — but plan for 11–12 hours and be pleased if it
comes in under.

---

## 9. What would make this plan wrong

Stated so it can be checked rather than trusted.

- **If occupancy cannot be cleanly derived** — multi-villa stays use
  `roomIds`, and if any flow writes `roomId` without `roomIds`, derivation
  misses villas. Checked at plan time and it looked sound, but 1.2 should
  confirm it before committing to the approach.
- **If config turns out to need per-field writes** rather than
  whole-list writes, Stage 2's pattern changes and Stage 3 inherits it.
  Whole-list was chosen because these lists are small and always read
  whole; two managers editing the same list in the same minute is not a
  real scenario at ten villas.
- **If the `config` rule cannot express "manager only"** as cleanly as
  expected. It should — `isManager()` already exists and is proven — but
  it is untested for this collection.


---

## 10. Closing state

Both audits are closed. Every item in `PERSISTENCE-AUDIT.md` (`[A]`–`[K]`)
and `HARDCODED-AUDIT.md` (`H1`–`H14`) is fixed and verified, except the
two recorded below as deliberate.

**Deliberately not done, with reasons:**

- **Inventory departments (`H8`–`H14` partial).** They group categories
  rather than being a flat list, so the generic list editor cannot express
  them without mangling the structure. Instead, a category belonging to no
  department now gathers under "Other" — so a manager adding one can never
  make their own stock invisible, which was the actual risk.
- **Suggestion history sharing (`PERSISTENCE-AUDIT.md` §6).** Guide and
  agent names are still remembered per device. Flagged as a decision
  rather than a bug; nobody has asked for it.

**What is left:**

| Step | What |
|---|---|
| 5.2 | **Blocked on a new Gmail App Password.** The e-mail does not send — see §11 |

5.1, 5.3, 5.4 and 5.5 are done, verified against the live project.

5.2 turned out to be forceable after all: queueing a row straight into
`guestEmails` fires the trigger without a booking or a guest. That was
worth doing rather than waiting — it failed, and waiting would have meant
finding out from a guest.

One thing found while doing 5.1 and worth knowing: Reports opens on the
current month, and the test invoices were dated the month before, so the
list looked empty rather than filtered. Not a bug — but "there are no
invoices" and "there are none in this period" read identically at a
glance.

**Deploys are the recurring trap.** Three times in this work something was
committed, reported as fixed, and not actually live — the screen-stacking
fix, invoice `createdAt`, and 5.4. Committing is not deploying. Check the
served build before believing the live app has a change:

```bash
curl -s https://leopard-inn.web.app/ | grep -o 'v=1[0-9][0-9]' | head -1
```


---

## 11. Stage 5.2 — the welcome e-mail does not send

Forced on live on 2026-09-01 by queueing a row directly into
`guestEmails` with a real address. Both attempts came back:

    Invalid login: 535-5.7.8 Username and Password not accepted

The stored `GMAIL_APP_PASSWORD` is at version 2 and enabled, so a
password *was* set — it is simply no longer a password Google accepts.
That fits: the App Password in it was one of the two revoked after being
pasted into a chat.

Two things were fixed while chasing it. Neither cured it, and both were
worth doing anyway:

- **The password is now stripped of whitespace at the point of use.**
  Google *displays* an App Password as four groups of four, which is what
  gets copied, and a value set from a file on Windows carries a trailing
  CR LF. Either is sent verbatim and returns the same "Username and
  Password not accepted" — a message that reads like a wrong password and
  is not. `SHEET_ID` had this exact bug already.
- **`googleapis` is now required lazily.** It takes about eight seconds
  to load and was required at the top of `sheets-mirror.js`, so the whole
  functions codebase took 10.6s to declare its exports against a 10s
  deploy-analyser timeout. Deploys failed with "Cannot determine backend
  specification", which names no file and no cause. Now 1.6s.

### What unblocks it

Dinura, in their own terminal. **Do not paste the password into a chat** —
that is how the last two died. `secrets:set` prompts for it with hidden
input:

    firebase functions:secrets:set GMAIL_APP_PASSWORD --project leopard-inn
    firebase deploy --only functions:sendWelcomeEmail --project leopard-inn

The redeploy is not optional: a function binds a secret version when it
deploys, so setting the secret alone changes nothing.

A new App Password comes from Google Account → Security → 2-Step
Verification → App passwords, signed in as `leopardinnvillas@gmail.com`.
2-Step Verification must be on or the option is not offered.

To check it worked, queue a row from the browser console on the live app
and watch the status go from Queued to Sent:

```js
const ge = await import('/js/data/guest-email.js');
const row = ge.queueWelcomeEmail({
  bookingId: "email-test", grcNo: "TEST", branch: "Arugam Bay",
  guestName: "Test", email: "<your address>"
});
// then, a few seconds later:
ge.GUEST_EMAIL_QUEUE.find(r => r.id === row.id).status;
```

Four rows in `guestEmails` are test residue — two from 2026-08-30/31 and
two from this check, all `Failed` with BadCredentials. They are tied to
booking ids no real booking has, so they show up on no guest's history.
Nothing is deleted from that collection by design.

---

## 12. Stage 5.5 — QA sweep, done 2026-09-01

Traced on the live project as the signed-in manager.

**One real bug found and fixed** — `4d9b65d`, the flagship shape from
`CLAUDE.md`: one fact stored twice, free to disagree. Room types, meal
plans, menu categories, inventory categories and stock usage reasons are
single shared arrays but were saved per property, and hydration applied
one property's copy then overwrote it with the other's. A manager's edit
vanished on the next reload. Proven by writing a different marker under
each property and reloading — exactly one survived.

**Verified sound:**

| Area | Result |
|---|---|
| Config round trip | A villa rate written on live survived a reload and was restored. Only `id`, `name`, `rate` are stored — occupancy still never persisted |
| Numbering | All eight blocks (2 properties × 4 document types) hold 50 numbers, FY `2026/27` |
| A slash in an id | Invoice ids read `INV-2026/27-001`. Safe: the adapter stores a separate non-enumerable `__docId`, and the ids are only ever used with `getElementById` and `data-` attributes, never a CSS selector |
| Invoice lifecycle | Two `Void` with reasons, two `Active` — 5.1 landed and left Dinura's own tests alone |
| Occupancy | Every villa free, matching four `Checked Out` bookings. Derivation re-runs on every bookings snapshot |
| Branch scoping | Staff hydrate one property, managers both |
| Error log | Four entries, all `permission-denied` from 2026-08-30, before the rules were fixed. Nothing since |

**Worth knowing, not worth fixing:**

- `INV-2026/27-001` has no `createdAt` — it predates that fix. Reports
  sort on `date`, which it has, so nothing is misplaced.
- The `config` collection was empty on live until this sweep. Everything
  in Stages 2–4 had only ever been verified on dev. It is now exercised
  on live, and holds one document: `Wilpattu__villas`, with the correct
  rates.
