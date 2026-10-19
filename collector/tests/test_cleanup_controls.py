"""Ensure source retention deletes only older generated control TSVs."""

import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/cleanup_controls.py"
spec = importlib.util.spec_from_file_location("cleanup", SCRIPT)
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)


class CleanupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def create(self, name):
        path = self.root / name
        path.write_text("example data\n")
        return path

    def test_deletes_older_generated_files_and_keeps_successful_source(self):
        older = [self.create("control_20260901_120000.tsv"),
                 self.create("control_20261018_120000.tsv")]
        current = self.create("control_20261019_120000.tsv")
        newer = self.create("control_20261020_120000.tsv")
        self.assertEqual(cleanup.cleanup_controls(current), 2)
        self.assertTrue(current.exists())
        self.assertTrue(newer.exists())
        self.assertTrue(all(not path.exists() for path in older))

    def test_preserves_unrelated_files_directories_and_symlinks(self):
        current = self.create("control_20261019_120000.tsv")
        unrelated = [self.create("notes.tsv"), self.create("control_backup.tsv"),
                     self.create("control_20261018_120000.tsv.bak")]
        directory = self.root / "control_20261017_120000.tsv"
        directory.mkdir()
        link = self.root / "control_20261016_120000.tsv"
        link.symlink_to(current.name)
        self.assertEqual(cleanup.cleanup_controls(current), 0)
        self.assertTrue(all(path.exists() for path in unrelated))
        self.assertTrue(directory.is_dir())
        self.assertTrue(link.is_symlink())

    def test_missing_or_invalid_current_cannot_trigger_deletion(self):
        old = self.create("control_20260901_120000.tsv")
        for current in [self.root / "control_20261019_120000.tsv",
                        self.create("unknown.tsv")]:
            with self.assertRaises(ValueError):
                cleanup.cleanup_controls(current)
            self.assertTrue(old.exists())


    def test_refresh_cleans_only_after_successful_publication(self):
        # Exercise the real shell entry point with production fetches stubbed out.
        for exit_code in (1, 0):
            with self.subTest(publication_exit=exit_code):
                root = self.root / str(exit_code)
                scripts = root / "scripts"
                scripts.mkdir(parents=True)
                shutil.copy(SCRIPT, scripts / SCRIPT.name)
                shutil.copy(SCRIPT.with_name("main.sh"), scripts / "main.sh")
                controls = root / "controls"
                controls.mkdir()
                old = controls / "control_20260901_120000.tsv"
                old.write_text("old source")
                tools = root / "bin"
                tools.mkdir()
                stub = tools / "stub"
                stub.write_text(f"#!{sys.executable}\n" + r'''import os
import subprocess
import sys
from pathlib import Path
program = Path(sys.argv[0]).name
args = sys.argv[1:]
if program == "date":
    print("20261019_120000")
elif program == "unzip":
    (Path(args[args.index("-d") + 1]) / "source.tsv").write_text("source")
elif program == "Rscript":
    Path("controls/control_20261019_120000.tsv").write_text("new source")
elif program == "python3":
    if args[0].endswith("publish_dashboard_data.py"):
        sys.exit(int(os.environ["TEST_PUBLICATION_EXIT"]))
    sys.exit(subprocess.call([sys.executable] + args))
''')
                stub.chmod(0o755)
                for program in ("date", "curl", "unzip", "Rscript", "python3"):
                    (tools / program).symlink_to(stub)
                env = dict(os.environ, PATH=str(tools) + os.pathsep + os.environ["PATH"],
                           TEST_PUBLICATION_EXIT=str(exit_code))
                result = subprocess.run(["/bin/bash", str(scripts / "main.sh")],
                                        env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, exit_code, result.stderr)
                self.assertEqual(old.exists(), exit_code != 0)
                self.assertTrue((controls / "control_20261019_120000.tsv").exists())


if __name__ == "__main__":
    unittest.main()
