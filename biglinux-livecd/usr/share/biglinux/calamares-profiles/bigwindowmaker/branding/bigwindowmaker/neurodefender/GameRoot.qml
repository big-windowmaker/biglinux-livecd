/* NeuroDefender: Nanobot Crisis — the game's cabinet, screens and loop.
 *
 * The slideshow (BigWindowMakerSlides.qml) loads this file only when the
 * installation step starts, and calls activate()/deactivate() from the
 * Calamares onActivate()/onLeave(). Nothing runs while it is inactive, hidden
 * or paused: the one Timer below is the whole game loop.
 *
 * Look of a 1997 arcade: the game screen (320 x 264 pixels: HUD strip,
 * 240-pixel arena, HUD strip) scaled up with crisp pixels, between two
 * cabinet panels (emblem and sector map; capsules and keys). Everything is
 * drawn by render.js and art.js; QML only places the canvases and the menus.
 * The rules live in engine.js, the numbers in config.js, the texts in
 * strings.js. Any error in a frame stops the game and asks the slideshow to
 * show the static presentation instead ("failed").
 */
pragma ComponentBehavior: Bound

import QtQuick
import "config.js" as Config
import "engine.js" as Engine
import "render.js" as Render
import "art.js" as Art
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
    property string toastText: ""
    property real toastTime: 0
    property int hudShown: 0                 // the score as it counts up on screen
    property int hudBest: 0
    // the HUD strips' contents, rebuilt every frame (see syncHud)
    property var hud: ({ score: 0, best: 0, beating: false, stage: "", boss: false, lives: 3, bombs: 2,
                         energy: 100, weapon: "", mult: 1, shield: 0, label: { score: "", best: "" } })
    property var bannerLines: []
    property string bannerStyle: "plain"
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

    // --- geometry ---------------------------------------------------------
    readonly property int screenW: Config.ARENA_W
    readonly property int screenH: Config.ARENA_H + 2 * Render.HUD_TOP
    readonly property int panelW: 72                     // cabinet panel, in game pixels
    // screen pixels per game pixel: the largest that fits under the title bar
    readonly property real arenaScale: {
        const s = Math.min((width - 12) / screenW, (height - titleBar.height - 8) / screenH);
        return Math.max(0.5, s >= 2 ? Math.floor(s) : s);    // whole pixels when there is room
    }
    readonly property bool panels: width - 12 >= (screenW + 2 * panelW) * arenaScale + 12

    // ------------------------------------------------------------------ API

    function activate(): void {
        txt = Strings.forLocale(Qt.locale().name);
        g.names = txt.pickupShort;
        active = true;
        lastTime = 0;
        lastPaint = 0;
        dormant = false;
        Render.resetPictures();
        repaintStatic();
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
        hudShown = 0;
        screen = "demo";
    }

    function startPlay(): void {
        releaseInput();
        g.names = txt.pickupShort;
        Engine.startGame(g, "play", Date.now() % 2147483647, 0);
        g.lowFx = lowFx;
        newRecord = false;
        hudShown = 0;
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

    function openCodex(): void {
        codexPage = 0;
        seenVersion++;
        screen = "codex";
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

    // the menu of each screen: [{ label, act }]
    function menuItems(): var {
        switch (screen) {
        case "title":
            return [{ label: txt.start, act: "start" }, { label: txt.howTo, act: "help" },
                    { label: txt.codex, act: "codex" },
                    { label: !soundAvailable ? txt.soundNa : (soundOn ? txt.soundOn : txt.soundOff), act: "sound" },
                    { label: userLowFx ? txt.effectsLow : txt.effectsFull, act: "effects" }];
        case "paused":
            return [{ label: txt.resume, act: "resume" }, { label: txt.howTo, act: "help" }, { label: txt.quit, act: "quit" }];
        case "over":
            return [{ label: txt.playAgain, act: "start" }, { label: txt.quit, act: "quit" }];
        case "help": case "codex":
            return [{ label: txt.back, act: "back" }];
        case "demo":
            return [{ label: txt.start, act: "start" }];
        }
        return [];
    }

    function menuAction(act: string): void {
        switch (act) {
        case "start": startPlay(); break;
        case "help": openHelp(); break;
        case "codex": openCodex(); break;
        case "sound": toggleSound(); break;
        case "effects": toggleEffects(); break;
        case "resume": resume(); break;
        case "quit": goTitle(); break;
        case "back": if (screen === "help") closeHelp(); else goTitle(); break;
        }
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
            if (!g.banner) bannerLines = [];
            else {
                const main = Strings.fill(txt.banner[g.banner] || g.banner, g.bannerArg);
                bannerLines = g.banner === "sector" ? [main, txt.sectors[g.sector]] : [main];
            }
            bannerStyle = g.banner === "warning" ? "warning"
                        : (["sectorClear", "victory", "bonusPerfect"].indexOf(g.banner) >= 0 ? "gold"
                        : (["waveClear", "bonusResult"].indexOf(g.banner) >= 0 ? "mint" : "plain"));
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
        const p = g.p, h = hud;
        // the score counts up like an arcade's
        if (hudShown !== g.score) hudShown = Math.min(g.score, hudShown + Math.max(7, Math.ceil((g.score - hudShown) * 0.2)));
        if (screen === "play") hudBest = Math.max(g.best, g.score);
        const wave = Math.min(g.wave + 1, Config.wavesPerSector);
        const boss = g.phase === "boss" || g.phase === "bossWarning" || g.phase === "bossDown";
        h.score = hudShown;
        h.best = screen === "demo" ? Math.max(hudBest, g.best) : hudBest;
        h.beating = screen === "play" && g.score > 0 && g.score >= hudBest;
        h.boss = boss;
        h.stage = txt.sector + " " + (g.sector + 1) + " · "
                  + (boss ? txt.boss : (g.bonusWave || g.pendingBonus ? "BONUS" : txt.wave + " " + wave));
        h.lives = Math.max(0, p.lives);
        h.bombs = p.bombs;
        h.energy = Math.max(0, Math.round(p.energy));
        h.weapon = p.laser > 0 ? txt.weapons.laser : (p.rapid > 0 ? txt.weapons.rapid
                   : (p.spread === 2 ? txt.weapons.spread3 : (p.spread === 1 ? txt.weapons.spread2 : txt.weapons.normal)));
        h.mult = g.mult;
        h.shield = Math.max(0, Math.ceil(p.shield));
        h.label.score = txt.score;
        h.label.best = txt.hiScore;
        if (toastTime > 0) toastTime -= dt;
        if (bgSector !== g.sector) { bgSector = g.sector; background.requestPaint(); leftPanel.requestPaint(); }
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
        if (k === Qt.Key_Escape) {
            if (screen === "play") pause();
            else if (screen === "help") closeHelp();
            else if (screen === "codex") goTitle();
            event.accepted = true;
            return;
        }
        if (screen !== "play") {
            // menus: arrows choose, Enter or Space runs; Left/Right turn the database's pages
            if (k === Qt.Key_Up || k === Qt.Key_W) { menu.step(-1); event.accepted = true; }
            else if (k === Qt.Key_Down || k === Qt.Key_S) { menu.step(1); event.accepted = true; }
            else if (screen === "codex" && (k === Qt.Key_Left || k === Qt.Key_A)) { codexPage = (codexPage + Art.codexPages(txt) - 1) % Art.codexPages(txt); event.accepted = true; }
            else if (screen === "codex" && (k === Qt.Key_Right || k === Qt.Key_D)) { codexPage = (codexPage + 1) % Art.codexPages(txt); event.accepted = true; }
            else if (k === Qt.Key_Return || k === Qt.Key_Enter || k === Qt.Key_Space) {
                if (screen === "demo") startPlay(); else menu.activate();
                event.accepted = true;
            }
            return;
        }
        if (k === Qt.Key_B) { if (!event.isAutoRepeat) input.bomb = true; event.accepted = true; return; }
        if (setKey(k, true)) event.accepted = true;
    }

    function keyReleased(event: var): void {
        if (event.isAutoRepeat) return;
        if (setKey(event.key, false)) event.accepted = true;
    }

    // a hidden item pauses a running game (a lost focus does too, see keys)
    onShownChanged: if (!shown) pause()

    // static pictures follow the screen, the page, the language and the result
    function repaintStatic(): void {
        screenCanvas.requestPaint();
        leftPanel.requestPaint();
        rightPanel.requestPaint();
    }
    onScreenChanged: { menu.index = 0; screenCanvas.requestPaint(); }
    onCodexPageChanged: screenCanvas.requestPaint()
    onTxtChanged: repaintStatic()
    onResultChanged: screenCanvas.requestPaint()
    onArenaScaleChanged: repaintStatic()

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
        anchors.fill: parent
        color: "#0B0D18"
        Rectangle { anchors { left: parent.left; right: parent.right; top: parent.top } height: 1; color: "#FFFFFF" }
        Rectangle { anchors { left: parent.left; top: parent.top; bottom: parent.bottom } width: 1; color: "#FFFFFF" }
        Rectangle { anchors { left: parent.left; right: parent.right; bottom: parent.bottom } height: 1; color: "#000000" }
        Rectangle { anchors { right: parent.right; top: parent.top; bottom: parent.bottom } width: 1; color: "#000000" }
    }

    Rectangle {
        id: titleBar
        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 1 }
        height: 20
        color: "#111111"
        Text {
            anchors { left: parent.left; leftMargin: 8; verticalCenter: parent.verticalCenter }
            text: "NeuroDefender — Nanobot Crisis"
            color: "#FFFFFF"
            font.bold: true
            font.pixelSize: 12
        }
        Row {
            anchors { right: parent.right; rightMargin: 2; verticalCenter: parent.verticalCenter }
            spacing: 2
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

    // ------------------------------------------------------------------ cabinet

    Item {
        id: cabinet
        anchors { left: parent.left; right: parent.right; top: titleBar.bottom; bottom: parent.bottom; margins: 4 }

        Row {
            anchors.centerIn: parent
            spacing: 4

            // left panel: brain emblem, NEURO DEFENDER, the nine-sector map
            Item {
                visible: game.panels
                width: game.panelW * game.arenaScale
                height: game.screenH * game.arenaScale
                Canvas {
                    id: leftPanel
                    width: game.panelW
                    height: game.screenH
                    scale: game.arenaScale
                    transformOrigin: Item.TopLeft
                    smooth: false
                    onPaint: {
                        const ctx = getContext("2d");
                        Art.drawLeftPanel(ctx, { sector: Math.max(0, game.screen === "title" ? 0 : game.g.sector),
                                                 width: width, height: height,
                                                 labels: { map: game.txt.mapTitle, sectors: game.txt.sectors } });
                    }
                }
            }

            // the game screen
            Item {
                id: view
                width: game.screenW * game.arenaScale
                height: game.screenH * game.arenaScale
                clip: true

                // neural backdrop: painted once per sector, scrolled for free
                Item {
                    x: 0; y: Render.HUD_TOP * game.arenaScale
                    width: parent.width; height: Config.ARENA_H * game.arenaScale
                    clip: true
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
                }

                Canvas {
                    id: arena
                    width: game.screenW
                    height: game.screenH
                    scale: game.arenaScale
                    transformOrigin: Item.TopLeft
                    smooth: false
                    renderStrategy: Canvas.Cooperative
                    onPaint: {
                        const t0 = Date.now();
                        game.lastPaint = t0;
                        const ctx = getContext("2d");
                        try {
                            if (game.screen === "title")
                                Render.drawTitle(ctx, game.g.time, game.frame,
                                                 { title: "NEURODEFENDER", subtitle: game.txt.subtitle, tagline: game.txt.tagline });
                            else
                                Render.drawFrame(ctx, game.g, game.frame, game.lowFx || game.g.lowFx,
                                                 game.hud, game.bannerLines, game.bannerStyle);
                        } catch (err) {
                            game.fail("paint: " + err);
                            return;
                        }
                        game.avgPaintMs += ((Date.now() - t0) - game.avgPaintMs) * 0.05;
                    }
                }

                // still pictures over the game: pause veil, results, help, database
                Canvas {
                    id: screenCanvas
                    width: game.screenW
                    height: game.screenH
                    scale: game.arenaScale
                    transformOrigin: Item.TopLeft
                    smooth: false
                    visible: ["paused", "over", "help", "codex"].indexOf(game.screen) >= 0
                    onPaint: {
                        const ctx = getContext("2d");
                        ctx.clearRect(0, 0, width, height);
                        if (game.seenVersion < 0) return;            // dependency: re-read g.seen
                        switch (game.screen) {
                        case "paused": Art.drawPause(ctx, game.txt); break;
                        case "over": Art.drawResult(ctx, game.txt, game.result); break;
                        case "help": Art.drawHelp(ctx, game.txt); break;
                        case "codex": Art.drawCodex(ctx, game.txt, game.codexPage, game.g.seen, Render.sprite); break;
                        }
                    }
                }

                // keyboard and mouse: only while this item has the focus
                Item {
                    id: keys
                    objectName: "neurodefenderKeys"
                    x: 0; y: Render.HUD_TOP * game.arenaScale
                    width: parent.width; height: Config.ARENA_H * game.arenaScale
                    focus: true
                    Keys.onPressed: (event) => game.keyPressed(event)
                    Keys.onReleased: (event) => game.keyReleased(event)
                    onActiveFocusChanged: if (!activeFocus) game.pause()
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
                }

                // the menu of the current screen (above the click area)
                PixelMenu {
                    id: menu
                    unit: game.arenaScale
                    blink: game.frame
                    items: game.active ? game.menuItems() : []
                    anchors.horizontalCenter: parent.horizontalCenter
                    y: (game.screen === "title" ? 84 : (game.screen === "paused" ? 112
                        : (game.screen === "over" ? 148 : (game.screen === "demo" ? 236 : 245)))) * game.arenaScale
                    visible: game.screen !== "play"
                    onActivated: (act) => { game.menuAction(act); keys.forceActiveFocus(); }
                }

                // title footer: the installation note and the record
                PixelText {
                    visible: game.screen === "title"
                    anchors { horizontalCenter: parent.horizontalCenter; top: parent.top; topMargin: 170 * game.arenaScale }
                    text: game.hudBest > 0 ? game.txt.hiScore + " " + game.hudBest : game.txt.menuHint
                    color: "#FFD166"
                    unit: game.arenaScale
                }

                // demo caption
                PixelText {
                    visible: game.screen === "demo"
                    anchors { horizontalCenter: parent.horizontalCenter; top: parent.top; topMargin: 190 * game.arenaScale }
                    text: game.txt.demo
                    px: 2
                    gradient: (game.frame >> 4) % 2 ? "gold" : "chrome"
                    unit: game.arenaScale
                }
                PixelText {
                    visible: game.screen === "demo"
                    anchors { horizontalCenter: parent.horizontalCenter; top: parent.top; topMargin: 216 * game.arenaScale }
                    text: game.txt.pressEnter
                    color: "#FFFFFF"
                    unit: game.arenaScale
                }

                // new record on the results
                PixelText {
                    visible: game.screen === "over" && game.newRecord
                    anchors { horizontalCenter: parent.horizontalCenter; top: parent.top; topMargin: 130 * game.arenaScale }
                    text: game.txt.newRecord
                    color: (game.frame >> 3) % 2 ? "#FFD166" : "#FFFFFF"
                    unit: game.arenaScale
                }

                // achievement toast
                Rectangle {
                    visible: game.toastTime > 0
                    anchors { right: parent.right; top: parent.top; margins: 16 * game.arenaScale }
                    width: toast.width + 8 * game.arenaScale
                    height: toast.height + 6 * game.arenaScale
                    color: "#1A1240"
                    border.color: "#FFD166"
                    border.width: Math.max(1, Math.round(game.arenaScale))
                    PixelText {
                        id: toast
                        anchors.centerIn: parent
                        text: game.toastText
                        color: "#FFD166"
                        unit: game.arenaScale
                    }
                }
            }

            // right panel: the capsules and the keys
            Item {
                visible: game.panels
                width: game.panelW * game.arenaScale
                height: game.screenH * game.arenaScale
                Canvas {
                    id: rightPanel
                    width: game.panelW
                    height: game.screenH
                    scale: game.arenaScale
                    transformOrigin: Item.TopLeft
                    smooth: false
                    onPaint: {
                        const ctx = getContext("2d");
                        Art.drawRightPanel(ctx, { width: width, height: height,
                                                  labels: { capsules: game.txt.pickupsTitle, short: game.txt.pickupShort,
                                                            keys: game.txt.panelKeys } });
                    }
                }
            }
        }
    }
}
