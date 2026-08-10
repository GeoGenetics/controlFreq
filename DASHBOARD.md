# React dashboard

The dashboard is a Vite/React application that reads a compact summary of a controlFreq TSV. It includes filters for control type, kingdom, pipeline, and date range, plus taxa search and CSV export.

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
