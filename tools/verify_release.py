#!/usr/bin/env python3
"""Verify the exact released research core and its local Codex configuration."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import tomllib
from typing import Any


sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
VERSION_PATH = ROOT / "VERSION"
SKILL_ROOT = ".agents/skills/" + "crypto-fund-research"
CONTROL: dict[str, tuple[int, str]] = {
    SKILL_ROOT + "/SKILL.md": (6439, "ddbe9cc27ae4ede5485fbf029f131b3b5888b98f85945dd44d74c505a63a9de8"),
    SKILL_ROOT + "/agents/openai.yaml": (266, "04e6499f529d09d369fa2afbbae6d9a2c11c2367f01f770be44a3c4a95da687c"),
    SKILL_ROOT + "/references/mandate.md": (1415, "19ca6692eab45896e8773d7df418fd30eba3659ad72d16e6fb83bb2debaa19c4"),
    SKILL_ROOT + "/references/operating-charter.md": (4734, "f2f6782a33a9ef049edc4c5e899a1aacc121ee8d73a1605a26c39b373de67fb0"),
    SKILL_ROOT + "/references/output-contracts.md": (5996, "cc43de24e03577bf93457796805278a11fb83a332718934b9a7be030bb31b1cb"),
    SKILL_ROOT + "/references/research-standard.md": (7341, "83f9fc9fa069acdd7a885b8e00d6507be8fa561016098fc88be46a9c1ce1f919"),
    ".codex/agents/fundamental-onchain.toml": (2003, "6b888ab4e46b6adbffcb15a4542e5997634be4adb5a32f08ad4c3fb79477bb39"),
    ".codex/agents/market-regime.toml": (2394, "c62c7f7a46e98f3e6fc1d938e867999656c99fbc2fc5fd2fb84f3136bb26cc31"),
    ".codex/agents/opportunity-scout.toml": (2144, "831697e06407ac9b2c5c0dc34b021db4108a4659092dd41722c90285c1122b24"),
    ".codex/agents/quant-portfolio.toml": (2568, "2a7df5238445c149dca7d206ba9b5bdb6a6042c7ff389f11c33e06948928859b"),
    ".codex/agents/risk-officer.toml": (2387, "2df09d3bc1cfbf012935b429722c2497779f3eff00bd3db585029ea9df77dd48"),
    ".codex/config.toml": (63, "af00171d0ae3470aa41fb82e4165d91e5871e912d635e7545f9dc8f4a7752fc9"),
    "AGENTS.md": (6063, "6efd5eec6fc84fbbe1574007a47fee1bbc0fc8f21038584e863f36a2ebdf6b44"),
}
PRESENTATION_ASSETS: dict[str, tuple[int, str]] = {
    "assets/hero.svg": (2078, "be121975269013b658165310d52b8ad083ccbfc2aa658dd93631bdd20200ce8d"),
    "assets/research-flow.svg": (4119, "d59292042e530ba5efd2cd1138ee279b141114980e78fd5f376a72c2526ed14d"),
}
FIXED_ORDER = [
    SKILL_ROOT + "/agents/openai.yaml",
    SKILL_ROOT + "/references/mandate.md",
    SKILL_ROOT + "/references/operating-charter.md",
    SKILL_ROOT + "/references/output-contracts.md",
    SKILL_ROOT + "/references/research-standard.md",
    SKILL_ROOT + "/SKILL.md",
    ".codex/agents/fundamental-onchain.toml",
    ".codex/agents/market-regime.toml",
    ".codex/agents/opportunity-scout.toml",
    ".codex/agents/quant-portfolio.toml",
    ".codex/agents/risk-officer.toml",
    ".codex/config.toml",
    "AGENTS.md",
]
FIXED_TREE_SHA256 = "4a93ecc920f464ed33e890ae290ec525041207600613df2ea00cec878f879c22"
ORDINAL_TREE_SHA256 = "87e6c095025492cdf0cee71386c27729d45d90f6ebf3b11d13745af8e7ea10c7"
EXPECTED_AGENTS = {
    "fundamental-onchain.toml": "fundamental_onchain",
    "market-regime.toml": "market_regime",
    "opportunity-scout.toml": "opportunity_scout",
    "quant-portfolio.toml": "quant_portfolio",
    "risk-officer.toml": "risk_officer",
}
MARKDOWN_LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


class VerificationError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationError(message)


def safe_target(relative: str) -> Path:
    require("\\" not in relative and "\x00" not in relative, f"unsafe path: {relative!r}")
    pure = PurePosixPath(relative)
    require(not pure.is_absolute() and pure.parts and all(part not in ("", ".", "..") for part in pure.parts), f"unsafe path: {relative!r}")
    target = ROOT.joinpath(*pure.parts)
    resolved = target.resolve(strict=True)
    require(resolved == ROOT or ROOT in resolved.parents, f"path escapes release root: {relative}")
    descriptor = os.lstat(target)
    require(stat.S_ISREG(descriptor.st_mode), f"core path is not a regular file: {relative}")
    require(not target.is_symlink(), f"core path is a symbolic link: {relative}")
    attributes = getattr(descriptor, "st_file_attributes", 0)
    reparse = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    require(not reparse or not attributes & reparse, f"core path is a reparse point: {relative}")
    return target


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def tree_hash(order: list[str], hashes: dict[str, str]) -> str:
    payload = "".join(f"{hashes[path]}  {path}\n" for path in order).encode("utf-8")
    return digest(payload)


def verify_core() -> dict[str, str]:
    require(len(CONTROL) == 13, "core file count mismatch")
    hashes: dict[str, str] = {}
    for relative in sorted(CONTROL):
        expected_bytes, expected_hash = CONTROL[relative]
        target = safe_target(relative)
        data = target.read_bytes()
        require(len(data) == expected_bytes, f"byte count mismatch: {relative}")
        actual_hash = digest(data)
        require(actual_hash == expected_hash, f"hash mismatch: {relative}")
        hashes[relative] = actual_hash

    require(set(FIXED_ORDER) == set(hashes) and len(FIXED_ORDER) == len(hashes), "fixed order coverage mismatch")
    require(tree_hash(FIXED_ORDER, hashes) == FIXED_TREE_SHA256, "fixed tree mismatch")
    require(tree_hash(sorted(hashes), hashes) == ORDINAL_TREE_SHA256, "ordinal tree mismatch")
    return hashes


def verify_presentation_assets() -> dict[str, str]:
    hashes: dict[str, str] = {}
    for relative in sorted(PRESENTATION_ASSETS):
        expected_bytes, expected_hash = PRESENTATION_ASSETS[relative]
        data = safe_target(relative).read_bytes()
        require(len(data) == expected_bytes, f"presentation asset byte count mismatch: {relative}")
        actual_hash = digest(data)
        require(actual_hash == expected_hash, f"presentation asset hash mismatch: {relative}")
        hashes[relative] = actual_hash
    return hashes


def verify_configuration() -> None:
    config = tomllib.loads((ROOT / ".codex" / "config.toml").read_text(encoding="utf-8"))
    require(config == {"agents": {"enabled": True, "max_concurrent_threads_per_session": 3}}, "project agent config mismatch")

    agent_dir = ROOT / ".codex" / "agents"
    actual_files = {path.name for path in agent_dir.iterdir() if path.is_file()}
    require(actual_files == set(EXPECTED_AGENTS), "specialist agent file set mismatch")
    for filename, expected_name in EXPECTED_AGENTS.items():
        document = tomllib.loads((agent_dir / filename).read_text(encoding="utf-8"))
        require(document.get("name") == expected_name, f"agent name mismatch: {filename}")
        require(document.get("sandbox_mode") == "read-only", f"agent is not read-only: {filename}")
        require(document.get("model_reasoning_effort") in {"medium", "high", "xhigh", "max"}, f"agent effort missing: {filename}")
        require(isinstance(document.get("developer_instructions"), str) and document["developer_instructions"].strip(), f"agent instructions missing: {filename}")


def verify_markdown_links() -> int:
    checked = 0
    for path in ROOT.rglob("*.md"):
        if ".git" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        for match in MARKDOWN_LINK.finditer(text):
            target = match.group(1).split("#", 1)[0]
            if not target or "://" in target or target.startswith("mailto:"):
                continue
            resolved = (path.parent / target).resolve()
            require(resolved == ROOT or ROOT in resolved.parents, f"Markdown link escapes release root: {path.relative_to(ROOT)}")
            require(resolved.exists(), f"broken Markdown link: {path.relative_to(ROOT)} -> {target}")
            checked += 1
    return checked


def verify() -> dict[str, Any]:
    require((ROOT / ".gitattributes").read_bytes() == b"* text=auto eol=lf\n", ".gitattributes bytes mismatch")
    require(VERSION_PATH.read_bytes() == b"1.1.0\n", "VERSION bytes mismatch")
    hashes = verify_core()
    presentation_assets = verify_presentation_assets()
    verify_configuration()
    links = verify_markdown_links()
    return {
        "core_file_count": len(hashes),
        "links_checked": links,
        "ordinal_tree_sha256": ORDINAL_TREE_SHA256,
        "presentation_asset_count": len(presentation_assets),
        "checkout_eol": "lf",
        "release_version": "1.1.0",
        "specialist_count": len(EXPECTED_AGENTS),
        "status": "VERIFIED",
    }


def main() -> int:
    try:
        print(json.dumps(verify(), sort_keys=True))
    except (FileNotFoundError, OSError, UnicodeError, VerificationError, tomllib.TOMLDecodeError) as error:
        print(json.dumps({"error": str(error), "status": "ERROR"}, sort_keys=True), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
