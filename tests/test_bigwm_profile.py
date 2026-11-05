"""Perfil "bigwm" do instalador, gerado do bigcommunity no empacotamento."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

REPOSITORY = Path(__file__).resolve().parents[1]
PROFILES = REPOSITORY / "biglinux-livecd/usr/share/biglinux/calamares-profiles"
GENERATOR = REPOSITORY / "tools/make-bigwm-profile"


@pytest.fixture(scope="module")
def bigwm(tmp_path_factory: pytest.TempPathFactory) -> Path:
    root = tmp_path_factory.mktemp("profiles") / "calamares-profiles"
    shutil.copytree(PROFILES, root, symlinks=True)
    subprocess.run([str(GENERATOR), str(root)], check=True)
    return root / "bigwm"


def branding_strings(profile: Path) -> dict[str, str]:
    desc = yaml.safe_load((profile / "branding/bigwm/branding.desc").read_text(encoding="utf-8"))
    return desc["strings"]


def test_profile_has_the_layout_resolve_profile_accepts(bigwm: Path) -> None:
    # usr/lib/biglinux-livecd/resolve-profile: settings.conf, profile.json,
    # modules/ e branding/, sem links.
    for name in ("settings.conf", "profile.json"):
        assert (bigwm / name).is_file()
    for name in ("modules", "branding", "branding/bigwm"):
        assert (bigwm / name).is_dir() and not (bigwm / name).is_symlink()
    assert not (bigwm / "branding/bigcommunity").exists()


def test_profile_carries_the_big_windowmaker_name(bigwm: Path) -> None:
    profile = json.loads((bigwm / "profile.json").read_text(encoding="utf-8"))
    assert profile["id"] == "bigwm"
    assert profile["display_name"] == "Big WindowMaker"
    assert profile["branding"] == "bigwm"
    settings = yaml.safe_load((bigwm / "settings.conf").read_text(encoding="utf-8"))
    assert settings["branding"] == "bigwm"

    strings = branding_strings(bigwm)
    assert strings["productName"] == "Big WindowMaker"
    assert strings["shortProductName"] == "Big WindowMaker"
    # A pasta EFI é a primeira palavra do GRUB_DISTRIBUTOR ("Big WindowMaker"),
    # a mesma do install-grub nas atualizações.
    assert strings["bootloaderEntryName"] == "Big"
    for value in strings.values():
        assert "community" not in str(value).lower(), value


def test_component_name_matches_the_branding_directory(bigwm: Path) -> None:
    desc = yaml.safe_load((bigwm / "branding/bigwm/branding.desc").read_text(encoding="utf-8"))
    assert desc["componentName"] == "bigwm"


def test_logo_is_the_big_windowmaker_one(bigwm: Path) -> None:
    logo = (bigwm / "branding/bigwm/logo.svg").read_bytes()
    assert logo == (REPOSITORY / "tools/bigwm/logo.svg").read_bytes()
    assert logo != (PROFILES / "bigcommunity/branding/bigcommunity/logo.svg").read_bytes()


def test_no_visible_bigcommunity_text_in_the_qml(bigwm: Path) -> None:
    for qml in (bigwm / "branding/bigwm").glob("*.qml"):
        for line in qml.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("//"):
                continue
            assert '"Powered by BigCommunity"' not in line, qml.name


def test_generated_configuration_is_valid_yaml(bigwm: Path) -> None:
    files = sorted(bigwm.glob("modules/*.conf")) + [bigwm / "settings.conf"]
    for path in files:
        assert isinstance(yaml.safe_load(path.read_text(encoding="utf-8")), dict), path


def test_generator_is_repeatable(bigwm: Path) -> None:
    # O empacotamento pode rodar duas vezes no mesmo diretório.
    subprocess.run([str(GENERATOR), str(bigwm.parent)], check=True)
    assert branding_strings(bigwm)["productName"] == "Big WindowMaker"
