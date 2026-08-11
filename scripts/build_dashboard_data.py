#!/usr/bin/env python3
"""Stream a controlFreq TSV into a compact JSON file for the React dashboard."""

import argparse
import csv
import json
import math
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


def classify(row):
    if row["pipeline"] == "PREFILTER":
        return "Microbe"
    if "Metazoa" in row["taxa_path"]:
        return "Animal"
    if "Viridiplantae" in row["taxa_path"]:
        return "Plant"
    return "Other Eukaryote"


def clean(value):
    return "" if value in (None, "NA") else value


def number(value):
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else None
    except (TypeError, ValueError):
        return None


def anomaly_baseline(values):
    """Return a robust upper limit based on median + 3 scaled MAD."""
    median = statistics.median(values)
    deviations = [abs(value - median) for value in values]
    mad = statistics.median(deviations)
    threshold = median + 3 * 1.4826 * mad
    if mad == 0:
        threshold = max(median * 2, median + 1)
    return median, threshold


def compact_lineage(path, kingdom, taxon):
    """Return a small, root-to-leaf lineage suitable for the dashboard."""
    wanted = {"phylum", "class", "order", "family", "genus"}
    lineage = [kingdom]
    parsed = []
    for part in path.split(";"):
        fields = part.replace('""', '"').split(":", 2)
        if len(fields) != 3:
            continue
        name = fields[1].strip('"')
        rank = fields[2].strip('"')
        if name and rank in wanted:
            parsed.append((name, rank))
    for name, _ in reversed(parsed):
        if name not in lineage:
            lineage.append(name)
    if taxon not in lineage:
        lineage.append(taxon)
    return lineage


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, default=Path("public/dashboard-data.json"))
    args = parser.parse_args()

    reads_by_group = defaultdict(int)
    libraries_by_group = defaultdict(set)
    taxon_groups = defaultdict(
        lambda: {"reads": 0, "libraries": set(), "aSum": 0.0, "aReads": 0}
    )
    library_groups = defaultdict(
        lambda: {"reads": 0, "topTaxon": "", "topReads": 0}
    )
    library_taxon_groups = defaultdict(
        lambda: {"reads": 0, "aSum": 0.0, "aReads": 0}
    )
    library_metadata = {}
    taxa_reads = defaultdict(int)
    taxa_months = defaultdict(lambda: defaultdict(int))

    with args.input.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            ctype = row.get("control_type", "")
            date = row.get("control_date", "")
            if "Negative" not in ctype or not date or date == "NA":
                continue

            pipeline = row.get("pipeline", "")
            path = row.get("taxa_path", "")
            parsed_reads = number(row.get("nreads"))
            if parsed_reads is None:
                continue
            reads = int(parsed_reads)
            if row.get("rank") != "genus" or reads <= 49:
                continue
            if pipeline == "PREFILTER" and "Bacteria" not in path:
                continue

            month = date[:7]
            kingdom = classify(row)
            control_type = ctype.replace("_", " ")
            library_id = row.get("library_id", "")
            taxon = row.get("name") or "Unknown"
            if library_id and library_id not in library_metadata:
                library_metadata[library_id] = {
                    "libraryId": library_id,
                    "controlId": clean(row.get("control_id")),
                    "date": date,
                    "month": month,
                    "controlType": control_type,
                    "flowcell": clean(row.get("flowcell")),
                    "flowcellPosition": clean(row.get("results_flowcell_pos") or row.get("fastq_flowcell_pos")),
                    "machine": clean(row.get("fastq_machine")),
                    "runNumber": clean(row.get("fastq_run_n")),
                    "project": clean(row.get("fastq_project")),
                }
            key = (month, control_type, kingdom, pipeline)

            reads_by_group[key] += reads
            libraries_by_group[key].add(library_id)

            taxon_group = taxon_groups[
                (month, control_type, kingdom, pipeline, taxon)
            ]
            taxon_group["reads"] += reads
            taxon_group["libraries"].add(library_id)
            damage = number(row.get("A"))
            if damage is not None:
                taxon_group["aSum"] += damage * reads
                taxon_group["aReads"] += reads

            library_group = library_groups[
                (library_id, month, control_type, kingdom, pipeline)
            ]
            library_group["reads"] += reads
            if reads > library_group["topReads"]:
                library_group["topTaxon"] = taxon
                library_group["topReads"] = reads

            if library_id:
                lineage = compact_lineage(path, kingdom, taxon)
                library_taxon = library_taxon_groups[
                    (
                        library_id,
                        month,
                        control_type,
                        kingdom,
                        pipeline,
                        taxon,
                        "|".join(lineage),
                    )
                ]
                library_taxon["reads"] += reads
                if damage is not None:
                    library_taxon["aSum"] += damage * reads
                    library_taxon["aReads"] += reads

            taxon_key = (taxon, kingdom)
            taxa_reads[taxon_key] += reads
            taxa_months[taxon_key][month] += reads

    records = [
        {
            "month": key[0],
            "controlType": key[1],
            "kingdom": key[2],
            "pipeline": key[3],
            "reads": reads,
            "libraries": len(libraries_by_group[key] - {""}),
        }
        for key, reads in sorted(reads_by_group.items())
    ]

    taxon_records = []
    for key, values in sorted(taxon_groups.items()):
        mean_a = (
            round(values["aSum"] / values["aReads"], 4)
            if values["aReads"]
            else None
        )
        taxon_records.append(
            {
                "month": key[0],
                "controlType": key[1],
                "kingdom": key[2],
                "pipeline": key[3],
                "name": key[4],
                "reads": values["reads"],
                "libraries": len(values["libraries"] - {""}),
                "meanA": mean_a,
            }
        )

    baseline_values = defaultdict(list)
    for key, values in library_groups.items():
        if key[0]:
            baseline_values[(key[2], key[3], key[4])].append(values["reads"])
    baselines = {
        key: anomaly_baseline(values)
        for key, values in baseline_values.items()
        if len(values) >= 4
    }

    library_warnings = []
    for key, values in sorted(library_groups.items()):
        baseline_key = (key[2], key[3], key[4])
        if not key[0] or baseline_key not in baselines:
            continue
        median, threshold = baselines[baseline_key]
        if values["reads"] <= threshold:
            continue
        library_warnings.append(
            {
                "libraryId": key[0],
                "month": key[1],
                "controlType": key[2],
                "kingdom": key[3],
                "pipeline": key[4],
                "reads": values["reads"],
                "baseline": round(median),
                "threshold": round(threshold),
                "fold": round(values["reads"] / median, 1) if median else None,
                "topTaxon": values["topTaxon"],
            }
        )

    library_taxon_records = []
    for key, values in sorted(library_taxon_groups.items()):
        library_taxon_records.append(
            {
                "libraryId": key[0],
                "month": key[1],
                "controlType": key[2],
                "kingdom": key[3],
                "pipeline": key[4],
                "name": key[5],
                "path": key[6],
                "reads": values["reads"],
                "meanA": (
                    round(values["aSum"] / values["aReads"], 4)
                    if values["aReads"]
                    else None
                ),
            }
        )

    taxa = []
    ranked_taxa = sorted(taxa_reads.items(), key=lambda item: item[1], reverse=True)
    for (name, kingdom), reads in ranked_taxa[:30]:
        values = [value for _, value in sorted(taxa_months[(name, kingdom)].items())]
        previous, latest = (
            (values[-2], values[-1]) if len(values) > 1 else (0, values[-1])
        )
        change = round((latest - previous) / previous * 100, 1) if previous else 0
        taxa.append(
            {"name": name, "kingdom": kingdom, "reads": reads, "change": change}
        )

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": args.input.name,
        "records": records,
        "taxa": taxa,
        "taxonRecords": taxon_records,
        "libraryTaxonRecords": library_taxon_records,
        "libraryMetadata": [library_metadata[key] for key in sorted(library_metadata)],
        "libraryWarnings": sorted(
            library_warnings, key=lambda row: row["reads"], reverse=True
        ),
        "warningMethod": (
            "Above median + 3 scaled MAD within control type, kingdom and "
            "pipeline (minimum 4 libraries)."
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, separators=(",", ":")), encoding="utf-8"
    )
    print(
        f"Wrote {len(records)} observations, {len(taxon_records)} taxon groups, "
        f"{len(library_taxon_records)} library taxa, "
        f"{len(library_metadata)} library metadata rows, and "
        f"{len(library_warnings)} library warnings to {args.output}"
    )


if __name__ == "__main__":
    main()
