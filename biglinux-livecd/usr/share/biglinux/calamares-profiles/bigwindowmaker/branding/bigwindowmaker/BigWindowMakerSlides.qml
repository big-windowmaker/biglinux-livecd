/* Big WindowMaker: what the installer shows while the system is installed.
 *
 * The NeuroDefender arcade game (neurodefender/GameRoot.qml), loaded only when
 * the installation step starts (Calamares slideshow API 2: onActivate /
 * onLeave). The installation never waits for it: Calamares draws its real
 * progress bar and status line below this area.
 *
 * Fallback: the classic slides below — a gray OPENSTEP panel with a raised
 * border, a title bar like Window Maker's, and the logo. They show while the
 * game loads, if it cannot be loaded, or if it stops with an error. Colors
 * come from the active Qt palette (the Kvantum OPENSTEP theme of the live
 * session), so the light and the dark themes both read well. No timers run
 * while the page is not shown.
 */
pragma ComponentBehavior: Bound

import QtQuick

Rectangle {
    id: root

    width: parent ? parent.width : 800
    height: parent ? parent.height : 440
    color: palette.window

    property bool activatedInCalamares: false
    property int current: 0
    readonly property bool portuguese: Qt.locale().name.indexOf("pt") === 0
    // the game, unless it failed; the slides otherwise
    property bool gameFailed: false
    readonly property bool gameShown: !gameFailed && game.status === Loader.Ready && game.item !== null

    SystemPalette { id: palette; colorGroup: SystemPalette.Active }

    readonly property var slides: [
        { pt: ["Bem-vindo ao Big WindowMaker",
               "O Window Maker clássico, com o Dock, o Clip e os menus que você conhece, no X11 e no Wayland."],
          en: ["Welcome to Big WindowMaker",
               "The classic Window Maker, with the Dock, the Clip and the menus you know, on X11 and Wayland."] },
        { pt: ["Dock e Clip",
               "Arraste aplicativos para o Dock. O Clip guarda as áreas de trabalho e os dockapps mostram o sistema."],
          en: ["Dock and Clip",
               "Drag applications to the Dock. The Clip holds the workspaces, and dockapps show the system."] },
        { pt: ["Aparência OPENSTEP",
               "Temas claro e escuro iguais em aplicativos GTK e Qt, com bordas retas, relevos e barras de título clássicas."],
          en: ["OPENSTEP look",
               "Light and dark themes alike in GTK and Qt applications, with straight borders, relief and classic title bars."] },
        { pt: ["Leve e rápido",
               "A sessão Wayland usa o wlmaker; a sessão X11, o Window Maker. Os dois gastam pouca memória."],
          en: ["Light and fast",
               "The Wayland session runs wlmaker; the X11 session, Window Maker. Both use little memory."] },
        { pt: ["Baseado no BigLinux",
               "Big WindowMaker usa a base, os programas e o suporte do BigLinux."],
          en: ["Based on BigLinux",
               "Big WindowMaker uses the base, the programs and the support of BigLinux."] }
    ]

    function onActivate() {
        activatedInCalamares = true;
        current = 0;
        if (game.item) game.item.activate();
    }
    function onLeave() {
        activatedInCalamares = false;
        if (game.item) game.item.deactivate();
    }

    // Loaded on the first activation, in the background: the installer's
    // start-up never parses the game.
    Loader {
        id: game
        objectName: "neurodefenderLoader"
        anchors.fill: parent
        focus: true                      // keyboard users reach the arena with Tab, no click needed
        z: 1
        active: root.activatedInCalamares || status === Loader.Ready
        asynchronous: true
        source: "neurodefender/GameRoot.qml"
        visible: root.gameShown
        onStatusChanged: {
            if (status === Loader.Error) {
                console.warn("NeuroDefender could not be loaded; showing the slides");
                root.gameFailed = true;
            }
        }
        onLoaded: {
            item.failure.connect(function() { root.gameFailed = true; });
            if (root.activatedInCalamares) item.activate();
        }
    }

    Timer {
        objectName: "slidesTimer"
        interval: 7000
        repeat: true
        running: root.activatedInCalamares && root.visible && !root.gameShown
        onTriggered: root.current = (root.current + 1) % root.slides.length
    }

    // The panel: Window Maker's relief (light top-left, dark bottom-right).
    Rectangle {
        id: panel
        visible: !root.gameShown
        anchors.centerIn: parent
        width: Math.min(parent.width - 48, 640)
        height: Math.min(parent.height - 32, 360)
        color: palette.button
        border.width: 0

        Rectangle { anchors { left: parent.left; right: parent.right; top: parent.top } height: 1; color: palette.light }
        Rectangle { anchors { left: parent.left; top: parent.top; bottom: parent.bottom } width: 1; color: palette.light }
        Rectangle { anchors { left: parent.left; right: parent.right; bottom: parent.bottom } height: 1; color: palette.shadow }
        Rectangle { anchors { right: parent.right; top: parent.top; bottom: parent.bottom } width: 1; color: palette.shadow }

        // Title bar, as the focused window's in Window Maker.
        Rectangle {
            id: titleBar
            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 1 }
            height: 22
            color: "#000000"
            Text {
                anchors.centerIn: parent
                text: "Big WindowMaker"
                color: "#ffffff"
                font.bold: true
                font.pixelSize: 13
            }
        }

        Row {
            anchors { left: parent.left; right: parent.right; top: titleBar.bottom; bottom: dots.top; margins: 20 }
            spacing: 24

            Image {
                anchors.verticalCenter: parent.verticalCenter
                width: Math.min(140, panel.height * 0.42)
                height: width
                source: "logo.svg"
                sourceSize.width: width
                sourceSize.height: height
                fillMode: Image.PreserveAspectFit
                smooth: true
            }

            Column {
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - 164
                spacing: 12

                Text {
                    width: parent.width
                    text: (root.portuguese ? root.slides[root.current].pt : root.slides[root.current].en)[0]
                    color: palette.buttonText
                    font.italic: true
                    font.pixelSize: 24
                    wrapMode: Text.WordWrap
                }
                Rectangle { width: parent.width; height: 1; color: palette.shadow }
                Text {
                    width: parent.width
                    text: (root.portuguese ? root.slides[root.current].pt : root.slides[root.current].en)[1]
                    color: palette.buttonText
                    font.pixelSize: 15
                    wrapMode: Text.WordWrap
                    lineHeight: 1.15
                }
            }
        }

        // Position: small square buttons, sunken for the current slide.
        Row {
            id: dots
            anchors { horizontalCenter: parent.horizontalCenter; bottom: parent.bottom; bottomMargin: 12 }
            spacing: 6
            Repeater {
                model: root.slides.length
                Rectangle {
                    id: dot
                    required property int index
                    width: 10; height: 10
                    color: dot.index === root.current ? palette.dark : palette.button
                    border.color: palette.shadow
                    border.width: 1
                    MouseArea { anchors.fill: parent; onClicked: root.current = dot.index }
                }
            }
        }
    }
}
