# controlFreq dashboard

A Vite/React dashboard for tracking taxonomic assignments in laboratory negative controls. The dashboard is deployed to GitHub Pages from the `main` branch. [DASHBOARD.md](DASHBOARD.md) describes its views and filters.

## Refresh data

Run these commands from the repository root on a machine with access to the internal SMDB endpoint and the CAEG production results directories. On the CAEG HPC, load the R environment first:

```bash
module load gcc/11.2.0 R/4.3.3
bash scripts/main.sh
```

The script downloads an SMDB TSV, writes `controls/control_<timestamp>.tsv`, and rebuilds every `public/dashboard-data*.json` file. It needs `curl`, `unzip`, Python 3, R with `tidyr`, `lubridate`, `stringr`, `readr`, `dplyr`, and `purrr`, plus the `miller/6.16.0` module used by `scripts/findLibrary.sh`. The source SMDB and control TSV stay local; the generated JSON files are the only data outputs tracked by Git.

Before publishing, check the new source and data files:

```bash
git status --short
python3 -c 'import json; from pathlib import Path; p=Path("public/dashboard-data.json"); d=json.loads(p.read_text()); print(d["source"], d["generatedAt"], len(d["records"])); [json.loads(p.read_text()) for p in Path("public").glob("dashboard-data*.json")]'
npm install
npm run build
```

To refresh **and push the data** in one run:

```bash
bash scripts/main.sh --push
```

`--push` commits all 11 `public/dashboard-data*.json` files and pushes the current branch to `origin`. It requires configured Git credentials and a checked-out branch. Other staged files are excluded from this data commit. A push to `main` triggers the GitHub Pages deployment; on another branch, merge or push the change to `main` through your normal Git workflow to publish it. If the generated files are unchanged, the script skips the commit and push. If `git push` fails, the local commit remains; fix the Git issue and run `git push origin <branch>`.

If the control TSV already exists, rebuild the dashboard data without downloading anything:

```bash
python3 scripts/build_dashboard_data.py controls/control_YYYYMMDD_HHMMSS.tsv
git add public/dashboard-data*.json
git commit -m "Update dashboard data" -- public/dashboard-data*.json
git push origin "$(git branch --show-current)"
```

The builder keeps negative-control rows with numeric reads at phylum, class, order, family, genus, and species ranks. Read thresholds and other filters are applied in the dashboard.

## Maintain the dashboard

Edit React components and styles in `src/`. For local development, run `npm install` and `npm run dev`. Run `npm run build` before pushing application changes. GitHub Actions runs the same build and publishes `dist/` after a push to `main`.

When changing the TSV schema or JSON shape, update `scripts/getControls.R`, `scripts/build_dashboard_data.py`, and the matching reads in `src/` together. Rebuild the JSON and the Vite app to catch missing fields or files. The dashboard reads `public/dashboard-data.json` first and fetches rank-specific JSON only when that rank is selected.
