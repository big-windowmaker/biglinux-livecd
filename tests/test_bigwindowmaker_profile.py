"""Perfil "bigwindowmaker" do instalador: a identidade do Big WindowMaker.

Um perfil de verdade (não uma cópia feita no empacotamento): nome, endereços,
logomarca, ilustração de boas-vindas, apresentação e cores próprias. O
bigcommunity fica intacto.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

REPOSITORY = Path(__file__).resolve().parents[1]
PROFILES = REPOSITORY / "biglinux-livecd/usr/share/biglinux/calamares-profiles"
PROFILE = PROFILES / "bigwindowmaker"
BRANDING = PROFILE / "branding/bigwindowmaker"
COMMUNITY = PROFILES / "bigcommunity/branding/bigcommunity"


def branding() -> dict:
    return yaml.safe_load((BRANDING / "branding.desc").read_text(encoding="utf-8"))


def test_layout_resolve_profile_accepts() -> None:
    # usr/lib/biglinux-livecd/resolve-profile: settings.conf, profile.json,
    # modules/ e branding/, sem links.
    for name in ("settings.conf", "profile.json"):
        assert (PROFILE / name).is_file() and not (PROFILE / name).is_symlink()
    for name in ("modules", "branding", "branding/bigwindowmaker"):
        assert (PROFILE / name).is_dir() and not (PROFILE / name).is_symlink()
    assert not (PROFILE / "branding/bigcommunity").exists()


def test_names() -> None:
    profile = json.loads((PROFILE / "profile.json").read_text(encoding="utf-8"))
    assert profile["id"] == "bigwindowmaker"
    assert profile["display_name"] == "Big WindowMaker"
    assert profile["branding"] == "bigwindowmaker"
    assert (PROFILE / profile["wizard_logo"]).is_file()
    settings = yaml.safe_load((PROFILE / "settings.conf").read_text(encoding="utf-8"))
    assert settings["branding"] == "bigwindowmaker"
    desc = branding()
    assert desc["componentName"] == "bigwindowmaker"
    strings = desc["strings"]
    assert strings["productName"] == "Big WindowMaker"
    assert strings["shortProductName"] == "Big WindowMaker"
    # A pasta EFI é a primeira palavra do GRUB_DISTRIBUTOR ("Big WindowMaker"),
    # a mesma do install-grub nas atualizações.
    assert strings["bootloaderEntryName"] == "Big"
    for value in strings.values():
        assert "community" not in str(value).lower(), value
        assert "forum.biglinux" not in str(value), value


def test_artwork_is_big_windowmaker() -> None:
    # Os três desenhos pedidos são do Big WindowMaker, não os do BigCommunity.
    for name in ("logo.svg", "welcome-illustration.svg", "big-welcome.svg"):
        ours = (BRANDING / name).read_bytes()
        assert ours != (COMMUNITY / name).read_bytes(), name
        assert b"<svg" in ours and b"viewBox" in ours, name
    # A logomarca é a oficial, sem alteração do desenho (os vetores dela estão
    # nos três arquivos).
    logo = (BRANDING / "logo.svg").read_text(encoding="utf-8")
    paths = re.findall(r'\sd="([^"]+)"', logo)
    assert len(paths) == 2
    for name in ("welcome-illustration.svg", "big-welcome.svg"):
        text = (BRANDING / name).read_text(encoding="utf-8")
        for path in paths:
            assert path in text, name
    desc = branding()
    assert desc["images"]["productLogo"] == "logo.svg"
    assert desc["images"]["productWelcome"] == "welcome-illustration.svg"


def test_classic_slideshow_and_colors() -> None:
    desc = branding()
    assert desc["slideshow"] == "BigWindowMakerSlides.qml"
    assert (BRANDING / desc["slideshow"]).is_file()
    # Sem os jogos do BigCommunity.
    assert not (BRANDING / "BigPulse.qml").exists()
    assert not (BRANDING / "BigBlocks.qml").exists()
    style = desc["style"]
    assert style["SidebarBackground"].upper() == "#AEAAAE"


def test_no_bigcommunity_text_left() -> None:
    for path in BRANDING.rglob("*"):
        if path.suffix not in {".qml", ".qss", ".desc", ".js"}:
            continue
        text = path.read_text(encoding="utf-8")
        assert "BigCommunity" not in text, path
        assert "communitybig" not in text, path


def test_bigcommunity_profile_untouched() -> None:
    profile = json.loads((PROFILES / "bigcommunity/profile.json").read_text(encoding="utf-8"))
    assert profile["id"] == "bigcommunity"
    assert yaml.safe_load((COMMUNITY / "branding.desc").read_text(encoding="utf-8"))[
        "strings"]["productName"] == "BigCommunity"


def test_configuration_is_valid_yaml() -> None:
    files = sorted(PROFILE.glob("modules/*.conf")) + [PROFILE / "settings.conf"]
    for path in files:
        assert isinstance(yaml.safe_load(path.read_text(encoding="utf-8")), dict), path
