// NeuroDefender inside the slideshow, as Calamares drives it (API 2):
// QT_QPA_PLATFORM=offscreen qmltestrunner -input tests/neurodefender/tst_slideshow.qml
import QtQuick
import QtTest

Item {
    id: host
    width: 810
    height: 470

    Component {
        id: slidesComponent
        // the real entry point of the branding, at the size Calamares gives it
        Loader {
            focus: true                         // Calamares makes the slideshow the root item
            width: host.width
            height: host.height
            source: Qt.resolvedUrl("../../biglinux-livecd/usr/share/biglinux/calamares-profiles/bigwindowmaker/branding/bigwindowmaker/BigWindowMakerSlides.qml")
        }
    }

    TestCase {
        id: tc
        name: "NeuroDefenderSlideshow"
        when: windowShown

        property var holder: null
        property var slides: null

        function init() {
            holder = createTemporaryObject(slidesComponent, host);
            tryVerify(() => holder.status === Loader.Ready, 5000);
            slides = holder.item;
        }

        function gameLoader() { return findChild(slides, "neurodefenderLoader"); }
        function game() { return gameLoader().item; }
        function loop() { return findChild(game(), "neurodefenderLoop"); }

        function activate() {
            slides.onActivate();
            tryVerify(() => game() !== null, 5000, "the game loads on activation");
            tryVerify(() => slides.gameShown, 2000);
        }

        function test_01_nothing_runs_before_activation() {
            wait(300);
            verify(!slides.activatedInCalamares);
            compare(gameLoader().active, false, "the game is not even loaded at start-up");
            compare(findChild(slides, "slidesTimer").running, false);
        }

        function test_02_activation_shows_the_title_and_runs_the_loop() {
            activate();
            compare(game().screen, "title");
            verify(loop().running);
            compare(findChild(game(), "neurodefenderSound").active, false, "sound is off by default");
            compare(findChild(slides, "slidesTimer").running, false, "the slides rest behind the game");
        }

        function test_03_keyboard_plays() {
            activate();
            const keys = findChild(game(), "neurodefenderKeys");
            mouseClick(keys, 20, 20);                   // the click gives the arena the keyboard
            verify(keys.activeFocus);
            keyClick(Qt.Key_Return);
            compare(game().screen, "play");
            tryVerify(() => game().g.phase !== "sectorIntro", 6000);   // the sector banner: no shooting yet
            const x0 = game().g.p.x;
            keyPress(Qt.Key_Right);
            wait(400);
            keyRelease(Qt.Key_Right);
            verify(game().g.p.x > x0 + 20, "moved right: " + (game().g.p.x - x0));
            const shots = game().g.stats.shots;
            keyPress(Qt.Key_Space);
            wait(500);
            keyRelease(Qt.Key_Space);
            verify(game().g.stats.shots > shots + 1, "held fire shoots repeatedly");
            keyClick(Qt.Key_P);
            compare(game().screen, "paused");
            tryVerify(() => !loop().running, 500, "pause stops the loop");
            keyClick(Qt.Key_P);
            compare(game().screen, "play");
            verify(loop().running);
        }

        function test_04_mouse_fires_and_bombs() {
            activate();
            game().startPlay();
            tryVerify(() => game().g.phase !== "sectorIntro", 6000);   // no shooting during the sector banner
            const keys = findChild(game(), "neurodefenderKeys");
            const shots = game().g.stats.shots;
            mousePress(keys, keys.width / 2, keys.height - 10, Qt.LeftButton);
            wait(500);
            mouseRelease(keys, keys.width / 2, keys.height - 10, Qt.LeftButton);
            verify(game().g.stats.shots > shots, "left button fires");
            const bombs = game().g.p.bombs;
            mouseClick(keys, keys.width / 2, keys.height / 2, Qt.RightButton);
            wait(100);
            compare(game().g.p.bombs, bombs - 1, "right button drops a bomb");
        }

        function test_05_leave_stops_everything() {
            activate();
            game().startPlay();
            game().soundOn = true;
            wait(300);
            slides.onLeave();
            compare(slides.activatedInCalamares, false);
            compare(game().active, false);
            compare(game().screen, "paused");
            compare(loop().running, false, "no game timer after onLeave");
            compare(game().soundOn, false);
            compare(findChild(game(), "neurodefenderSound").active, false, "audio unloaded");
            compare(findChild(slides, "slidesTimer").running, false);
            // a frame that would have come later changes nothing
            const t = game().g.time;
            wait(300);
            compare(game().g.time, t);
        }

        function test_06_focus_loss_pauses() {
            activate();
            game().startPlay();
            wait(200);
            const keys = findChild(game(), "neurodefenderKeys");
            verify(keys.activeFocus);
            keys.focus = false;
            compare(game().screen, "paused");
        }

        function test_07_a_failing_game_falls_back_to_the_slides() {
            activate();
            game().fail("test failure");
            verify(!slides.gameShown);
            verify(!loop().running);
            verify(findChild(slides, "slidesTimer").running, "the slides take over");
        }

        function test_08_demo_starts_by_itself_and_returns() {
            activate();
            game().titleIdle = 100;
            tryVerify(() => game().screen === "demo", 1000);
            tryVerify(() => game().g.stats.shots > 0, 8000, "the demo pilot plays");
            keyClick(Qt.Key_Return);
            compare(game().screen, "play", "Enter takes over from the demo");
        }

        function test_09_layout_fits_small_areas() {
            for (const size of [[810, 470], [640, 360], [520, 300], [1000, 600]]) {
                host.width = size[0]; host.height = size[1];
                activate();
                const gm = game();
                verify(gm.arenaScale > 0);
                verify(320 * gm.arenaScale + 4 <= gm.width, "arena width fits " + size);
                verify(gm.screenH * gm.arenaScale + 8 + 20 <= gm.height, "screen with HUD fits " + size);
                slides.onLeave();
            }
            host.width = 810; host.height = 470;
        }

        function test_10_help_and_database() {
            activate();
            game().openHelp();
            compare(game().screen, "help");
            verify(!loop().running, "help screen is static");
            game().closeHelp();
            compare(game().screen, "title");
            game().screen = "codex";
            verify(!loop().running);
        }

        function test_11_language_follows_the_installer() {
            activate();
            const portuguese = Qt.locale().name.indexOf("pt") === 0;
            compare(game().txt.start, portuguese ? "INICIAR JOGO" : "START GAME");
        }
    }
}
