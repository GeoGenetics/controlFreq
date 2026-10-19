# Collector / web JSON contract

A release contains 11 UTF-8 JSON files. Only these derived files cross the
boundary; raw SMDB, control TSVs, and production result files stay on Dandy.

`dashboard-data.json` is the entry point. It contains:

| Field | Purpose |
| --- | --- |
| `generatedAt`, `source` | UTC build timestamp and source TSV basename |
| `ranks` | Supported taxonomic ranks |
| `rankFiles` | Maps each non-genus rank to relative `taxa` and `libraries` filenames |
| `records` | Monthly summaries by rank, control type, kingdom and pipeline |
| `taxa`, `taxonIndex` | Leading taxa and rank/name search index |
| `taxonRecords`, `libraryTaxonRecords` | Genus taxon and library details loaded initially |
| `libraryMetadata` | Library/control IDs, date, flowcell and run metadata |
| `libraryWarnings`, `warningMethod` | Per-library warnings and baseline description |

For each of `phylum`, `class`, `order`, `family`, and `species`, two files hold
JSON arrays: `dashboard-data-<rank>-taxa.json` and
`dashboard-data-<rank>-libraries.json`. Their row shapes match `taxonRecords`
and `libraryTaxonRecords`. The web app loads them lazily relative to the same
base URL as the entry point. Genus is already embedded in the entry point.

The collector's filtering and calculations are unchanged by the directory
split. The builder remains the definition of individual row fields; coordinate
changes with `web/src/App.jsx` and the analysis components consuming those rows.

Published output has this layout:

```text
output/
  releases/<unique-release>/dashboard-data*.json
  current -> releases/<unique-release>
```

The publisher validates the generated JSON and atomically switches `current`
only after successful completion. Release directories are immutable after
publication. Mount or transfer the entire parent layout, preserving the
relative symlink. Never expose raw collector directories through the webserver.
