# Law School Shortlist Builder

A personal tool for building a shortlist of law schools, organized by state.

**Flow:** the map is the front door. Hover any state and the rail beside it fills with that state's real strengths and weaknesses — the measures where it genuinely stands apart from the other 50, with the figure behind each one. Click through to every school there. Open the fit panel and enter your GPA, LSAT, career goals, and where you want to practice, and you get every ABA school ranked for you, grouped into Safety / Target / Reach / Far reach, each with a modelled admit / waitlist / deny split. Click one for full stats, employment outcomes, and where your numbers land in its admitted range → add it to your target list. Your list is grouped by state, persists in the browser, and exports to Markdown or CSV.

Press `/` (or `⌘K`) anywhere to jump straight to any of the 193 schools or 51 jurisdictions by name.

**Map layers.** The chips above the map recolor it:

| Layer | What the colour means | Needs |
|---|---|---|
| Overall | The blended state score, ranked against all 51 | — |
| Your reach | Modelled admit chance at that state's **highest-ranked** school | GPA + LSAT |
| Your fit | How the best-fitting school there ranks for your whole profile | a goal or target state |
| Affordability | Cost of living and housing, inverted | — |
| Legal market | Lawyer job density and average legal pay | — |
| Schools | Count of ABA-accredited schools | — |

*Your reach* is measured at the flagship on purpose. "Best odds anywhere in the state" sounds more useful but is nearly worthless: almost every state has some school that admits broadly, so a strong applicant sees 98% everywhere and the map goes flat — 8 distinct values across 51 jurisdictions at GPA 3.2 / LSAT 174, against 25 when measured at the flagship.

### State strengths and weaknesses

Ten measures per jurisdiction, each percentile-ranked against the other 50, in `INSIGHT_METRICS` in `app.js`. Four come straight from `states.json` (legal market, legal pay, cost of living, quality of life); six are derived from the schools in that state (how many there are, its highest-ranked one, median out-of-state tuition, median employment rate, the best BigLaw share available, and the median share of a class that stays in state).

The rail only shows a measure where the state genuinely stands apart — above the 62nd percentile for a strength, below the 38th for a weakness, at most three of each. A state that's mid-pack on everything says so rather than manufacturing a strength. Every line carries the raw figure and the state's place, so nothing is a bare adjective: "Legal pay · 2nd of 51 · $230k average salary."

The denominators differ on purpose. Measures drawn from schools say "of 50" because Alaska has none; state-level measures say "of 51."

## How the matching works

Three independent scores, deliberately never collapsed into one number — a school can be strong on your career goal and wrong everywhere else, and you should be able to see that.

- **Admission odds.** A modelled admit / waitlist / deny split from your GPA and LSAT alone (LSAT weighted 60/40, because that's the number that moves a school's medians most), plus the plain-English band name — Safety, Target, Reach, Far reach — that the percentage falls into. Label and number are one element by design, so a reassuring word can never sit next to a discouraging figure. **Read the section below before trusting the number.**
- **Career fit (0–100).** Percentile rank against every other ABA school on the outcomes you said you care about — BigLaw, federal clerkships, government, public interest, in-house, small firm, academia. Percentiles rather than raw percentages, because 12% federal clerkships is extraordinary while 12% BigLaw is unremarkable. Placement always carries some weight even when you've named a goal.
- **Place fit (0–100).** Your target states, plus credit for schools that *feed* a market rather than sit in it (17.8% of Tulane's class goes to New York), blended with whatever you weighted among affordability, quality of life, city lifestyle, and legal-market strength. A named state outweighs the sliders.

Results are grouped by admission band and ranked within each band on career and place only, so admission odds aren't double-counted. Each row shows the school's own median LSAT and GPA with a marker for where your numbers fall in its 25th–75th spread, above a line naming the specific figures that earned it that position.

### How the admission odds are built (and what they're worth)

An ordered logit. Your numbers produce a latent "review score"; two thresholds cut it into admit, waitlist and deny, so the three always add to 100 and admit chances rise monotonically with both numbers. It lives in `admitOdds()` in `app.js`.

**Nothing in it is fitted to real admission results.** No law school publishes who it admitted at what numbers, and this repo has no individual outcome data of any kind. The curve is *constrained* by three figures every school does report, and everything else is an assumption you can read and change in the `ODDS` block right above the function:

| Reported figure | What it does |
|---|---|
| Acceptance rate | Sets where the curve sits. An applicant at a school's own medians lands at `acceptanceRate ^ 0.35`, less a penalty that grows at the very selective end — about 26% at a school admitting under 10%, about 78% at one admitting more than half. |
| 25th–75th spread | Sets how steep it is. A tight band means a sharper cliff; a school admitting across a wide range moves you less per point. |
| Yield (enrolled ÷ offers) | A small correction. The reported percentiles describe **enrolled** students, not admitted ones, so a school that loses most of its admits to better offers had an admitted class stronger than the class it enrolled. |

Two further assumptions worth knowing:

- **There is a ceiling.** At a school admitting 4% of applicants no LSAT makes you a favourite, and a model built only on numbers shouldn't run to 99%. The ceiling drops as selectivity rises, so the most selective schools can never read as a Safety no matter what you type.
- **Splitters get flagged, not fixed.** A single blended index is least reliable exactly when your LSAT and GPA pull in opposite directions, and schools differ enormously in how they treat that. When the two diverge by more than 1.6 standard deviations the school page says so. It doesn't try to correct for it, because the data to do that isn't public.

**The waitlist share is the softest figure in the app.** The ABA collects no waitlist data — not applicants waitlisted, not admits from the waitlist, nothing, for any school. All 78 columns of the Standard 509 First Year Class compilation are applications, offers, enrollees, and score percentiles. So that slice is a modelled band around the decision boundary, widening with selectivity, and it renders hatched everywhere it appears to keep it visually separate from the two figures with real reporting under them. If you trust one thing on the page, trust admit-vs-deny, and read the waitlist as "roughly the zone where waitlists happen."

What the model knows nothing about: your essays, letters, work history, résumé, softs, whether you applied in September or March, scholarship negotiation, or any school's institutional priorities in a given cycle. Those decide a great deal of what actually happens. Treat 60% as "worth an application," never as a coin flip you've already half-won.

## Running it

The app loads its data from local JSON files, so it needs a tiny local web server (opening `index.html` directly with `file://` will fail on most browsers because of how they block local file reads).

The front end is three plain files with no build step: `index.html` (the shell), `app.css` (all styling, organised tokens → base → components → views), and `app.js` (data loading, scoring, and every view).

From this folder, run:

```bash
python3 -m http.server 8777
```

Then open **http://localhost:8777** in your browser. That's it.

To stop the server, press `Ctrl+C` in the terminal.

## The data (read this before trusting a number)

Everything lives in plain JSON you can edit in any text editor:

- **`data/states.json`** — all 50 states plus DC, with cost-of-living, quality-of-life, and legal-industry figures, plus 1–5 scores. The youthful-active-lifestyle factor is **not** here — it lives at the city level (see below), because it varies too much within a state to be one number.
- **`data/cities.json`** — the 148 law-school cities, each scored on youthful-active-lifestyle: a `social` scene signal (weighted heaviest), `outdoors`, and `walkability`, blended into a `lifestyleScore`, plus a blurb. Shown on each school's detail page for the city you'd actually live in.
- **`data/schools.json`** — all 193 ABA-accredited schools in the 50 states + DC: median GPA, median LSAT, in-state / out-of-state tuition, a tier, a rank, and a write-up, plus two blocks pulled straight from the ABA (see below): `admissions` (applications, offers, acceptance rate, and 25th/50th/75th percentile GPA and LSAT) and `outcomes` (employment rate and the share of graduates going to BigLaw, mid-law, small firms, government, public interest, federal and state clerkships, business, and academia), with `topStates` giving the three states each school actually places graduates into.
- **`data/us-states.json`** — the map geometry. You shouldn't need to touch this.

### Refreshing the ABA data

`tools/fetch_aba.py` pulls the current Standard 509 compilation reports and folds them into `data/schools.json`:

```bash
pip3 install openpyxl
python3 tools/fetch_aba.py --year 2025        # --dry-run to preview
```

It hits the two public endpoints the ABA's own disclosure site calls (no key, no auth), then joins 193 schools onto the ABA's roster. The ABA lists schools by parent institution — "Samford University" where this project says "Cumberland School of Law" — so `ALIASES` in that script bridges roughly 50 of them. **The join is asserted 1:1**: if a school stops matching, or one ABA record gets claimed twice, the script fails loudly instead of quietly dropping outcomes. It also prints every school it matched by inference rather than exact name, so you can eyeball them.

One school (Wilmington University) has no employment record — provisionally approved in 2023, no graduating class yet. That's listed in `EXPECTED_MISSING` so it doesn't trip the assertion.

### Where the numbers come from

Each figure traces to a named public source, so you can re-check any of them:

| Field | Source |
|---|---|
| Median GPA / LSAT, 25th/75th percentiles, applications, offers, acceptance rate | **ABA Standard 509, 2025 "First Year Class" compilation** — fetched live by `tools/fetch_aba.py` from [abarequireddisclosures.org](https://www.abarequireddisclosures.org/) |
| `outcomes` and `topStates` — employment rate, firm-size distribution, employer type, clerkships, states of employment | **ABA 509 Employment Summary compilation, 2025 report** (describes the class of 2024) — same script |
| Tuition | ABA Standard 509 disclosures, 2025 |
| Bar-passage figures quoted inside write-ups | ABA 509 First-Time Bar Admission reports, 2025 |
| `rank` | Publicly reported US News rank; `tier` is derived from it |
| `costOfLivingIndex`, `housingIndex` | **C2ER / MERIC state cost-of-living index, Q1 2026** (US average = 100, lower is cheaper) |
| `lawyerJobsPer1k`, `avgLegalSalary` | **BLS OES, May 2025**, occupation 23-1011 (Lawyers), via the BLS public API |
| `safety` | Quintile of the **FBI 2024 violent-crime rate** per 100k, inverted |
| `healthcare` | Quintile of **CDC life expectancy at birth** by state |
| `livability` | Editorial 1–5 — climate, natural setting, general amenity density |
| City lifestyle scores and blurbs | Editorial estimates, not survey data |

**Caveats worth knowing:**

- **Employment data is a rear-view mirror.** The 2025 report describes the class of 2024 — people who started law school in 2021. If you matriculate next year you'll graduate roughly four years after the class you're being shown. It's the best available data, not a forecast.
- **The admission percentage is a model, not a measurement**, and nothing in it is fitted to real admission results — see [How the admission odds are built](#how-the-admission-odds-are-built-and-what-theyre-worth) for what constrains it and what it ignores. Treat "Target" as "worth applying to," never as "you're in."
- **Scores are percentile ranks, not absolute measures.** A 1–5 score answers "where does this rank among the 51 jurisdictions," not "what is the value." The raw figures shown next to each score carry the magnitude. Adding or removing a state shifts everyone's scores.
- **`topStates` only covers the top three.** A school that scatters graduates widely can look less connected to your target market than it is, since anything past third place isn't reported.
- **The three factors are weighted equally**, which has consequences you may not want. DC has by far the strongest legal market in the country (47 lawyers per 1,000 jobs, more than four times the next state) but lands mid-pack overall because it's expensive and scores badly on crime. If you care more about the legal market than about cost, reweight `overall` in `states.json`.
- **About 32 schools report tuition per credit** rather than annually. Those are annualized at a third of the required credit hours, so they're approximate.
- **Mississippi's safety score is flattered** by incomplete FBI reporting participation. It's what the official data says; treat it with suspicion.
- **Puerto Rico's three ABA schools are not included** — the map covers the 50 states and DC only.
- **Write-ups have two voices.** Schools in the original 12 states keep hand-written write-ups; the rest are generated from each school's own 509 figures.
- `tier` is a public-data proxy for prestige. Four schools carry no published rank (two opened too recently to be ranked); their tier falls back to median LSAT.

**These numbers are an approximate, point-in-time snapshot.** Spot-check any school against its official 509 report before making a real decision. Every value is editable — change the JSON and reload.

## Editing states or schools

- **Add a school:** add an object to the `schools` array in `data/schools.json` with a `state` matching one in `states.json`. It'll show up automatically. If it's in a city not already in `cities.json`, add that too, or the lifestyle block won't render. To give it admissions and outcomes data, add an `ALIASES` entry in `tools/fetch_aba.py` mapping your name to the ABA's, then re-run the script.
- **Change a score or fix a number:** edit the value and reload the page. Note that re-running `tools/fetch_aba.py` overwrites the `admissions`, `outcomes`, `topStates`, `medianGPA`, and `medianLSAT` fields — hand-edit those in the script, not the JSON, if you want the change to survive.
- **Reweight the model:** `overall` in `states.json` is just the average of the three factor scores. Recompute it however you like — the map color and sort follow whatever you put there. The fit weights live in `app.js`: `LSAT_WEIGHT`/`GPA_WEIGHT` for how the two numbers blend into one index, the `0.55`/`0.45` split in `scoreAll` for career vs. place, and the `0.7`/`0.3` split in `locationFit` for named states vs. sliders. The admission model is the `ODDS` block — every constant in it is commented with what it controls, and `BAND_CUTS` sets the admit probabilities where Safety/Target/Reach/Far reach change over.
- **Renaming a school** will drop it from any saved target list, since the list stores names. Edit `lawSchoolShortlist` in localStorage if you need to rename something you've saved. Your profile lives in `lawSchoolProfile`.
