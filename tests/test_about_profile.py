"""Sobre do assistente de instalação: o perfil da edição pode trocar os
textos (profile.json "about"); sem o bloco, os do BigLinux continuam.

O diálogo é o Adw.AboutDialog de verdade substituído por um registro dos
argumentos: o teste roda sem tela.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPOSITORY = Path(__file__).resolve().parents[1]
CALAMARES = REPOSITORY / "biglinux-livecd/usr/share/biglinux/calamares"
PROFILES = REPOSITORY / "biglinux-livecd/usr/share/biglinux/calamares-profiles"
sys.path.insert(0, str(CALAMARES))

app = pytest.importorskip("src.app")


class FakeDialog:
    """Grava o que o diálogo receberia."""

    last: "FakeDialog | None" = None

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.credits: list[tuple[str, list[str]]] = []
        self.acknowledgements: list[tuple[str, list[str]]] = []
        self.links: list[tuple[str, str]] = []
        FakeDialog.last = self

    def add_credit_section(self, title, people):
        self.credits.append((title, people))

    def add_acknowledgement_section(self, title, people):
        self.acknowledgements.append((title, people))

    def add_link(self, title, url):
        self.links.append((title, url))

    def present(self, _parent):
        pass


def show_about(monkeypatch, profile: str) -> FakeDialog:
    monkeypatch.setenv("CALAMARES_PROFILE_DIRECTORY", str(PROFILES / profile))
    monkeypatch.setattr(app.Adw, "AboutDialog", FakeDialog)
    monkeypatch.setattr(app, "installed_version", lambda: "26.10.26-8")
    fake_self = type("App", (), {"window": object()})()
    app.CalamaresApp.on_about_action(fake_self, None, None)
    assert FakeDialog.last is not None
    return FakeDialog.last


def test_big_windowmaker_about(monkeypatch) -> None:
    d = show_about(monkeypatch, "bigwindowmaker")
    assert d.kwargs["application_name"] == "Instalador do Big WindowMaker"
    assert d.kwargs["developer_name"] == "Big WindowMaker"
    assert d.kwargs["version"] == "26.10.26-8"  # do pacote, não "1.0.0" fixo
    assert d.kwargs["developers"] == [
        "Rafael Ruscher <rruscher@gmail.com>",
        "Barnabé Di Kartola <barnabedikartola@gmail.com>",
    ]
    assert "BigLinux" in d.kwargs["copyright"]  # o projeto original continua creditado
    assert d.credits and "BigLinux" in d.credits[0][0]
    thanks = d.acknowledgements[0][1]
    assert any("Alfredo Kojima" in p for p in thanks)
    assert any("Philipp Kaeser" in p for p in thanks)
    assert any("Bruno Gonçalves" in p for p in thanks)
    assert any("Tales A. Mendonça" in p for p in thanks)
    assert (
        "Big WindowMaker no GitHub",
        "https://github.com/big-windowmaker",
    ) in d.links


@pytest.mark.parametrize("profile", ["biglinux", "bigcommunity", "xivastudio"])
def test_other_editions_keep_biglinux_about(monkeypatch, profile) -> None:
    d = show_about(monkeypatch, profile)
    assert d.kwargs["developer_name"] == "BigLinux Team"
    assert d.kwargs["website"] == "https://www.biglinux.com.br"
    assert d.kwargs["developers"] == ["BigLinux Development Team"]
    assert not d.acknowledgements
    assert [title for title, _url in d.links][:1] != ["Big WindowMaker no GitHub"]
