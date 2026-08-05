#!/usr/bin/env python3
"""Stream a controlFreq TSV into a compact JSON file for the React dashboard."""

import argparse, csv, json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

def classify(row):
    if row["pipeline"] == "PREFILTER": return "Microbe"
    if "Metazoa" in row["taxa_path"]: return "Animal"
    if "Viridiplantae" in row["taxa_path"]: return "Plant"
    return "Other Eukaryote"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, default=Path("public/dashboard-data.json"))
    args = parser.parse_args()
    reads_by_group, libraries_by_group = defaultdict(int), defaultdict(set)
    taxa_reads, taxa_months = defaultdict(int), defaultdict(lambda: defaultdict(int))
    with args.input.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            ctype, date = row.get("control_type", ""), row.get("control_date", "")
            if "Negative" not in ctype or not date or date == "NA": continue
            pipeline, path = row.get("pipeline", ""), row.get("taxa_path", "")
            try: reads = int(float(row.get("nreads", "0")))
            except (TypeError, ValueError): continue
            if row.get("rank") != "genus" or reads <= 49: continue
            if pipeline == "PREFILTER" and "Bacteria" not in path: continue
            month, kingdom = date[:7], classify(row)
            key = (month, ctype.replace("_", " "), kingdom, pipeline)
            reads_by_group[key] += reads
            libraries_by_group[key].add(row.get("library_id", ""))
            taxon_key = (row.get("name") or "Unknown", kingdom)
            taxa_reads[taxon_key] += reads
            taxa_months[taxon_key][month] += reads
    records = [{"month": k[0], "controlType": k[1], "kingdom": k[2], "pipeline": k[3],
                "reads": reads, "libraries": len(libraries_by_group[k] - {""})}
               for k, reads in sorted(reads_by_group.items())]
    taxa = []
    for (name, kingdom), reads in sorted(taxa_reads.items(), key=lambda x: x[1], reverse=True)[:30]:
        values = [v for _, v in sorted(taxa_months[(name, kingdom)].items())]
        previous, latest = (values[-2], values[-1]) if len(values) > 1 else (0, values[-1])
        change = round((latest - previous) / previous * 100, 1) if previous else 0
        taxa.append({"name": name, "kingdom": kingdom, "reads": reads, "change": change})
    payload = {"generatedAt": datetime.now(timezone.utc).isoformat(), "source": args.input.name,
               "records": records, "taxa": taxa}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(records)} observations and {len(taxa)} taxa to {args.output}")

if __name__ == "__main__": main()
