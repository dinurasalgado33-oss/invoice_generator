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

## 6. Stage 5 — closing out the live app ✅ COMPLETE

Not from either audit; outstanding from earlier work.

| Step | What | Whose |
|---|---|---|
| 5.1 | ~~Void the two test invoices~~ **done** | Both voided with a stated reason, attributed to Ashen, `reissued: false` so the money stays closed. Dinura's own `d` / `dinu` test invoices left alone |
| 5.2 | ~~Confirm a welcome e-mail actually sends~~ **done** | It did not. Forced rather than waited for, and it failed on a dead App Password — see §11. Now sends, verified to a real address |
| 5.3 | ~~Exercise the staff screen on live~~ **done** | Created and disabled a throwaway account; confirmed it is disabled in Auth as well as the profile, so an open session stops immediately. Guards verified against live: a lowercase branch, a short password, and a manager disabling themselves are all refused |
| 5.4 | ~~Flag malformed profiles~~ **done** `5d3e468` | Names the exact fault: stray whitespace in a key, `active` stored as text, a branch that is not one of the two exact strings. Verified against all seven shapes including the real `"role "` bug |
| 5.5 | ~~Full QA sweep~~ **done** `4d9b65d` | One real bug found and fixed: five shared lists stored per property, so a manager's edit vanished on reload — see §12 |

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

**Three items were left as deliberate decisions and have since been
done — see §14.** Nothing is outstanding.

**Nothing is left. Every step of Stage 5 is done and verified against
the live project.**

5.2 was the last one, and it was genuinely broken rather than merely
untested — see §11.

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

## 11. Stage 5.2 — the welcome e-mail, and why it took five tries

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

### Fixed, 2026-09-02

```
{"status":"Sent","sentAt":"2026-09-02T05:54:41.806Z","error":""}
```

It took five secret versions, and the reason is worth writing down: the
error never changes. Gmail answers "Username and Password not accepted"
whether the value is the wrong credential, five credentials, or the right
one — so every wrong attempt looks exactly like the last, and there is
nothing in the message to tell you which mistake you made.

What actually got there was checking the *shape* of the stored secret
instead of guessing at its content. A Gmail App Password is exactly 16
lowercase letters. Printing only the length and character class — never
the value — named each failure immediately:

| Version | Shape | What it was |
|---|---|---|
| 2, 3 | 42 chars, mixed | Not an App Password at all |
| 4 | 80 chars, lowercase | Five App Passwords in one paste (5 × 16) |
| 5 | 16 chars, lowercase | Correct — typed by hand, not pasted |

```bash
firebase functions:secrets:access GMAIL_APP_PASSWORD --project leopard-inn 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=d.replace(/\s+/g,'');console.log('length='+s.length+' all_lowercase='+/^[a-z]+$/.test(s))})"
```

`length=16 all_lowercase=true` is the only passing answer. Run this
before deploying, not after — it costs a second and it is the difference
between knowing and guessing.

Two more things that matter if this ever needs doing again:

- **Type the password, do not paste it.** Version 4 was five passwords
  glued together, which is what a multi-line clipboard becomes once the
  whitespace strip runs. Typing sixteen letters is faster than diagnosing
  that.
- **A function binds a secret version when it deploys.** Answering **Yes**
  to `secrets:set`'s re-deploy prompt handles it. Setting the secret alone
  changes nothing, and the app keeps failing with the same message.

### How to re-check it

Queue a row from the browser console on the live app, signed in, and
watch the status go from Queued to Sent:

```js
const ge = await import('/js/data/guest-email.js');
const row = ge.queueWelcomeEmail({
  bookingId: "email-test", grcNo: "TEST", branch: "Arugam Bay",
  guestName: "Test", email: "<your address>"
});
// then, a few seconds later:
ge.GUEST_EMAIL_QUEUE.find(r => r.id === row.id).status;
```

Seven rows in `guestEmails` are test residue — two from 2026-08-30/31 and
five from this work, four `Failed` with BadCredentials and one `Sent`.
They are tied to booking ids no real booking has, so they show up on no
guest's history. Nothing is deleted from that collection by design.

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


---

## 13. The welcome e-mail carries the menu, 2026-09-02

Settled and live. The e-mail contains the property's menu itself — no
link, no attachment, no browser.

### What was wrong before

The links did not work at all. The queue row stores menus as strings,
`["ab-main","ab-cocktail"]`, and `buildHtml` read `.url` and `.label` off
them — which on a string are `undefined`. Every guest would have received
two identical links labelled "Menu" pointing at
`https://leopard-inn.web.app/`, the staff portal login.

### Why inline rather than a PDF

The size worry does not survive contact with the numbers. A menu is about
6KB of words. The PDFs are megabytes because of the embedded Cinzel font
and the cover artwork, none of which an e-mail needs.

| Property | Dishes | E-mail |
|---|---|---|
| Arugam Bay | 93 | 30KB |
| Wilpattu | 68 | 20KB |

Gmail clips a message over about 102KB behind a "View entire message"
link — the exact extra tap this change removes — so there is roughly 3x
headroom. Past 80KB the dish *descriptions* are dropped first, because a
guest can still order everything by name and number; only past that is
the menu left out rather than sent cut off mid-course. Verified at 1x,
3x, 6x and 20x the real menu.

### Two decisions

**The menu is read when the e-mail sends, not stamped on the row at
check-in.** A row that failed and was chased days later would otherwise
carry a menu the kitchen no longer serves. One menu, one place — the same
reasoning as deriving occupancy instead of storing it.

**A menu that cannot be read is dropped, never allowed to fail the send.**
The guest still gets the greeting and reception's number. A welcome with
no menu beats no welcome.

### Ordered by dish number, not by category

The first version sorted courses by `MENU_CATEGORIES`, and the Wilpattu
e-mail opened on Side Dishes at number 51. That list is shared between
both properties and written in Arugam Bay's order, so Wilpattu's fresh
juices — dishes 1-9 — landed wherever it happened to put them.

`js/menu-pdf.js` already carried a comment naming this exact failure. The
warning was there and the shared list got used anyway. **When a comment
in this repo explains why something is ordered a particular way, that is
usually a bug someone already paid for.**

Both properties now read 1..n in order. The check asserts the numbers
start at 1, ascend, and are all present — and was confirmed to fail
against the old ordering before being trusted.

### Dead code removed

`composeWelcome()` in `js/data/guest-email.js` was exported and never
called. Its comment claimed the wording lived with the app "so the
manager can see it" while the real text sat on the server. The copy that
looked authoritative was the dead one. Gone, along with `menusForBranch`
and the `menus` field on the queue row, which nothing reads now that the
e-mail carries the menu itself.

### One thing that is not a bug

While testing, several near-identical messages went to one address with
the same subject. Gmail threads them and hides the repeated tail behind a
small "..." — which reads exactly like the menu stopping partway. A real
guest gets one e-mail, in no thread, with nothing to trim against.
Confirmed by sending to a plus-tagged address, which Gmail treats as a
separate conversation.

### The board sheet

Now in the e-mail, and editable — see §14.

Live: hosting `v=147`, `sendWelcomeEmail` deployed 2026-09-02.


---

## 14. The last three, 2026-09-02

All three were recorded as decisions rather than gaps. Each turned out to
have something behind it worth fixing.

### Suggestions are shared, not learned twice — `3a6f197`

Reception's phone and the office tablet each kept their own list of
guides, drivers and agents in `localStorage`. The whole point of the
feature is that "Pradeep", "pradeep" and "Pradeeep" stop becoming three
people — and that only ever worked for whichever device learned the
spelling first. One fact, two homes.

Now shared config, merged at sign-in. Local *order* stays per device on
purpose: the top of the list is what this device used most recently,
which is what the person holding it most likely wants next. Writes are
debounced four seconds and read-merge-write rather than blind, so a name
another device learned meanwhile is not dropped.

Verified by typing a guide, wiping `localStorage`, reloading as a fresh
device, and watching it come back.

### Inventory departments are a manager's to change — `a81d979`

Left because departments were one nested structure the list editor could
not express. **The nesting was itself the bug.** It stored every category
name twice: once in `INVENTORY_CATEGORIES`, which a manager edits, and
again inside a department, which they could not. Renaming a category in
the list editor silently orphaned it from its department and moved its
stock to "Other" with nothing to say why.

Split into two flat lists that cannot contradict each other — department
names, and a category-to-department map. The nested shape the stock table
wants is derived. Verified: grouping identical to before the refactor; an
unassigned category lands in "Other"; a removed department drops its
categories into "Other" rather than hiding them.

### The board sheet reaches board guests — `e492f7b`

A guest on half board is not ordering from the à la carte list; they have
already paid for a set meal. "What do I actually get" was the question the
welcome e-mail left unanswered.

`BOARD_MENU` moved from a const in `js/menu-pdf.js` to `js/data/menu.js`,
with an editor at **Menu → Edit board menu**. The printed sheet and the
e-mail read the same array — `MENU_DOCS['wp-board'].board === BOARD_MENU`,
asserted on live — so an edit changes both or neither. Held apart, they
would have become the app menu and the printed menu all over again.

Verified: the Wilpattu e-mail grew 19,871 → 22,573 bytes while Arugam Bay
stayed at 30,286, and the board PDF still builds at three pages.

### One number worth keeping

That board PDF is **1.1MB** for six options. The decision to put the menu
in the e-mail rather than attach a PDF rested on the claim that the PDFs
are megabytes because of the embedded font and cover artwork. It is now
measured rather than asserted.
