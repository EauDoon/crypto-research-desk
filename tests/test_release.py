from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


def run_verifier(root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-B", str(root / "tools" / "verify_release.py")],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )


class ReleaseVerificationTests(unittest.TestCase):
    def test_release_verifies(self) -> None:
        result = run_verifier(ROOT)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "")
        receipt = json.loads(result.stdout)
        self.assertEqual(receipt["status"], "VERIFIED")
        self.assertEqual(receipt["release_version"], "1.0.0")
        self.assertEqual(receipt["core_file_count"], 13)
        self.assertEqual(receipt["specialist_count"], 5)

    def test_core_mutation_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory(prefix="crypto-fund-release-test-") as temporary:
            copy = Path(temporary) / "release"
            shutil.copytree(ROOT, copy)
            target = copy / "AGENTS.md"
            target.write_bytes(target.read_bytes() + b"\n")
            result = run_verifier(copy)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(json.loads(result.stderr)["status"], "ERROR")

    def test_missing_core_file_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory(prefix="crypto-fund-release-test-") as temporary:
            copy = Path(temporary) / "release"
            shutil.copytree(ROOT, copy)
            (copy / ".codex" / "agents" / "risk-officer.toml").unlink()
            result = run_verifier(copy)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(json.loads(result.stderr)["status"], "ERROR")

    def test_unlisted_agent_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory(prefix="crypto-fund-release-test-") as temporary:
            copy = Path(temporary) / "release"
            shutil.copytree(ROOT, copy)
            (copy / ".codex" / "agents" / "extra.toml").write_text('name = "extra"\n', encoding="utf-8")
            result = run_verifier(copy)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(json.loads(result.stderr)["status"], "ERROR")


if __name__ == "__main__":
    unittest.main()
