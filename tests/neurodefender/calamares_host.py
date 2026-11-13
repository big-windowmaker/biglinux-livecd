#!/usr/bin/env python3
"""Hosts the slideshow the way Calamares 3.4 does (ExecutionViewStep +
SlideshowQML, API 2): a QQuickWidget inside a QTabWidget, with the progress
bar and the status label as native widgets below it. Prints the game's state
so the tests can check what the real installer would run.

    calamares_host.py BRANDING_DIR SCRIPT
SCRIPT: comma-separated steps "wait:MS", "activate", "leave", "start",
"hide", "show", "probe:NAME".
"""
import sys
from pathlib import Path

from PySide6.QtCore import QMetaObject, QTimer, QUrl
from PySide6.QtQml import QQmlComponent
from PySide6.QtQuickWidgets import QQuickWidget
from PySide6.QtWidgets import (
    QApplication,
    QLabel,
    QProgressBar,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

branding, script = Path(sys.argv[1]), sys.argv[2].split(",")
app = QApplication(sys.argv[:1])
top = QWidget()
top.resize(826, 560)
layout = QVBoxLayout(top)
tabs = QTabWidget()
view = QQuickWidget()
view.setResizeMode(QQuickWidget.SizeRootObjectToView)
tabs.addTab(view, "Slideshow")
tabs.addTab(QLabel("log"), "Log")
tabs.tabBar().hide()
layout.addWidget(tabs)
bar = QProgressBar()
bar.setValue(12)
layout.addWidget(bar)
layout.addWidget(QLabel("Preenchendo sistemas de arquivos."))
top.show()

url = QUrl.fromLocalFile(str(branding / "BigWindowMakerSlides.qml"))
component = QQmlComponent(view.engine(), url, QQmlComponent.Asynchronous)
state = {"root": None}


def created():
    if component.isReady() and state["root"] is None:
        root = component.create()
        state["root"] = root
        view.setContent(url, component, root)        # what Calamares does
    elif component.isError():
        print("COMPONENT ERROR", component.errorString(), flush=True)


component.statusChanged.connect(created)
created()


def game():
    root = state["root"]
    loader = root.findChild(object, "neurodefenderLoader") if root else None
    return loader.property("item") if loader else None


def probe(name):
    g = game()
    keys = ["active", "shown", "screen", "needsLoop", "dormant", "failed", "framesRun"]
    values = {k: (g.property(k) if g else None) for k in keys}
    print("PROBE", name, " ".join(f"{k}={values[k]}" for k in keys), flush=True)


steps = iter(script)


def run_next():
    step = next(steps, None)
    if step is None:
        app.quit()
        return
    delay = 0
    root = state["root"]
    if step.startswith("wait:"):
        delay = int(step[5:])
    elif step == "activate":
        QMetaObject.invokeMethod(root, "onActivate")
        root.setProperty("activatedInCalamares", True)
    elif step == "leave":
        QMetaObject.invokeMethod(root, "onLeave")
        root.setProperty("activatedInCalamares", False)
    elif step == "start":
        QMetaObject.invokeMethod(game(), "startPlay")
    elif step == "hide":
        tabs.setCurrentIndex(1)                      # the "Toggle log" button
    elif step == "show":
        tabs.setCurrentIndex(0)
    elif step.startswith("probe:"):
        probe(step[6:])
    QTimer.singleShot(delay, run_next)


QTimer.singleShot(500, run_next)
sys.exit(app.exec())
