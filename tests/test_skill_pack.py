from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / ".agents" / "skills"
CATALOGUE = ROOT / "docs" / "SKILLS.md"
UMBRELLA = "crypto-fund-research"
AUTHORITY = "Research, monitoring, and written analysis only. No orders, wallets, credentials, or external financial action."
FRONT_MATTER = re.compile(r"^---\nname: (\S+)\ndescription: \S.+\n---\n", re.MULTILINE)
LANE = re.compile(r"^Lane: (.+)$", re.MULTILINE)
HEADING = re.compile(r"^## (.+)$", re.MULTILINE)
CATALOGUE_ROW = re.compile(r"^\| \[`([^`]+)`\]\(\.\./\.agents/skills/([^/]+)/SKILL\.md\) \|")


def catalogued_lanes() -> list[tuple[str, str, str]]:
    """Every docs/SKILLS.md catalogue row as (lane, label, linked skill id)."""
    rows: list[tuple[str, str, str]] = []
    lane = ""
    for line in CATALOGUE.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            lane = line[3:].strip()
        elif match := CATALOGUE_ROW.match(line):
            rows.append((lane, match.group(1), match.group(2)))
    return rows


class SkillPackTests(unittest.TestCase):
    def test_named_skills_keep_the_house_shape(self) -> None:
        for skill in sorted(SKILLS.glob("*/SKILL.md")):
            if skill.parent.name == UMBRELLA:
                continue
            text = skill.read_text(encoding="utf-8")
            with self.subTest(skill=skill.parent.name):
                self.assertIsNotNone(FRONT_MATTER.search(text), "front matter")
                self.assertEqual(FRONT_MATTER.search(text).group(1), skill.parent.name, "front-matter name")
                self.assertEqual(len(LANE.findall(text)), 1, "exactly one Lane line")
                self.assertEqual(HEADING.findall(text), ["Procedure", "Do not", "Authority"], "section order")
                self.assertIn(AUTHORITY, text, "shared Authority line")

    def test_catalogue_and_skill_pack_agree(self) -> None:
        rows = catalogued_lanes()
        labels = [label for _, label, _ in rows]
        self.assertEqual(len(labels), len(set(labels)), "a skill is catalogued more than once")
        for lane, label, linked in rows:
            with self.subTest(skill=label):
                self.assertEqual(label, linked, "catalogue label and link disagree")
                self.assertIn(lane, LANE.findall((SKILLS / linked / "SKILL.md").read_text(encoding="utf-8")), "catalogued lane")
        on_disk = {path.parent.name for path in SKILLS.glob("*/SKILL.md")} - {UMBRELLA}
        self.assertEqual(set(labels), on_disk, "docs/SKILLS.md and .agents/skills disagree")


if __name__ == "__main__":
    unittest.main()
