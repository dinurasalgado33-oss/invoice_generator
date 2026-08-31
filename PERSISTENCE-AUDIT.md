# Leopard Inn — What Reaches the Database, and What Doesn't

A full sweep of every piece of state the app changes, and whether that
change survives a reload or reaches another device.

Written 2026-08-30, against commit `6b8c0be`. **Audit only — nothing here
is fixed yet.** The order of work is at the bottom.

The method: every mutation-shaped statement in `js/` was extracted
mechanically (99 of them), each classified as durable state or not, and
each durable one checked for a persist call. Then every finding was
confirmed by reading the surrounding code, because a grep can only say
what is missing near a line, not whether it matters.

---

## 1. The one-line summary

Records are solid. **Everything a manager configures, the live state of
every villa, and all stock levels are memory-only** — they work for the
session, vanish on reload, and never reach a second device.

The reason they were missed is worth stating plainly: the backend work
traced *records* — bookings, invoices, charges, cards — on the unexamined
assumption that config is not financial. A villa's nightly rate and a VAT
percentage are exactly as financial as an invoice. They are financial
*before* the bill rather than after it.

---

## 2. Verdict by area

### ✅ Persisted and hydrated — no action

| State | Collection |
|---|---|
| `INVOICES` | `invoices` |
| `BOOKINGS` | `bookings` |
| `GUEST_CHARGES` | `guestCharges` |
| `FOOD_ORDER_RECORDS` | `foodOrders` |
| `ACTIVITY_RECORDS` | `activityCharges` |
| `RESERVATIONS` | `reservations` |
| `PROFORMA_INVOICES` | `proformaInvoices` |
| `GRC_RECORDS` | `registrationCards` |
| `RESTOCK_LOG` | `restocks` |
| `USAGE_LOG` | `stockUsage` |
| `GUEST_EMAIL_QUEUE` | `guestEmails` |
| `ROOM_ACTIVITY_LOG` | `roomActivity` |
| `LOGIN_LOG` | `logins` |
| `ERROR_LOG` | `errors` |
| `MENU_ITEMS` — add and edit | `menuItems` |

### ❌ Not persisted — the actual findings

| # | State | Where | Consequence |
|---|---|---|---|
| **A** | Villa occupancy — `status`, `guest`, `bookingId`, `checkin`, `checkout`, `phone`, `source` | `rooms.js` 341-347, 392-398, 724-726, 841-847 | **Severe.** After any reload every villa reads *available*. See §3. |
| **B** | Villa name and nightly rate | `configure.js` 98-99 | Rate change reverts on reload; two devices bill different rates |
| **C** | Activities and prices | `configure.js` 239, 261 | Same |
| **D** | Branch details — address, phone, **bank account** | `configure.js` 302 | Wrong bank details on an agent invoice |
| **E** | GRC terms & conditions | `configure.js` 389-392, 414 | Signed cards print stale terms |
| **F** | Cancellation policy | `configure.js` 508-511, 530 | Agent invoices print stale policy |
| **G** | Proforma notices | `configure.js` 592, 611 | Same |
| **H** | Inventory items — add, edit, delete | `inventory.js` 439, 462 | New items vanish on reload |
| **I** | Stock levels | `inventory.js` 58-59, 359; `orders.js` 32 | Stock resets to seed values. See §4. |
| **J** | Menu dish **delete** | `menu.js` 268 | Splices locally, never calls `remove()` — **the dish returns on the next hydration** |
| **K** | VAT rate | `charges.js` 100 | See §5 — worse than a persistence gap |

### ⚪ Deliberately not persisted — confirmed correct

| State | Why |
|---|---|
| `FOOD_ORDERS` | Live kitchen queue. "Currently pending" only ever means now; documented as session-scoped by design |
| Suggestion history (guides, agents, countries) | Per-device convenience for `<datalist>`. Arguably *should* be shared — see §6 |
| Lock PIN, idle timeout | Per-device by definition |
| Number blocks | Per-device by design — that is the whole point of block allocation |
| Report filters, download links, DOM state | Not durable state |

---

## 3. Finding A — villa occupancy (most serious)

`ROOMS` is declared in `COLLECTIONS`, has a security rule written for it,
and is **written by nothing and hydrated by nothing**:

```
declared but never hydrated: CONFIG, ROOMS
files writing COLLECTIONS.ROOMS: 0
```

Every villa in the seed data is `status: "available"` (11 of 11). Nothing
rebuilds occupancy from bookings — `rooms.js` only ever looks *up* a
booking by `room.bookingId`, never the reverse.

So: reception checks a guest in, the tablet reloads, and every villa
reads available. The booking record survives — it is persisted — but the
room's link to it is gone. A second device never sees the occupancy at
all.

**What that costs:** double-booking a villa somebody is asleep in; a
guest's open tab unreachable because the room no longer knows its
`bookingId`; the home dashboard's occupancy count wrong.

**This one should probably not be fixed by persisting it.** Bookings
already carry everything needed:

```js
{ id, roomId, roomIds, guest, villa, branch, checkin, checkout,
  source, reservationId, status: "Checked In" }
```

A booking with `status: "Checked In"` says exactly which villas are
occupied, by whom, for which nights. Deriving occupancy from bookings
after hydration means one fact stored once. Persisting `room.status`
instead creates a second copy of "is this villa occupied", free to
disagree with the bookings — which is this project's signature bug, and
the reason `guestCharges` stopped being an array on the room.

**Recommendation: derive, don't store.**

---

## 4. Finding I — stock has four inputs and only two are recorded

| Path | Changes stock | Logged? |
|---|---|---|
| Restock form | `+qty` | ✅ `RESTOCK_LOG` |
| "Log as used" form | `−qty` | ✅ `USAGE_LOG` |
| **Manual +/− adjuster** (`inventory.js` 359) | `±delta` | ❌ **nothing** |
| **Order placed / deleted** (`orders.js` 32, 40) | `−ingredients` / `+ingredients` | ❌ **nothing** |

So stock is not merely unpersisted — it is **unauditable**. Two of the
four things that move it leave no record of who moved it or why.

This blocks the tidy answer. Stock *could* be derived the same way
occupancy can — opening + restocks − usage — but only if every movement
is logged. Two of them aren't.

**Recommendation: log the two missing paths first, then derive.** That
fixes the audit gap and the persistence gap with one change, and avoids a
second copy of "how much chicken is there".

---

## 5. Finding K — VAT is not editable at all

`setVatRate()` is exported from `charges.js` and **called from nowhere**.
There is no VAT input anywhere in `index.html` — the only `vat` ids are
`prev-vat` and `prev-vat-row`, which display it on the invoice preview.

So the rate is hardcoded to `0` for both properties and a manager cannot
change it in the app. This is not a persistence bug; it is a missing
feature with a dead setter sitting behind it, ready for a UI that was
never built.

Worth knowing: the rate is correctly frozen onto each invoice when
raised, so turning VAT on later is a setting rather than a migration.
That part is right.

---

## 6. Open question — should suggestions be shared?

Guide names, travel agents, countries and vehicles are remembered per
device in `localStorage`. The module's own comment explains the reasoning:
these cannot be configured up front because nobody knows the full set in
advance.

But the stated purpose is stopping "Pradeep", "pradeep" and "Pradeeep"
becoming three people — and per-device storage only achieves that on one
device. The tablet and the phone will each learn their own spellings.

Not a bug against its current design. Flagged as a decision.

---

## 7. Dependencies — what has to be wired before what

```
bookings (persisted)
   └── villa occupancy .............. DERIVE from bookings   [A]
          └── guest tab reachable via room.bookingId
          └── home dashboard occupancy count

restocks + stockUsage (persisted)
   └── stock levels ................. DERIVE, but first:
          ├── log manual adjustments ................ [I-1]
          └── log order reserve/restore ............. [I-2]

config collection (new, not yet created)
   ├── villas: name, rate ........... [B]
   ├── activities ................... [C]
   ├── branch info .................. [D]
   ├── conditions ................... [E]
   ├── cancellation ................. [F]
   ├── notices ...................... [G]
   ├── inventory items .............. [H]  (items, not stock)
   └── vat .......................... [K]  (needs a UI first)

menuItems (persisted)
   └── delete path .................. [J]  one missing remove() call
```

Two things follow from the shape of this:

**`[J]` is independent and one line.** It has no dependencies and is a
missing `remove()` call.

**`[A]` and `[I]` are not persistence work.** Treating them as "add a
write call" would create exactly the duplicated-fact bug this project
keeps having. They are derivation work, and `[I]` needs its two logging
gaps closed first or the derivation will be wrong.

---

## 8. Suggested order

| Step | Item | Why here |
|---|---|---|
| 1 | `[J]` menu delete | One line, no dependencies, currently resurrects deleted dishes |
| 2 | `[A]` derive occupancy from bookings | Most serious; unblocks nothing but fixes the worst failure |
| 3 | `[I-1]`, `[I-2]` log the two silent stock paths | Audit gap in its own right; prerequisite for step 4 |
| 4 | `[I]` derive stock from logs | Depends on step 3 being complete |
| 5 | `[B]`–`[H]` config collection + seed + hydrate | Largest, but mechanical and uniform once the pattern exists |
| 6 | `[K]` VAT UI, then persist with the rest | Needs a feature built before it can be persisted |

Steps 1–4 are correctness. Step 5 is the bulk of the work. Step 6 is a
new feature.

---

## 9. What this audit did not cover

Stated so the next person knows where the edges are.

**Closed since first writing:**

- **Cloud Functions' own writes** — checked. The welcome e-mail's
  Sent/Failed write, the Sheet mirror's cursor, and both staff-management
  writes all persist correctly. No gaps.
- **Files excluded from the mechanical scan** — checked. `store.js`,
  `sync.js`, `firestore-adapter.js` and `config-store.js` contain only
  the persistence machinery itself (the `array.push` in `store.js` *is*
  the write path). No hidden state.

**Closed — the blocker is resolved:**

- **Finding [A] is now observed, not inferred.** On dev, signed in as a
  manager with everything else hydrating correctly: a guest was checked
  into Balcony Villa, the booking was confirmed present *on the server*,
  the page was reloaded, and the result was
  `booking.status: "Checked In", booking.roomId: 7` alongside
  `room.status: "available", room.guest: null, room.bookingId: null`.

  The database knows a guest is in that villa. The villa does not.

  Worth recording how nearly this went wrong. The first attempt looked
  like a clean confirmation and was worthless: the dev profile document
  had its key stored as `"role "` with a trailing space, so
  `profile.role` was undefined, `isManager()` was false, and Firestore
  refused every read *and* every write. The villa read available because
  nothing had loaded at all — and the check-in was never saved either.
  A test that cannot fail for the right reason proves nothing, and this
  one would have written a false confirmation into this document.

  That malformed key is also this project's documented failure mode
  happening for real: the account signs in, routes down the manager path
  because `undefined !== "staff"`, looks entirely normal, and silently
  sees nothing. It affected `leopard-inn-dev` only; the live project's
  profile is correct.

**Deliberately out of scope:**

- **Whether every persisted write stores the *right* value.** This audit
  asks whether a write happens, not whether it is correct. The earlier
  lifecycle sweeps covered that for records.
- **The live project's existing data.** All inspection was static plus
  dev-project runtime; nothing was tested against `leopard-inn`.
- **Firestore rules for the new `config` collection.** None exists yet;
  it will be denied by the catch-all until written. That is wiring work,
  not audit work.
