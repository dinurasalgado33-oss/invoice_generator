# Leopard Inn — What's Hardcoded That Shouldn't Be

Everything a manager would plausibly want to change that currently lives
in a `const` in a data module, reachable only by editing code.

Written 2026-08-30, against commit `b124258`.

**STATUS: CLOSED.** Every finding is fixed, inventory departments
included — they were the last one left in a const and are now two flat
lists a manager edits. See `EXECUTION-PLAN.md` §14.

Companion to `PERSISTENCE-AUDIT.md`. That one asks *does this change reach
the database*; this one asks *can a manager make the change at all*. They
overlap heavily and §5 explains why they should be executed together
rather than as two passes.

---

## 1. The standing requirement

Dinura's direction, in his words: the manager should be able to change
and modify things on their own instead of reaching out to him. Nothing
that a hotel would reasonably want to adjust should require a developer.

That reframes hardcoding from a shortcut into a defect. A hotel that has
to phone someone to change a villa rate or a check-in time is a hotel
that stops using the software — and the cost lands on Dinura personally,
indefinitely.

---

## 2. Tier 1 — money. Changes what a guest is billed.

| # | What | Where | Current | Why it matters |
|---|---|---|---|---|
| **H1** | **Service charge rate** | `charges.js:44` | `0.1` | Directly changes every bill with food on it. Their own records show it waived and negotiated, so it is already not a constant in practice |
| **H2** | **VAT rate** | `charges.js:100` | `0` both properties | No UI at all; `setVatRate()` is exported and called from nowhere. Covered as `[K]` in the persistence audit |

### H1 has a trap attached

`INVOICE_REMARK` (`charges.js:54`) is printed on every invoice and reads:

> "Please note that a **10%** service charge will be added to all BB…"

The number is written into the sentence, while the rate it describes is a
separate constant. Change the rate to 12% and the invoice charges 12% and
promises 10% — on the document the guest is handed.

This is the project's signature bug in miniature: one fact stored twice,
free to disagree. **Making the rate configurable requires the remark to
derive from it**, not merely to sit beside it. The existing comment says
the two "live next to each other on purpose" — which was a reasonable
mitigation while both were constants, and stops being one the moment a
manager can change the rate.

---

## 3. Tier 2 — operational. Printed on documents or blocking daily work.

| # | What | Where | Current | Why |
|---|---|---|---|---|
| **H3** | Standard check-in / checkout times | `grc.js:23-24, 27-28` | `02.00pm` / `11.00am` | Printed on every registration card. Seasonal changes are normal |
| **H4** | Booking sources | `charges.js:80` | `Direct, Booking.com, Walk-in, Agent` | The first time they list on Airbnb or another OTA, reception cannot record it. Feeds revenue-by-source reporting |
| **H5** | Currencies | `charges.js:89` | `LKR, USD, EUR, GBP` | A guest paying in AUD or INR cannot be billed in their currency |
| **H6** | Hotel name, address, phone | `branches.js:7-27` | fixed strings | Partly editable already via Configure → Branch, but **not persisted** — see persistence `[D]` |
| **H7** | GRC liability notice | `grc.js:16` | fixed paragraph | Legal text on a document guests sign. Changing it should not need a deploy |

---

## 4. Tier 3 — lists that will grow. Nothing breaks meanwhile.

| # | What | Where | Current |
|---|---|---|---|
| **H8** | Room types | `grc.js:8` | `Single, Twin, Double, Triple, Guide` |
| **H9** | Meal plans | `grc.js:12` | `R/O, B/B, H/B, F/B` |
| **H10** | Menu categories | `menu.js:24` | fixed list |
| **H11** | Inventory categories | `inventory.js:2` | fixed list |
| **H12** | Inventory units | `inventory.js:6` | `kg, g, L, ml, pcs` |
| **H13** | Inventory departments | `inventory.js:11` | fixed list |
| **H14** | Stock usage reasons | `inventory.js:214` | `Kitchen use, Waste / spoilage, Staff meal, Other` |

These are all the same mechanism repeated: a list a manager should be
able to append to. Low urgency individually, but **H14 gains urgency**
if stock movements start being logged, because it becomes the vocabulary
of the audit trail (persistence `[I-1]`).

---

## 5. Deliberately left hardcoded

Recorded so a future pass does not "fix" them.

| What | Why |
|---|---|
| Branch keys `"Wilpattu"` / `"Arugam Bay"` | The security boundary. Compared with `==` in rules and `===` in the app. Editable branch *keys* would mean editable access control |
| Charge categories (`room`, `food`, `activity`) | Structural. Every revenue split, report and service-charge calculation is written against these three |
| Financial year start (1 April) | Sri Lankan tax law, not hotel policy |
| `Asia/Colombo` timezone | Same |
| Document number prefixes (`INV`, `GRC`, `RES`, `TRA`) | Changing a prefix mid-year breaks the continuity of a numbered series an accountant relies on |
| Dish and villa numeric IDs | Guests read dish numbers off a printed menu |

---

## 6. How this interacts with the persistence audit

Two of these are the *same item* seen from different sides:

| Persistence audit | This audit | They are one job |
|---|---|---|
| `[K]` VAT not persisted | `H2` VAT not editable | A VAT rate must be both editable and persisted to be worth anything |
| `[D]` branch info not persisted | `H6` branch info partly hardcoded | Same screen, same save |
| `[I-1]` stock adjustments unlogged | `H14` usage reasons fixed | The reason list is the vocabulary the log is written in |

And the rest of Tier 1–3 all land in the same place: a new configurable
value is useless unless it persists, so **every item here creates a
persistence item.**

---

## 7. Consequence for sequencing

Executing these as two phases — "make things configurable", then "make
things persist" — means touching every configure screen and its data
module **twice**, and leaves a window where a manager can change a rate
that silently reverts. That window is worse than either bug alone,
because it looks like it works.

**They should be executed as one pass per item:** make it configurable,
persist it, hydrate it, verify it, move to the next.

The exception is the persistence items that have nothing to do with
hardcoding — menu delete `[J]`, occupancy derivation `[A]`, stock
logging `[I-1]`/`[I-2]`. Those are correctness fixes rather than
features, they have no configurable counterpart, and they can go first
independently.

A merged order of work is not written here on purpose. Both audits should
be reviewed and settled before either is turned into a plan.

---

## 8. What this audit did not cover

- **Whether each Tier 3 list needs its own screen, or one generic
  "manage lists" screen.** That is a design decision, not an audit
  finding.
- **Per-property vs shared config.** Most of these are per-property
  today; some (currencies, units) arguably should be shared. Undecided.
- **Who may change what.** Everything here assumes manager-only, matching
  the existing Configure screens. Nobody has asked whether some of it
  should be owner-only.
- **The printed PDF menus.** They are generated from `MENU_ITEMS`, which
  is already configurable and persisted; the layout and artwork are not,
  and reasonably should not be.
