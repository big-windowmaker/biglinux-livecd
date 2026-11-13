#!/usr/bin/env python3
"""Synthesises NeuroDefender's sound effects (8-bit, 22050 Hz, mono WAV).

Every sound is made here from square waves, frequency sweeps and noise, in
the spirit of a 90s Sound Blaster: no recorded or third-party audio. The
output is deterministic (seeded noise), so the WAV files in the branding
folder can be checked against this script:

    tools/neurodefender-sfx.py            # write the files
    tools/neurodefender-sfx.py --check    # exit 1 if they differ
"""

from __future__ import annotations

import io
import math
import sys
import wave
from pathlib import Path

RATE = 22050
OUT = (
    Path(__file__).resolve().parents[1]
    / "biglinux-livecd/usr/share/biglinux/calamares-profiles/bigwindowmaker"
    / "branding/bigwindowmaker/neurodefender/sfx"
)


class Noise:
    """Linear congruential noise: the same bytes on every run."""

    def __init__(self, seed: int) -> None:
        self.state = seed

    def next(self) -> float:
        self.state = (self.state * 1103515245 + 12345) & 0x7FFFFFFF
        return self.state / 0x3FFFFFFF - 1.0


def square(phase: float, duty: float = 0.5) -> float:
    return 1.0 if (phase % 1.0) < duty else -1.0


def envelope(i: int, n: int, attack: float = 0.01, release: float = 0.6) -> float:
    t = i / n
    if t < attack:
        return t / attack
    return max(0.0, 1.0 - (t - attack) / max(1e-6, 1.0 - attack)) ** (1 / release)


def sweep(f0: float, f1: float, dur: float, duty: float = 0.5, vol: float = 0.6,
          vibrato: float = 0.0) -> list[float]:
    n = int(RATE * dur)
    out, phase = [], 0.0
    for i in range(n):
        t = i / n
        f = f0 * (f1 / f0) ** t
        if vibrato:
            f *= 1 + vibrato * math.sin(2 * math.pi * 30 * i / RATE)
        phase += f / RATE
        out.append(square(phase, duty) * vol * envelope(i, n))
    return out


def noise(dur: float, vol: float, seed: int, lowpass: float = 0.5, pitch_drop: bool = True) -> list[float]:
    n = int(RATE * dur)
    gen, out, last, hold, value = Noise(seed), [], 0.0, 0, 0.0
    for i in range(n):
        # sample-and-hold noise: the hold grows, so the rumble deepens
        step = 1 + int((i / n) * 12) if pitch_drop else 2
        if hold <= 0:
            value, hold = gen.next(), step
        hold -= 1
        last += (value - last) * lowpass
        out.append(last * vol * envelope(i, n, 0.005, 0.8))
    return out


def tones(notes: list[tuple[float, float]], duty: float = 0.5, vol: float = 0.5) -> list[float]:
    out: list[float] = []
    for freq, dur in notes:
        n = int(RATE * dur)
        phase = 0.0
        for i in range(n):
            phase += freq / RATE
            out.append(square(phase, duty) * vol * envelope(i, n, 0.02, 1.5))
    return out


def mix(*tracks: list[float]) -> list[float]:
    n = max(len(t) for t in tracks)
    return [sum(t[i] for t in tracks if i < len(t)) for i in range(n)]


SOUNDS = {
    "shot": lambda: sweep(1400, 500, 0.07, 0.25, 0.35),
    "laser": lambda: sweep(2200, 1800, 0.09, 0.5, 0.25, vibrato=0.08),
    "pop": lambda: mix(noise(0.16, 0.5, 11, 0.6), sweep(500, 120, 0.12, 0.5, 0.25)),
    "boom": lambda: mix(noise(0.55, 0.7, 23, 0.35), sweep(180, 40, 0.5, 0.5, 0.35)),
    "powerup": lambda: tones([(523, 0.05), (659, 0.05), (784, 0.05), (1047, 0.09)], 0.25, 0.4),
    "hurt": lambda: mix(sweep(300, 90, 0.25, 0.3, 0.45), noise(0.2, 0.3, 31, 0.5)),
    "shield": lambda: sweep(600, 1500, 0.12, 0.5, 0.3, vibrato=0.05),
    "teleport": lambda: mix(sweep(300, 2400, 0.14, 0.5, 0.3), sweep(2400, 300, 0.14, 0.25, 0.15)),
    "evolve": lambda: tones([(196, 0.09), (233, 0.09), (277, 0.09), (330, 0.18)], 0.5, 0.4),
    "bomb": lambda: mix(noise(0.7, 0.6, 47, 0.25), sweep(900, 60, 0.6, 0.5, 0.35)),
    "gameover": lambda: tones([(392, 0.18), (330, 0.18), (262, 0.18), (196, 0.5)], 0.5, 0.45),
    "victory": lambda: tones([(523, 0.12), (659, 0.12), (784, 0.12), (1047, 0.12),
                              (784, 0.12), (1047, 0.4)], 0.25, 0.45),
}


def encode(samples: list[float]) -> bytes:
    data = bytes(max(0, min(255, int(128 + 127 * max(-1.0, min(1.0, s))))) for s in samples)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(1)
        w.setframerate(RATE)
        w.writeframes(data)
    return buf.getvalue()


def main(argv: list[str]) -> int:
    check = "--check" in argv
    OUT.mkdir(parents=True, exist_ok=True)
    stale = []
    for name, make in SOUNDS.items():
        blob = encode(make())
        path = OUT / f"{name}.wav"
        if check:
            if not path.is_file() or path.read_bytes() != blob:
                stale.append(path.name)
        else:
            path.write_bytes(blob)
    if check and stale:
        print("out of date:", ", ".join(stale), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
