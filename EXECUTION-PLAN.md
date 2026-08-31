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

## 4. Stage 3 — the rest of config

Mechanical once Stage 2 has established the pattern. Grouped by screen so
each pass finishes one place a manager visits.

| Step | Items | Screen |
|---|---|---|
| 3.1 | `[D]` + `H6` Branch details, bank account | Configure → Branch |
| 3.2 | `[E]` Conditions · `[F]` Cancellation · `[G]` Notices | Their three screens |
| 3.3 | `[H]` Inventory items | Inventory |
| 3.4 | `[I]` Derive stock from logs | Inventory — **requires 1.3 and 1.4** |
| 3.5 | `H3` Check-in / checkout times | Configure → Branch |
| 3.6 | `H4` Booking sources · `H5` Currencies | Configure → Branch |
| 3.7 | `H7` GRC liability notice | Configure → Conditions |

---

## 5. Stage 4 — list management

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

## 6. Stage 5 — closing out the live app

Not from either audit; outstanding from earlier work.

| Step | What | Whose |
|---|---|---|
| 5.1 | Void the two test invoices in the live books | Dinura — manager only |
| 5.2 | Confirm a welcome e-mail actually sends | First real check-in with an address |
| 5.3 | Exercise the staff screen on live | Create a throwaway account, disable it |
| 5.4 | Extend the staff screen to flag malformed profiles | Me — it flags a *missing* profile but not one whose key is misspelled, which is exactly what happened on dev |
| 5.5 | Full QA sweep after all of the above | Fresh session |

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
