#!/usr/bin/env bash
set -eo pipefail

collector_dir="$(cd "$(dirname "$0")/.." && pwd)"
# Dandy does not grant this account journal read access, so keep a local copy.
mkdir -p "$collector_dir/logs"
exec > >(tee -a "$collector_dir/logs/collector.log") 2>&1
printf '\nCollector invocation: %s (%s)\n' "$(date --iso-8601=seconds)" "${1:-refresh}"

# systemd does not source shell profiles. Initialise Dandy's modules explicitly.
export MODULEPATH="${CONTROLFREQ_MODULEPATH:-/opt/software/modules}"
source "${CONTROLFREQ_MODULES_INIT:-/etc/profile.d/modules.sh}"
module purge
module load gcc/11.2.0 R/4.3.3 python/3.10.18
set -u

if [[ "${1:-}" == "--check" ]] && (( $# == 1 )); then
  for program in curl unzip python3 Rscript flock; do
    command -v "$program" >/dev/null
  done
  python3 -c 'import sys; assert sys.version_info >= (3, 8), "Python 3.8+ required"'
  Rscript -e 'pkgs <- c("tidyr", "lubridate", "stringr", "readr", "dplyr", "purrr"); missing <- pkgs[!vapply(pkgs, requireNamespace, logical(1), quietly=TRUE)]; if (length(missing)) stop(paste("Missing R packages:", paste(missing, collapse=", ")))'
  /bin/bash -c 'module purge; module load miller/6.16.0; command -v mlr >/dev/null'
  echo "Collector service prerequisites OK"
  exit 0
elif (( $# != 0 )); then
  echo "Usage: bash collector/scripts/run-systemd.sh [--check]" >&2
  exit 2
fi

exec /bin/bash "$collector_dir/scripts/main.sh" \
  --output-dir "${CONTROLFREQ_OUTPUT_DIR:-$collector_dir/output}"
