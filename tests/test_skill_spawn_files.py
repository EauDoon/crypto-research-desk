from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / ".agents" / "skills"
WORKERS = ROOT / ".agents" / "workers"
ATTACHED = re.compile(r"^### .*?\(`([^`]+)`\)\s*$(.*?)(?=^### |\Z)", re.MULTILINE | re.DOTALL)
DIRECTIVE = re.compile(r"^(?:\d+\. |- )")
LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")


def directives(skill_text: str) -> list[str]:
    """Procedure steps and fail-modes a spawn file has to reproduce."""
    procedure, _, do_not = skill_text.partition("## Do not")
    lines = [line.strip() for line in procedure.splitlines() + do_not.splitlines()]
    return [LINK.sub(r"\1", line) for line in lines if DIRECTIVE.match(line)]


class SkillSpawnFileTests(unittest.TestCase):
    def test_every_worker_attaches_at_least_one_skill(self) -> None:
        for worker in sorted(WORKERS.glob("*.md")):
            with self.subTest(worker=worker.name):
                self.assertTrue(ATTACHED.findall(worker.read_text(encoding="utf-8")), worker.name)

    def test_spawn_files_reproduce_their_skills(self) -> None:
        for worker in sorted(WORKERS.glob("*.md")):
            text = worker.read_text(encoding="utf-8")
            for skill_id, body in ATTACHED.findall(text):
                skill = SKILLS / skill_id / "SKILL.md"
                with self.subTest(worker=worker.name, skill=skill_id):
                    self.assertTrue(skill.is_file(), f"{worker.name} attaches missing skill {skill_id}")
                    block = [LINK.sub(r"\1", line.strip()) for line in body.splitlines()]
                    for line in directives(skill.read_text(encoding="utf-8")):
                        self.assertIn(line, block, f"{worker.name} does not reproduce {skill_id}: {line}")
                        block.remove(line)


if __name__ == "__main__":
    unittest.main()
