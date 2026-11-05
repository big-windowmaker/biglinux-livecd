"""The setup wizard on Big WindowMaker: its look and its light/dark choice."""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

REPOSITORY = Path(__file__).resolve().parents[1]
LIBRARY = REPOSITORY / "biglinux-livecd/usr/share/biglinux/livecd"
sys.path.insert(0, str(LIBRARY))

import windowmaker_look  # noqa: E402
from desktop_theme import apply_simple_theme  # noqa: E402
from user_config import write_text  # noqa: E402

# An executable that is sure to exist: the tests never run it, they only need
# the existence and permission checks to pass (/tmp may be mounted noexec).
EXECUTABLE = sys.executable


class FakeWindowMakerHost:
    def __init__(self, big_wm_theme_command: str, succeeds: bool = True) -> None:
        self.test_mode = False
        self.theme_list_script = "/nonexistent/list-themes"
        self.theme_apply_script = "/nonexistent/apply-theme"
        self.theme_state_file = "/tmp/big_desktop_theme"
        self.gnome_layout_state_file = "/tmp/big_gnome_layout"
        self.big_wm_theme_command = big_wm_theme_command
        self.succeeds = succeeds
        self.commands: list[tuple[list[str], bool]] = []
        self.states: list[tuple[str, str]] = []
        self.config_writes: list[str] = []

    def _run_command(
        self,
        command: list[str],
        *,
        as_root: bool = False,
        read_only: bool = False,
        wait_for_completion: bool = False,
    ) -> tuple[bool, str]:
        assert not as_root, "the theme belongs to the live user, not root"
        self.commands.append((command, wait_for_completion or read_only))
        if command[0] == self.big_wm_theme_command and not self.succeeds:
            return False, "failed"
        return True, ""

    def _write_live_state_file(self, filepath: str, content: str) -> bool:
        self.states.append((filepath, content))
        return True

    def _write_user_config_file(self, filepath: str, content: str) -> bool:
        self.config_writes.append(filepath)
        write_text(filepath, content)
        return True

    def _apply_gtk_settings_ini(self, dark: bool, icon_theme: str) -> None:
        raise AssertionError("Window Maker keeps OneStepBack; no adw-gtk3 here")

    def get_desktop_environment(self) -> str:
        return "WindowMaker"

    def _ensure_gnome_settings_file(self) -> None:
        raise AssertionError("GNOME setup must not run for Window Maker")

    def _sync_gnome_settings_tmp(self) -> None:
        raise AssertionError("GNOME sync must not run for Window Maker")

    def _stamp_gnome_input_sources(self, settings_file: str) -> None:
        raise AssertionError("GNOME input sources must not run for Window Maker")


def _assert_desktop_themes_untouched(home: Path, host: FakeWindowMakerHost) -> None:
    assert host.config_writes == []
    for path in (
        ".config/Kvantum/kvantum.kvconfig",
        ".config/kdeglobals",
        ".config/gtk-3.0/settings.ini",
        ".config/gtk-4.0/settings.ini",
        ".config/dconf",
    ):
        assert not (home / path).exists(), path


@pytest.mark.parametrize("theme", ["light", "dark"])
def test_window_maker_theme_goes_through_big_wm_theme(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, theme: str
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    host = FakeWindowMakerHost(EXECUTABLE)

    assert apply_simple_theme(host, theme)

    # Waited for: the session starts right after the wizard closes.
    assert host.commands == [([EXECUTABLE, theme], True)]
    assert host.states == [("/tmp/big_desktop_theme", theme)]
    _assert_desktop_themes_untouched(tmp_path, host)


@pytest.mark.parametrize(
    ("theme", "color_scheme"), [("light", "'default'"), ("dark", "'prefer-dark'")]
)
def test_window_maker_without_big_wm_theme_only_sets_the_color_scheme(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, theme: str, color_scheme: str
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    host = FakeWindowMakerHost(str(tmp_path / "missing/big-wm-theme"))

    assert apply_simple_theme(host, theme)

    assert [command for command, _wait in host.commands] == [
        [
            "gsettings",
            "set",
            "org.gnome.desktop.interface",
            "color-scheme",
            color_scheme,
        ]
    ]
    _assert_desktop_themes_untouched(tmp_path, host)


def test_window_maker_falls_back_when_big_wm_theme_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    host = FakeWindowMakerHost(EXECUTABLE, succeeds=False)

    assert not apply_simple_theme(host, "dark")

    assert [command for command, _wait in host.commands] == [
        [EXECUTABLE, "dark"],
        [
            "gsettings",
            "set",
            "org.gnome.desktop.interface",
            "color-scheme",
            "'prefer-dark'",
        ],
    ]
    _assert_desktop_themes_untouched(tmp_path, host)


def test_window_maker_refuses_unknown_themes(tmp_path: Path) -> None:
    host = FakeWindowMakerHost(EXECUTABLE)
    assert not apply_simple_theme(host, "sepia")
    assert host.commands == []
    assert host.states == []


@pytest.mark.parametrize(
    ("output", "expected"),
    [("dark\n", "dark"), ("light", "light"), ("sepia", "light"), ("", "light")],
)
def test_wizard_starts_in_the_variant_big_wm_theme_reports(
    monkeypatch: pytest.MonkeyPatch, output: str, expected: str
) -> None:
    import services

    service = services.SystemService(test_mode=True)
    service.big_wm_theme_command = EXECUTABLE
    calls: list[list[str]] = []

    def run(command: list[str], **kwargs: bool) -> tuple[bool, str]:
        assert kwargs.get("read_only"), "asking for the variant changes nothing"
        calls.append(command)
        return True, output

    monkeypatch.setattr(service, "_run_command", run)
    assert service.get_windowmaker_theme() == expected
    assert calls == [[EXECUTABLE, "get"]]


def test_wizard_starts_light_without_big_wm_theme(tmp_path: Path) -> None:
    import services

    service = services.SystemService(test_mode=True)
    service.big_wm_theme_command = str(tmp_path / "missing")
    assert service.get_windowmaker_theme() == "light"


def test_only_window_maker_gets_the_look() -> None:
    assert windowmaker_look.is_windowmaker("WindowMaker")
    for desktop in ("GNOME", "XFCE", "Cinnamon", "other", ""):
        assert not windowmaker_look.is_windowmaker(desktop)


def test_window_maker_logo_with_fallback(tmp_path: Path) -> None:
    installed = tmp_path / "big-wm.svg"
    fallback = "/usr/share/biglinux/livecd/assets/comm-logo.png"
    assert windowmaker_look.logo_path(fallback, str(installed)) == fallback
    installed.write_text("<svg/>", encoding="utf-8")
    assert windowmaker_look.logo_path(fallback, str(installed)) == str(installed)
    # The path big-wm-themes installs the logo to (big-wm/Makefile).
    assert (
        windowmaker_look.LOGO_PATH
        == "/usr/share/icons/hicolor/scalable/apps/big-wm.svg"
    )


@pytest.mark.parametrize("variant", ["light", "dark"])
def test_each_variant_has_its_stylesheets(variant: str) -> None:
    base, palette = windowmaker_look.stylesheet_paths(variant)
    assert Path(base) == LIBRARY / "style-windowmaker.css"
    assert Path(palette) == LIBRARY / f"style-windowmaker-{variant}.css"
    assert Path(base).is_file() and Path(palette).is_file()


def test_unknown_variants_are_refused() -> None:
    with pytest.raises(ValueError):
        windowmaker_look.stylesheet_paths("../style")
    assert windowmaker_look.normalize_variant(None) == "light"
    assert windowmaker_look.normalize_variant(" dark\n") == "dark"


def _defined_colors(path: Path) -> set[str]:
    return set(re.findall(r"@define-color\s+(\w+)", path.read_text(encoding="utf-8")))


def test_both_palettes_define_every_colour_the_rules_use() -> None:
    rules = (LIBRARY / "style-windowmaker.css").read_text(encoding="utf-8")
    used = set(re.findall(r"@(wm_\w+)", rules))
    light = _defined_colors(LIBRARY / "style-windowmaker-light.css")
    dark = _defined_colors(LIBRARY / "style-windowmaker-dark.css")
    assert used
    assert light == dark
    assert used <= light


def test_window_maker_rules_cannot_reach_other_editions() -> None:
    """Every rule hangs off the class only a Window Maker wizard window has."""
    rules = (LIBRARY / "style-windowmaker.css").read_text(encoding="utf-8")
    rules = re.sub(r"/\*.*?\*/", "", rules, flags=re.S)
    selectors = re.findall(r"([^{}]+)\{", rules)
    assert selectors
    for group in selectors:
        for selector in group.split(","):
            assert selector.strip().startswith("window.windowmaker"), selector


def test_app_window_loads_the_look_only_for_window_maker() -> None:
    source = (LIBRARY / "ui/app_window.py").read_text(encoding="utf-8")
    assert "if self.windowmaker_look:\n            self._load_windowmaker_look()" in (
        source
    )
    assert 'self.add_css_class("windowmaker")' in source
    assert source.count("windowmaker_look.stylesheet_paths(") == 2


@pytest.mark.parametrize("enabled", [True, False])
def test_a_missing_icc_profile_tool_is_skipped_quietly(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    enabled: bool,
) -> None:
    """Big WindowMaker ships no icc_profile_apply; the wizard logged an ERROR."""
    import services

    service = services.SystemService(test_mode=True)
    service.icc_profile_command = str(tmp_path / "icc_profile_apply")
    calls: list[list[str]] = []
    monkeypatch.setattr(
        service, "_run_command", lambda command, **_kwargs: calls.append(command)
    )

    with caplog.at_level("DEBUG"):
        service.apply_icc_profile_settings(enabled)
        service._finalize_display_profile(enabled)
    assert calls == []
    assert not [record for record in caplog.records if record.levelname == "ERROR"]

    (tmp_path / "icc_profile_apply").write_text("", encoding="utf-8")
    service.apply_icc_profile_settings(enabled)
    action = "enable" if enabled else "disable"
    assert calls == [[str(tmp_path / "icc_profile_apply"), action]]
