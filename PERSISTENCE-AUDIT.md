# What talks to the database, and what only pretends to

Every piece of shared state in the app, whether a change to it reaches
Firestore, and whether it survives a reload. Built by scanning all 99
mutation sites in `js/` and classifying each one, after villa rates were
found to be memory-only.

The pattern behind every gap below is the same: the sync work traced
**records** — bookings, invoices, charges — and never checked **state**
that is edited rather than created. A villa's nightly rate and a villa's
occupancy are both as financial as an invoice; they are financial
*before* the bill rather than after it.

Status: 🔴 not started · 🟡 in progress · ✅ done and verified

---

## 1. Critical — wrong answers to a guest at the desk

| # | State | Where | Problem | Status |
|---|---|---|---|---|
| 1.1 | Villa occupancy — `status`, `guest`, `bookingId`, `checkin`, `checkout`, `phone`, `source` | `js/rooms.js` (7 sites) | Never written, never derived. Every seed room is `available`, so **after any reload every villa shows free even with guests in them**. A second device never sees occupancy at all. Invites double-booking an occupied villa, and orphans the guest's tab from the room. | 🔴 |

The booking record itself survives — it is persisted. What is lost is the
room's link to it, which is the thing reception actually looks at.

---

## 2. High — money, and things a manager changes

| # | State | Where | Problem | Status |
|---|---|---|---|---|
| 2.1 | Villa name and nightly rate | `configure.js:98-99` | `room.rate = rate` and stop | 🔴 |
| 2.2 | Activities and prices | `configure.js:239,261` | add/delete, no persist | 🔴 |
| 2.3 | Branch details — hotel name, address, phone, **bank account** | `configure.js:302` | no persist | 🔴 |
| 2.4 | **VAT rate** per property | `charges.js:111` | no persist | 🔴 |
| 2.5 | GRC terms & conditions | `configure.js:392,414` | no persist | 🔴 |
| 2.6 | Cancellation policy | `configure.js:508,511,530` | no persist | 🔴 |
| 2.7 | Proforma notices | `configure.js:592,611` | no persist | 🔴 |
| 2.8 | Inventory items — add, edit, delete | `inventory.js:439,462` | no collection exists | 🔴 |
| 2.9 | Stock levels | `inventory.js:58,359`, `orders.js:32` | mutated in place; the restock/usage **logs** persist but the number does not, so stock resets to seed on reload | 🔴 |
| 2.10 | Deleting a menu dish | `menu.js:268` | splices locally, never calls `remove()` — the dish **comes back** on next hydration | 🔴 |

---

## 3. Already correct

| State | Collection |
|---|---|
| Invoices, incl. void + reissue | `invoices` |
| Bookings, incl. status changes | `bookings` |
| Guest charges, incl. billed / written-off / released | `guestCharges` |
| Food order and activity charge records | `foodOrders`, `activityCharges` |
| Reservations, incl. cancel with reason | `reservations` |
| Agent invoices | `proformaInvoices` |
| Registration cards | `registrationCards` |
| Restock and usage log entries | `restocks`, `stockUsage` |
| Welcome e-mail queue | `guestEmails` |
| Room activity log | `roomActivity` |
| Sign-ins, errors | `logins`, `errors` |
| Menu dish **add and edit** (not delete — see 2.10) | `menuItems` |
| Document number blocks | `counters` |

---

## 4. Deliberately not persisted

| State | Why |
|---|---|
| `FOOD_ORDERS` live queue | "Currently pending" only ever means orders placed just now; cleared each session by design. The *records* of completed orders do persist. |
| Report filters, search, tab | Per-person view state, not shared fact. |
| Download links, canvas exports | Transient DOM. |
| Suggestion lists | Derived from records already stored. |
