"""The installer windows follow the Big WindowMaker look, and only that."""

from __future__ import annotations

import os
import stat
import subprocess
import tempfile
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parents[1]
PACKAGE = REPOSITORY / "biglinux-livecd"
WRAPPER = PACKAGE / "usr/bin/calamares-biglinux_polkit"
LAUNCHER = PACKAGE / "usr/bin/calamares-biglinux"
LOOK = PACKAGE / "usr/lib/biglinux-livecd/window-maker-look"


def make_stub(directory: Path, name: str, content: str) -> None:
    path = directory / name
    path.write_text(f"#!/usr/bin/env bash\nset -eu\n{content}\n", encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def run_wrapper(session: dict[str, str], kvantum: str | None) -> list[str]:
    """Runs the polkit wrapper with a fake sudo; returns the env -i words."""
    # Stubs must be executable, and /tmp may be mounted noexec.
    with tempfile.TemporaryDirectory(prefix=".test-look-", dir=REPOSITORY) as directory:
        test_directory = Path(directory)
        stubs = test_directory / "stubs"
        stubs.mkdir()
        home = test_directory / "home"
        if kvantum is not None:
            (home / ".config/Kvantum").mkdir(parents=True)
            (home / ".config/Kvantum/kvantum.kvconfig").write_text(
                kvantum, encoding="utf-8"
            )
        log = test_directory / "sudo-arguments"
        make_stub(stubs, "id", "printf '1000\\n'")
        make_stub(stubs, "gsettings", "printf \"'default'\\n\"")
        make_stub(stubs, "dbus-send", "exit 1")
        make_stub(stubs, "sudo", 'printf "%s\\n" "$@" >"$TEST_LOG"')
        environment = {
            "PATH": f"{stubs}:/usr/bin:/bin",
            "USER": "liveuser",
            "HOME": str(home),
            "DISPLAY": ":0",
            "TEST_LOG": str(log),
        }
        environment.update(session)
        result = subprocess.run(
            [str(WRAPPER)],
            check=False,
            capture_output=True,
            text=True,
            env=environment,
        )
        assert result.returncode == 0, result.stderr
        return log.read_text(encoding="utf-8").splitlines()


BIG_WM_SESSION = {
    "XDG_CURRENT_DESKTOP": "WindowMaker",
    "DESKTOP_SESSION": "big-wm",
    "GTK_THEME": "OneStepBack",
    "LD_PRELOAD": "/usr/lib/libgtk-nocsd.so.0",
}


def test_big_windowmaker_session_passes_only_theme_names() -> None:
    arguments = run_wrapper(BIG_WM_SESSION, "[General]\ntheme=QTStepOpenStep\n")
    assert "BIGLINUX_BIG_WM=1" in arguments
    assert "BIGLINUX_GTK_THEME=OneStepBack" in arguments
    assert "BIGLINUX_GTK_NOCSD=1" in arguments
    assert "BIGLINUX_KVANTUM_THEME=QTStepOpenStep" in arguments
    # The preload itself never crosses: root builds it from a fixed path.
    assert not any(word.startswith("LD_PRELOAD") for word in arguments)
    assert not any(word.startswith("GTK_THEME") for word in arguments)
    assert arguments[-1] == "/usr/bin/calamares-biglinux"


def test_wayland_session_and_dark_variant() -> None:
    arguments = run_wrapper(
        {
            "XDG_CURRENT_DESKTOP": "wlmaker",
            "GTK_THEME": "OneStepBack:dark",
            "LD_PRELOAD": "/usr/lib/other.so:/usr/lib/libgtk-nocsd.so.0",
        },
        "[Applications]\ntheme=Other\n[General]\n  theme = QTStepDark\n",
    )
    assert "BIGLINUX_BIG_WM=1" in arguments
    assert "BIGLINUX_GTK_THEME=OneStepBack:dark" in arguments
    assert "BIGLINUX_GTK_NOCSD=1" in arguments
    assert "BIGLINUX_KVANTUM_THEME=QTStepDark" in arguments
    assert not any("other.so" in word for word in arguments)


def test_unsafe_names_are_dropped() -> None:
    session = dict(BIG_WM_SESSION)
    session["GTK_THEME"] = "../../../tmp/evil"
    session["LD_PRELOAD"] = "/tmp/libgtk-nocsd.so.0"
    arguments = run_wrapper(session, "[General]\ntheme=../x; rm -rf /\n")
    assert "BIGLINUX_BIG_WM=1" in arguments
    assert not any(word.startswith("BIGLINUX_GTK_THEME") for word in arguments)
    assert "BIGLINUX_GTK_NOCSD=1" not in arguments
    assert not any(word.startswith("BIGLINUX_KVANTUM_THEME") for word in arguments)


def test_other_desktops_are_left_alone() -> None:
    for desktop in ("KDE", "GNOME", "XFCE", "X-Cinnamon"):
        arguments = run_wrapper(
            {
                "XDG_CURRENT_DESKTOP": desktop,
                "GTK_THEME": "OneStepBack",
                "LD_PRELOAD": "/usr/lib/libgtk-nocsd.so.0",
            },
            "[General]\ntheme=QTStepOpenStep\n",
        )
        assert not any(word.startswith("BIGLINUX_BIG_WM") for word in arguments)
        assert not any(word.startswith("BIGLINUX_GTK") for word in arguments)
        assert not any(word.startswith("BIGLINUX_KVANTUM") for word in arguments)


def run_look(tmp_path: Path, environment: dict[str, str], body: str) -> str:
    """Sources window-maker-look against fake theme directories."""
    themes = tmp_path / "themes"
    (themes / "OneStepBack/gtk-4.0").mkdir(parents=True, exist_ok=True)
    (themes / "Gtk3Only/gtk-3.0").mkdir(parents=True, exist_ok=True)
    kvantum = tmp_path / "Kvantum"
    for name in ("QTStepOpenStep", "QTStepDark", "BigAdwaitaRoundGtk"):
        (kvantum / name).mkdir(parents=True, exist_ok=True)
        (kvantum / name / f"{name}.kvconfig").write_text("", encoding="utf-8")
    library = tmp_path / "libgtk-nocsd.so.0"
    library.write_bytes(b"")
    library.chmod(0o755)
    script = f"""
set -u
source {LOOK}
big_wm_themes_directory={themes}
big_wm_kvantum_directory={kvantum}
big_wm_nocsd_library={library}
big_wm_library_owner={os.getuid()}
{body}
"""
    result = subprocess.run(
        ["bash", "-c", script],
        check=False,
        capture_output=True,
        text=True,
        env={"PATH": "/usr/bin:/bin", **environment},
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


PRINT_ALL = """
big_wm_set_gtk_environment
printf 'gtk:%s\\n' "${big_wm_gtk_environment[@]}"
printf 'kvantum:%s\\n' "$(big_wm_kvantum_theme)"
"""


def test_root_side_uses_only_installed_names(tmp_path: Path) -> None:
    output = run_look(
        tmp_path,
        {
            "BIGLINUX_BIG_WM": "1",
            "BIGLINUX_GTK_THEME": "OneStepBack",
            "BIGLINUX_GTK_NOCSD": "1",
            "BIGLINUX_KVANTUM_THEME": "QTStepDark",
        },
        PRINT_ALL,
    )
    assert "gtk:BIGLINUX_WINDOW_MAKER=1\n" in output
    assert "gtk:GTK_THEME=OneStepBack\n" in output
    assert f"gtk:LD_PRELOAD={tmp_path}/libgtk-nocsd.so.0\n" in output
    assert "kvantum:QTStepDark\n" in output


def test_root_side_falls_back_and_refuses(tmp_path: Path) -> None:
    # A theme without GTK 4, an unknown Kvantum theme: QTStep default.
    output = run_look(
        tmp_path,
        {
            "BIGLINUX_BIG_WM": "1",
            "BIGLINUX_GTK_THEME": "Gtk3Only",
            "BIGLINUX_KVANTUM_THEME": "Missing",
        },
        PRINT_ALL,
    )
    assert "GTK_THEME" not in output
    assert "LD_PRELOAD" not in output
    assert "kvantum:QTStepOpenStep\n" in output
    # BigLinux's own Kvantum theme is what the other desktops write there.
    output = run_look(
        tmp_path,
        {"BIGLINUX_BIG_WM": "1", "BIGLINUX_KVANTUM_THEME": "BigAdwaitaRoundGtk"},
        PRINT_ALL,
    )
    assert "kvantum:QTStepOpenStep\n" in output
    # Not a Big WindowMaker session: nothing at all.
    output = run_look(
        tmp_path,
        {
            "BIGLINUX_GTK_THEME": "OneStepBack",
            "BIGLINUX_GTK_NOCSD": "1",
            "BIGLINUX_KVANTUM_THEME": "QTStepDark",
        },
        PRINT_ALL,
    )
    assert output == "gtk:\nkvantum:\n"


def test_root_side_refuses_a_writable_or_linked_preload(tmp_path: Path) -> None:
    environment = {"BIGLINUX_BIG_WM": "1", "BIGLINUX_GTK_NOCSD": "1"}
    body = 'chmod 0777 "$big_wm_nocsd_library"\n' + PRINT_ALL
    assert "LD_PRELOAD" not in run_look(tmp_path, environment, body)
    body = (
        'ln -sf "$big_wm_nocsd_library" "$big_wm_nocsd_library.link"\n'
        "big_wm_nocsd_library=$big_wm_nocsd_library.link\n" + PRINT_ALL
    )
    assert "LD_PRELOAD" not in run_look(tmp_path, environment, body)
    body = "big_wm_library_owner=0\n" + PRINT_ALL
    if os.getuid() != 0:
        assert "LD_PRELOAD" not in run_look(tmp_path, environment, body)


def test_launcher_applies_the_look_to_every_gtk_window() -> None:
    launcher = LAUNCHER.read_text(encoding="utf-8")
    assert "source /usr/lib/biglinux-livecd/window-maker-look" in launcher
    assert (
        'gtk_dialog=(/usr/bin/env "${big_wm_gtk_environment[@]}" /usr/bin/python3'
        in launcher
    )
    assert (
        '/usr/bin/env "${big_wm_gtk_environment[@]}" python3 '
        "/usr/share/biglinux/calamares/main.py" in launcher
    )
    # The values come from the helper, never straight from the environment.
    assert "$BIGLINUX_GTK_THEME" not in launcher
    assert "${BIGLINUX_KVANTUM_THEME" not in launcher
    assert "big_wm_kvantum=$(big_wm_kvantum_theme)" in launcher


def test_installer_windows_are_opaque_in_window_maker() -> None:
    calamares = PACKAGE / "usr/share/biglinux/calamares"
    main = (calamares / "main.py").read_text(encoding="utf-8")
    dialog = (calamares / "gtk_dialog.py").read_text(encoding="utf-8")
    for source in (main, dialog):
        assert 'os.environ.get("BIGLINUX_WINDOW_MAKER") == "1"' in source
    # The translucent background is only added outside Window Maker.
    translucent = dialog.index("alpha(@theme_bg_color, 0.97)")
    assert dialog.rindex("BIGLINUX_WINDOW_MAKER", 0, translucent) > 0
    body = main[main.index("def load_custom_css") :]
    assert body.index("BIGLINUX_WINDOW_MAKER") < body.index("alpha(@theme_bg_color")


def _kdeglobals(tmp_path: Path, colors: str) -> dict[str, dict[str, str]]:
    kvantum = tmp_path / "Kvantum"
    (kvantum / "QTStepTest").mkdir(parents=True, exist_ok=True)
    (kvantum / "QTStepTest/QTStepTest.kvconfig").write_text(
        f"[%General]\nfoo=1\n\n[GeneralColors]\n{colors}\n[Hacks]\nx=1\n", encoding="utf-8"
    )
    output = run_look(tmp_path, {}, "big_wm_kdeglobals QTStepTest\n")
    groups: dict[str, dict[str, str]] = {}
    current = ""
    for line in output.splitlines():
        if line.startswith("["):
            current = line.strip("[]")
            groups[current] = {}
        elif "=" in line:
            key, value = line.split("=", 1)
            groups[current][key] = value
    return groups


def _contrast(a: str, b: str) -> float:
    def luminance(rgb: str) -> float:
        channels = []
        for value in rgb.split(","):
            c = int(value) / 255
            channels.append(c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4)
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]

    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


DARK_COLORS = """window.color=#3c3c3c
base.color=#2e2e2e
button.color=#464646
light.color=#6a6a6a
highlight.color=#a8a8a8
text.color=#e6e6e6
window.text.color=#e0e0e0
button.text.color=#e6e6e6
disabled.text.color=#e0e0e080
highlight.text.color=#000000
"""

LIGHT_COLORS = """window.color=#aaaaaa
base.color=#aaaaaa
button.color=#aaaaaa
light.color=#ffffff
highlight.color=#ffffff
text.color=#000000
window.text.color=#000000
button.text.color=#000000
highlight.text.color=#000000
"""


def test_kdeglobals_follow_the_kvantum_theme(tmp_path: Path) -> None:
    # Calamares (KDE platform theme, org.kde.desktop) takes every color from
    # kdeglobals: without one it used Breeze's light scheme, dark text on the
    # dark QTStep surfaces.
    for colors, dark in ((DARK_COLORS, True), (LIGHT_COLORS, False)):
        groups = _kdeglobals(tmp_path, colors)
        assert groups["General"]["ColorScheme"] == "QTStepTest"
        view, window = groups["Colors:View"], groups["Colors:Window"]
        assert view["BackgroundNormal"] == ("46,46,46" if dark else "170,170,170")
        assert view["ForegroundNormal"] == ("230,230,230" if dark else "0,0,0")
        assert groups["Colors:Selection"]["ForegroundNormal"] == "0,0,0"
        for group in ("Colors:Window", "Colors:View", "Colors:Button", "Colors:Selection"):
            values = groups[group]
            assert _contrast(values["ForegroundNormal"], values["BackgroundNormal"]) >= 4.5, group
        # secondary text and the error/warning/success/link colors stay AA
        for key in ("ForegroundInactive", "ForegroundNegative", "ForegroundNeutral",
                    "ForegroundPositive", "ForegroundLink"):
            assert _contrast(window[key], window["BackgroundNormal"]) >= 4.5, (dark, key)


def test_kdeglobals_refuses_an_unknown_theme(tmp_path: Path) -> None:
    output = run_look(tmp_path, {}, "big_wm_kdeglobals Missing || echo refused\n")
    assert output == "refused\n"


def test_launcher_writes_kdeglobals_and_drops_stale_ones() -> None:
    launcher = LAUNCHER.read_text(encoding="utf-8")
    assert "rm -rf -- /root/.config/Kvantum /root/.config/kdeglobals" in launcher
    assert 'big_wm_kdeglobals "$big_wm_kvantum" >/root/.config/kdeglobals' in launcher
