---
name: walkthrough-fix
description: Work through the UX findings in the newest WALKTHROUGH file — build them, verify each on dev, then ship to production and update the document. Use after a walkthrough has been reviewed and the user says to fix the findings.
---

# Execute the findings

Phase two. The walk found them and the user has approved them; this builds
them. Read the newest `WALKTHROUGH-*.md` first and work from its ranking,
not from memory of the conversation.

## Before starting

Confirm which findings are in scope. "Fix them all" means the UX findings
listed in that document — not new ideas that occur along the way. Anything
new goes in the document as a finding, not into the diff.

If a finding turns out to be **wrong**, say so and strike it through in the
document with the reason. That has happened before: a finding tagged
"confirmed in source" was a grep against the wrong class name, and the
feature had worked for three weeks. Withdrawing a finding is a result.

## Build order

Cheapest-first within the ranking. A finding that takes one line and saves
reception a tap every checkout beats one that takes an hour and saves a
manager a scroll once a month.

Group edits that touch the same file. Do not interleave unrelated changes in
one commit — each commit should be one finding or one coherent group, so a
single change can be reverted without taking others with it.

## Verify each one, on dev, before moving on

- Deploy to dev and **prove the version is live** before believing a result.
  Committing is not deploying.
- **Make the check fail first.** Break it, watch it go red, restore it.
- Measure rather than eyeball: box sizes, request counts, computed styles,
  screens of scrolling before and after.
- Screenshot at 375px for anything visual.
- Check the whole lifecycle, not the screen. A field that saves is not a
  field that reloads, reprints and reports correctly.

Watch for what edits like these break: **duplicate element IDs** when markup
moves, **handlers bound to elements that no longer exist**, and
**document-wide selectors** picking up the class you just reused.

## Ship

Only after every finding in the batch passes on dev:

```bash
firebase deploy --only hosting --project leopard-inn
curl -s "https://leopard-inn.web.app/?cb=$(date +%s)" | grep -o 'v=1[0-9][0-9]' | head -1
```

Verify on production itself — version served, no test-database banner, no
console errors, and the changed thing actually changed. Then push to git.

Ask before deploying to production. Approval for one batch is not approval
for the next.

## Close the loop

Update the `WALKTHROUGH-*.md`: mark each finding done with how it was
verified, strike through any withdrawn, and leave anything deferred clearly
marked as still open. Then say plainly what shipped, what did not, and what
remains unproven — printing, real devices, real inboxes, scale.
