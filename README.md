# controlFreq dashboard

A Vite/React dashboard for tracking taxonomic assignments in laboratory negative controls. The dashboard is deployed to GitHub Pages from the `main` branch. [DASHBOARD.md](DASHBOARD.md) describes its views and filters.

## How controls are found

`scripts/main.sh` downloads the merged SMDB table from the internal SMDB service. `scripts/getControls.R` reads that table and identifies controls using `robot_sample_id` and `archive_sample_id`. It uses the robot ID when present, otherwise the archive ID, as `control_id`. The matching is case-insensitive:

| ID pattern | Stored `control_type` |
| --- | --- |
| `robot_sample_id` starts with `ExrNTC` | `Extraction_Negative` |
| `robot_sample_id` starts with `ExrPTC` | `Extraction_Positive` |
| `robot_sample_id` starts with `LibNTC` | `Library_Negative` |
| `robot_sample_id` starts with `LibPTC` | `Library_Positive` |
| Otherwise, `control_id` contains `SmplNTC` | `Sample_Negative` |

Rows without a match or a `library_id` are discarded. The prefix checks take priority over `SmplNTC`. For Exr/Lib IDs, the eight digits after the prefix are interpreted as `YYMMDDNN`: the first six give the control date and the last two identify the control on that day. If the ID does not yield a date, including for `SmplNTC`, the script uses `robot_sample_sampling_date`. It keeps distinct combinations of library ID, control ID, type, and date.

To locate the sequencing results, `getControls.R` passes those library IDs to `scripts/findLibrary.sh`. That helper loads Miller, selects the last filename matching each of `/datasets/caeg_production/_STATS/20*.fastq.tsv` and `20*.prod.tsv`, joins the catalogs on `library`, `date`, and `flowcell`, then selects the requested libraries. The control rows are joined to those catalog results by library ID; entries with `results_wf` equal to `ARCHIVE` are excluded. A library can have more than one matched run, so it can produce multiple result rows.

For each remaining result path, the extractor looks for `results/metadmg/aggregate/Lib_<library_id>_collapsed.stat.gz` and `results/prefilter_metadmg/aggregate/Lib_<library_id>_collapsed.stat.gz`. Existing files contribute taxonomic rows labeled `EUKARYOTE` or `PREFILTER`. Controls without a matching statistics file remain in the control TSV with no read count. `scripts/build_dashboard_data.py` then includes only negative controls with a non-missing control date, numeric read count, and a supported taxonomic rank; PREFILTER rows also need a Bacteria or Archaea lineage. If an expected control is absent, check its SMDB IDs and `library_id`, run `bash scripts/findLibrary.sh LIBRARY_ID` to inspect the catalog match, and check the expected statistics paths. If control IDs or production catalog paths change, update `getControls.R` or `findLibrary.sh` accordingly.

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
