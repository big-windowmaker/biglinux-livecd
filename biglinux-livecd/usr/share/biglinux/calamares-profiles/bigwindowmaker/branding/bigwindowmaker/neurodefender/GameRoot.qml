/* NeuroDefender: Nanobot Crisis — the game's window, HUD, screens and loop.
 *
 * The slideshow (BigWindowMakerSlides.qml) loads this file only when the
 * installation step starts, and calls activate()/deactivate() from the
 * Calamares onActivate()/onLeave(). Nothing runs while it is inactive, hidden
 * or paused: the one Timer below is the whole game loop.
 *
 * The rules live in engine.js (plain JavaScript, tested with Node), the
 * drawing in render.js, the numbers in config.js, the texts in strings.js.
 * Any error in a frame stops the game and asks the slideshow to show the
 * static presentation instead ("failed").
 */
pragma ComponentBehavior: Bound

import QtQuick
import "config.js" as Config
import "engine.js" as Engine
import "render.js" as Render
import "strings.js" as Strings

FocusScope {
    id: game

    width: 800
    height: 440
    focus: true                          // hands the keyboard down to the arena

    // --- set from outside -------------------------------------------------
    property bool active: false
    property bool failed: false
    signal failure(string reason)

    // --- state ------------------------------------------------------------
    property var txt: Strings.en
    // title, demo, play, paused, help, codex, over
    property string screen: "title"
    property string returnTo: "title"          // where HOW TO PLAY goes back to
    property var g: Engine.create(1)
    property var input: ({ left: false, right: false, up: false, down: false, fire: false,
                           bomb: false, pointer: false, px: 160, py: 200 })
    property int frame: 0
    property double lastTime: 0
    property real titleIdle: 0
    property real demoTime: 0
    property int demoRun: 0
    property bool soundOn: false
    property bool soundAvailable: true
    property bool lowFx: false
    property bool economy: false
    property bool userLowFx: false
    property int bgSector: -1
    property real bgScroll: 0
    property bool newRecord: false
    property int codexPage: 0
    property var toasts: []
    property string toastText: ""
    property real toastTime: 0

    // HUD mirrors (written only when they change: no binding churn per frame)
    property int hudScore: 0
    property int hudShown: 0
    property int hudBest: 0
    property int hudLives: 3
    property int hudBombs: 2
    property real hudEnergy: 100
    property int hudSector: 1
    property int hudWave: 1
    property string hudStage: ""          // "WAVE 2", "BOSS", ...
    property string hudWeapon: ""
    property real hudMult: 1
    property real hudShield: 0
    property string bannerText: ""
    property string bannerKey: ""
    // Game Over / victory figures, copied when the screen opens
    property var result: ({ won: false, score: 0, best: 0, sector: 1, wave: 1, kills: 0, accuracy: 0 })
    property int seenVersion: 0           // bumps when the database must re-read g.seen

    // --- measurements (shown in the tests and in the docs) -----------------
    property int framesRun: 0
    property real avgFrameMs: 0
    property real avgPaintMs: 0

    // Calamares shows the slideshow in a QQuickWidget, whose internal window
    // reports visible=false even on screen: visibility is judged by painting.
    // A hidden widget (the installer's log view, a minimised window) stops
    // painting the canvas; then a game pauses and the title/demo rest.
    property double lastPaint: 0
    property bool dormant: false
    readonly property bool shown: game.visible
    readonly property bool needsLoop: active && !failed && shown
                                      && (screen === "play" || screen === "demo" || screen === "title")
    readonly property bool narrow: width < 320 * 1.2 + 170

    // ------------------------------------------------------------------ API

    function activate(): void {
        txt = Strings.forLocale(Qt.locale().name);
        active = true;
        lastTime = 0;
        lastPaint = 0;
        dormant = false;
        hudStage = txt.wave + " 1";
        if (screen === "demo" || screen === "title") goTitle();
    }

    function deactivate(): void {
        // the installation step is over (or hidden): stop everything now
        active = false;
        releaseInput();
        if (screen === "play") screen = "paused";
        soundOn = false;                 // unloads QtMultimedia, if it was loaded
    }

    // ------------------------------------------------------------------ flow

    function goTitle(): void {
        seenVersion++;
        screen = "title";
        titleIdle = 0;
        newRecord = false;
        Render.resetCache();
    }

    function startDemo(): void {
        // attract mode: a short battle somewhere in the campaign
        const sectors = [0, 2, 4, 1, 5, 3, 6, 7, 8];
        Engine.startGame(g, "demo", 977 + demoRun * 131, sectors[demoRun % sectors.length]);
        g.lowFx = true;                  // the demo is the cheap show
        demoRun++;
        demoTime = 0;
        screen = "demo";
    }

    function startPlay(): void {
        releaseInput();
        Engine.startGame(g, "play", Date.now() % 2147483647, 0);
        g.lowFx = lowFx;
        newRecord = false;
        screen = "play";
        keys.forceActiveFocus();
    }

    function pause(): void {
        if (screen !== "play") return;
        releaseInput();
        screen = "paused";
    }

    function resume(): void {
        if (screen !== "paused") return;
        screen = "play";
        lastTime = 0;
        lastPaint = 0;
        dormant = false;
        keys.forceActiveFocus();
    }

    function openHelp(): void {
        if (screen === "help") return;
        if (screen === "play") pause();
        returnTo = screen === "paused" ? "paused" : "title";
        screen = "help";
    }

    function closeHelp(): void {
        screen = returnTo;
        if (screen === "title") titleIdle = 0;
    }

    function toggleSound(): void {
        if (!soundAvailable) return;
        soundOn = !soundOn;
    }

    function toggleEffects(): void {
        userLowFx = !userLowFx;
        lowFx = userLowFx;
        if (screen !== "demo") g.lowFx = lowFx;
    }

    function releaseInput(): void {
        input.left = input.right = input.up = input.down = false;
        input.fire = input.bomb = input.pointer = false;
    }

    // ------------------------------------------------------------------ loop

    function tick(): void {
        const now = Date.now();
        const dt = lastTime > 0 ? Math.min(0.1, (now - lastTime) / 1000) : 1 / 60;
        lastTime = now;
        try {
            // nothing painted lately: the widget is hidden
            const stalled = lastPaint > 0 && now - lastPaint > 700;
            if (stalled !== dormant) dormant = stalled;
            if (dormant) {
                if (screen === "play") pause();
                arena.requestPaint();          // painting again wakes the game
                return;
            }
            frame++;
            if (screen === "title") {
                titleIdle += dt;
                g.time += dt;
                if (titleIdle > 14) startDemo();
                arena.requestPaint();
                return;
            }
            Engine.update(g, dt, input);
            if (screen === "demo") {
                demoTime += dt;
                if (g.phase === "gameover" || g.phase === "won" || demoTime > 75) goTitle();
            } else if (g.phase === "gameover" || g.phase === "won") {
                result = { won: g.phase === "won", score: g.score, best: g.best, sector: g.sector + 1,
                           wave: Math.min(g.wave + 1, Config.wavesPerSector), kills: g.stats.kills,
                           accuracy: Engine.accuracy(g) };
                hudBest = g.best;
                seenVersion++;
                screen = "over";
            }
            handleEvents();
            syncHud(dt);
            if (!(lowFx || g.lowFx)) bgScroll = (bgScroll + dt * 6) % 240;
            arena.requestPaint();
            measure(Date.now() - now, 0);
        } catch (err) {
            fail("frame: " + err + (err && err.stack ? "\n" + err.stack : ""));
        }
    }

    function fail(reason: string): void {
        console.warn("NeuroDefender stopped, showing the static presentation:", reason);
        failed = true;
        failure(reason);
    }

    function measure(updateMs: real, paintMs: real): void {
        framesRun++;
        avgFrameMs += (updateMs - avgFrameMs) * 0.05;
        // slow machine: fewer particles first, then 30 updates per second
        if (framesRun > 120 && !userLowFx) {
            if (!lowFx && avgFrameMs + avgPaintMs > Config.autoLowFxMs) { lowFx = true; g.lowFx = true; }
            if (!economy && avgFrameMs + avgPaintMs > Config.autoEconomyMs) economy = true;
        }
    }

    function handleEvents(): void {
        const ev = g.events;
        for (let i = 0; i < ev.length; i++) {
            const e = ev[i];
            if (e.indexOf("sfx:") === 0) { if (screen === "play") playSound(e.substring(4)); }
            else if (e.indexOf("ach:") === 0) showToast(txt.achievementTitle + ": " + (txt.achievements[e.substring(4)] || e.substring(4)));
            else if (e === "record" && screen !== "demo") newRecord = true;
        }
        const key = g.banner + "|" + g.bannerArg;
        if (key !== bannerKey) {
            bannerKey = key;
            bannerText = g.banner ? Strings.fill(txt.banner[g.banner] || g.banner, g.bannerArg) : "";
            if (g.banner === "sector")
                bannerText += "\n" + txt.sectors[g.sector];
        }
    }

    // events -> the twelve synthesised sounds
    readonly property var soundMap: ({
        shot: "shot", laser: "laser", pop: "pop", hit: "pop", split: "pop", boom: "boom",
        powerup: "powerup", hurt: "hurt", death: "boom", block: "shield", shield: "shield",
        shieldbreak: "shield", teleport: "teleport", cloak: "teleport", evolve: "evolve",
        warning: "evolve", wave: "evolve", dive: "teleport", bomb: "bomb", gameover: "gameover",
        victory: "victory", clear: "powerup", eshot: ""
    })

    function playSound(name: string): void {
        if (!soundOn || !sound.item) return;
        const file = soundMap[name];
        // called by name on purpose: naming the SoundBank type here would make
        // this file depend on QtMultimedia, which must stay optional
        if (file) sound.item["play"](file);
    }

    function showToast(text: string): void {
        toastText = text;
        toastTime = 2.6;
    }

    function syncHud(dt: real): void {
        const p = g.p;
        if (hudScore !== g.score) hudScore = g.score;
        // the score counts up like an arcade's
        if (hudShown !== hudScore) hudShown = Math.min(hudScore, hudShown + Math.max(7, Math.ceil((hudScore - hudShown) * 0.2)));
        if (hudBest !== Math.max(g.best, g.score) && screen === "play") hudBest = Math.max(g.best, g.score);
        if (hudLives !== p.lives) hudLives = p.lives;
        if (hudBombs !== p.bombs) hudBombs = p.bombs;
        const en = Math.max(0, Math.round(p.energy));
        if (hudEnergy !== en) hudEnergy = en;
        if (hudSector !== g.sector + 1) hudSector = g.sector + 1;
        if (hudWave !== Math.min(g.wave + 1, Config.wavesPerSector)) hudWave = Math.min(g.wave + 1, Config.wavesPerSector);
        const stage = (g.phase === "boss" || g.phase === "bossWarning" || g.phase === "bossDown") ? txt.boss
                      : (g.bonusWave || g.pendingBonus ? "BONUS" : txt.wave + " " + hudWave);
        if (hudStage !== stage) hudStage = stage;
        const w = p.laser > 0 ? txt.weapons.laser : (p.rapid > 0 ? txt.weapons.rapid
                  : (p.spread === 2 ? txt.weapons.spread3 : (p.spread === 1 ? txt.weapons.spread2 : txt.weapons.normal)));
        if (hudWeapon !== w) hudWeapon = w;
        if (hudMult !== g.mult) hudMult = g.mult;
        const sh = Math.max(0, Math.ceil(p.shield));
        if (hudShield !== sh) hudShield = sh;
        if (toastTime > 0) toastTime -= dt;
        if (bgSector !== g.sector) { bgSector = g.sector; background.requestPaint(); }
    }

    // ------------------------------------------------------------------ input

    function setKey(key: int, down: bool): bool {
        switch (key) {
        case Qt.Key_Left: case Qt.Key_A: input.left = down; return true;
        case Qt.Key_Right: case Qt.Key_D: input.right = down; return true;
        case Qt.Key_Up: case Qt.Key_W: input.up = down; return true;
        case Qt.Key_Down: case Qt.Key_S: input.down = down; return true;
        case Qt.Key_Space: input.fire = down; return true;
        }
        return false;
    }

    function keyPressed(event: var): void {
        const k = event.key;
        if (k === Qt.Key_P) { if (screen === "play") pause(); else if (screen === "paused") resume(); event.accepted = true; return; }
        if (k === Qt.Key_M) { toggleSound(); event.accepted = true; return; }
        if (k === Qt.Key_H) { if (screen === "help") closeHelp(); else openHelp(); event.accepted = true; return; }
        if (k === Qt.Key_Return || k === Qt.Key_Enter) {
            if (screen === "title" || screen === "demo" || screen === "over") { startPlay(); event.accepted = true; }
            else if (screen === "paused") { resume(); event.accepted = true; }
            return;
        }
        if (k === Qt.Key_Escape) {
            if (screen === "play") pause();
            else if (screen === "help") closeHelp();
            else if (screen === "codex") goTitle();
            event.accepted = true;
            return;
        }
        if (screen !== "play") return;
        if (k === Qt.Key_B) { if (!event.isAutoRepeat) input.bomb = true; event.accepted = true; return; }
        if (setKey(k, true)) event.accepted = true;
    }

    function keyReleased(event: var): void {
        if (event.isAutoRepeat) return;
        if (setKey(event.key, false)) event.accepted = true;
    }

    // a hidden item pauses a running game (a lost focus does too, see keys)
    onShownChanged: if (!shown) pause()

    Timer {
        id: loop
        objectName: "neurodefenderLoop"
        interval: game.dormant ? 250 : (game.economy || game.screen !== "play" ? 33 : 16)
        repeat: true
        running: game.needsLoop
        onRunningChanged: game.lastTime = 0
        onTriggered: game.tick()
    }

    // sound: only loaded while switched on
    Loader {
        id: sound
        objectName: "neurodefenderSound"
        active: game.soundOn && game.active
        asynchronous: true
        source: "SoundBank.qml"
        onStatusChanged: {
            if (status === Loader.Error) {
                console.warn("NeuroDefender: no sound (QtMultimedia or the audio device is unavailable)");
                game.soundAvailable = false;
                game.soundOn = false;
            }
        }
    }

    // ================================================================== look

    // the window: OPENSTEP grey with relief, black title bar like Window Maker's
    Rectangle {
        id: frameBox
        anchors.fill: parent
        color: "#AEAAAE"
        Rectangle { anchors { left: parent.left; right: parent.right; top: parent.top } height: 1; color: "#FFFFFF" }
        Rectangle { anchors { left: parent.left; top: parent.top; bottom: parent.bottom } width: 1; color: "#FFFFFF" }
        Rectangle { anchors { left: parent.left; right: parent.right; bottom: parent.bottom } height: 1; color: "#000000" }
        Rectangle { anchors { right: parent.right; top: parent.top; bottom: parent.bottom } width: 1; color: "#000000" }
    }

    Rectangle {
        id: titleBar
        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 1 }
        height: 22
        color: "#111111"
        Text {
            anchors { left: parent.left; leftMargin: 8; verticalCenter: parent.verticalCenter }
            text: "NeuroDefender — Nanobot Crisis"
            color: "#FFFFFF"
            font.bold: true
            font.pixelSize: 13
        }
        Row {
            anchors { right: parent.right; rightMargin: 3; verticalCenter: parent.verticalCenter }
            spacing: 3
            RetroButton { compact: true; text: "?"; onClicked: game.openHelp() }
            RetroButton { compact: true; text: game.soundOn ? "♪" : "-"; onClicked: game.toggleSound() }
            RetroButton {
                compact: true; text: game.screen === "paused" ? "▶" : "II"
                enabled: game.screen === "play" || game.screen === "paused"
                opacity: enabled ? 1 : 0.5
                onClicked: game.screen === "paused" ? game.resume() : game.pause()
            }
        }
    }

    // arena size: the largest 4:3 that fits next to (or under) the HUD
    readonly property real arenaScale: {
        const availW = width - 12 - (narrow ? 0 : 158);
        const availH = height - titleBar.height - 12 - (narrow ? 34 : 0);
        const s = Math.max(0.5, Math.min(availW / Config.ARENA_W, availH / Config.ARENA_H));
        return s >= 2 ? Math.floor(s) : s;          // whole pixels when there is room
    }

    // ------------------------------------------------------------------ arena

    Rectangle {
        id: arenaBox
        x: 6 + (game.narrow ? (game.width - 12 - width) / 2 : 0)
        y: titleBar.y + titleBar.height + 6 + (game.narrow ? 34 : 0)
        width: Config.ARENA_W * game.arenaScale + 4
        height: Config.ARENA_H * game.arenaScale + 4
        color: "#000000"
        // sunken relief
        Rectangle { anchors { left: parent.left; right: parent.right; top: parent.top } height: 1; color: "#555555" }
        Rectangle { anchors { left: parent.left; top: parent.top; bottom: parent.bottom } width: 1; color: "#555555" }
        Rectangle { anchors { left: parent.left; right: parent.right; bottom: parent.bottom } height: 1; color: "#FFFFFF" }
        Rectangle { anchors { right: parent.right; top: parent.top; bottom: parent.bottom } width: 1; color: "#FFFFFF" }

        Item {
            id: view
            x: 2; y: 2
            width: Config.ARENA_W * game.arenaScale
            height: Config.ARENA_H * game.arenaScale
            clip: true

            // neural backdrop: painted once per sector, scrolled for free
            Canvas {
                id: background
                width: Config.ARENA_W
                height: Config.ARENA_H * 2
                scale: game.arenaScale
                transformOrigin: Item.TopLeft
                smooth: false
                y: (game.bgScroll - Config.ARENA_H) * game.arenaScale
                renderStrategy: Canvas.Cooperative
                onPaint: {
                    const ctx = getContext("2d");
                    Render.drawBackground(ctx, Math.max(0, game.bgSector), width, height);
                }
            }

            Canvas {
                id: arena
                width: Config.ARENA_W
                height: Config.ARENA_H
                scale: game.arenaScale
                transformOrigin: Item.TopLeft
                smooth: false
                renderStrategy: Canvas.Cooperative
                onPaint: {
                    const t0 = Date.now();
                    game.lastPaint = t0;
                    const ctx = getContext("2d");
                    try {
                        if (game.screen === "title") Render.drawTitle(ctx, game.g.time, game.frame);
                        else Render.drawArena(ctx, game.g, game.frame, game.lowFx || game.g.lowFx);
                    } catch (err) {
                        game.fail("paint: " + err);
                        return;
                    }
                    game.avgPaintMs += ((Date.now() - t0) - game.avgPaintMs) * 0.05;
                }
            }

            // keyboard and mouse: only while this item has the focus
            Item {
                id: keys
                objectName: "neurodefenderKeys"
                anchors.fill: parent
                focus: true
                Keys.onPressed: (event) => game.keyPressed(event)
                Keys.onReleased: (event) => game.keyReleased(event)
                onActiveFocusChanged: if (!activeFocus) game.pause()
            }
            MouseArea {
                anchors.fill: parent
                acceptedButtons: Qt.LeftButton | Qt.RightButton
                onPressed: (mouse) => {
                    keys.forceActiveFocus();
                    if (game.screen !== "play") return;
                    if (mouse.button === Qt.RightButton) { game.input.bomb = true; return; }
                    game.input.fire = true;
                    game.input.pointer = true;
                    game.input.px = mouse.x / game.arenaScale;
                    game.input.py = mouse.y / game.arenaScale;
                }
                onPositionChanged: (mouse) => {
                    game.input.px = mouse.x / game.arenaScale;
                    game.input.py = mouse.y / game.arenaScale;
                }
                onReleased: (mouse) => {
                    if (mouse.button === Qt.LeftButton) { game.input.fire = false; game.input.pointer = false; }
                }
            }

            // banners: READY, WAVE COMPLETE, WARNING...
            Text {
                anchors.centerIn: parent
                width: parent.width - 20
                visible: game.bannerText !== "" && (game.screen === "play" || game.screen === "demo")
                text: game.bannerText
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                color: game.bannerKey.indexOf("warning") === 0 ? ((game.frame >> 3) % 2 ? "#FF405C" : "#FFFFFF") : "#FFFFFF"
                style: Text.Outline
                styleColor: "#000000"
                font.family: "monospace"
                font.bold: true
                font.pixelSize: Math.max(14, Math.round(11 * game.arenaScale))
            }

            // achievement toast
            Rectangle {
                anchors { right: parent.right; top: parent.top; margins: 6 }
                visible: game.toastTime > 0
                width: toast.implicitWidth + 16
                height: toast.implicitHeight + 8
                color: "#111111"
                border.color: "#FFD166"
                Text {
                    id: toast
                    anchors.centerIn: parent
                    text: game.toastText
                    color: "#FFD166"
                    font.family: "monospace"
                    font.bold: true
                    font.pixelSize: 11
                }
            }

            // ---------------------------------------------------- screens

            // title
            Item {
                anchors.fill: parent
                visible: game.screen === "title"
                Column {
                    anchors { top: parent.top; topMargin: parent.height * 0.06; horizontalCenter: parent.horizontalCenter }
                    spacing: 2
                    Item {
                        anchors.horizontalCenter: parent.horizontalCenter
                        width: logo.implicitWidth; height: logo.implicitHeight
                        // neon: a pulsing glow copy behind the crisp text
                        Text {
                            x: 2; y: 2
                            text: logo.text; font: logo.font
                            color: (game.frame >> 4) % 2 ? "#A855F7" : "#5B2A8A"
                        }
                        Text {
                            id: logo
                            text: "NEURODEFENDER"
                            color: "#00E5FF"
                            font.family: "monospace"
                            font.bold: true
                            font.pixelSize: Math.round(20 * game.arenaScale)
                        }
                    }
                    Text {
                        anchors.horizontalCenter: parent.horizontalCenter
                        text: game.txt.subtitle
                        color: "#FFD166"
                        font.family: "monospace"; font.bold: true
                        font.pixelSize: Math.round(9 * game.arenaScale)
                        font.letterSpacing: 4
                    }
                    Text {
                        anchors.horizontalCenter: parent.horizontalCenter
                        text: "“" + game.txt.tagline + "”"
                        color: "#FFFFFF"
                        font.italic: true
                        font.pixelSize: Math.round(6 * game.arenaScale)
                    }
                }
                Column {
                    anchors { centerIn: parent; verticalCenterOffset: -parent.height * 0.02 }
                    spacing: 4
                    RetroButton { anchors.horizontalCenter: parent.horizontalCenter; text: game.txt.start; highlighted: true; onClicked: game.startPlay() }
                    RetroButton { anchors.horizontalCenter: parent.horizontalCenter; text: game.txt.howTo; onClicked: game.openHelp() }
                    RetroButton {
                        anchors.horizontalCenter: parent.horizontalCenter
                        text: !game.soundAvailable ? game.txt.soundNa : (game.soundOn ? game.txt.soundOn : game.txt.soundOff)
                        onClicked: game.toggleSound()
                    }
                    RetroButton { anchors.horizontalCenter: parent.horizontalCenter; text: game.userLowFx ? game.txt.effectsLow : game.txt.effectsFull; onClicked: game.toggleEffects() }
                    RetroButton { anchors.horizontalCenter: parent.horizontalCenter; text: game.txt.codex; onClicked: { game.codexPage = 0; game.screen = "codex"; } }
                }
                Text {
                    anchors { bottom: parent.bottom; bottomMargin: 4; horizontalCenter: parent.horizontalCenter }
                    width: parent.width - 24
                    text: game.txt.installNote + "  " + (game.hudBest > 0 ? game.txt.hiScore + " " + game.hudBest : "")
                    horizontalAlignment: Text.AlignHCenter
                    color: "#AEAAAE"
                    font.pixelSize: 11
                }
            }

            // demo label
            Rectangle {
                visible: game.screen === "demo"
                anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
                height: 30
                color: "#CC111111"
                Row {
                    anchors.centerIn: parent
                    spacing: 10
                    Text {
                        anchors.verticalCenter: parent.verticalCenter
                        text: game.txt.demo
                        color: (game.frame >> 4) % 2 ? "#FFD166" : "#FFFFFF"
                        font.family: "monospace"; font.bold: true; font.pixelSize: 13
                    }
                    RetroButton { anchors.verticalCenter: parent.verticalCenter; text: game.txt.start; highlighted: true; onClicked: game.startPlay() }
                }
            }

            // pause, game over and the text screens share a dimmed panel
            Rectangle {
                anchors.fill: parent
                visible: game.screen === "paused" || game.screen === "over" || game.screen === "help" || game.screen === "codex"
                color: "#C8080B18"

                Column {
                    anchors.centerIn: parent
                    spacing: 6
                    visible: game.screen === "paused"
                    Text { anchors.horizontalCenter: parent.horizontalCenter; text: game.txt.paused; color: "#00E5FF"; font.family: "monospace"; font.bold: true; font.pixelSize: 26 }
                    Text { anchors.horizontalCenter: parent.horizontalCenter; text: game.txt.pausedHint; color: "#FFFFFF"; font.pixelSize: 11 }
                    RetroButton { anchors.horizontalCenter: parent.horizontalCenter; text: game.txt.resume; highlighted: true; onClicked: game.resume() }
                    RetroButton { anchors.horizontalCenter: parent.horizontalCenter; text: game.txt.howTo; onClicked: game.openHelp() }
                    RetroButton { anchors.horizontalCenter: parent.horizontalCenter; text: game.txt.quit; onClicked: game.goTitle() }
                }

                Column {
                    anchors.centerIn: parent
                    spacing: 5
                    visible: game.screen === "over"
                    Text {
                        anchors.horizontalCenter: parent.horizontalCenter
                        text: game.result.won ? game.txt.victoryTitle : game.txt.gameOver
                        color: game.result.won ? "#39FF88" : "#FF405C"
                        font.family: "monospace"; font.bold: true; font.pixelSize: 26
                    }
                    Text {
                        anchors.horizontalCenter: parent.horizontalCenter
                        visible: game.newRecord
                        text: game.txt.newRecord
                        color: (game.frame >> 3) % 2 ? "#FFD166" : "#FFFFFF"
                        font.family: "monospace"; font.bold: true; font.pixelSize: 14
                    }
                    Grid {
                        anchors.horizontalCenter: parent.horizontalCenter
                        columns: 2; columnSpacing: 14; rowSpacing: 2
                        Text { text: game.txt.finalScore; color: "#AEAAAE"; font.pixelSize: 12 }
                        Text { text: game.result.score; color: "#FFFFFF"; font.family: "monospace"; font.bold: true; font.pixelSize: 12 }
                        Text { text: game.txt.best; color: "#AEAAAE"; font.pixelSize: 12 }
                        Text { text: game.result.best; color: "#FFD166"; font.family: "monospace"; font.bold: true; font.pixelSize: 12 }
                        Text { text: game.txt.reached; color: "#AEAAAE"; font.pixelSize: 12 }
                        Text { text: game.txt.sector + " " + game.result.sector + " · " + game.txt.wave + " " + game.result.wave; color: "#FFFFFF"; font.family: "monospace"; font.pixelSize: 12 }
                        Text { text: game.txt.kills; color: "#AEAAAE"; font.pixelSize: 12 }
                        Text { text: game.result.kills; color: "#FFFFFF"; font.family: "monospace"; font.pixelSize: 12 }
                        Text { text: game.txt.accuracy; color: "#AEAAAE"; font.pixelSize: 12 }
                        Text { text: game.result.accuracy + "%"; color: "#FFFFFF"; font.family: "monospace"; font.pixelSize: 12 }
                    }
                    RetroButton { anchors.horizontalCenter: parent.horizontalCenter; text: game.txt.playAgain; highlighted: true; onClicked: game.startPlay() }
                    RetroButton { anchors.horizontalCenter: parent.horizontalCenter; text: game.txt.quit; onClicked: game.goTitle() }
                }

                // how to play
                Item {
                    anchors.fill: parent
                    anchors.margins: 10
                    visible: game.screen === "help"
                    Text {
                        id: helpTitle
                        anchors { top: parent.top; horizontalCenter: parent.horizontalCenter }
                        text: game.txt.howTo
                        color: "#00E5FF"; font.family: "monospace"; font.bold: true; font.pixelSize: 16
                    }
                    Text {
                        id: story
                        anchors { top: helpTitle.bottom; topMargin: 4; left: parent.left; right: parent.right }
                        text: game.txt.story
                        color: "#FFFFFF"; font.pixelSize: 11; wrapMode: Text.WordWrap
                        horizontalAlignment: Text.AlignHCenter
                    }
                    Row {
                        anchors { top: story.bottom; topMargin: 6; horizontalCenter: parent.horizontalCenter }
                        spacing: 16
                        Column {
                            spacing: 1
                            Text { text: game.txt.controlsTitle; color: "#FFD166"; font.family: "monospace"; font.bold: true; font.pixelSize: 11 }
                            Repeater {
                                model: game.txt.controls
                                Text {
                                    required property var modelData
                                    text: "<b>" + modelData[0] + "</b>  " + modelData[1]
                                    textFormat: Text.StyledText
                                    color: "#FFFFFF"; font.pixelSize: 10
                                }
                            }
                        }
                        Column {
                            spacing: 1
                            Text { text: game.txt.pickupsTitle; color: "#FFD166"; font.family: "monospace"; font.bold: true; font.pixelSize: 11 }
                            Repeater {
                                model: ["spread", "rapid", "laser", "shield", "bomb", "repair", "life"]
                                Row {
                                    id: capRow
                                    required property string modelData
                                    spacing: 5
                                    // the capsule's letter: the icon reads without colour
                                    Rectangle {
                                        width: 13; height: 13
                                        color: Render.PICKUP_COLOR[capRow.modelData]
                                        border.color: "#FFFFFF"
                                        Text { anchors.centerIn: parent; text: game.txt.pickups[capRow.modelData][0]; color: "#000000"; font.family: "monospace"; font.bold: true; font.pixelSize: 10 }
                                    }
                                    Text { text: game.txt.pickups[capRow.modelData][1]; color: "#FFFFFF"; font.pixelSize: 10 }
                                }
                            }
                        }
                    }
                    Text {
                        anchors { bottom: backHelp.top; bottomMargin: 3; horizontalCenter: parent.horizontalCenter }
                        text: game.txt.clickToPlay
                        color: "#AEAAAE"; font.pixelSize: 10
                    }
                    RetroButton { id: backHelp; anchors { bottom: parent.bottom; horizontalCenter: parent.horizontalCenter } text: game.txt.back; onClicked: game.closeHelp() }
                }

                // nanobot database (encyclopedia): what you have met so far
                Item {
                    anchors.fill: parent
                    anchors.margins: 10
                    visible: game.screen === "codex"
                    Text {
                        id: codexTitle
                        anchors { top: parent.top; horizontalCenter: parent.horizontalCenter }
                        text: game.txt.codex + "  " + (game.codexPage + 1) + "/3"
                        color: "#00E5FF"; font.family: "monospace"; font.bold: true; font.pixelSize: 16
                    }
                    Column {
                        anchors { top: codexTitle.bottom; topMargin: 6; left: parent.left; right: parent.right }
                        spacing: 4
                        Repeater {
                            model: game.txt.codexEntries.slice(game.codexPage * 6, game.codexPage * 6 + 6)
                            Column {
                                id: entry
                                required property var modelData
                                readonly property bool known: game.seenVersion >= 0 && (entry.modelData[0] === "basic" || game.g.seen[entry.modelData[0]] === true)
                                width: parent.width
                                Text { text: entry.modelData[1]; color: entry.known ? "#FFD166" : "#555555"; font.family: "monospace"; font.bold: true; font.pixelSize: 11 }
                                Text { width: parent.width; text: entry.known ? entry.modelData[2] : game.txt.codexUnknown; color: entry.known ? "#FFFFFF" : "#777777"; font.pixelSize: 10; wrapMode: Text.WordWrap }
                            }
                        }
                    }
                    Row {
                        anchors { bottom: parent.bottom; horizontalCenter: parent.horizontalCenter }
                        spacing: 6
                        RetroButton { compact: true; text: "<"; onClicked: game.codexPage = (game.codexPage + 2) % 3 }
                        RetroButton { text: game.txt.back; onClicked: game.goTitle() }
                        RetroButton { compact: true; text: ">"; onClicked: game.codexPage = (game.codexPage + 1) % 3 }
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------------ HUD

    component HudLabel: Text {
        color: "#000000"
        font.family: "monospace"
        font.bold: true
        font.pixelSize: 11
    }
    component HudValue: Text {
        color: "#000000"
        font.family: "monospace"
        font.pixelSize: 15
        font.bold: true
    }

    // side panel (wide layouts) — sunken boxes of black-on-grey text
    Column {
        id: hud
        visible: !game.narrow
        x: arenaBox.x + arenaBox.width + 8
        y: arenaBox.y
        width: game.width - x - 8
        spacing: 3

        HudLabel { text: game.txt.score }
        HudValue { text: String(game.hudShown).padStart(7, "0") }
        HudLabel { text: game.txt.hiScore }
        HudValue {
            text: String(game.hudBest).padStart(7, "0")
            color: game.screen === "play" && game.hudScore > 0 && game.hudScore >= game.hudBest && (game.frame >> 4) % 2 ? "#7A5A00" : "#000000"
        }
        Rectangle { width: parent.width; height: 1; color: "#555555" }
        HudLabel { text: game.txt.sector + " " + game.hudSector + " · " + game.hudStage }
        Text {
            width: parent.width
            text: game.txt.sectors[game.hudSector - 1]
            color: "#000000"; font.pixelSize: 11; elide: Text.ElideRight
        }
        Rectangle { width: parent.width; height: 1; color: "#555555" }
        HudLabel { text: game.txt.energy }
        // energy bar: sunken, with a number so it does not rely on colour
        Rectangle {
            width: parent.width; height: 12
            color: "#000000"
            Rectangle {
                x: 1; y: 1; height: parent.height - 2
                width: (parent.width - 2) * game.hudEnergy / Config.player.energy
                color: game.hudEnergy > 50 ? "#39FF88" : (game.hudEnergy > 25 ? "#FFD166" : "#FF405C")
            }
            Text { anchors.centerIn: parent; text: game.hudEnergy; color: "#FFFFFF"; style: Text.Outline; styleColor: "#000000"; font.family: "monospace"; font.bold: true; font.pixelSize: 10 }
        }
        Row {
            spacing: 10
            Column { HudLabel { text: game.txt.lives } HudValue { text: "♥ " + game.hudLives } }
            Column { HudLabel { text: game.txt.bombs } HudValue { text: "◉ " + game.hudBombs } }
        }
        HudLabel { text: game.txt.weapon }
        HudValue { text: game.hudWeapon + (game.hudShield > 0 ? " +O" + game.hudShield : ""); font.pixelSize: 13 }
        HudLabel { text: game.txt.combo + " x" + game.hudMult.toFixed(1); color: game.hudMult > 1 ? "#7A1020" : "#000000" }
    }

    // top strip (narrow layouts)
    Row {
        visible: game.narrow
        x: 8
        y: titleBar.y + titleBar.height + 8
        spacing: 12
        HudValue { text: game.txt.score + " " + game.hudShown; font.pixelSize: 12 }
        HudValue { text: "♥" + game.hudLives; font.pixelSize: 12 }
        HudValue { text: "◉" + game.hudBombs; font.pixelSize: 12 }
        HudValue { text: "E" + game.hudEnergy; font.pixelSize: 12 }
        HudValue { text: game.txt.sector + " " + game.hudSector + " · " + game.hudStage; font.pixelSize: 12 }
    }
}
