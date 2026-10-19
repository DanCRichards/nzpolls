# NZ 2026 election seat forecast

A single-page seat forecast for New Zealand's 7 November 2026 general election. The page runs thousands of simulated elections in the browser and shows the most likely Parliament, who can govern, electorate chances and party list outcomes.

## Build and run

```bash
python3 data/data.py   # only after editing seats, candidates or party lists in data.py
python3 data/map.py    # only after replacing files in data/boundaries/ (needs pip install shapely pyproj)
python3 build.py       # always, after any change: writes dist/index.html
open dist/index.html   # no server needed; the page is fully self-contained
```

`build.py` checks `src/body.html` for unbalanced tags before building. It also fills `{{POLL_SUMMARY}}` (the footer's latest-poll line) in `body.html` from the first entry in `POLLS`, so the latest poll is plain text for search engines and link previews, `{{FAQ_HTML}}` and `{{JSON_LD}}` from `faq()` and `json_ld()` (the election FAQ at the bottom of the page and the matching WebSite, WebPage, WebApplication, Event and FAQPage structured data, with answers built from the data files), and `{{BUILD_DATE}}` in `head.html`. Keep the FAQ text and structured data coming from the same `faq()` list so they always match. Past breakages came from moving blocks of markup and leaving a stray or missing `</div>`, so keep that check passing.

## Files

| Path | What it is |
|---|---|
| `src/head.html` | Doctype, meta tags and title, up to the opening `<style>` |
| `src/base.css`, `src/extra.css` | All styles. Colours are CSS variables on `:root` with dark-mode values; party colours are `--NAT`, `--LAB`, `--GRN`, `--ACT`, `--NZF`, `--TPM`, `--OPP`, `--OTH` |
| `src/body.html` | All page markup |
| `src/foot.html` | Third-party scripts loaded after the forecast script: the Buy Me a Coffee floating button |
| `src/head.js` | Constants: `POLLS` (with fieldwork midpoints), `AVG`, `PARTIES`, `TREND` (late-swing slopes), `SPECIALS`, lookup indexes |
| `src/main.js` | Everything else: state, seat model, simulation, rendering, controls |
| `data/data.py` | Source of truth for the 71 electorates (candidates, starting weights, notes) and every party list. Writes `data/data.json` |
| `data/data.json` | Generated. Embedded in the page as `const DATA` |
| `data/map.py` | Clips the 2026 electorate boundaries to the coastline, simplifies them and writes `data/map.json` |
| `data/map.json` | Generated. Embedded in the page as `const MAP`: SVG paths, label points and bounding boxes per electorate |
| `data/boundaries/` | Map sources: Stats NZ 2026 electorate boundaries (CC BY 4.0) and a LINZ coastline (CC BY 3.0 NZ) |
| `data/NZ_2026_Poll_Seat_Tracker.xlsx` | Companion spreadsheet: Sainte-Laguë seat calculator and poll log |
| `static/` | Icons (`favicon.ico`, `favicon.svg`, `favicon-96.png`, `apple-touch-icon.png`, `icon-192/512.png`, maskable 512), `site.webmanifest` and `og.png` (the 1200×630 link-preview image). Copied into `dist/` by the build |
| `dist/` | Built output: `index.html`, the `static/` files, and generated `robots.txt` and `sitemap.xml` |

## How it works

**Inputs live in one `state` object** (`main.js`): party vote (`shares`), the poll it came from (`pollBase`), called seats (`locks`), the three traditional blocs (`bloc`: `opp` Labour-led, `und` kingmaker, `gov` National-led), polling error (`err`, 0 means simulations off), `simSeats`, the National split-ticket slider (`split`), `trend`, Opportunity's `oppMode` (`direct` or `squeeze`), `squeeze` and `squeezeTo`, and `custom` blocs.

**`eff()` is the party vote actually used.** It applies late swing, then Opportunity's squeeze (squeeze mode only), on top of `state.shares`. Always read party vote through `eff()`.

**Seat chances:** `seatProbs(seat, shares)` turns each candidate's starting weight `w` into probabilities, nudged by how far their party's vote is from the poll average.

**Simulation:** `simulate()` is async and runs in batches of 400 so the progress bar can update; a newer run cancels an older one. Each run:
1. Adds polling error to the party vote: independent per party, plus an optional shared swing between blocs.
2. Decides all 71 electorates. Every seat draws exactly one random number per run, whether or not it's called, so changing one seat never disturbs another.
3. Allocates seats with Sainte-Laguë: 5% threshold or an electorate, overhang for extra electorate wins, and vacant seats when a list runs out (Te Pāti Māori has one list candidate).

The random seed is fixed, so identical inputs give identical results. That's deliberate: differences you see come only from what changed.

**Page load:** `firstLoad()` runs 600 simulations, draws them with `renderAll()`, then calls `update()` for the full count. Because the seed is fixed, the quick runs are the first runs of the full set. Before any script runs, the seat diagram shows a grey placeholder that `build.py` writes into `{{HEMI_SKELETON}}` (same layout as `seatPositions()`), with placeholder odds cards in `body.html`.

**Results (`state.sim`)** are typed arrays with one slot per run: seats per party, independent seats, House size, outcome (0 National-led majority, 1 Labour-led, 2 neither), factor flags, per-candidate seat wins (`seatWin`), and per-rank list entries (`listIn`). Every percentage on the page is a count from these. Custom blocs reuse them, so they update without a rerun.

**`sim.rep` is the Parliament drawn on screen:** the stored run closest to the middle result for every party, the overall House size, and National's electorates and entitlement, with ties broken by the most plausible electorate results. The National card, list tables and seat diagram all describe this same run so they agree.

## Page sections

Above it, a short intro (date and countdown, title, one line). Keep it short so the seat diagram is on the first screen on a phone.

1. **Most likely Parliament:** the poll and simulation controls, then the seat diagram with a majority outline, odds cards, party bar with hover MP lists, and a collapsible detail table.
2. **Simulation:** intro and reset, then cards for Opportunity (side, vote with direct and squeeze modes, impact), National's overhang (bars, list table under More info), polling error, Te Pāti Māori, breakaway MPs and late swing.
3. **Electorate seats:** a List / Map switch. The list shows cards with simulated chances, rating pills and calls. The map (general or Māori electorates) colours each seat by who's ahead, with the shade set by the same rating as the pills and stripes for toss-ups; selecting a seat shows its card. Map state lives in `MAPV` (`main.js`), and `paintMap()` runs after every simulation.
4. **Party list outcome.**
5. **More tools:** the all-party chart of what extra votes would do.
6. **Traditional government blocs:** which bloc each other party sits in.
7. **Custom blocs:** saved in localStorage under `nzSeatForecast.customBlocs.v1`.
8. **Election FAQ** (collapsed `details#faq`), then the footer with the latest poll, the coffee link and sources.

A pinned bar appears once the seat diagram scrolls off screen, with a mini diagram, odds, party bar and Reset.

On phones only, a small "Change the forecast" pill (`#scrollCue`) appears at the bottom after the first full result, until the visitor scrolls; tapping it scrolls to the simulation section.

## Conventions

- Plain sentence case in all text. Party names in full in prose; codes only in tight labels.
- Every number shown should trace to the simulation arrays or the data files. Don't hard-code figures in explanatory text.
- Tooltips: add `data-tip="..."` (plain text) or `data-tiphtml="..."` (escaped HTML) to any element, and give non-buttons `tabindex="0"`.
- Respect `prefers-reduced-motion` for any animation (confetti, smooth scrolling, spinners).
- Opportunity status messages report Opportunity and overall odds only; National's card reports National's numbers.
- Sources for stated party positions are linked inline in the text where they appear.
- Analytics: Umami (script tag in `src/head.html`, counting only on nzpolls.co.nz). Events are mapped in one place, the analytics section at the end of `main.js`: add a selector or element id there for any new control rather than calling `track()` from handlers. Sliders report on `change` (release), never `input`.

## Data notes

- Polls are to 19 October 2026 (published). Add new ones to `POLLS` in `head.js` in order of fieldwork, newest first, with a `mid` date; the first entry is the default. Also update the "Polls to" date in the footer note in `body.html`.
- Electorate starting weights come from 2023 results (notional for new boundaries), adjusted for retirements and the published electorate polls named in each seat's `note`. They are estimates, not published forecasts.
- Electorate polls in use (see each seat's `note`): Auckland Central, Hutt South, Mount Albert, and Whakaata Māori-Curia polls in six Māori seats (all but Tāmaki Makaurau). When a new one comes out, update that seat's weights in `data.py` and its note, then run `data.py` and `build.py`.
