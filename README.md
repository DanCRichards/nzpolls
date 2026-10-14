# nzpolls

A single-page seat forecast for New Zealand's 7 November 2026 general election. It runs thousands of simulated elections in the browser and shows the most likely Parliament, who can govern, electorate chances and party list outcomes.

## Build

```bash
python3 data/data.py   # only after editing seats, candidates or party lists
python3 build.py       # writes dist/index.html, a fully self-contained page
```

See [CLAUDE.md](CLAUDE.md) for how the model and page are put together.

## Hosting

Every push to `main` builds the page and deploys `dist/` to GitHub Pages via `.github/workflows/pages.yml`.

One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**. The site is then served at `https://dancrichards.github.io/nzpolls/`.
