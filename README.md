# Law School Shortlist Builder

A personal tool for building a shortlist of law schools, organized by state.

**Flow:** US map (12 states, colored by overall fit) → click a state → see every ABA law school there → click a school → full stats + a write-up on where it excels or falls short → add it to your target list. Your list is grouped by state, persists in the browser, and exports to Markdown or CSV.

## Running it

The app loads its data from local JSON files, so it needs a tiny local web server (opening `index.html` directly with `file://` will fail on most browsers because of how they block local file reads).

From this folder, run:

```bash
python3 -m http.server 8777
```

Then open **http://localhost:8777** in your browser. That's it.

To stop the server, press `Ctrl+C` in the terminal.

## The data (read this before trusting a number)

Everything lives in plain JSON you can edit in any text editor:

- **`data/states.json`** — the 12 states with affordability, quality-of-life (safety + healthcare + livability + community/youthful-active-lifestyle, anchored to each state's main law-school city), and legal-industry figures, plus 1–5 scores. Scores are normalized *relative to these 12 states only*.
- **`data/schools.json`** — 92 ABA-accredited schools across those states: median GPA, median LSAT, in-state / out-of-state tuition, a tier, an approximate rank, and a write-up.
- **`data/us-states.json`** — the map geometry. You shouldn't need to touch this.

**These numbers are an approximate, point-in-time snapshot** compiled from public sources (ABA Standard 509 disclosures for the school data, cost-of-living / BLS / Census figures for the states). Spot-check any school against its official 509 report before making a real decision. Every value is editable — change the JSON and reload.

- `tier` is a public-data proxy for prestige (derived from selectivity/outcomes) — we deliberately don't republish paywalled US News rankings. If you have the official US News ranks, you can drop them into each school's `rank` field for your own private use.

## Editing states or schools

- **Add a school:** add an object to the `schools` array in `data/schools.json` with a `state` matching one of the 12. It'll show up automatically.
- **Add a state:** add it to `data/states.json` (the `state` name must match the map geometry's name, e.g. "Ohio") and it becomes live and colored on the map.
- **Change a score or fix a number:** edit the value and reload the page.
