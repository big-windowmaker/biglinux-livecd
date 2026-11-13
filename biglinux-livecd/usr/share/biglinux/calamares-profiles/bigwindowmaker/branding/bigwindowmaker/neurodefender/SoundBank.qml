/* NeuroDefender: optional sound effects.
 *
 * Loaded by GameRoot only after the player turns the sound on, so QtMultimedia
 * is never touched in a silent installation, and a missing module or audio
 * device just leaves the game silent (the Loader reports the error).
 * The WAV files are synthesised by tools/neurodefender-sfx.py.
 */
pragma ComponentBehavior: Bound

import QtQuick
import QtMultimedia

Item {
    id: bank

    property real volume: 0.35
    readonly property var names: ["shot", "laser", "pop", "boom", "powerup", "hurt", "shield",
                                  "teleport", "evolve", "bomb", "gameover", "victory"]
    property var effects: ({})
    property var lastPlayed: ({})

    function play(name: string): void {
        const fx = effects[name];
        if (!fx)
            return;
        // the same sound at most every 45 ms: rapid fire stays a buzz, not a wall
        const now = Date.now();
        if (now - (lastPlayed[name] || 0) < 45)
            return;
        lastPlayed[name] = now;
        fx.play();
    }

    function stopAll(): void {
        for (const k in effects)
            effects[k].stop();
    }

    Instantiator {
        model: bank.names
        delegate: SoundEffect {
            required property string modelData
            source: Qt.resolvedUrl("sfx/" + modelData + ".wav")
            volume: bank.volume
        }
        onObjectAdded: (index, object) => { bank.effects[bank.names[index]] = object; }
    }

    Component.onDestruction: stopAll()
}
