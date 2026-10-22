# Law School Shortlist Builder

A personal tool for building a shortlist of law schools, organized by state.

**Flow:** you land on **Find your fit**: enter your GPA, LSAT, career goals, and where you want to practice. You then get every ABA school sorted into Reach / Target / Safety / Far reach; a search box above the list filters it by name, city, or state, and you click one for its full page. Add schools to **My saved list**: each one becomes a folder, filed by admission band, that opens to the site's read of the school beside your own notes and attached files. Everything stays in the browser (notes in localStorage, files in IndexedDB); **Back up** / **Restore** move it all as one JSON file, and the list still exports to Markdown or CSV. **Explore by state** (in the menu) is the whiteboard map of every state: hover one for its real strengths and weaknesses, click it and the map zooms in, dots every city with a law school, and lists those schools beside it (with your band for each once you've entered a GPA and LSAT). Pick a school and a pin drops on it, with a link through to its page. Back, Esc, or a click on open water zooms out. **About** (also in the menu) sets out where each figure comes from, the year it describes, and how far to trust the admission odds.

### State strengths and weaknesses

Ten measures per jurisdiction, each percentile-ranked against the other 50, in `INSIGHT_METRICS` in `app.js`. Four come straight from `states.json` (legal market, legal pay, cost of living, quality of life); six are derived from the schools in that state (how many there are, its highest-ranked one, median out-of-state tuition, median employment rate, the best BigLaw share available, and the median share of a class that stays in state).

The map card and state page only show a measure where the state genuinely stands apart — above the 62nd percentile for a strength, below the 38th for a weakness, at most three of each. A state that's mid-pack on everything says so rather than manufacturing a strength. On the state page every line carries the raw figure and the state's place, so nothing is a bare adjective: "Legal pay · 2nd of 51 · $230k average salary."

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
- **`data/cities.json`** — the 146 law-school cities, each scored on youthful-active-lifestyle: a `social` scene signal (weighted heaviest), `outdoors`, and `walkability`, blended into a `lifestyleScore`, plus a blurb. Shown on each school's detail page for the city you'd actually live in.
- **`data/schools.json`** — all 193 ABA-accredited schools in the 50 states + DC: median GPA, median LSAT, in-state / out-of-state tuition, a tier, a rank, and a write-up, plus three blocks pulled straight from the ABA (see below): `admissions` (applications, offers, acceptance rate, and 25th/50th/75th percentile GPA and LSAT) and `outcomes` (employment rate and the share of graduates going to BigLaw, mid-law, small firms, government, public interest, federal and state clerkships, business, and academia), with `topStates` giving the three states each school actually places graduates into, and `bar` (first-time pass rate against its states' average). `_vintage` at the top of the file records which class or year each category describes, and the app labels the figures from it.
- **`data/us-states.json`** — the map geometry: Census state boundaries at 1:10m from [us-atlas](https://github.com/topojson/us-atlas), with Alaska and Hawaii moved into insets. Rebuilt by `tools/build_geometry.py` (instructions at the top of that file); you shouldn't need to touch it.

### Refreshing the ABA data

Every school figure comes from one source, the ABA, so the whole category refreshes in one go. `tools/fetch_aba.py` pulls the newest Standard 509 compilation reports and folds them into `data/schools.json`, then regenerates the data-driven write-ups (`tools/writeups.py`):

```bash
pip3 install openpyxl
python3 tools/fetch_aba.py --dry-run   # preview every change
python3 tools/fetch_aba.py
```

There's no year to pass: each category takes the newest report the ABA has actually published. Before a release the backend serves a blank, zero-filled, or half-filled file (schools' in-progress submissions), so a report only counts once at least 95% of schools have their headline figure. When to re-run:

| Category | ABA report | Covers | Released |
|---|---|---|---|
| Admissions, medians, acceptance rate | First Year Class | the class that entered that fall | mid-December |
| Tuition (and required credit hours) | Tuitions and Fees; The Basics | the academic year starting that fall | mid-December |
| `outcomes`, `topStates` | Employment Summary | that year's graduating class, ten months on | late April |
| `bar` | First-Time Bar Admission | the previous year's graduates | spring |

It hits the public endpoints the ABA's own disclosure site calls (no key, no auth), then joins 193 schools onto the ABA's roster. The ABA lists schools by parent institution — "Samford University" where this project says "Cumberland School of Law" — so `ALIASES` in that script bridges roughly 50 of them. **The join is asserted 1:1**: if a school stops matching, or one ABA record gets claimed twice, the script fails loudly instead of quietly dropping outcomes. It also prints every school it matched by inference rather than exact name, so you can eyeball them.

One school (Wilmington University Farnan) has no employment or bar record — provisionally approved in 2023, no graduating class yet. That's listed in `EXPECTED_MISSING` so it doesn't trip the assertion. Marquette has no bar figure either: Wisconsin admits its graduates by diploma privilege.

### Where the numbers come from

Each figure traces to a named public source, so you can re-check any of them:

| Field | Source |
|---|---|
| Median GPA / LSAT, 25th/75th percentiles, applications, offers, acceptance rate | **ABA Standard 509 "First Year Class" compilation** (fall 2025 entering class) — fetched by `tools/fetch_aba.py` from [abarequireddisclosures.org](https://www.abarequireddisclosures.org/) |
| `outcomes` and `topStates` — employment rate, firm-size distribution, employer type, clerkships, states of employment | **ABA Employment Summary compilation** (class of 2025, released April 2026) — same script |
| Tuition | **ABA 509 Tuitions and Fees compilation** (2025–26); per-credit schools annualized at a third of the ABA-reported required credit hours — same script |
| `bar`, and the bar-passage lines in write-ups | **ABA First-Time Bar Admission compilation** (class of 2025) — same script |
| `rank` | **U.S. News Best Law Schools, 2026 edition** (April 2026), read from usnews.com; `null` (shown "Unranked") where U.S. News publishes no number. `tier` is derived from it |
| `costOfLivingIndex`, `housingIndex` | **C2ER cost-of-living index as published by MERIC, Q2 2026** (US average = 100, lower is cheaper) |
| `lawyerJobsPer1k`, `avgLegalSalary` | **BLS OES, May 2025**, occupation 23-1011 (Lawyers), via the BLS public API |
| `violentCrimeRate`, `safety` | **FBI 2025 estimated violent-crime rate** per 100k (Crime in the United States, Table 4, August 2026); `safety` is its quintile, inverted |
| `lifeExpectancy`, `healthcare` | **CDC/NCHS life expectancy at birth, 2022** (U.S. State Life Tables, December 2025 — the newest state tables); `healthcare` is its quintile |
| `livability` | Editorial 1–5 — climate, natural setting, general amenity density |
| City lifestyle scores and blurbs | Editorial estimates, not survey data |

**Caveats worth knowing:**

- **Employment data is a rear-view mirror.** The current report describes the class of 2025 — people who started law school in 2022. If you matriculate next year you'll graduate roughly four years after the class you're being shown. It's the best available data, not a forecast.
- **The admission percentage is a model, not a measurement**, and nothing in it is fitted to real admission results — see [How the admission odds are built](#how-the-admission-odds-are-built-and-what-theyre-worth) for what constrains it and what it ignores. Treat "Target" as "worth applying to," never as "you're in."
- **Scores are percentile ranks, not absolute measures.** A 1–5 score answers "where does this rank among the 51 jurisdictions," not "what is the value." The raw figures shown next to each score carry the magnitude. Adding or removing a state shifts everyone's scores.
- **`topStates` only covers the top three.** A school that scatters graduates widely can look less connected to your target market than it is, since anything past third place isn't reported.
- **The three factors are weighted equally**, which has consequences you may not want. DC has by far the strongest legal market in the country (47 lawyers per 1,000 jobs, nearly five times the next state) but lands mid-pack overall because it's expensive and scores badly on crime. If you care more about the legal market than about cost, reweight `overall` in `states.json`.
- **30 schools report tuition per credit** rather than annually. Those are annualized at a third of the JD's required credit hours (as the school reports them to the ABA), so they're approximate.
- **Mississippi's crime figure rests on thin reporting.** Agencies covering only about two-thirds of its population reported to the FBI in 2024, so its estimate leans more on FBI imputation than most states'. It's what the official data says; treat it with suspicion.
- **Puerto Rico's three ABA schools are not included** — the map covers the 50 states and DC only.
- **Write-ups have two voices.** Schools in the original 12 states keep hand-written write-ups; the rest (`writeupAuto`) are generated by `tools/writeups.py` from each school's own 509 figures and re-generated on every ABA refresh. Hand-written ones aren't, so re-read them when ranks or bar results move.
- `tier` is a public-data proxy for prestige, bracketed from the U.S. News rank (T14 is ranks 1–14, so the three-way tie at 13 makes it 15 schools). The 19 schools without a published rank — U.S. News's bottom band, plus two too new to be ranked — are "Unranked" rather than guessed at.

**These numbers are an approximate, point-in-time snapshot.** Spot-check any school against its official 509 report before making a real decision. Every value is editable — change the JSON and reload.

## Editing states or schools

- **Add a school:** add an object to the `schools` array in `data/schools.json` with a `state` matching one in `states.json`. It'll show up automatically. If it's in a city not already in `cities.json`, add that too, or the lifestyle block won't render. To give it admissions and outcomes data, add an `ALIASES` entry in `tools/fetch_aba.py` mapping your name to the ABA's, then re-run the script.
- **Change a score or fix a number:** edit the value and reload the page. Note that re-running `tools/fetch_aba.py` overwrites `admissions`, `outcomes`, `topStates`, `bar`, `medianGPA`, `medianLSAT`, both tuition fields, and every `writeupAuto` write-up — fix those in the script, not the JSON, if you want the change to survive.
- **Update the ranks:** U.S. News publishes each spring and blocks scripted access, so the list is captured in a browser (`.claude/skills/refreshing-law-school-data/usnews-capture.js`) and applied with `python3 tools/apply_ranks.py LIST.txt --edition "2027 edition (April 2027)"`. It matches each school on its exact `usnewsName`, refuses to run on any mismatch, and regenerates the auto write-ups (they lead with the tier).
- **Update the state figures:** `python3 tools/states.py` fetches the newest MERIC cost-of-living quarter, FBI violent-crime estimates, and BLS lawyer employment and pay, and recomputes every score; edit `lifeExpectancy` by hand when the CDC publishes new state life tables, then re-run it.
- **Check the links:** `python3 tools/check_links.py` flags any school link that errors, redirects elsewhere, or lands on a not-found page.
- **The whole fact-check / refresh process** is written up as a Claude Code skill in `.claude/skills/refreshing-law-school-data/`.
- **Reweight the model:** `overall` in `states.json` is just the average of the three factor scores. Recompute it however you like — the map color and sort follow whatever you put there. The fit weights live in `app.js`: `LSAT_WEIGHT`/`GPA_WEIGHT` for how the two numbers blend into one index, the `0.55`/`0.45` split in `scoreAll` for career vs. place, and the `0.7`/`0.3` split in `locationFit` for named states vs. sliders. The admission model is the `ODDS` block — every constant in it is commented with what it controls, and `BAND_CUTS` sets the admit probabilities where Safety/Target/Reach/Far reach change over.
- **Renaming a school:** change `name` and add the old one to its `formerNames` list. On the next load the app moves saved schools, notes, and attached files across, and a backup made before the rename still restores onto the right school. Update the `ALIASES` key in `tools/fetch_aba.py` if the old name was one. Your profile lives in `lawSchoolProfile`.
