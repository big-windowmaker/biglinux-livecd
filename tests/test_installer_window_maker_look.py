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
