from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
COPY_IGNORE = shutil.ignore_patterns(".git", "node_modules", "dist", "work", "test-results", "playwright-report")


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
        self.assertEqual(receipt["release_version"], "1.1.0")
        self.assertEqual(receipt["checkout_eol"], "lf")
        self.assertEqual(receipt["core_file_count"], 13)
        self.assertEqual(receipt["presentation_asset_count"], 2)
        self.assertEqual(receipt["specialist_count"], 5)

    def test_core_mutation_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory(prefix="crypto-fund-release-test-") as temporary:
            copy = Path(temporary) / "release"
            shutil.copytree(ROOT, copy, ignore=COPY_IGNORE)
            target = copy / "AGENTS.md"
            target.write_bytes(target.read_bytes() + b"\n")
            result = run_verifier(copy)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(json.loads(result.stderr)["status"], "ERROR")

    def test_missing_core_file_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory(prefix="crypto-fund-release-test-") as temporary:
            copy = Path(temporary) / "release"
            shutil.copytree(ROOT, copy, ignore=COPY_IGNORE)
            (copy / ".codex" / "agents" / "risk-officer.toml").unlink()
            result = run_verifier(copy)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(json.loads(result.stderr)["status"], "ERROR")

    def test_unlisted_agent_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory(prefix="crypto-fund-release-test-") as temporary:
            copy = Path(temporary) / "release"
            shutil.copytree(ROOT, copy, ignore=COPY_IGNORE)
            (copy / ".codex" / "agents" / "extra.toml").write_text('name = "extra"\n', encoding="utf-8")
            result = run_verifier(copy)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(json.loads(result.stderr)["status"], "ERROR")

    def test_checkout_policy_mutation_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory(prefix="crypto-fund-release-test-") as temporary:
            copy = Path(temporary) / "release"
            shutil.copytree(ROOT, copy, ignore=COPY_IGNORE)
            (copy / ".gitattributes").write_bytes(b"* text=auto\n")
            result = run_verifier(copy)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(json.loads(result.stderr)["status"], "ERROR")

    def test_presentation_asset_mutation_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory(prefix="crypto-fund-release-test-") as temporary:
            copy = Path(temporary) / "release"
            shutil.copytree(ROOT, copy, ignore=COPY_IGNORE)
            target = copy / "assets" / "hero.svg"
            target.write_bytes(target.read_bytes() + b"\n")
            result = run_verifier(copy)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(json.loads(result.stderr)["status"], "ERROR")


    def test_generated_dependencies_are_not_repository_documents(self) -> None:
        with tempfile.TemporaryDirectory(prefix="crypto-fund-release-test-") as temporary:
            copy = Path(temporary) / "release"
            shutil.copytree(ROOT, copy, ignore=COPY_IGNORE)
            dependency = copy / "node_modules" / "example"
            dependency.mkdir(parents=True)
            (dependency / "README.md").write_text("[external package file](missing.md)\n", encoding="utf-8")
            result = run_verifier(copy)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_broken_public_document_link_still_fails(self) -> None:
        with tempfile.TemporaryDirectory(prefix="crypto-fund-release-test-") as temporary:
            copy = Path(temporary) / "release"
            shutil.copytree(ROOT, copy, ignore=COPY_IGNORE)
            (copy / "BROKEN.md").write_text("[missing document](missing.md)\n", encoding="utf-8")
            result = run_verifier(copy)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(json.loads(result.stderr)["status"], "ERROR")


if __name__ == "__main__":
    unittest.main()
