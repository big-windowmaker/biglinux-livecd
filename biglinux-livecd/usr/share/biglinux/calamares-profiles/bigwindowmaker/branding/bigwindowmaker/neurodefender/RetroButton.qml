/* NeuroDefender: a square OPENSTEP button (raised relief, sunken when pressed).
 * Keyboard: Tab reaches it, Enter or Space activates it.
 */
import QtQuick

Rectangle {
    id: button

    property string text: ""
    property bool compact: false
    property bool highlighted: false
    signal clicked()

    implicitWidth: compact ? 22 : Math.max(150, label.implicitWidth + 24)
    implicitHeight: compact ? 18 : 24
    color: area.pressed ? "#8E8A8E" : (highlighted ? "#C9C5C9" : "#AEAAAE")
    activeFocusOnTab: true

    Keys.onPressed: (event) => {
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
            event.accepted = true;
            button.clicked();
        }
    }

    // relief: light top-left, dark bottom-right (swapped while pressed)
    Rectangle { anchors { left: parent.left; right: parent.right; top: parent.top } height: 1; color: area.pressed ? "#555555" : "#FFFFFF" }
    Rectangle { anchors { left: parent.left; top: parent.top; bottom: parent.bottom } width: 1; color: area.pressed ? "#555555" : "#FFFFFF" }
    Rectangle { anchors { left: parent.left; right: parent.right; bottom: parent.bottom } height: 1; color: area.pressed ? "#FFFFFF" : "#000000" }
    Rectangle { anchors { right: parent.right; top: parent.top; bottom: parent.bottom } width: 1; color: area.pressed ? "#FFFFFF" : "#000000" }
    Rectangle { anchors { left: parent.left; right: parent.right; bottom: parent.bottom; margins: 1 } height: 1; color: "#555555"; visible: !area.pressed }

    Text {
        id: label
        anchors.centerIn: parent
        anchors.horizontalCenterOffset: area.pressed ? 1 : 0
        anchors.verticalCenterOffset: area.pressed ? 1 : 0
        text: button.text
        color: "#000000"
        font.family: "monospace"
        font.bold: true
        font.pixelSize: button.compact ? 11 : 12
    }

    // keyboard focus: a dotted frame, as in classic toolkits
    Rectangle {
        anchors.fill: parent
        anchors.margins: 3
        color: "transparent"
        border.color: "#000000"
        border.width: 1
        visible: button.activeFocus
        opacity: 0.6
    }

    MouseArea {
        id: area
        anchors.fill: parent
        onClicked: button.clicked()
    }
}
