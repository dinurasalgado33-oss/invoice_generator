# Leopard Inn — Backend Plan

Decided 21 August 2026, before any of it was built. Everything here is a
choice Dinura made, with the reasoning kept so a future decision can be
weighed against it rather than guessed at.

Two properties, ten villas. Wilpattu Forest Retreat (4) and Arugam Bay
Beachfront Hotel (6).

---

## 1. Stack

| Piece | Choice | Why |
|---|---|---|
| Database | **Firestore** | Real offline persistence — writes queue locally and sync on reconnect. This is the reason for Firebase, not popularity. Wilpattu's signal is unreliable and reception cannot be blocked mid-check-in. |
| Auth | **Firebase Auth**, e-mail + password | Replaces the three hardcoded plaintext logins. |
| Functions | **Cloud Functions** | Sends the welcome e-mail, writes the Google Sheet, reserves numbering blocks. Anything holding a secret. |
| Hosting | **Firebase Hosting** | Serves the app, the menu PDFs and the QR target. Free, HTTPS included. |
| Audit mirror | **Google Sheets** | The manager already lives in spreadsheets and an accountant can be given a Sheet without app access. |
| Backups | **Firestore scheduled export** → Cloud Storage | The Sheet is a report, not a backup. |
| Environments | **Two projects** — `leopard-inn-dev`, `leopard-inn` | A mistake while building cannot corrupt a real invoice or delete a guest's registration card. |

Blaze (pay-as-you-go) is required on the live project for Functions and
scheduled exports. At ten villas the usage rounds to zero, but a card must
be on file.

---

## 2. Decisions already fixed

### Offline and sync

- **Offline-first.** Staff keep working with no signal; it syncs later.
- **Last-to-sync wins**, chosen knowing an earlier write can be overwritten
  without anyone noticing. Blast radius is small because almost everything
  is append-only — invoices, orders, activity charges, registration cards
  and reservations cannot conflict. Only villa occupancy is mutable.
- **Guest charges are separate documents, not a list on the villa.** This
  is the one place last-write-wins genuinely loses money: reception adding
  a drink on one phone and the kitchen adding a curry on another would,
  as a single array, end with one charge silently replacing the other.
  As separate documents both survive and the bill is their sum.

### Numbering

- **Per property.** Wilpattu counts its own series and Arugam Bay counts
  its own. Matches how the two hotels already run.
- **Restarts each financial year, on 1 April** — e.g. `INV-2026/27-001`.
  An accountant gets a series that matches the period they file.
- **Reserved blocks.** A device claims a block of numbers while it has
  signal and spends them offline, because Firestore transactions do not
  work offline and two phones would otherwise both claim the same number.
  A printed number never changes afterwards. **Gaps in the sequence are
  expected and normal** — tell the manager, or it looks like missing
  invoices.

### Time

- **Sri Lanka time is what a day means.** Timestamps stay UTC underneath,
  which is correct, but everything that groups or reports by day converts
  to Asia/Colombo first. Without this, anything recorded after 6:30pm is
  stamped with the previous day in UTC, and the nightly Sheet job would
  pick the wrong invoices every single night — a silent, permanent skew
  rather than a visible break. Fixed before anything touches the database.

### Money

- **Revenue comes only from the checkout invoice.** Never reservations,
  never agent proformas. Already true in the code.
- **No cancellation-fee calculation.** The printed policy stays as terms.
- **VAT is configurable** — a rate the manager sets, defaulting to zero,
  stored on each invoice so an old bill keeps the rate it was raised at.
- **Discounts are percentages everywhere** — invoices, reservations and
  agent invoices. The flat-amount option goes.
- **Foreign-currency bills store the exchange rate used**, stamped at
  billing time. Already built.
- **Financial year starts 1 April.**

### Records

- **Nothing financial is ever hard-deletable.** Invoices, registration
  cards, reservations and agent invoices are voided or cancelled, never
  removed. Menu dishes and stock items may be deleted.
- **Config changes are logged** — every villa rate, dish price and policy
  edit records who changed it, when, and what it was before.
- **No historical import.** The database starts clean from go-live; the old
  spreadsheets stay as reference. Their known problems (the Chicken Kottu
  price disagreement) do not get imported with them.
- **Daily backup, nothing rolled off.** Revisit when data protection is
  looked at properly — passport and NIC numbers accumulate indefinitely.
- **No restore drill before go-live.** Dinura's call, knowing the risk:
  the first time an incomplete export would be discovered is the day it
  was needed. Worth doing eventually.

### Access

- **E-mail and password, with a PIN to unlock the app.** The account stays
  signed in so nobody types a password during a busy check-in, but a guest
  who picks up the reception phone cannot read passport numbers.
- **Staff are scoped to their own property.** Managers see both, one at a
  time.
- **Voiding an invoice stays manager-only.**
- **The app signs itself out after a long idle period.** The PIN stops a
  guest at the desk reading passport numbers, but the account stays signed
  in and a client-side PIN can be bypassed — so anyone who *takes* the
  phone has full access regardless. Auto sign-out means a lost phone stops
  being useful within hours instead of indefinitely. The PIN is screen
  privacy, not device security; a missing phone means disabling the
  account, not trusting the PIN.
- **Property scoping is enforced by the rules, not the screens.** A
  Wilpattu receptionist cannot read Arugam Bay guest records even if they
  went looking for them. Managers read both, so Reports' "All Branches"
  still works for the people who use it.
- **A small manager-only staff screen** to add or disable a member of
  staff and set their property. *This reverses an earlier decision that
  the Firebase console was enough* — it changed once it was clear that
  adding someone needs a custom claim set by a Function, so it is a
  two-step job, not one click, and not something to be doing with a new
  receptionist waiting.

### The app itself

- **The service worker owns caching.** The twelve hand-bumped `?v=` tags
  go. Two caching schemes that don't know about each other is how staff
  end up running a three-week-old app while you swear it was fixed. Staff
  get told a new version is ready and it updates on next open.
- **Automated tests for the sync layer only** — writes queuing offline,
  syncing in order, nothing lost on reconnect. That is the piece where
  "I checked it in the browser" genuinely stops being enough, because a
  charge lost in sync looks like nothing at all on screen. Everything else
  stays hand-checked.

### Guest-facing

- **The app installs to the home screen** (PWA) with the Leopard Inn crest,
  opens full-screen, and caches itself so it starts with no signal.
- **Welcome e-mail on check-in**, carrying every menu for that property.
  Automatic, with sent / queued / failed / no-e-mail visible in Guest
  History — a silent bounce was the thing to avoid.
- Sender is **the property's own name** — "Leopard Inn Wilpattu" or
  "Leopard Inn Arugam Bay" — through Gmail until a domain exists.
- **E-mail required on the registration card** unless staff tick that the
  guest has not got one.
- **Menu PDFs are hosted**, so the QR code and the e-mail have a stable
  address. Public read must be scoped to the menu alone — the same
  database holds passport and NIC numbers.

### Audit mirror

- **Google Sheet, nightly, append-only, shared with Dinura and the
  accountant.** Read-only to everyone.
- Contents: **everything bearing on revenue** — invoices, voids as
  reversal rows, provider payouts (what leaves for jeep operators and
  drivers) and stock spend.
- **Never written back to.** Firestore is the record; the Sheet is a
  mirror. Two writable copies of the same fact is the bug class this whole
  project has been spent killing.
- A void appends a reversal row; it never edits the original. That is how
  books work, and it means a row once written can be trusted.

### Errors

- **The app reports its own errors** to a collection Dinura can read —
  screen, message, time. Today a crash on one receptionist's phone is
  invisible until someone mentions it.

---

## 3. Still open

- **Domain.** Not yet owned. Hosting runs on the free `web.app` address and
  e-mail goes via Gmail until one exists; both are built so the domain
  drops in without rework.
- **VAT rates.** Configurable, but the actual percentages and what they
  apply to (rooms, food, or both) are not yet known.
- **Data protection / PDPA.** Deferred deliberately. Passport and NIC
  numbers go in as-is. Revisit before real guests' data is live.
- **Printed output has never been checked against the paper originals.**
  Folded into the phase where the team configures the system.
- **A backup has never been restored.** Accepted for now.
- **Nobody has used the app for a real shift.**

---

## 4. Order of work

Two things happen before the database exists, deliberately — both are
easier to get right while a mistake still costs nothing.

1. **Sri Lanka time** everywhere a day is grouped or reported.
2. **Guest charges become their own records** rather than a list on the
   villa. Done on its own and tested hard: it touches checkout, the
   part-way bill, villa release and the cancel-write-off — the four paths
   where every money-losing bug found on 21 August actually lived.
3. **Store abstraction** — every persisted write through one place with a
   swappable adapter. *(started — `js/data/store.js`)*
4. **Error logging** — starts local, changes destination later.
5. **Percentage-only discounts** and the **configurable VAT** field.

Then, once Dinura sends the two web configs:

6. **Firestore adapter** + security rules — staff scoped to their property,
   manager-only voiding, menu publicly readable and nothing else.
7. **Sync-layer tests.**
8. **Auth** replacing the hardcoded accounts, the PIN lock, auto sign-out,
   and the staff screen.
9. **Numbering blocks**, per property, resetting 1 April.
10. **PWA** — manifest, icon, service worker; the `?v=` tags come out.
11. **Hosting** — app and menu PDFs.
12. **Functions** — welcome e-mail, nightly Sheet append, nightly backup.

## 5. Setup checklist for Dinura

```
1. console.firebase.google.com — create two projects:
     leopard-inn-dev
     leopard-inn
2. In each:  Build > Firestore Database > Create  (production mode, asia-south1)
3. In each:  Build > Authentication > Sign-in method > enable Email/Password
4. Live project only:  upgrade to Blaze  (needed for Functions and backups)
5. In each:  Project settings > General > Your apps > Web > register
             copy the firebaseConfig object and send both
```

The web config is safe to share — it is public by design, and the security
lives in the rules, not in hiding it.
