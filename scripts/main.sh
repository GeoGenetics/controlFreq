name="SMDB_$(date +"%Y%m%d_%H%M%S")"
push_dashboard=false
if [ "${1:-}" = "--push" ]; then
  push_dashboard=true
fi

rm tmpdir/*
curl -L -o "tmpdir/${name}.zip" -X POST -d 'checkbox_smdb=on' http://dandyweb01fl.unicph.domain:5100/download_merged_standardized
unzip -o "tmpdir/${name}.zip" -d tmpdir/
tsv=$(find tmpdir -type f -name "*.tsv" | head -n 1)
mv "$tsv" "smdb/$name.tsv"
rm tmpdir/*
echo "SMDB file downloaded and controls extracted: smdb/$name.tsv"

echo "Getting control data and generating report..."
Rscript scripts/getControls.R "$(realpath "smdb/$name.tsv")"

control_tsv="controls/control_${name#SMDB_}.tsv"
echo "Updating dashboard data from $control_tsv..."
python3 scripts/build_dashboard_data.py "$control_tsv"
echo "Dashboard data updated: public/dashboard-data.json"

if [ "$push_dashboard" = true ]; then
  git add public/dashboard-data.json
  if git diff --cached --quiet -- public/dashboard-data.json; then
    echo "Dashboard data is unchanged; nothing to push."
  else
    branch="$(git branch --show-current)"
    git commit -m "Update dashboard data ${name#SMDB_}" -- public/dashboard-data.json
    git push origin "$branch"
  fi
fi

