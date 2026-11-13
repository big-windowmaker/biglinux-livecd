// Opens the installer's slideshow (with NeuroDefender) in a normal window,
// the size Calamares gives it, and calls onActivate() as Calamares does at
// the installation step. For testing only:
//
//     /usr/lib/qt6/bin/qml tools/neurodefender-play.qml
import QtQuick
import QtQuick.Window

Window {
    width: 826
    height: 470
    visible: true
    title: "NeuroDefender (teste do instalador)"

    Loader {
        anchors.fill: parent
        focus: true                      // Calamares makes the slideshow the root item
        source: Qt.resolvedUrl("../biglinux-livecd/usr/share/biglinux/calamares-profiles/bigwindowmaker/branding/bigwindowmaker/BigWindowMakerSlides.qml")
        onLoaded: item.onActivate()
    }
}
