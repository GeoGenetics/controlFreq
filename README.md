# controlFreq

ControlFreq has two independently runnable parts in one repository:

- [`collector/`](collector/README.md) runs on Dandy, reads SMDB and production
  results, and publishes dashboard JSON.
- [`web/`](web/README.md) contains the React dashboard and a web-only container.
  It reads published JSON and needs no access to production systems.

The boundary is the [JSON contract](DATA_CONTRACT.md). Data can be refreshed
without rebuilding the web image, and the web app can be developed without
running the collector.

## Development branch

This split is being developed on `container-deployment` in a separate Git
worktree. The existing `main` checkout and its GitHub Pages deployment are
unaffected until changes are merged. The Pages workflow on this branch is
restricted to `main`, including manual runs.

## Develop the dashboard

```bash
cd web
npm ci
npm run dev
npm run build
```

The tracked `web/public/dashboard-data*.json` snapshot supports local development
and GitHub Pages. The container excludes that snapshot and reads live JSON
from its mounted data directory instead. [DASHBOARD.md](DASHBOARD.md) describes
the dashboard's views and filters.

## Run the web container

After generating or transferring a JSON release:

```bash
cp .env.example .env
# Set CONTROLFREQ_DATA_DIR in .env to the absolute output path on this host.
docker compose up --build -d
```

By default, the dashboard is available at `http://127.0.0.1:8080/`, suitable for
placing behind the webserver's reverse proxy. Deployment details and direct
network binding are in [web/README.md](web/README.md).

## Collector deployment on Dandy

On this branch, the collector runs as a **systemd user service on
`dandycomp07fl.unicph.domain`**, under the `dlm551` account. The
`controlfreq-collector.timer` triggers `controlfreq-collector.service` daily
at 03:00–03:10 Europe/Copenhagen. User lingering is enabled so it can run
after logout. The service uses this worktree:
`/maps/projects/caeg/scratch/dlm551/controlFreq-container-deployment`.

Run these commands as `dlm551` on **dandycomp07fl**:

```bash
# Check the next automatic run and the last/current refresh:
systemctl --user list-timers controlfreq-collector.timer --no-pager
systemctl --user status controlfreq-collector.service --no-pager

# Start a refresh in the background:
systemctl --user start --no-block controlfreq-collector.service
```

A completed refresh normally leaves the service `inactive (dead)`; check for
`status=0/SUCCESS` and a new publication message in
`collector/logs/collector.log`. Failures do not send automatic notifications.
See the [collector operations guide](collector/README.md#run-automatically-with-systemd-on-dandy)
for logs, foreground runs, and recovery if systemd cannot find the units.

The completed release is exposed at `collector/output/current/`. Point the
container at the parent `collector/output/` directory if it is on the same
host/shared filesystem, or transfer the release as described in the
[collector guide](collector/README.md#transfer-to-the-webserver).

When changing the JSON format, update the collector and web readers together.
Run `python3 -m unittest discover -s collector/tests` and `npm ci && npm run build`
inside `web/` before merging.
