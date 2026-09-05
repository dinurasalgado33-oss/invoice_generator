# Walkthrough — 6 September 2026

Against **leopard-inn-dev** (`isLiveProject: false`, confirmed by reading
`firebase-config.js`, not by trusting the URL). Deployed dev build under
test was `v=216` at the start and `v=217` after the two fixes below; each
fix was deployed to dev and re-verified against the served file, not the
working copy.

Signed in as **manager**. Production was not touched.

---

## 1. What was walked, and what was not

### Walked end to end, with real controls

The reception spine, as one continuous stay:

| Step | Result |
|---|---|
| Reservation `RES-2026/27-353` — 2 adults, 1 child, HB, Pool Villa 2, 2 nights | correct, rate snapshot `1000` stored |
| Check in against it → `GRC-2026/27-352` | every field carried; total 23,000 |
| Food order → **reload** → survived → completed | queue → 2 charges, 2,740 |
| Activity charge — Half Day Safari | 17,000, category `safari` |
| Checkout → `INV-2026/27-402` | bill 42,740 · service 474 · net 43,214 |
| Invoice e-mail queued | 462 KB PDF attached, status `Queued` |
| Guest History → reprint Card, Reservation, Invoice | all three correct |

Every arithmetic step was checked rather than assumed. The service charge
of 474 is 10% of the 4,740 of food, which includes the 2,000 board
supplement — the change made earlier this week, working in a real stay.

Also walked, all **previously never walked**:

- **Interim bill** — billed the 880 tab, villa stayed occupied, tab reset
  to 0, invoice stamped `interim: true`. The room charge was correctly
  left for checkout.
- **Travel agent invoice** — `TRA-2026/27-351`, linked to its reservation,
  cancellation policy printed, total 24,000.
- **Inventory** — restock and correction through the real ± controls.
  Stock is derived from the movement log, and a `Manual correction` row
  was written for each adjustment. Restored to its original 35kg.
- **Configure sweep** — all 12 rows opened; every one loaded real values
  (Branch details 8/8 fields, Charges 2/2, Times 2/2, liability notice,
  menu 78 rows, 4 conditions, 10 activities, 7 villas, 58 inventory rows).
- **Reports and Finance cross-checked against each other** — both say
  112,586 revenue over 3 invoices, and the category split now sums to
  exactly that.

### Not walked — be explicit about this

- **Printing to a real printer.** Still the largest untested surface. The
  print CSS renders, but nothing here proves what comes out of the
  machine at the desk.
- **Menu publish.** Blocked on dev — see D1 below. Not a code fault, but
  it means this path remains unproven for the fourth walk running.
- **Board menu editing** (`Edit board menu`) — opened but not exercised.
- **Staff account creation.** The screen loads and is correct, but
  creating an account needs a password typed into a form, which I do not
  do.
- **Arugam Bay.** Only its config and one reservation reprint were
  checked. The full spine was walked at Wilpattu only.
- **Offline behaviour.** Not exercised at all.
- **Real e-mail delivery.** Both queues were verified as *queued*, with
  the PDF present. Whether Gmail accepts and delivers them is untested.

### One limitation of this walk's evidence

The Browser pane kept losing composition, so rendered `opacity` and mouse
events were unreliable and most interaction was driven by clicking the
real control elements directly. The handlers, submits and records are
therefore genuinely exercised; **pixel-level rendering is not proven**.
The viewport also settled at 404×873 rather than the 375×812 requested,
so scroll measurements below are if anything *optimistic* — a real phone
is narrower and will scroll more.

---

## 2. Bugs found and fixed

### B1 — The Finance dashboard's category split was all-time, under a monthly heading

**What it was.** `renderDashboard` computes its KPIs from `monthInvoices`,
but the Revenue by Category pie and legend read `branchInvoices` — every
Active invoice the branch had ever raised, with no month filter. The same
flaw sat in **Payable to Providers**, which filtered activity records by
branch only.

So a screen titled "Finance Dashboard", stamped "Generated 06 Sept 2026",
showing "THIS MONTH'S REVENUE LKR 111,618", displayed underneath it:

| | Villa | F&B | Safari |
|---|---|---|---|
| Shown | 81,000 | 16,918 | 51,000 |
| Actually September | **52,500** | **8,118** | 51,000 |

Villa overstated by 54%, and getting worse every month the hotel trades.

**Why nothing errored.** The slices were real money, correctly attributed
and correctly converted — just for the wrong span. Nothing threw, nothing
reached the error log, and the numbers looked entirely plausible. The only
visible symptom was that the slices summed to more than the revenue KPI
directly above them, which reads as rounding until you add it up.

**How it was verified.** I reproduced `categoryLKR` outside the app and
computed both spans. The displayed figures matched the all-time
computation to the rupee (81,000 / 16,918 / 51,000) and did not match
September. After the fix, the screen reads 52,500 / 8,118 / 51,000 — and
the three slices now sum to **exactly** the revenue KPI, which they never
did before. Re-checked after a third invoice was raised later in the walk:
52,500 + 9,086 + 51,000 = 112,586, matching both the KPI and the Reports
screen.

**Honest caveat on the second half.** The Payable-to-Providers fix is
confirmed *by reading*, not by observation: all three activity records on
dev happen to fall in September, so all-time and this-month are identical
and I could not make that figure diverge. It will diverge in October, and
a manager paying against it would pay September's safaris twice.

`js/dashboard.js`

### B2 — 69 focusable controls inside 14 invisible sheets

**What it was.** Closed sheets are hidden with `opacity: 0` and
`pointer-events: none`. That stops a finger. It does not stop the Tab key,
and it does not remove anything from the accessibility tree. Every one of
the 14 overlays in the markup kept its inputs, buttons and dropdowns in
the focus order — 69 controls in total. Tabbing through a screen walked
into them: focus disappeared off-screen with no visible ring, and Enter
could press a button nobody could see.

**Why nothing errored.** Reception uses touch, so nobody would ever hit
it by hand. It is invisible in exactly the way this project's bugs
usually are.

**How it was fixed.** `inert` is the one thing that removes a subtree from
focus, from the accessibility tree and from clicks together. It is kept in
step with the `.open` class by a MutationObserver rather than added at
each of the many places a sheet opens or closes — that list is precisely
what a future sheet would be forgotten from.

**How it was verified.** Before: focusing `#void-reason` in a closed sheet
succeeded. After: 14/14 closed overlays report `inert`, focus no longer
lands, and toggling `.open` releases and re-applies it — so the check
discriminates in both directions rather than merely passing.

`js/navigation.js`

---

## 3. UX findings — recorded, not changed

Ranked by cost to the person using it.

### U1 — The dish list is a 320px porthole over 5,706px of menu

`.food-order-list` has `max-height: 320px` hardcoded. Measured: 68 dishes,
66px per row, **4.8 dishes visible at a time**, 17.8 screens of scrolling
inside a box occupying a third of the screen — on a viewport 873px tall.

There *is* a search box and it works correctly (filters, shows a proper
empty state, restores on clear), which takes most of the sting out. But
reception taking an order over the phone, browsing rather than searching,
is scrolling a letterbox.

**Cost:** to reach dish #59 by scrolling, ~12 swipes inside a small box.
**Suggested fix:** make the height responsive — `max-height: 55vh` roughly
doubles what is visible and costs nothing else.
`css/rooms.css:303`

### U2 — Two phone fields, one of them ambiguously labelled

The registration card has **Phone** on step 1 (the guest's, carried from
the reservation) and **Contact No** on step 3, sitting between
"Guide / Chauffeur" and "Vehicle No" — so it is the guide's number, but
the label does not say so.

I misread it myself during this walk and briefly believed the guest's
phone had failed to carry.

**Cost:** the guest's number typed twice, or the guide's left blank.
**Suggested fix:** relabel to "Guide's Contact No".

### U3 — The larger charge asks for less confirmation

Completing a **2,740** food order opens a confirm dialog. Charging a
**17,000** safari — money that is also owed onward to a third party —
applies immediately with no dialog at all.

**Cost:** a mis-tap on the activity sheet puts 17,000 on a guest's bill
silently. The inconsistency also teaches staff that dialogs are arbitrary.
**Suggested fix:** confirm the activity charge too, or drop the food-order
confirm. Either is defensible; the asymmetry is not.

### U4 — The Charges step is 3.1 screens for an ordinary bill

Invoice step 2 measured **3.14 screens of scrolling** with 5 line items,
because each item is a tall stacked card at phone width. A 10-line bill
would be over 6 screens.

**Cost:** checking a bill against what the guest is saying means scrolling
back and forth with them standing there.
**Suggested fix:** a compact row for saved lines that expands on tap.

### U5 — A failing publish gives no feedback for minutes

With Storage unreachable, the Publish button sat on "Publishing…",
disabled, for over five minutes with no error and no timeout. The code is
not at fault — `withBusy` has a correct try/catch/finally with a toast —
the Firebase SDK simply retries a blocked upload for a very long time
before rejecting.

**Cost:** a manager cannot tell a slow publish from a broken one, and the
only signal is a button that never comes back.
**Suggested fix:** race the upload against a timeout (~20s) and say
"Couldn't reach storage — check your connection and try again."

### U6 — One long form where the other two are stepped

The registration card is a 4-step stepper. The invoice is a 4-step
stepper. The reservation form is a single screen of 10 fields and 1.24
screens of scroll. It works, and it is arguably right for a short form —
but it is the odd one out, and a member of staff who learns the stepper
pattern twice will look for it a third time.

**Cost:** small, but it is the kind of inconsistency that makes an app
feel assembled rather than designed.

### U7 — Wilpattu prints "Hotel", Arugam Bay prints "Villa"

`hotelName` is "Leopard Inn Wilpattu **Hotel**" and "Leopard Inn Arugam
Bay **Villa**". This prints at the head of every invoice, confirmation and
registration card. You told me in an earlier session it is villa, not
hotel.

This is **config data**, editable in Configure → Hotel & bank details, so
it is yours to change rather than mine — and the values on production may
differ from dev. Worth checking there.

### U8 — Both properties share one e-mail address, phone and bank account

Arugam Bay's `email` is `leopardinnwilpattu@gmail.com`. It prints on
Arugam Bay guest invoices and agent invoices. The phone and the full bank
account are also identical across both.

The shared bank account may well be deliberate — one company, one account.
The **e-mail** reading "wilpattu" on an Arugam Bay guest's bill is the part
that looks like a mistake to the guest. Also config data.

### U9 — Guest History is 3.6 screens with one stay in it

Measured 3.61 screens of scroll showing a single result. The card is
generous — four document buttons, a charges expander, status pills — which
is good, but the density is low for a screen whose job is finding one stay
among many.

---

## 4. If only three things get done

1. **U2, relabel "Contact No" → "Guide's Contact No".** A one-word change
   that removes a real ambiguity on a legal document. Minutes.
2. **U1, make the dish list `55vh` instead of `320px`.** One line, roughly
   doubles what reception can see while taking an order.
3. **U3, confirm the activity charge.** It is the largest amount anyone
   can add to a bill with a single tap, and it is the only one that adds
   it without asking.

U5 is the next one after those, and matters more once you are relying on
the guest menu link in daily use.

---

## 5. Not established by this walk

- **Anything printed on paper.** Print CSS renders; a printer was never
  involved.
- **Menu publishing anywhere.** Broken on dev (D1), and I did not publish
  on production during an audit.
- **That e-mails arrive.** Both queues hold correct rows with the PDF
  attached; delivery is the Cloud Function's job and was not invoked.
- **Behaviour at scale.** 68 dishes, 5 invoices, 4 villas. Nothing here
  says how the lists behave after a season of trading.
- **Offline and bad signal** — the condition the app is built for, and the
  one hardest to test from here.
- **Pixel rendering.** See the evidence limitation in section 1.
- **Staff-role behaviour.** Walked as manager throughout. The staff
  boundary was verified in an earlier session (`704bcbd`) and not re-checked.

---

## D1 — Dev blocker, not an app bug

Firebase **Storage on `leopard-inn-dev` has no CORS configuration**, so
every request from `https://leopard-inn-dev.web.app` fails its preflight:

```
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/...'
blocked by CORS policy: Response to preflight request doesn't pass access
control check: It does not have HTTP ok status.
```

This affects reading *and* writing menu PDFs, so menu publish cannot be
walked on dev at all — which is likely why it has stayed unwalked for four
walkthroughs. Production is configured (you have published and e-mailed
menus from it), so this is a gap in the dev project only.

Fixing it needs `gsutil` and a one-line CORS file, run in your terminal:

```bash
gcloud storage buckets update gs://leopard-inn-dev.firebasestorage.app --cors-file=cors.json
```

…with `cors.json` allowing origin `https://leopard-inn-dev.web.app` for
`GET, PUT, POST, HEAD`. Until then, treat menu publish as verified on
production only.
