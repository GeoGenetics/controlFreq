# Dandy collector

This part runs on Dandy, with access to SMDB and `/datasets/caeg_production`.
It needs no Node, Docker, webserver, or Git credentials. It reads production
results and publishes the JSON consumed by the web app.

## Refresh data

From the repository root on Dandy:

```bash
module load gcc/11.2.0 R/4.3.3
bash collector/scripts/main.sh
# Or choose a shared/export directory:
bash collector/scripts/main.sh --output-dir /path/to/controlfreq-data
```

Requirements: `curl`, `unzip`, `flock`, Python 3.8+, R with `tidyr`, `lubridate`,
`stringr`, `readr`, `dplyr`, and `purrr`, and the `miller/6.16.0` module.
The entry point works from any directory. Relative output paths are resolved
against the caller's directory. Raw SMDB TSVs, control TSVs, and temporary files
stay in `collector/smdb/`, `collector/controls/`, and `collector/tmpdir/`.
These directories and `collector/output/` are ignored by Git.

After successful JSON publication, the refresh deletes older generated
`control_YYYYMMDD_HHMMSS.tsv` files from this collector's `controls/` directory.
It keeps the TSV used for the successful publication. Cleanup does not run if
collection or publication fails. Files newer than the successful TSV, symlinks,
subdirectories, and differently named files are left alone. The original
checkout's `controls/` and the SMDB downloads are not cleaned by this policy.

The default output is `collector/output/`. Each refresh creates a complete set
of 11 JSON files in `output/releases/<unique-release>/`, validates their JSON,
and atomically replaces the relative `output/current` symlink. A failed build
leaves the previous release active. Old releases are retained; remove unused
ones periodically, keeping the target of `current`. Keep the export directory
readable and its parent directories traversable by the webserver user.

To regenerate from an existing TSV without contacting SMDB:

```bash
python3 collector/scripts/publish_dashboard_data.py \
  collector/controls/control_YYYYMMDD_HHMMSS.tsv
```

For a plain set of files without release publication, the original builder is
still available:

```bash
python3 collector/scripts/build_dashboard_data.py /path/to/control.tsv \
  --output /path/to/staging/dashboard-data.json
```

Its default is now `collector/output/dashboard-data.json`; use the publisher
when feeding a running webserver. The former `--push` option is removed: data
updates no longer create Git commits or trigger website builds.

## Run automatically with systemd on Dandy

The development worktree is installed as a user service on
`dandycomp07fl.unicph.domain`, running as `dlm551`. The timer runs daily at
03:00 Europe/Copenhagen, with up to ten minutes of randomized delay. Missed
runs are caught up when the timer next starts. User lingering is enabled on
this host so the timer continues after logout.

The units are in `collector/systemd/`. The installed copies are under
`~/.config/systemd/user/`; `~/.config/controlfreq/collector.env` selects the
repository and output directory. It currently points to this development
worktree and its `collector/output/`. Keep that worktree in place while the
timer uses it. Data publication remains separate from transfer to a webserver.

```bash
# Check schedule and last/current refresh:
systemctl --user list-timers controlfreq-collector.timer
systemctl --user status controlfreq-collector.service

# Refresh now in the background (also used by the daily timer):
systemctl --user start --no-block controlfreq-collector.service
# Or wait for completion:
# systemctl --user start controlfreq-collector.service

# Logs are also copied here because journal access is restricted on Dandy:
tail -f collector/logs/collector.log
# Where journal access is permitted:
journalctl --user -u controlfreq-collector.service -n 100

# Stop future scheduled refreshes (a running refresh is left to finish):
systemctl --user disable --now controlfreq-collector.timer
```

The service explicitly initialises `/etc/profile.d/modules.sh`, then loads
`gcc/11.2.0`, `R/4.3.3`, and `python/3.10.18`. It needs no interactive shell
configuration. Check these dependencies without fetching production data:

```bash
bash collector/scripts/run-systemd.sh --check
```

A lock in `collector/tmpdir/collector.lock` prevents manual and scheduled runs
of this collector from overlapping. The original `main` checkout remains
independent. A refresh may run for up to 12 hours; failures are recorded in the
service status and leave the previously published JSON active. Local logs are
appended to `collector/logs/collector.log`, which is ignored by Git.

To install on another intended collector host, first adjust the absolute paths
in the environment example, then run from the repository root:

```bash
mkdir -p ~/.config/systemd/user ~/.config/controlfreq
cp collector/systemd/controlfreq-collector.{service,timer} ~/.config/systemd/user/
cp collector/systemd/collector.env.example ~/.config/controlfreq/collector.env
chmod 600 ~/.config/controlfreq/collector.env
loginctl enable-linger "$USER"
systemctl --user daemon-reload
systemctl --user enable --now controlfreq-collector.timer
systemctl --user start --no-block controlfreq-collector.service
```

Use `systemctl --user edit controlfreq-collector.timer` to change the schedule.
For example, `[Timer]` with an empty `OnCalendar=` followed by
`OnCalendar=*-*-* 06:00:00 Europe/Copenhagen` replaces the default calendar.
Run `systemctl --user daemon-reload` and
`systemctl --user restart controlfreq-collector.timer` after editing. Recopy
repository unit files and reload systemd when updating the installed units.

## Transfer to the webserver

If both machines see the same export directory, mount that directory into the
web container. Otherwise copy each completed release first, then switch
`current` on the webserver. For example, from Dandy, with the destination parent
already created and `WEB_HOST` set to your SSH destination:

```bash
release=$(basename "$(readlink collector/output/current)")
rsync -a "collector/output/releases/$release" "$WEB_HOST:/srv/controlfreq/data/releases/"
ssh "$WEB_HOST" "ln -s releases/$release /srv/controlfreq/data/.current-$release && mv -Tf /srv/controlfreq/data/.current-$release /srv/controlfreq/data/current"
```

Mount the parent directory containing both `releases/` and `current`, so the
container sees updates to the symlink. Do not copy files one by one into the
active release. Transfer is intentionally explicit; no remote upload or
production refresh runs merely by starting the web app.

See [the JSON contract](../DATA_CONTRACT.md) and [web deployment](../web/README.md).

## How controls are found


`scripts/main.sh` downloads the merged SMDB table from the internal SMDB service. `scripts/getControls.R` reads that table and identifies controls using `robot_sample_id` and `archive_sample_id`. It uses the robot ID when present, otherwise the archive ID, as `control_id`. The matching is case-insensitive:

| ID pattern | Stored `control_type` |
| --- | --- |
| `robot_sample_id` starts with `ExrNTC` | `Extraction_Negative` |
| `robot_sample_id` starts with `ExrPTC` | `Extraction_Positive` |
| `robot_sample_id` starts with `LibNTC` | `Library_Negative` |
| `robot_sample_id` starts with `LibPTC` | `Library_Positive` |
| Otherwise, `control_id` contains `SmplNTC` | `Sample_Negative` |

Rows without a match or a `library_id` are discarded. The prefix checks take priority over `SmplNTC`. For Exr/Lib IDs, the eight digits after the prefix are interpreted as `YYMMDDNN`: the first six give the control date and the last two identify the control on that day. If the ID does not yield a date, including for `SmplNTC`, the script uses `robot_sample_sampling_date`. It keeps distinct combinations of library ID, control ID, type, and date.

To locate the sequencing results, `getControls.R` passes those library IDs to `scripts/findLibrary.sh`. That helper loads Miller, selects the last filename matching each of `/datasets/caeg_production/_STATS/20*.fastq.tsv` and `20*.prod.tsv`, joins the catalogs on `library`, `date`, and `flowcell`, then selects the requested libraries. The control rows are joined to those catalog results by library ID; entries with `results_wf` equal to `ARCHIVE` are excluded. A library can have more than one matched run, so it can produce multiple result rows.

For each remaining result path, the extractor looks for `results/metadmg/aggregate/Lib_<library_id>_collapsed.stat.gz` and `results/prefilter_metadmg/aggregate/Lib_<library_id>_collapsed.stat.gz`. Existing files contribute taxonomic rows labeled `EUKARYOTE` or `PREFILTER`. Controls without a matching statistics file remain in the control TSV with no read count. `scripts/build_dashboard_data.py` then includes only negative controls with a non-missing control date, numeric read count, and a supported taxonomic rank; PREFILTER rows also need a Bacteria or Archaea lineage. If an expected control is absent, check its SMDB IDs and `library_id`, run `bash scripts/findLibrary.sh LIBRARY_ID` to inspect the catalog match, and check the expected statistics paths. If control IDs or production catalog paths change, update `getControls.R` or `findLibrary.sh` accordingly.
