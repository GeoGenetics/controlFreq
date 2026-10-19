#!/usr/bin/env python3
"""Build a complete JSON release, then atomically switch the current symlink."""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def publish(input_path, output_dir):
    output_dir = output_dir.resolve()
    releases = output_dir / "releases"
    releases.mkdir(parents=True, exist_ok=True)
    release_name = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ-")
    release = Path(tempfile.mkdtemp(prefix=release_name, dir=releases))
    link = output_dir / f".current-{release.name}"
    try:
        subprocess.run([
            sys.executable, str(Path(__file__).with_name("build_dashboard_data.py")),
            str(input_path), "--output", str(release / "dashboard-data.json"),
        ], check=True)
        payload = json.loads((release / "dashboard-data.json").read_text())
        for files in payload["rankFiles"].values():
            for filename in files.values():
                if Path(filename).name != filename:
                    raise ValueError(f"Invalid rank filename: {filename}")
                json.loads((release / filename).read_text())
        # mkdtemp defaults to 0700; the web server must be able to traverse it.
        release.chmod(0o755)
        for path in release.iterdir():
            path.chmod(0o644)
        link.symlink_to(Path("releases") / release.name, target_is_directory=True)
        os.replace(link, output_dir / "current")
    except BaseException:
        link.unlink(missing_ok=True)
        shutil.rmtree(release)
        raise
    print(f"Published dashboard data: {output_dir / 'current'} -> releases/{release.name}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Existing control TSV")
    parser.add_argument("--output-dir", type=Path,
                        default=Path(__file__).resolve().parents[1] / "output")
    args = parser.parse_args()
    publish(args.input.resolve(), args.output_dir)


if __name__ == "__main__":
    main()
