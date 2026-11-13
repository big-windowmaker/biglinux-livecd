/* NeuroDefender: text in the game's 5x7 pixel font, at the same pixel size
 * as the arena ("unit" screen pixels per arena pixel). Painted only when
 * the text changes.
 */
import QtQuick
import "art.js" as Art

Item {
    id: root

    property string text: ""
    property string color: "#FFFFFF"
    property string shadow: "#05060C"
    property int px: 1                    // font pixel size, in arena pixels
    property real unit: 1
    property string gradient: ""          // "chrome", "gold", "blood", "mint"

    readonly property int logicalW: Math.max(1, Art.width(text, px) + px)
    readonly property int logicalH: 10 * px + px

    width: logicalW * unit
    height: logicalH * unit

    onTextChanged: canvas.requestPaint()
    onColorChanged: canvas.requestPaint()
    onGradientChanged: canvas.requestPaint()

    Canvas {
        id: canvas
        width: root.logicalW
        height: root.logicalH
        scale: root.unit
        transformOrigin: Item.TopLeft
        smooth: false
        onPaint: {
            const ctx = getContext("2d");
            ctx.clearRect(0, 0, width, height);
            const rows = { chrome: Art.CHROME, gold: Art.GOLD, blood: Art.BLOOD, mint: Art.MINT }[root.gradient];
            Art.text(ctx, root.text, 0, 0, root.color, { scale: root.px, shadow: root.shadow, rows: rows });
        }
    }
}
