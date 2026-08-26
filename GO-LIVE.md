# Leopard Inn — Backend Audit & Go-Live Runbook

Everything so far was built against **`leopard-inn-dev`**, a throwaway
project. This file is the record of what that proved, what it did not,
and exactly what has to happen to stand up the real project without
repeating any of it.

`BACKEND-PLAN.md` holds the *decisions* and why they were made. This file
holds the *state* and the *steps*. Read that one for "why"; read this one
for "what's done and what's next."

Last updated: 2026-08-26, at commit `6745a0f`.

---

## 1. Status at a glance

| Area | State |
|---|---|
| Firestore connection | ✅ Working, proven end to end |
| Auth (email/password) | ✅ Working — one account |
| Security rules | ⚠️ **Written in full, published only in part** — see §3 |
| Offline cache + multi-tab | ✅ Configured, not stress-tested |
| Record IDs (UUID) | ✅ Done, collision case tested directly |
| Numbering — reservations | ✅ Wired |
| Numbering — invoices | ⚠️ Wired, **unverified** (blocked by rules) |
| Numbering — GRC, proforma | ❌ Not wired |
| Cloud Functions | ❌ None written |
| Hosting | ❌ Not set up |
| Google Sheets mirror | ❌ Not started |
| Backups | ❌ Not configured |
| `LIVE` project config | ❌ Deliberately still `null` |

---

## 2. What dev actually proved

Worth being precise here, because "it worked in dev" is doing a lot of
load-bearing work otherwise.

**Genuinely verified, by watching real data move:**

- The app connects to Firestore, signs in, and loads.
- A real sign-in writes a row to `logins`, which was read back in the
  console. That single fact proves the whole chain: config → auth →
  profile lookup → rules → adapter → write.
- The `users/{uid}` profile drives role and branch correctly.
- Sign-in no longer races itself; the busy state and the 10s hydration
  timeout both behave.
- UUID record IDs: two bookings created back to back with no
  coordination, charges added to each, and neither guest's tab picked up
  the other's. This was the actual bug being fixed, tested directly.
- A full stay — check in, charge, check out, invoice — completes with no
  console errors.

**Written and syntactically sound, but never observed working:**

- Every rule except the handful exercised by `logins` and the collections
  that hydrate at sign-in. In particular the branch-scoping rules
  (`mayTouchExisting` / `mayWriteIncoming`) have **never been tested
  against a real staff account** — there has only ever been one manager
  account. A staff member being correctly locked out of the other
  property's records is, right now, an untested claim.
- Offline behaviour. The persistent cache is configured but nothing has
  been done with the network actually off.
- Invoice numbering, which was wired at `6745a0f` and could not be
  verified because block reservation is refused (§3).

**Not built at all:** Functions, hosting, Sheets, backups.

---

## 3. Fix this first: there is no way to deploy rules

This is the most important finding in the file, and it is a process
problem rather than a code one.

`firestore.rules` is a complete, careful, 200-line security boundary that
lives in the repo — and **nothing deploys it.** It has only ever reached
Firebase by being copy-pasted into the console by hand.

The predictable thing happened. The `counters` rule was added to the file
in commit `1f3e3d1`, never pasted in, and so document numbering has been
silently refused ever since. It surfaced only because invoice numbering
was tested today and returned `permission-denied`. The file and the live
project had quietly disagreed for two commits.

Two things follow, and both matter more for the real project than for
dev:

1. **The rules in the repo are not evidence of the rules in force.** For
   `leopard-inn-dev` that is an annoyance. For the real project it is a
   guest-data question, because the file is the only place the branch
   scoping is written down.
2. **Set up the Firebase CLI before creating the live project**, so the
   live project never has a hand-edited rules state to drift from:

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init firestore
   ```

   That writes `firebase.json`, `.firebaserc` and
   `firestore.indexes.json` — none of which exist today. After that,
   publishing rules is one command that can be committed alongside the
   change that needed it:

   ```bash
   firebase deploy --only firestore:rules
   ```

**Immediate action, before anything else:** paste the current
`firestore.rules` into `leopard-inn-dev` → Firestore → Rules → Publish,
so invoice numbering can be verified against dev before the live project
is built on top of unverified work.

---

## 4. Setting up the live project

### 4.1 Create it

Console → Add project → name it (`leopard-inn` or similar).

- **Firestore: create in production mode.** Not test mode. Test mode is
  world-readable for 30 days and this database holds passport and NIC
  numbers from the first check-in onward. Production mode denies
  everything until rules are published, which is the correct starting
  point.
- **Location: `asia-south1` (Mumbai)** — nearest region to Sri Lanka.
  This is permanent and cannot be changed later, so it is worth getting
  right rather than accepting the US default.
- Analytics is optional and unused by the code. Harmless either way.

### 4.2 Publish the rules before anything else

Deploy `firestore.rules` (via CLI per §3) *before* creating any account
or writing any record. An empty database with correct rules is safe; an
empty database with default rules is not.

Then confirm in the console that the `counters` block is present. That is
the one that has already been missed once.

### 4.3 Enable Email/Password auth

Authentication → Sign-in method → Email/Password → Enable.

Email/Password is the only provider the code uses. Google sign-in was
discussed and is **not implemented** — `session.js` calls
`signInWithEmailAndPassword` and nothing else. Enabling Google in the
console alone would not make it work.

### 4.4 Create the accounts

For each person, in Authentication → Users → Add user. Then copy their
UID and create `users/{uid}` in Firestore **by hand**.

The app cannot create these documents — `allow write: if false` on
`/users/{uid}` is deliberate, and it is what stops a receptionist
promoting themselves to manager. So this step is manual, always.

Document shape:

| Field | Type | Value |
|---|---|---|
| `role` | string | `manager` or `staff` — exactly, lowercase |
| `active` | boolean | `true` |
| `branch` | string | `Wilpattu` or `Arugam Bay` — staff only |
| `name` | string | display name, optional |
| `email` | string | optional, for the audit trail |

**The branch string must match exactly**, including the space in
`Arugam Bay`. It is compared with `==` in the rules and `===` in the app.
`arugam bay` or `ArugamBay` will produce an account that silently sees
nothing, with no error explaining why.

`active: false` is the way to switch someone off — never delete the auth
user, or their sign-in history in `logins` loses its subject.

### 4.5 Authorized domains

Authentication → Settings → Authorized domains. Add whatever the app is
actually served from. Sign-in fails from any domain not on this list, and
the error does not make the reason obvious.

### 4.6 Fill in `LIVE`

In `js/data/firebase-config.js`, replace `const LIVE = null;` with the
live project's config object.

Until that is filled in, **any real domain silently falls back to the dev
database** — the app shouts about it in the console and sets
`data-using-test-database` on `<html>`, but it does not stop. Do not
leave this half-done.

Selection is by hostname and needs no flag: localhost, `127.0.0.1`,
`::1`, `*.local`, `192.168.*`, `10.*` and `file://` all get dev.
Everything else gets live. That direction is deliberate — an unrecognised
host gets the *test* database, so the mistake goes the safe way.

### 4.7 Indexes

Nothing to do. The adapter issues one query shape only —
`where("branch", "==", …)`, single field — which Firestore indexes
automatically. No composite indexes are needed, and
`firestore.indexes.json` can stay empty.

If a query with a second filter or an `orderBy` is added later, Firestore
will refuse it at runtime with a console link that creates the index.

---

## 5. What must NOT be carried over from dev

- **The dev config values.** `firebase-config.js` keeps `DEV` and `LIVE`
  as separate objects on purpose. Do not overwrite `DEV` with live
  values — that removes the safety net that makes local development
  incapable of touching real guest records.
- **The test account.** `dinurasalgado33@gmail.com` on dev has a weak
  password that was fine for a throwaway project. The live project holds
  real guests' passport numbers; it needs a real password, and that
  password should be set by you and never typed into a chat, this file,
  or the repo.
- **Any data.** There is none worth moving — the seed and demo records
  were cleared earlier, so the live project starts genuinely clean. That
  is an advantage: no migration step, no risk of demo bookings appearing
  in real revenue.
- **Number blocks.** Reserved blocks live in each device's
  `localStorage`, keyed per project only by branch and year — *not* by
  project ID. A device that used dev and then switches to live will still
  be holding a dev block and will spend its numbers against live
  documents. Clear site data on every device at the switchover, or the
  first live invoices carry numbers the live counter knows nothing about.
  Worth fixing properly by putting the project ID in the storage key.

---

## 6. Gaps to close before real guests

Roughly in order of how much they'd hurt.

1. **Rules deploy path** (§3) — everything else is guesswork without it.
2. **Verify invoice numbering** once rules are published. Wired but
   unproven.
3. **Wire GRC and proforma numbering.** Same `takeNumber` machinery,
   two more files. Until then those documents have no numbering scheme at
   all.
4. **Test with a real staff account.** The branch scoping is the single
   most security-relevant thing in the rules and has never been exercised.
   Create a staff account on dev, sign in, confirm they cannot see the
   other property.
5. **Test offline properly.** Check in a guest with the network off,
   reconnect, confirm the records arrive intact and the numbers do not
   collide with another device's.
6. **Cloud Functions** — the welcome email send, the nightly Sheets
   append, the nightly backup. None written. Note that the email API key
   must live in a Function and never in client JS, which is readable by
   anyone.
7. **Backups.** Firestore's scheduled export needs a Blaze plan and a
   Cloud Storage bucket. Free-tier Spark has no automatic backups at all —
   worth knowing before assuming the data is safe.
8. **Staff management screen** so accounts don't need console access
   forever. Manager-only, and it still cannot write `users/{uid}`
   directly — it needs a Function.
9. **PIN unlock + auto sign-out.** A shared reception tablet left signed
   in is the realistic threat, not a remote attacker.
10. **Hosting.** `firebase deploy --only hosting`, plus the domain added
    to authorized domains (§4.5).

---

## 7. Verifying the switch

After filling in `LIVE`, from the real domain, in the browser console:

```js
const fb = await import('/js/data/firebase.js');
fb.currentProject();          // must be the LIVE project id, not leopard-inn-dev
document.documentElement.dataset.usingTestDatabase;  // must be undefined
```

Then sign in and confirm:

- `logins` gets a new row in the **live** project's console.
- Numbering primes: `blockStatus` reports `hasBlock: true` for each
  document type, for each property the account works at.
- A staff account sees only its own property, on every screen.
- `errors` stays empty. Anything landing there at this stage is a real
  misconfiguration, not noise.

If `currentProject()` still says `leopard-inn-dev` on a real domain, stop
— `LIVE` is not filled in, and everything being typed in is going into a
database meant to be thrown away.
