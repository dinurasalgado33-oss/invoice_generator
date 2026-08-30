# Leopard Inn — Backend Audit & Go-Live Runbook

Everything so far was built against **`leopard-inn-dev`**, a throwaway
project. This file is the record of what that proved, what it did not,
and exactly what has to happen to stand up the real project without
repeating any of it.

`BACKEND-PLAN.md` holds the *decisions* and why they were made. This file
holds the *state* and the *steps*. Read that one for "why"; read this one
for "what's done and what's next."

Last updated: 2026-08-30, at commit `5587320`.

---

## 0. Phase plan

The order matters: each phase is safe to skip past only once the one
before it is actually verified, not just written. Security scoping comes
before the live project, because there is no point standing up real guest
data behind a rule nobody has watched actually block anything.

| Phase | What | Status |
|---|---|---|
| 1 | Verify branch scoping with a real staff account | ✅ Done — verified against live Firestore rules, not just the UI |
| 2 | Offline resilience test — network genuinely off | ✅ Done — full stay offline, verified synced after reconnect |
| 3 | Create the real `leopard-inn` project, go live | ✅ Done — live at https://leopard-inn.web.app, rules deployed before any data, counters + menu seeded, verified |
| 4 | Cloud Functions — welcome email, Sheets mirror, backups | ⏸️ Deferred — needs the Blaze plan, Dinura chose not to enable it yet. Provider decided: Resend |
| 5 | Staff management screen, PIN unlock, auto sign-out | 🟡 PIN lock + auto-lock done and verified; staff management screen still needs a Cloud Function |
| 6 | Firebase Hosting | ✅ Done — deployed to leopard-inn.web.app as part of Phase 3 |

This table is shown after every phase completes, updated in place.

---

## 1. Status at a glance

| Area | State |
|---|---|
| Firestore connection | ✅ Working, proven end to end |
| Auth (email/password) | ✅ Working — manager + staff both verified |
| Security rules — written | ✅ Done |
| Security rules — deploy pipeline | ✅ CLI installed, deploys cleanly |
| Security rules — branch scoping | ✅ Verified against live Firestore, not just UI (Phase 1) |
| Offline cache + multi-tab | ✅ Full stay tested with network genuinely off (Phase 2) |
| Record IDs (UUID) | ✅ Done, collision case tested directly |
| Number blocks keyed per project | ✅ Done — dev→live switch is safe, no manual steps needed |
| Numbering — reservations | ✅ Verified live |
| Numbering — invoices | ✅ Verified live |
| Numbering — GRC | ✅ Verified live |
| Numbering — proforma | ✅ Verified live |
| Cloud Functions | ❌ None written |
| Hosting | ✅ Live at leopard-inn.web.app |
| Google Sheets mirror | ❌ Not started |
| Backups | ✅ Native Firestore scheduled backups — DAILY, 14-day retention |
| `LIVE` project config | ✅ Filled in and verified on the real domain |
| The real `leopard-inn` project | ✅ Created, rules deployed, seeded, in use |

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

**Also verified since, in Phases 1 and 2:**

- Branch scoping (`mayTouchExisting` / `mayWriteIncoming`), tested
  directly against Firestore with a real staff account, bypassing the UI
  entirely: cross-branch reads and writes both refused with
  `permission-denied`, own-branch writes succeeded, manager-only
  collections (`logins`, `users`) refused to staff.
- Offline behaviour, with the Firestore SDK's network genuinely
  disabled: a full stay (check in, charge, checkout, invoice) completed
  offline, queued with `hasPendingWrites: true`, then landed on the
  server once reconnected and rehydrated correctly after a reload.
- All four document types — invoice, GRC, reservation, proforma — draw
  real, correctly formatted numbers from Firestore. Doing this surfaced a
  genuine bug: a financial year like `2026/27` contains a slash, and
  Firestore treats `/` as a path separator, so every block-reservation
  attempt was being rejected outright, on any project, regardless of
  rules. Fixed in `8dbbb6e`.

**Not built at all:** Functions, hosting, Sheets, backups, the real
`leopard-inn` project itself.

---

## 3. Resolved: rules now deploy with one command

This used to be the most important open problem in the file. It no
longer is — recorded here so the reason it mattered doesn't get lost.

`firestore.rules` used to reach Firebase only by being copy-pasted into
the console by hand, and the predictable thing happened: the `counters`
rule was added to the file in commit `1f3e3d1`, never pasted in, and
document numbering was silently refused for two commits before anyone
noticed. The file and the live project had quietly disagreed.

**Fixed.** The Firebase CLI is installed, `firebase.json`, `.firebaserc`
and `firestore.indexes.json` exist and are committed, and a real deploy
has been run successfully:

```bash
cd "path to the project folder"
firebase deploy --only firestore:rules
```

Whenever `firestore.rules` changes, that command is the whole publish
step — no console, no copy-paste, no chance of the repo and the live
project disagreeing again.

One thing worth remembering for the live project: `firebase login` and
`npm install -g firebase-tools` need to run in **your own terminal**, on
your actual machine — an AI assistant's tool calls run in a separate
sandboxed environment and cannot install anything onto your real disk or
complete a Google OAuth sign-in on your behalf. Deploys likewise have to
be run by you, or by an assistant working directly in a terminal on your
machine, never one working through a sandboxed tool.

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
- ~~**Number blocks.**~~ Fixed in `e2ba474` — the storage key now includes
  the project ID, so a device switching from dev to live cannot spend a
  dev-issued number against a live document. No manual clearing needed at
  switchover.

---

## 6. Gaps to close before real guests

Roughly in order of how much they'd hurt. Struck-through items are done —
kept here rather than deleted, so the record of what closed each gap
stays attached to why it mattered.

1. ~~**Rules deploy path** (§3).~~ Done — Firebase CLI installed, deploys
   with `firebase deploy --only firestore:rules`.
2. ~~**Verify invoice numbering.**~~ Done — surfaced and fixed a real bug
   in the process: a financial year's `/` broke Firestore document IDs.
3. ~~**Wire GRC and proforma numbering.**~~ Done — both draw real numbers
   now, and a second, unrelated bug in the proforma's printed number was
   found and fixed along the way.
4. ~~**Test with a real staff account.**~~ Done — Phase 1. Verified
   directly against Firestore, not just the UI: cross-branch reads and
   writes refused, own-branch access works, manager-only collections
   refused to staff.
5. ~~**Test offline properly.**~~ Done — Phase 2. Genuinely disabled the
   Firestore SDK's network (not just watched the UI), ran a full stay —
   check in, charge, checkout, invoice — entirely offline, confirmed both
   the GRC and the invoice queued with `hasPendingWrites: true`, then
   reconnected and confirmed both landed on the server
   (`fromCache: false, hasPendingWrites: false`) and rehydrate correctly
   after a fresh reload.
6. **Cloud Functions** — the welcome email send, the nightly Sheets
   append, the nightly backup. Phase 4. Note that the email API key
   must live in a Function and never in client JS, which is readable by
   anyone.
7. **Backups.** Firestore's scheduled export needs a Blaze plan and a
   Cloud Storage bucket. Free-tier Spark has no automatic backups at all —
   worth knowing before assuming the data is safe. Phase 4.
8. **Staff management screen** so accounts don't need console access
   forever. Manager-only, and it still cannot write `users/{uid}`
   directly — it needs a Function. Phase 5.
9. ~~**PIN unlock + auto sign-out.**~~ Done — `a953902`. Locks via header
   button, a ten-minute idle timer, and tab-hidden (which catches the
   tablet screen sleeping). Session survives, so unlocking returns to the
   exact screen. Explicitly not a security boundary; the rules are.
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

---

## 8. Dinura's list

Everything that needs Dinura specifically — console access, a Google
account, a payment method, or a decision. Nothing here can be done by an
assistant. Detail for each is in the section named.

| # | Task | Detail | Blocks |
|---|---|---|---|
| 1 | Create the `leopard-inn` project — production mode, `asia-south1` | §4.1 | everything below |
| 2 | `firebase deploy --only firestore:rules` against it, **before** any account or record exists | §4.2 | 3, 4 |
| 3 | Enable Email/Password auth | §4.3 | 4 |
| 4 | Create each real account + its `users/{uid}` doc by hand | §4.4 | going live |
| 5 | Add the real config to `LIVE` in `js/data/firebase-config.js` | §4.6 | going live |
| 6 | Add the serving domain to Authorized domains | §4.5 | sign-in working |
| 7 | Run through the verification checklist | §7 | confidence |

Optional, whenever wanted:

| # | Task | Note |
|---|---|---|
| 8 | `firebase deploy --only hosting` | Works on the free plan. Puts the portal on a public URL — deliberately left undone. |
| 9 | Enable the Blaze plan | Only needed for Phase 4 (welcome email, Sheets mirror, scheduled backups). Provider already chosen: Resend. |

Two things worth repeating because they are the ones that bite:

- **The branch string must be exactly `Wilpattu` or `Arugam Bay`.** A
  typo makes an account that signs in fine and then silently sees
  nothing, with no error saying why.
- **Rules before data, always.** An empty database with correct rules is
  safe. An empty database with default rules is not.
