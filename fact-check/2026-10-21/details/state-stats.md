# states.json fact-check (as of 2026-10-21)

Every comparison was scripted against structured pulls. The scripts and raw downloads are in the scratchpad (`bls.py`, `meric2.py`, `safety.py`, `health2.py`, `final_h.py`, `dl/`).

## Data vintage findings

| Source | Claimed | What the data actually matches | Notes |
|---|---|---|---|
| BLS OEWS 23-1011 | May 2025 | **May 2025: exact match, 51/51** | May 2025 OEWS is released. The BLS API (`OEUS{fips}00000000000231011{16,04}`) returns year 2025 flagged `latest`. Jobs per 1k matches to 1 decimal and the mean wage matches to the dollar. No May 2024 check was needed. |
| C2ER/MERIC COL | Q1 2026 | **Q1 2026: exact match, 51/51** (composite and housing) | Taken from Wayback snapshots of meric.mo.gov dated 2026-06-10 through 2026-08-18. The live page now shows **Q2 2026**, and only 1 state matches it. The data is correct for its stated quarter but one quarter stale. It matches none of 2025 Q1, 2025 Q3 or the 2025 annual average. |
| FBI violent crime | 2024 | **2024: consistent, 51/51** | Rates come from Wikipedia's FBI-sourced 2024 table, which agrees with USAFacts (DC 1,005.5, AK 724.1, NM 717.1, ME 100.1). I couldn't pull the official CIUS 2024 estimates table directly: the CDE estimate endpoint 404s and the S3 download keys were unknown. The CDE summarized API gives MS a reported rate of 214.8 against an estimated 210.5, which is consistent. |
| CDC life expectancy | "most recent" | **Matches no CDC vintage cleanly** | The latest release is *U.S. State Life Tables, 2022* (NVSR 74-12, Dec 4 2025). No 2023 state tables appear on the NCHS life-tables page. Best fit is 2022 at 41/51. 2019 fits 39 to 42 depending on binning, 2021 fits 35 to 37, and 2020 fits 33. |

## Binning method

Ordering uses the CDC rank, which CDC computes on unrounded values, and the FBI rate. Five binnings were tested: worst-first bin sizes 10/10/10/10/11, 11/10/10/10/10 and 10/10/11/10/10, the site's own bin-size distribution, and numpy-style 20/40/60/80 percentile cutoffs. A row only appears as a mismatch below if the site value differs under **every** binning.

- **Safety:** the site's distribution is 11/9/10/10/11 (odd-looking, but it does partition 51). Under that binning all 51 match exactly. Under plain 10/10/10/10/11 only SC differs (site 1, computed 2). SC sits at 436.7 against KS at 438.7, which is a boundary case. **No robust mismatches.**
- **Healthcare:** the site's distribution is 10/11/10/9/11. The 9 rows below are wrong under every binning against CDC 2022.

## Mismatches only

| State | Field | Site value | Correct value | Source | Confidence |
|---|---|---|---|---|---|
| UT | qualityOfLife.healthcare | 4 | 5 (LE 79.0, rank 9/51) | CDC NVSR 74-12, Table A (2022) | High |
| NH | qualityOfLife.healthcare | 4 | 5 (LE 78.7, rank 10) | same | High |
| WA | qualityOfLife.healthcare | 5 | 4 (LE 78.4, rank 13) | same | High |
| FL | qualityOfLife.healthcare | 3 | 4 (LE 77.9, rank 19) | same | High |
| MD | qualityOfLife.healthcare | 3 | 4 (LE 77.8, rank 20) | same | High |
| OR | qualityOfLife.healthcare | 5 | 4, or 3 under some binnings (LE 77.7, rank 21) | same | High |
| VA | qualityOfLife.healthcare | 4 | 3 (LE 77.5, rank 23) | same | High |
| MI | qualityOfLife.healthcare | 2 | 3 (LE 76.8, rank 29) | same | High |
| NM | qualityOfLife.healthcare | 2 | 1 (LE 74.5, rank 43) | same | High |

The healthcare scores don't track any single CDC year. Re-deriving them from the 2022 tables fixes all 9 rows. If they were hand-tweaked, the `_note` saying "quintile of CDC life expectancy" is inaccurate.

## Verified-correct counts

| Field | Correct / 51 |
|---|---|
| legalIndustry.lawyerJobsPer1k | 51 |
| legalIndustry.avgLegalSalary | 51 |
| affordability.costOfLivingIndex | 51 (Q1 2026) |
| affordability.housingIndex | 51 (Q1 2026) |
| qualityOfLife.safety | 51 (under the site's 11/9/10/10/11 bins; 50 under standard bins) |
| qualityOfLife.healthcare | 42 (all binnings considered; 41 under 10/10/10/10/11) |

## README claims

1. **"DC … 47 lawyers per 1,000 jobs, more than four times the next state": TRUE.** BLS May 2025 shows DC at 47.112 and NY, the next state, at 9.483, a ratio of 4.97x. "Nearly five times" would be more precise. "Scores badly on crime" is also true: DC has the highest 2024 rate at 1,005.5 and gets safety 1.
2. **"Mississippi's safety score is flattered by incomplete FBI reporting participation": the participation part is TRUE.** The CDE API shows MS population coverage of 64.3 to 67.0% per month in 2024, against 96.1 to 96.7% nationally (1.89M of 2.94M residents covered). MS's 2024 estimated rate is 210.5, rank 46 of 51, which earns it a 5. FBI estimates do impute for non-reporters, so I can't be sure the score is "flattered". Low participation does make the estimate unreliable, and the caveat is fair.

## anchorCity flags

The pattern is that many anchors are law-school towns rather than the state's legal market, which contradicts "the city used as the state's representative legal market".

- **Strong:** VT South Royalton (a village of about 700 people; the market is Burlington). SD Vermillion (pop. about 11k; the market is Sioux Falls). ND Grand Forks (the market is Fargo or Bismarck). MS Oxford (the market is Jackson). WV Morgantown (the market is Charleston). MI Ann Arbor (the market is Detroit). IA Iowa City (the market is Des Moines). KS Lawrence (the market is the KC metro or Topeka/Wichita). AR Fayetteville (the market is Little Rock).
- **Mild:** CT New Haven (Hartford/Stamford are bigger). NE Lincoln (Omaha). MT Missoula (Billings/Helena). WY Laramie (Cheyenne). WI Madison (Milwaukee). TX Austin (Houston/Dallas are larger). VA Richmond/Charlottesville (Northern VA is the biggest VA legal market). NC Durham/Chapel Hill (Charlotte/Raleigh).

## Livability (editorial)

Nothing is absurd. Scores run from 2 to 5, with the plains states (KS, NE, ND, SD, OK) and MS at 2, and CA, CO, FL and HI at 5. All of that is defensible as taste.

## Could not verify

- **FBI rates:** I couldn't verify these against the primary CIUS 2024 table. A secondary source (Wikipedia, cross-checked with USAFacts) was used. I did not test whether MS's participation is the *lowest* of any state, because the CDE DEMO_KEY is rate-limited (50/day). I only pulled MS.
- **Healthcare:** the exact method the site used couldn't be reconstructed. No combination of CDC 2019 to 2022 and any binning reproduces it.
- **`score`/`overall` composites:** not in scope, not checked.
