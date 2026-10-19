# Web dashboard

The browser reads JSON; the server only serves static files. No R, Python,
SMDB credentials, production mounts, or collector source enters the image.

## Local development

```bash
cd web
npm ci
npm run dev
npm run build
```

Local development and ordinary builds use the tracked JSON in `public/`.
The default app path is `/`. Set `BASE_PATH=/controlFreq/` when building for
GitHub Pages; the workflow does this automatically. `VITE_DATA_URL` optionally
sets a separate URL prefix for both the initial and rank-specific JSON requests.
Use a trailing slash, e.g. `/data/`; a different origin must permit CORS.
These are build-time settings.

To try freshly generated data locally, copy only the JSON files from
`../collector/output/current/` into `public/`, then run the app normally. Those
snapshot changes are separate from publishing data to the container.

## Container deployment

Run Compose from the repository root. Set `CONTROLFREQ_DATA_DIR` in `.env` to
an existing absolute directory containing `current` and `releases/`, then run:

```bash
docker compose up --build -d
curl --fail http://127.0.0.1:8080/healthz
curl --fail http://127.0.0.1:8080/data/dashboard-data.json -o /tmp/dashboard-data.json
```

The image builds only `web/`, excludes `public/`, and configures the browser to
load `/data/`. Nginx serves those requests from the read-only mounted
`current/` release and sends `Cache-Control: no-store`. The collector generates
all 11 files before switching the symlink; updates appear without restarting
or rebuilding the container. Reload an open dashboard after a data refresh.
Missing data files return HTTP 404. `/healthz` checks the webserver, so check
the data URL as well when validating deployment.

The default port binding is `127.0.0.1:8080`. Set `CONTROLFREQ_BIND_ADDRESS`
and `CONTROLFREQ_PORT` in `.env` for another interface or port. Configure the
host's reverse proxy to forward the site's root path to this port; the supplied
container serves the application at `/`.

GitHub Pages remains supported through `BASE_PATH=/controlFreq/` and the
tracked snapshot. Its workflow builds `web/` and publishes `web/dist/` only
from `main`. The container data route is independent of Pages.
