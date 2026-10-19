"""Verify the collector/web boundary and safe replacement of active data."""

import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/publish_dashboard_data.py"
spec = importlib.util.spec_from_file_location("publisher", SCRIPT)
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)
RANKS = ("phylum", "class", "order", "family", "genus", "species")


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.output = self.root / "export with spaces"
        self.tsv = self.root / "control.tsv"
        fields = ["control_type", "control_date", "pipeline", "taxa_path",
                  "nreads", "rank", "library_id", "name", "A", "control_id"]
        with self.tsv.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields, delimiter="\t")
            writer.writeheader()
            for rank in RANKS:
                for library, reads in enumerate((10, 10, 10, 1000)):
                    writer.writerow({
                        "control_type": "Extraction_Negative",
                        "control_date": "2026-09-01", "pipeline": "PREFILTER",
                        "taxa_path": "2:Bacteria:superkingdom;123:Bacillus:genus",
                        "nreads": reads, "rank": rank, "library_id": f"L{library}",
                        "name": f"Test {rank}", "A": "0.2", "control_id": "ExrNTC26090101",
                    })

    def test_complete_readable_release_with_relative_rank_files(self):
        publisher.publish(self.tsv, self.output)
        current = self.output / "current"
        self.assertTrue(current.is_symlink())
        self.assertFalse(current.readlink().is_absolute())
        self.assertEqual(len(list(current.glob("*.json"))), 11)
        self.assertEqual(current.resolve().stat().st_mode & 0o777, 0o755)
        data = json.loads((current / "dashboard-data.json").read_text())
        self.assertEqual(data["ranks"], list(RANKS))
        self.assertEqual(len(data["libraryMetadata"]), 4)
        self.assertEqual(len(data["libraryWarnings"]), 6)
        self.assertEqual(data["taxonRecords"][0]["rank"], "genus")
        self.assertEqual(len(data["libraryTaxonRecords"]), 4)
        for rank, files in data["rankFiles"].items():
            for filename in files.values():
                rows = json.loads((current / filename).read_text())
                self.assertTrue(rows)
                self.assertTrue(all(row["rank"] == rank for row in rows))
                self.assertEqual((current / filename).stat().st_mode & 0o777, 0o644)

    def test_refresh_retains_previous_release(self):
        publisher.publish(self.tsv, self.output)
        previous = (self.output / "current").resolve()
        previous_data = (previous / "dashboard-data.json").read_bytes()
        publisher.publish(self.tsv, self.output)
        self.assertNotEqual(previous, (self.output / "current").resolve())
        self.assertEqual(previous_data, (previous / "dashboard-data.json").read_bytes())
        self.assertEqual(len(list((self.output / "releases").iterdir())), 2)

    def test_failed_build_keeps_current_and_removes_partial_release(self):
        publisher.publish(self.tsv, self.output)
        previous = (self.output / "current").readlink()
        with self.assertRaises(publisher.subprocess.CalledProcessError):
            publisher.publish(self.root / "missing.tsv", self.output)
        self.assertEqual((self.output / "current").readlink(), previous)
        self.assertEqual(len(list((self.output / "releases").iterdir())), 1)
        self.assertFalse(list(self.output.glob(".current-*")))


if __name__ == "__main__":
    unittest.main()
