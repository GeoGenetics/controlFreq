# React dashboard

The dashboard is a Vite/React application that reads a compact summary of a controlFreq TSV. It includes filters for control type, kingdom, pipeline, and date range, plus taxa search and CSV export.

## Dashboard features

Navigation is grouped into Monitor, Libraries, Taxa, and Quality so related
analyses stay together. Every main tab includes an open-by-default,
plain-language guide explaining what the page compares, how to read its
visuals, and where clicks lead; the guide can be collapsed at any time.

The generated JSON retains monthly summaries by taxon, control type, kingdom,
and pipeline, plus compact per-library genus lineages and run metadata. The
dashboard filters these summaries by taxon, assigned reads, mean A, control,
kingdom, pipeline, and date.

Warning library IDs and monthly read-volume points open library drill-downs.
Taxon names throughout the dashboard open Taxon Explorer. Its recurrence chart
uses side-by-side bars for extraction and library negatives; bar height is
assigned reads and the fixed fill-colour scale represents read-weighted mean A.

Library Explorer explains the warning baseline, provides a persistent two-slot
comparison tray, and shows detailed lineage values on Krona hover. Internal
Krona branches zoom the hierarchy, while terminal taxa open Taxon Explorer.
A Similar Libraries section ranks the eight nearest filtered profiles using
100 × (1 − Bray–Curtis distance), with date, control type, shared taxa, warning
status, and direct open/compare actions. The PCoA tab
uses Bray-Curtis distances of relative genus abundance. Dedicated tabs provide
taxon recurrence, library comparison with exact control dates and types,
damage/A distributions, run/batch QC, and
a co-occurrence network based on library co-presence and Jaccard similarity.
The Taxa Landscape tab plots prevalence across eligible libraries against mean
relative abundance when detected. Point size represents total reads, filters
cover control type, pipeline, kingdom, reads, and prevalence, and clicking a
point opens Taxon Explorer. Taxon Explorer also loads an optional Wikipedia
summary and image using the normalized taxon name, with clear external attribution.

The taxa heatmap shows the 12 most abundant matching taxa over time using a
log-scaled colour intensity. Date headings open all matching libraries, taxon
labels open Taxon Explorer, and populated cells open the matching month/taxon
library list before drilling into the selected library's Krona view. Library warnings use total genus-level reads and
flag values above the median plus three scaled median absolute deviations
within each control type, kingdom, and pipeline group. At least four libraries
are required to establish a baseline, and warnings are shown newest-first.
Minimum mean A filtering is available on
all analysis tabs where taxon-level A values can meaningfully restrict results.


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

This streams the large TSV and writes `public/dashboard-data.json`. Replace the input path with any newer control table. The builder retains every genus-level negative-control observation with a numeric read count; it does not apply a minimum-read cutoff. Dashboard and CSV-export filters are applied interactively.

## Run locally

Node.js 20 or newer is recommended.

```bash
npm install
npm run dev
```

Use `npm run build` to create a production bundle in `dist/`.
