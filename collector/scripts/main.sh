#!/usr/bin/env bash
set -euo pipefail

# All raw data stays inside collector/, regardless of the caller's directory.
collector_dir="$(cd "$(dirname "$0")/.." && pwd)"
output_dir="$collector_dir/output"
if (( $# == 2 )) && [[ "$1" == "--output-dir" ]]; then
  output_dir="$(realpath -m "$2")"
elif (( $# != 0 )); then
  echo "Usage: bash collector/scripts/main.sh [--output-dir DIRECTORY]" >&2
  echo "Data is published to a directory; Git commits and pushes are no longer used." >&2
  exit 2
fi
cd "$collector_dir"

mkdir -p tmpdir smdb controls
# Prevent a manual run and the timer from refreshing this collector together.
exec 9>tmpdir/collector.lock
if ! flock --nonblock 9; then
  echo "Another collector refresh is running; skipping this run."
  exit 0
fi

name="SMDB_$(date +"%Y%m%d_%H%M%S")"
tmp_dir=$(mktemp -d tmpdir/smdb.XXXXXX)
trap 'rm -rf -- "$tmp_dir"' EXIT
curl --fail --location --output "$tmp_dir/${name}.zip" --data 'checkbox_smdb=on' http://dandyweb01fl.unicph.domain:5100/download_merged_standardized
unzip -o "$tmp_dir/${name}.zip" -d "$tmp_dir"
tsv=$(find "$tmp_dir" -type f -name "*.tsv" -print -quit)
if [[ -z "$tsv" ]]; then
  echo "No TSV found in the downloaded SMDB archive" >&2
  exit 1
fi
mv "$tsv" "smdb/$name.tsv"
echo "SMDB downloaded: smdb/$name.tsv"

Rscript scripts/getControls.R "$(realpath "smdb/$name.tsv")"
control_tsv="controls/control_${name#SMDB_}.tsv"
python3 scripts/publish_dashboard_data.py "$control_tsv" --output-dir "$output_dir"
