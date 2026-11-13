/* NeuroDefender: an arcade menu in the pixel font. The chosen line is gold
 * between blinking arrows; the mouse picks a line by hovering and runs it
 * with a click, the keyboard with the arrows and Enter (GameRoot routes
 * the keys here).
 */
pragma ComponentBehavior: Bound

import QtQuick

Column {
    id: menu

    // [{ label, act }]
    property var items: []
    property int index: 0
    property real unit: 1
    property int blink: 0                 // the game's frame counter
    signal activated(string act)

    function step(delta: int): void {
        if (items.length > 0) index = (index + delta + items.length) % items.length;
    }
    function activate(): void {
        if (index >= 0 && index < items.length) activated(items[index].act);
    }

    spacing: 3 * unit
    onItemsChanged: if (index >= items.length) index = 0

    Repeater {
        model: menu.items
        Item {
            id: line
            required property var modelData
            required property int index
            readonly property bool chosen: line.index === menu.index
            width: label.width + 24 * menu.unit
            height: label.height
            anchors.horizontalCenter: parent.horizontalCenter

            // a dark plate under the chosen line
            Rectangle {
                anchors.fill: parent
                anchors.margins: -2 * menu.unit
                visible: line.chosen
                color: "#2A1E5C"
                border.color: "#A855F7"
                border.width: Math.max(1, Math.round(menu.unit))
            }
            PixelText {
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                visible: line.chosen && (menu.blink >> 3) % 2 === 0
                text: ">"
                color: "#FFD166"
                unit: menu.unit
            }
            PixelText {
                id: label
                anchors.centerIn: parent
                text: line.modelData.label
                color: line.chosen ? "#FFD166" : "#FFFFFF"
                unit: menu.unit
            }
            PixelText {
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                visible: line.chosen && (menu.blink >> 3) % 2 === 0
                text: "<"
                color: "#FFD166"
                unit: menu.unit
            }
            MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                onEntered: menu.index = line.index
                onClicked: { menu.index = line.index; menu.activate(); }
            }
        }
    }
}
