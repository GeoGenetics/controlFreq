#!/usr/bin/env python3
"""Remove older generated control TSVs after a successful publication."""

import argparse
import re
from pathlib import Path

CONTROL_NAME = re.compile(r"control_[0-9]{8}_[0-9]{6}\.tsv\Z")


def cleanup_controls(current):
    current = Path(current).absolute()
    if not CONTROL_NAME.fullmatch(current.name):
        raise ValueError(f"Unexpected control TSV name: {current.name}")
    if current.is_symlink() or not current.is_file():
        raise ValueError(f"Current control TSV must be an existing regular file: {current}")

    removed = 0
    freed = 0
    for candidate in sorted(current.parent.iterdir()):
        if (CONTROL_NAME.fullmatch(candidate.name)
                and candidate.name < current.name
                and not candidate.is_symlink()
                and candidate.is_file()):
            size = candidate.stat().st_size
            candidate.unlink()
            removed += 1
            freed += size
    print(f"Removed {removed} older control TSVs ({freed / 1024**3:.2f} GiB); kept {current.name}")
    return removed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("current", type=Path, help="Control TSV whose JSON was successfully published")
    args = parser.parse_args()
    cleanup_controls(args.current)


if __name__ == "__main__":
    main()
