#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if (( $# > 1 )) || { (( $# == 1 )) && [[ "$1" != "--push" ]]; }; then
  echo "Usage: bash scripts/main.sh [--push]" >&2
  exit 2
fi
push_dashboard=false
if [[ "${1:-}" == "--push" ]]; then
  push_dashboard=true
fi

name="SMDB_$(date +"%Y%m%d_%H%M%S")"
mkdir -p tmpdir smdb controls
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
python3 scripts/build_dashboard_data.py "$control_tsv"
echo "Dashboard JSON updated in public/"

if [[ "$push_dashboard" == true ]]; then
  dashboard_files=(public/dashboard-data*.json)
  git add -- "${dashboard_files[@]}"
  if git diff --cached --quiet -- "${dashboard_files[@]}"; then
    echo "Dashboard data is unchanged; nothing to push."
  else
    branch="$(git branch --show-current)"
    if [[ -z "$branch" ]]; then
      echo "Cannot push from a detached HEAD" >&2
      exit 1
    fi
    git commit -m "Update dashboard data ${name#SMDB_}" -- "${dashboard_files[@]}"
    git push origin "$branch"
  fi
fi
