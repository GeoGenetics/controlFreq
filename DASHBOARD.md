# React dashboard

The dashboard is a Vite/React application that reads a compact summary of a controlFreq TSV. It includes filters for control type, kingdom, pipeline, and date range, plus taxa search and CSV export.

## Dashboard features

The generated JSON retains monthly summaries by taxon, control type, kingdom,
and pipeline. The dashboard can filter these summaries by taxon name, minimum
assigned reads, and minimum read-weighted mean `A`, as well as the original
control, kingdom, pipeline, and date filters.

The taxa heatmap shows the 12 most abundant matching taxa over time using a
log-scaled colour intensity. Library warnings use total genus-level reads and
flag values above the median plus three scaled median absolute deviations
within each control type, kingdom, and pipeline group. At least four libraries
are required to establish a baseline.


## Refresh the data

The main pipeline refreshes the dashboard data automatically after generating
the latest control table:

```bash
bash scripts/main.sh
```

To also commit the generated JSON and push it to the current branch on GitHub:

```bash
bash scripts/main.sh --push
```

The commit contains only `public/dashboard-data.json`. Git authentication must
already be configured for the `origin` remote.

To rebuild only the dashboard data from an existing control table, run:

```bash
python3 scripts/build_dashboard_data.py controls/control_20260619_105413.tsv
```

This streams the large TSV and writes `public/dashboard-data.json`. Replace the input path with any newer control table.

## Run locally

Node.js 20 or newer is recommended.

```bash
npm install
npm run dev
```

Use `npm run build` to create a production bundle in `dist/`.
