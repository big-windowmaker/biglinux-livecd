"""NeuroDefender, the arcade game shown while Big WindowMaker installs.

The game is a decoration of the "bigwindowmaker" profile's slideshow: these
tests make sure it is complete (engine and QML), packaged, and that the
installer never depends on it (inert until activated, stopped on leave, the
static slides as fallback even when the game's QML does not compile).
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

REPOSITORY = Path(__file__).resolve().parents[1]
BRANDING = (
    REPOSITORY
    / "biglinux-livecd/usr/share/biglinux/calamares-profiles/bigwindowmaker/branding/bigwindowmaker"
)
GAME = BRANDING / "neurodefender"
TESTS = REPOSITORY / "tests/neurodefender"
QT6_BIN = Path("/usr/lib/qt6/bin")


def qt6_tool(name: str) -> str | None:
    """The Qt 6 build of a tool (a plain "qml" may be Qt 5's)."""
    candidate = QT6_BIN / name
    if candidate.is_file():
        return str(candidate)
    return None


def offscreen_env() -> dict[str, str]:
    env = dict(os.environ)
    env["QT_QPA_PLATFORM"] = "offscreen"
    env["QT_FORCE_STDERR_LOGGING"] = "1"
    return env


def test_entry_point_and_files() -> None:
    desc = yaml.safe_load((BRANDING / "branding.desc").read_text(encoding="utf-8"))
    assert desc["slideshow"] == "BigWindowMakerSlides.qml"
    assert desc["slideshowAPI"] == 2
    slides = (BRANDING / "BigWindowMakerSlides.qml").read_text(encoding="utf-8")
    # the game is loaded lazily and in the background, never at start-up
    assert 'source: "neurodefender/GameRoot.qml"' in slides
    assert "asynchronous: true" in slides
    assert "active: root.activatedInCalamares" in slides
    for name in ("GameRoot.qml", "RetroButton.qml", "SoundBank.qml",
                 "config.js", "engine.js", "render.js", "strings.js"):
        assert (GAME / name).is_file(), name
    # every relative import and every sound resolves
    for path in GAME.glob("*.qml"):
        for ref in re.findall(r'^import "([^"]+)"', path.read_text(encoding="utf-8"), re.M):
            assert (GAME / ref).is_file(), (path.name, ref)
    for path in GAME.glob("*.js"):
        for ref in re.findall(r'^\.import "([^"]+)"', path.read_text(encoding="utf-8"), re.M):
            assert (GAME / ref).is_file(), (path.name, ref)
    bank = (GAME / "SoundBank.qml").read_text(encoding="utf-8")
    names = re.search(r"names: \[([^\]]+)\]", bank, re.S)
    assert names
    for name in re.findall(r'"(\w+)"', names.group(1)):
        assert (GAME / "sfx" / f"{name}.wav").is_file(), name


def test_no_network_and_no_privileges() -> None:
    # offline, unprivileged, writes nothing: no URLs, processes or file I/O
    forbidden = ("http://", "https://", "XMLHttpRequest", "Qt.openUrlExternally",
                 "LocalStorage", "Settings {", "Process", "pkexec", "sudo")
    for path in list(GAME.glob("*.qml")) + list(GAME.glob("*.js")):
        text = path.read_text(encoding="utf-8")
        for word in forbidden:
            assert word not in text, (path.name, word)


def test_sound_is_synthesised_and_up_to_date() -> None:
    result = subprocess.run(
        ["python3", str(REPOSITORY / "tools/neurodefender-sfx.py"), "--check"],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stderr
    total = sum(p.stat().st_size for p in (GAME / "sfx").glob("*.wav"))
    assert total < 200_000, total


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js not installed")
def test_engine_with_node() -> None:
    result = subprocess.run(
        ["node", "--test", str(TESTS / "engine.test.cjs")],
        capture_output=True, text=True, check=False, timeout=600,
    )
    assert result.returncode == 0, result.stdout[-4000:] + result.stderr[-2000:]


@pytest.mark.skipif(qt6_tool("qmllint") is None, reason="Qt 6 qmllint not installed")
def test_qmllint_has_no_errors() -> None:
    files = [str(BRANDING / "BigWindowMakerSlides.qml"), *map(str, sorted(GAME.glob("*.qml")))]
    result = subprocess.run(
        [qt6_tool("qmllint") or "", "-I", str(BRANDING), *files],
        capture_output=True, text=True, check=False, timeout=300,
    )
    output = result.stdout + result.stderr
    assert "Error:" not in output, output
    # only calls into a Loader's item (typed QObject until it loads) may warn:
    # naming the loaded types would make the files depend on each other
    for line in output.splitlines():
        if line.startswith("Warning:"):
            assert 'on type "QObject" [missing-property]' in line, line


@pytest.mark.skipif(qt6_tool("qmltestrunner") is None, reason="Qt 6 qmltestrunner not installed")
def test_slideshow_lifecycle_in_qml() -> None:
    result = subprocess.run(
        [qt6_tool("qmltestrunner") or "", "-input", str(TESTS / "tst_slideshow.qml")],
        capture_output=True, text=True, check=False, timeout=600, env=offscreen_env(),
    )
    output = result.stdout + result.stderr
    assert result.returncode == 0, output[-6000:]
    assert "0 failed" in output, output[-6000:]


@pytest.mark.skipif(qt6_tool("qml") is None, reason="Qt 6 qml runtime not installed")
def test_slides_survive_a_game_that_does_not_compile(tmp_path: Path) -> None:
    copy = tmp_path / "branding"
    shutil.copytree(BRANDING, copy)
    (copy / "neurodefender/GameRoot.qml").write_text("import QtQuick\nItem { this is not QML", encoding="utf-8")
    probe = tmp_path / "probe.qml"
    probe.write_text(
        "import QtQuick\n"
        "Item {\n"
        "    width: 810; height: 470\n"
        f'    Loader {{ id: l; anchors.fill: parent; source: "file://{copy}/BigWindowMakerSlides.qml"\n'
        "        onLoaded: item.onActivate() }\n"
        "    Timer { interval: 1500; running: true; onTriggered: {\n"
        '        console.log("RESULT failed=" + l.item.gameFailed + " shown=" + l.item.gameShown);\n'
        "        Qt.quit(); } }\n"
        "}\n",
        encoding="utf-8",
    )
    result = subprocess.run(
        [qt6_tool("qml") or "", str(probe)],
        capture_output=True, text=True, check=False, timeout=60, env=offscreen_env(),
    )
    output = result.stdout + result.stderr
    assert "RESULT failed=true shown=false" in output, output[-3000:]


def test_package_ships_the_game() -> None:
    # the PKGBUILD copies the whole usr/ tree: the game folder rides along
    pkgbuild = (REPOSITORY / "pkgbuild/PKGBUILD").read_text(encoding="utf-8")
    assert 'cp -a biglinux-livecd/usr "${pkgdir}/"' in pkgbuild


def _pyside_quickwidgets() -> bool:
    try:
        import PySide6.QtQuickWidgets  # noqa: F401
    except ImportError:
        return False
    return True


@pytest.mark.skipif(not _pyside_quickwidgets(), reason="PySide6 with QtQuickWidgets not installed")
def test_inside_a_qquickwidget_like_calamares() -> None:
    # Calamares hosts the slideshow in a QQuickWidget, whose internal window
    # says visible=false: the game must still run there, pause when the
    # widget is hidden (the installer's log view) and stop on leave.
    script = ("activate,wait:1500,probe:title,start,wait:3000,probe:play,hide,wait:1500,"
              "probe:hidden,show,wait:600,probe:shown,leave,wait:200,probe:left")
    result = subprocess.run(
        ["python3", str(TESTS / "calamares_host.py"), str(BRANDING), script],
        capture_output=True, text=True, check=False, timeout=90, env=offscreen_env(),
    )
    probes = {}
    for line in (result.stdout + result.stderr).splitlines():
        if line.startswith("PROBE "):
            name, *pairs = line.split()[1:]
            probes[name] = dict(pair.split("=", 1) for pair in pairs)
    assert set(probes) == {"title", "play", "hidden", "shown", "left"}, result.stdout + result.stderr
    assert probes["title"]["needsLoop"] == "True"
    assert probes["play"]["screen"] == "play" and int(probes["play"]["framesRun"]) > 100, probes["play"]
    assert probes["hidden"]["screen"] == "paused", "hiding the widget pauses the game"
    assert probes["left"]["active"] == "False" and probes["left"]["needsLoop"] == "False"
