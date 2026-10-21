---
name: refreshing-law-school-data
description: Use when fact-checking or updating this law-school site's data — schools, ranks, tuition, admissions, employment, bar passage, state stats, city blurbs, or school links — or when the ABA, U.S. News, MERIC, FBI, BLS, or CDC has released something newer, or someone asks whether the site's figures are accurate or current.
---

# Refreshing law-school data

## Overview

Accuracy is the product. **One vetted source per category**, refreshed as a whole: ABA Standard 509 for every school figure, U.S. News (read on usnews.com) for ranks. Never patch in numbers from a school's own site or LSAC (LSAC republishes the ABA), even when newer: mixed years and definitions skew every comparison. Wait for the source's release instead.

## Sources and tools

| Category | Source | Tool | New data |
|---|---|---|---|
| Admissions, medians, tuition | ABA First Year Class; Tuitions and Fees (+ credit hours) | `tools/fetch_aba.py` | mid-December |
| `outcomes`, `topStates` | ABA Employment Summary (year Y = class of Y) | `tools/fetch_aba.py` | late April |
| `bar` | ABA First-Time Bar Admission (year Y = grads of Y−1) | `tools/fetch_aba.py` | spring |
| `rank`, `tier` | U.S. News Best Law Schools, usnews.com | `usnews-capture.js` → `tools/apply_ranks.py` | April |
| Cost of living; violent crime; lawyer jobs and pay | MERIC (C2ER); FBI CIUS Table 4; BLS OEWS 23-1011 | `tools/states.py` | quarterly; Aug–Sep; spring |
| `lifeExpectancy` | CDC/NCHS U.S. State Life Tables (NVSR, PDF) | hand-edit, then `tools/states.py` | ~yearly |
| School links | — | `tools/check_links.py` | any time |

`fetch_aba.py` and `apply_ranks.py` regenerate the `writeupAuto` write-ups themselves. All scores are computed only inside these tools.

## Procedure

1. **Dry-run the data tools**: `fetch_aba.py --dry-run` and `states.py --dry-run`. Read which report year each category picked. **0 changes means the stored data matches the source.** When changes are expected, spot-check two schools or states in the diff against the source file before applying.
2. **Ranks**: in a Chrome tab, run steps 1–2 of `usnews-capture.js` and note its `N entries, rank checksum X` line. Read the slices out to `fact-check/<date>/details/usnews-<year>-live.txt`. Then run `apply_ranks.py FILE --edition "<year on U.S. News's page title> edition (<Month Year>)" --dry-run`. **Its first line must equal the browser's checksum line**, or a line was mistyped or dropped: re-read that slice. A name mismatch stops the tool; fix that school's `usnewsName`, never the rank by hand.
3. **Schools added or gone**: if the ABA lists a school the site lacks, add it to `schools.json` with `usnewsName`, a `cities.json` record if its city is new, and an `ALIASES` entry if its name won't match. A closed school: confirm the closure, then remove it. A U.S. News entry that isn't an ABA school in the 50 states + DC goes in `NOT_ON_SITE`.
4. **Apply** the tools without `--dry-run`. Then search the README, `states.json` `_note` and `schools.json` `_note` for years and classes ("class of", "20xx", "Q1") and update every mention that moved.
5. **Prose**: re-read **every** hand-written write-up (no `writeupAuto`) and every `cities.json` blurb against the current data. Any claim about rank, tier, bar passage, employment, cost, or "best/only/largest/lags" can go stale. For a full audit, split them across parallel subagents. Tell each one: the numbers are already verified, so check only the prose; cite a source for every "wrong"; suggest corrected wording; write the results to `fact-check/<date>/details/<topic>.md`.
6. **Links**: `check_links.py`, then open only the flagged ones in one browser tab, one at a time.
7. **Check the app**: `python3 -m http.server 8777`, then open a school page, a state page, and results. Check for console errors and the vintage labels. Use 127.0.0.1, not localhost, so the owner's saved list isn't touched.
8. **Record and commit**: write `fact-check/<YYYY-MM-DD>/REPORT.md` with what was verified, what changed, and its sources. Stage only `data/`, `tools/`, `README.md`, the skill, and that `fact-check/` folder. Leave unrelated working-tree changes unstaged.

## Common mistakes

- **Mislabeling report years.** Prove what a report covers against one school's own published count before writing a label.
- **Trusting a half-filled ABA file.** Before release, the backend serves in-progress submissions. `fetch_aba.py` requires 95% of schools to be complete; don't weaken that.
- **Calling a rounding gap an error.** Stored 46.5 versus quoted 46 is the same raw share rounded twice. Check against counts before flagging.
- **Mixing FBI vintages.** Each release revises the prior year, so take every state from one table.
- **Scoring outside the tools.** One-off scripts don't reproduce the rules; for example, BLS legal scores use the 3-decimal figure.
- **Bursting link checks.** Firewalls then block the machine for an hour. Treat 403/406 as unverified, not broken.
- **Renaming a school by editing `name` alone.** Add the old name to `formerNames`, which migrates saved lists, notes and files. Then update the `ALIASES` key; `usnewsName` stays U.S. News's own name.
- **Assuming T14 is exactly 14 schools.** Ties at a bracket edge add schools. Unranked means `rank: null` and tier "Unranked", never a guessed tier.
- **Expecting bar data for every school.** Wisconsin's diploma privilege leaves Marquette with none, and new schools have no graduates.
