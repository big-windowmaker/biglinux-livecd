.pragma library
.import "config.js" as C
.import "engine.js" as E
.import "art.js" as Art
// NeuroDefender: drawing. Everything is original pixel art defined here as
// text rows; no image files. Sprites are rasterised once per colour into
// ImageData and blitted with drawImage; when a context cannot blit image
// data, the same rows are drawn as horizontal runs with fillRect.
//
// The game canvas is 320 x 264: a 12-pixel HUD strip, the 240-pixel arena,
// another 12-pixel strip. The QML item scales it up with smoothing off, so
// every pixel stays a crisp block.

var HUD_TOP = 12;

// Palette letters: a/b = sector colours (e = a darker a), others are fixed.
var FIXED = {
    w: "#FFFFFF", k: "#05060C", c: "#00E5FF", p: "#A855F7", g: "#39FF88",
    r: "#FF405C", y: "#FFD166", s: "#AEAAAE", d: "#2A2F45", o: "#FF9A3D",
    n: "#1B2A6B", m: "#FF6EC7", l: "#B8FBFF", v: "#6A2FB0", h: "#8A5A12"
};

var SPR = {
    // the ship grows with its weapon: pulse, twin (side cannons), triple
    // (swept golden wings and three barrels)
    ship0: [
        "......w......",
        ".....lwl.....",
        ".....cwc.....",
        "....ncwcn....",
        "....clwlc....",
        "...nclwlcn...",
        "..pnccwccnp..",
        ".ppncclccnpp.",
        "pvpncc.ccnpvp",
        "pv.nc...cn.vp",
        "p...k...k...p"
    ],
    ship1: [
        "........w........",
        ".......lwl.......",
        ".......cwc.......",
        "..w...ncwcn...w..",
        "..c...clwlc...c..",
        "..l..nclwlcn..l..",
        ".pcpnnccwccnnpcp.",
        "ppcppncclccnppcpp",
        "pvcvpncc.ccnpvcvp",
        "pv.v.nc...cn.v.vp",
        "p..k..k...k..k..p"
    ],
    ship2: [
        ".........w.........",
        "........lwl........",
        "...w....cwc....w...",
        "...l...ncwcn...l...",
        "...c...clwlc...c...",
        "y..c..nclwlcn..c..y",
        "yy.cpnnccwccnnpc.yy",
        "yypcppncclccnppcpyy",
        "yhpcvpncc.ccnpvcphy",
        "yhpvvpnc...cnpvvphy",
        "yh.v..nk...kn..v.hy",
        "y..k...........k..y"
    ],
    drone0: [
        "..eaaae..",
        ".eabbbae.",
        "eawkakwae",
        "aaaaaaaaa",
        ".eaeaeae.",
        ".a.a.a.a.",
        "a..e.e..a"
    ],
    drone1: [
        "..eaaae..",
        ".eabbbae.",
        "eawkakwae",
        "aaaaaaaaa",
        ".eaeaeae.",
        ".a.a.a.a.",
        ".a.e.e.a."
    ],
    brute0: [
        "...eaaae...",
        ".eaabbbaae.",
        "eabwkakwbae",
        "aaaaaaaaaaa",
        "abeaaaaaeba",
        "aaeaeaeaeaa",
        ".a.a...a.a.",
        "a..e...e..a"
    ],
    brute1: [
        "...eaaae...",
        ".eaabbbaae.",
        "eabwkakwbae",
        "aaaaaaaaaaa",
        "abeaaaaaeba",
        "aaeaeaeaeaa",
        ".a.a...a.a.",
        ".a.e...e.a."
    ],
    mite0: [
        ".eae.",
        "awbwa",
        "eaaae",
        "a.a.a"
    ],
    mite1: [
        ".eae.",
        "awbwa",
        "eaaae",
        ".a.a."
    ],
    turret: [
        "..ddd..",
        ".dabad.",
        "dabbbad",
        "dabwbad",
        ".daaad.",
        "..dad..",
        "...w..."
    ],
    gen: [
        "...a...",
        "..aba..",
        ".abwba.",
        "abwwwba",
        ".abwba.",
        "..aba..",
        "...a..."
    ],
    // capsule frame; the letter is drawn on top with the pixel font
    capsule: [
        ".kkkkk.",
        "kwwwwwk",
        "kw...wk",
        "kw...wk",
        "kw...wk",
        "kw...wk",
        "kwwwwwk",
        ".kkkkk."
    ]
};

// 3x5 pixel font (only what the arena prints)
var FONT = {
    "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
    "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001001001001",
    "8": "111101111101111", "9": "111101111001111", "+": "000010111010000", "x": "000101010101000",
    "!": "010010010000010", "-": "000000111000000", "/": "001001010100100", " ": "000000000000000",
    "A": "010101111101101", "B": "110101110101110", "C": "011100100100011", "D": "110101101101110",
    "E": "111100110100111", "F": "111100110100100", "G": "011100101101011", "H": "101101111101101",
    "I": "111010010010111", "J": "001001001101010", "K": "101101110101101", "L": "100100100100111",
    "M": "101111111101101", "N": "110101101101101", "O": "010101101101010", "P": "110101110100100",
    "Q": "010101101110011", "R": "110101110101101", "S": "011100010001110", "T": "111010010010010",
    "U": "101101101101111", "V": "101101101101010", "W": "101101111111101", "X": "101101010101101",
    "Y": "101101010010010", "Z": "111001010100111"
};

var PICKUP_GLYPH = { spread: "S", rapid: "R", laser: "L", shield: "O", bomb: "B", repair: "+", life: "1" };
var PICKUP_COLOR = { spread: "#00E5FF", rapid: "#FFD166", laser: "#FF6EC7", shield: "#39FF88",
                     bomb: "#A855F7", repair: "#FFFFFF", life: "#FF405C" };

// ---------------------------------------------------------------- sprite cache

var cache = {};
var canBlit = true;

function resetCache() { cache = {}; }

function hexToRgb(h) {
    var v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function shade(hex, k) {
    var rgb = hexToRgb(hex);
    var h = function(v) { var t = Math.round(v * k).toString(16); return t.length < 2 ? "0" + t : t; };
    return "#" + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
}

function colorOf(ch, a, b) {
    if (ch === "a") return a;
    if (ch === "b") return b;
    if (ch === "e") return shade(a, 0.55);
    return FIXED[ch];
}

// Rasterises rows into ImageData; "mono" paints every pixel one colour
// (the white hit flash).
function image(ctx, name, a, b, mono) {
    var key = name + a + b + (mono || "");
    var img = cache[key];
    if (img !== undefined) return img;
    var rows = SPR[name];
    var w = rows[0].length, h = rows.length;
    img = null;
    if (canBlit) {
        try {
            img = ctx.createImageData(w, h);
            var data = img.data;
            for (var y = 0; y < h; y++) {
                for (var x = 0; x < w; x++) {
                    var ch = rows[y].charAt(x);
                    var o = (y * w + x) * 4;
                    if (ch === ".") { data[o + 3] = 0; continue; }
                    var rgb = hexToRgb(mono || colorOf(ch, a, b));
                    data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = 255;
                }
            }
        } catch (err) {
            console.warn("NeuroDefender: ImageData unavailable, drawing sprites with fillRect:", err);
            canBlit = false;
            img = null;
        }
    }
    cache[key] = img;
    return img;
}

// noBlit: draw with fillRect (canvases other than the arena's, whose
// ImageData cache this is)
function sprite(ctx, name, x, y, a, b, mono, noBlit) {
    var rows = SPR[name];
    var w = rows[0].length, h = rows.length;
    var x0 = Math.round(x - w / 2), y0 = Math.round(y - h / 2);
    var img = noBlit ? null : image(ctx, name, a, b, mono);
    if (img) { ctx.drawImage(img, x0, y0); return; }
    // fallback: horizontal runs of one colour
    for (var r = 0; r < h; r++) {
        var row = rows[r], c = 0;
        while (c < w) {
            var ch = row.charAt(c);
            if (ch === ".") { c++; continue; }
            var end = c + 1;
            while (end < w && row.charAt(end) === ch) end++;
            ctx.fillStyle = mono || colorOf(ch, a, b);
            ctx.fillRect(x0 + c, y0 + r, end - c, 1);
            c = end;
        }
    }
}

// the 3x5 font has no accents: Á becomes A, Ç becomes C
var PLAIN = { "Á": "A", "À": "A", "Â": "A", "Ã": "A", "É": "E", "Ê": "E", "Í": "I",
              "Ó": "O", "Ô": "O", "Õ": "O", "Ú": "U", "Ü": "U", "Ç": "C" };

function text(ctx, str, x, y, color, center) {
    str = String(str).toUpperCase().replace(/[ÁÀÂÃÉÊÍÓÔÕÚÜÇ]/g, function (c) { return PLAIN[c]; });
    var w = str.length * 4 - 1;
    var x0 = Math.round(center ? x - w / 2 : x), y0 = Math.round(y);
    ctx.fillStyle = color;
    for (var i = 0; i < str.length; i++) {
        var f = FONT[str.charAt(i)];
        if (!f) continue;
        for (var p = 0; p < 15; p++)
            if (f.charAt(p) === "1") ctx.fillRect(x0 + i * 4 + (p % 3), y0 + Math.floor(p / 3), 1, 1);
    }
}

// ---------------------------------------------------------------- background

// The neural backdrop: neurons and synapses, seeded per sector so each one
// looks different but stable. Drawn once on a 320 x 480 canvas (two
// identical tiles) that the QML scrolls without repainting.
function drawBackground(ctx, sector, w, h) {
    var s = C.sectors[sector];
    var seed = (sector + 1) * 7919;
    function r() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    ctx.fillStyle = s.bg;
    ctx.fillRect(0, 0, w, h);
    var tile = h / 2, nodes = [], i, j;
    var n = 22;
    for (i = 0; i < n; i++) nodes.push([Math.floor(r() * w), Math.floor(r() * tile)]);
    for (var t = 0; t < 2; t++) {
        var oy = t * tile;
        ctx.strokeStyle = s.grid;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.55;          // the backdrop must never compete with shots
        ctx.beginPath();
        for (i = 0; i < n; i++) {
            for (j = i + 1; j < n; j++) {
                var dx = nodes[i][0] - nodes[j][0], dy = nodes[i][1] - nodes[j][1];
                if (dx * dx + dy * dy < 70 * 70) {
                    ctx.moveTo(nodes[i][0] + 0.5, nodes[i][1] + oy + 0.5);
                    // synapses bend at a right angle, like circuit traces
                    ctx.lineTo(nodes[j][0] + 0.5, nodes[i][1] + oy + 0.5);
                    ctx.lineTo(nodes[j][0] + 0.5, nodes[j][1] + oy + 0.5);
                }
            }
        }
        ctx.stroke();
        ctx.globalAlpha = 0.8;
        for (i = 0; i < n; i++) {
            var x = nodes[i][0], y = nodes[i][1] + oy;
            ctx.fillStyle = s.grid;
            ctx.fillRect(x - 2, y - 2, 5, 5);
            ctx.fillStyle = s.glow;
            ctx.fillRect(x - 1, y - 1, 3, 3);
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(x, y, 1, 1);
        }
        ctx.globalAlpha = 1;
    }
    if (sector === 8) {
        // the Neural Core: every sector's colour, pulsing rings of neurons
        for (i = 0; i < 9; i++) {
            ctx.fillStyle = C.sectors[i].glow;
            for (var k = 0; k < 6; k++)
                ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2, 2);
        }
    }
}

// ---------------------------------------------------------------- arena

function enemyColors(g, e) {
    var s = C.sectors[g.sector];
    if (e.kind === "brute") return [s.b, s.a];
    return [s.a, s.b];
}

function drawEnemy(ctx, g, e, frame, lowFx) {
    if (!e.on || e.delay > 0) return;
    var col = enemyColors(g, e);
    var name = e.sprite + (frame % 2);
    var alpha = 1;
    if (e.cloak) {
        if (e.cloakPhase === 1) alpha = (frame % 2) ? 0.35 : 1;          // warning flicker
        else if (e.cloakPhase === 2) alpha = C.traits.cloak.alpha;
    }
    // teleport warning: a bracket where it is about to land
    if (e.tpWarn > 0) {
        ctx.fillStyle = "#FFFFFF";
        var tx = Math.round(e.tpTarget), ty = Math.round(e.y);
        ctx.fillRect(tx - 6, ty - 5, 3, 1); ctx.fillRect(tx - 6, ty - 5, 1, 3);
        ctx.fillRect(tx + 4, ty - 5, 3, 1); ctx.fillRect(tx + 6, ty - 5, 1, 3);
        ctx.fillRect(tx - 6, ty + 5, 3, 1); ctx.fillRect(tx - 6, ty + 3, 1, 3);
        ctx.fillRect(tx + 4, ty + 5, 3, 1); ctx.fillRect(tx + 6, ty + 3, 1, 3);
        alpha *= (frame % 2) ? 0.5 : 1;
    }
    if (alpha !== 1) ctx.globalAlpha = alpha;
    sprite(ctx, name, e.x, e.y, col[0], col[1], e.flash > 0 ? "#FFFFFF" : null);
    var x = Math.round(e.x), y = Math.round(e.y), hw = Math.ceil(SPR[name][0].length / 2);
    // carriers glow gold at the corners
    if (e.carrier && (frame % 4) < 2) {
        ctx.fillStyle = "#FFD166";
        ctx.fillRect(x - hw - 1, y - 4, 1, 1); ctx.fillRect(x + hw, y - 4, 1, 1);
        ctx.fillRect(x - hw - 1, y + 3, 1, 1); ctx.fillRect(x + hw, y + 3, 1, 1);
    }
    // frontal shield: a bar under the nanobot, cracked as it weakens
    if (e.shield && e.shieldHp > 0) {
        var full = e.shieldHp >= e.shieldMax;
        ctx.fillStyle = full ? "#FFFFFF" : C.sectors[g.sector].b;
        for (var i = -hw; i <= hw; i++) {
            if (!full && e.shieldHp === 1 && (i % 3 === 0)) continue;
            ctx.fillRect(x + i, y + 5 + (Math.abs(i) > hw - 2 ? -1 : 0), 1, 1);
        }
    }
    // regenerator: a green cross while it is mending
    if (e.regen) {
        ctx.fillStyle = e.hp < e.maxHp ? "#39FF88" : "#1E7A45";
        ctx.fillRect(x + hw - 1, y - 6, 3, 1); ctx.fillRect(x + hw, y - 7, 1, 3);
    }
    // coordinator: antenna and the link to the protected neighbour
    if (e.coord) {
        ctx.fillStyle = "#FFD166";
        ctx.fillRect(x, y - 6, 1, 2); ctx.fillRect(x - 1, y - 7, 3, 1);
    }
    if (alpha !== 1) ctx.globalAlpha = 1;
    // protective bubble
    if (e.bubble > 0) {
        ctx.strokeStyle = "#FFD166";
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
    // diving kamikaze: a short exhaust trail
    if (e.state === E.ATTACKING && e.dive && !lowFx) {
        ctx.fillStyle = "#FF9A3D";
        ctx.fillRect(x, y - 6 - (frame % 2), 1, 2);
    }
}

function drawCoordLinks(ctx, g) {
    ctx.strokeStyle = "#FFD166";
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    var any = false;
    for (var i = 0; i < g.enemies.length; i++) {
        var e = g.enemies[i];
        if (!e.on || !e.coord || e.link < 0) continue;
        var o = g.enemies[e.link];
        if (!o.on || o.bubble <= 0) continue;
        ctx.moveTo(e.x + 0.5, e.y + 0.5); ctx.lineTo(o.x + 0.5, o.y + 0.5);
        any = true;
    }
    if (any) ctx.stroke();
    ctx.globalAlpha = 1;
}

// round pixel blob for boss cores
function blob(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    for (var dy = -r; dy <= r; dy++) {
        var w = Math.round(Math.sqrt(r * r - dy * dy));
        ctx.fillRect(Math.round(x) - w, Math.round(y) + dy, w * 2 + 1, 1);
    }
}

function drawBoss(ctx, g, frame) {
    var b = g.boss;
    if (!b.on) return;
    var s = C.sectors[g.sector];
    var cloaked = b.cloakT > 0 && b.cloakT < 2.0;
    if (b.cloakT > 2.0) ctx.globalAlpha = (frame % 2) ? 0.4 : 1;
    else if (cloaked) ctx.globalAlpha = 0.25;
    if (b.teleT > 0) {
        ctx.globalAlpha = (frame % 2) ? 0.3 : 0.8;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(Math.round(b.teleX) - 14, 40, 28, 1);
        ctx.fillRect(Math.round(b.teleX) - 14, 64, 28, 1);
    }
    var core = b.parts[0];
    var bx = Math.round(b.x), by = Math.round(b.y);
    // armour plating joining the parts
    var minX = bx, maxX = bx;
    for (var i = 1; i < b.nparts; i++) { minX = Math.min(minX, bx + b.parts[i].ox); maxX = Math.max(maxX, bx + b.parts[i].ox); }
    ctx.fillStyle = "#2A2F45";
    ctx.fillRect(minX, by - 3, maxX - minX + 1, 6);
    ctx.fillStyle = s.grid;
    ctx.fillRect(minX, by - 3, maxX - minX + 1, 1);
    ctx.fillStyle = s.glow;
    for (var xx = minX; xx < maxX; xx += 6) ctx.fillRect(xx + ((frame >> 1) % 6), by + 2, 2, 1);
    // core
    if (core.alive) {
        var pulse = (frame % 8) < 4 ? 1 : 0;
        blob(ctx, bx, by, core.r, core.flash > 0 ? "#FFFFFF" : s.a);
        blob(ctx, bx, by, core.r - 3, core.flash > 0 ? "#FFFFFF" : s.b);
        blob(ctx, bx, by, 2 + pulse, "#FFFFFF");
        // eye slit, the "mind"
        ctx.fillStyle = "#05060C";
        ctx.fillRect(bx - core.r + 3, by - 1, core.r * 2 - 5, 1);
        if (E.bossCoreShielded(g)) {
            ctx.strokeStyle = (frame % 6) < 3 ? "#FFFFFF" : s.glow;
            ctx.beginPath(); ctx.arc(b.x, b.y, core.r + 4, 0, Math.PI * 2); ctx.stroke();
        }
        if (b.def.final) {
            // the Overmind's crown: every sector's colour
            for (var c = 0; c < 9; c++) {
                ctx.fillStyle = C.sectors[c].glow;
                ctx.fillRect(bx - 9 + c * 2, by - core.r - 3 - ((c + (frame >> 2)) % 2), 1, 2);
            }
        }
    }
    for (i = 1; i < b.nparts; i++) {
        var pt = b.parts[i];
        var px = bx + pt.ox, py = by + pt.oy;
        if (!pt.alive) {
            ctx.fillStyle = "#3A3A3A";
            ctx.fillRect(px - 3, py - 2, 6, 4);
            continue;
        }
        sprite(ctx, pt.kind === "gen" ? "gen" : "turret", px, py, s.a, s.b, pt.flash > 0 ? "#FFFFFF" : null);
        if (pt.kind === "gen") {
            ctx.strokeStyle = s.glow;
            ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.moveTo(px + 0.5, py + 0.5); ctx.lineTo(bx + 0.5, by + 0.5); ctx.stroke();
            ctx.globalAlpha = (b.cloakT > 0 && b.cloakT < 2.0) ? 0.25 : 1;
        }
    }
    ctx.globalAlpha = 1;
}

function drawBossBar(ctx, g) {
    var b = g.boss;
    if (!b.on || b.entering > 0) return;
    var core = b.parts[0], total = 0, max = 0;
    for (var i = 0; i < b.nparts; i++) { total += Math.max(0, b.parts[i].hp); max += b.parts[i].maxHp; }
    var w = 120, x = (C.ARENA_W - w) / 2;
    ctx.fillStyle = "#05060C";
    ctx.fillRect(x - 1, 3, w + 2, 5);
    ctx.fillStyle = "#3A1010";
    ctx.fillRect(x, 4, w, 3);
    ctx.fillStyle = "#FF405C";
    ctx.fillRect(x, 4, Math.round(w * total / max), 3);
    ctx.fillStyle = "#FFD166";
    ctx.fillRect(x, 4, Math.round(w * Math.max(0, core.hp) / core.maxHp), 1);
    if (b.rebuildT > 0) text(ctx, Math.ceil(b.rebuildT), C.ARENA_W / 2, 10, "#FFD166", true);
}

function drawShip(ctx, g, frame) {
    var p = g.p;
    if (!p.alive) return;
    if (p.inv > 0 && (frame % 4) < 2) return;      // respawn blink
    var x = Math.round(p.x), y = Math.round(p.y);
    var hurt = p.flash > 0 && (frame % 2) === 0;
    var name = "ship" + p.spread;
    var half = Math.floor(SPR[name].length / 2);
    // engine flames: bigger and doubled with rapid fire
    var fl = 1 + (frame % 3);
    ctx.fillStyle = (frame % 2) ? "#FFD166" : "#FF9A3D";
    ctx.fillRect(x - 3, y + half, 1, fl);
    ctx.fillRect(x + 3, y + half, 1, 1 + ((frame + 1) % 3));
    if (p.rapid > 0) {
        ctx.fillStyle = (frame % 2) ? "#FFFFFF" : "#FFD166";
        ctx.fillRect(x - 1, y + half, 3, fl + 1);
        ctx.fillStyle = "#FF9A3D";
        ctx.fillRect(x, y + half + fl + 1, 1, 2);
    }
    if (p.spread === 2) {
        ctx.fillStyle = (frame % 2) ? "#FFD166" : "#FF9A3D";
        ctx.fillRect(x - 9, y + half, 1, 1 + (frame % 2));
        ctx.fillRect(x + 9, y + half, 1, 1 + ((frame + 1) % 2));
    }
    sprite(ctx, name, x, y, "#00E5FF", "#A855F7", hurt ? "#FF405C" : null);
    // neural laser: a magenta crystal grows on the nose
    if (p.laser > 0) {
        ctx.fillStyle = "#FF6EC7";
        ctx.fillRect(x - 1, y - half - 2, 3, 2);
        ctx.fillStyle = (frame % 4) < 2 ? "#FFFFFF" : "#FF6EC7";
        ctx.fillRect(x, y - half - 4, 1, 2);
        ctx.fillStyle = "#A855F7";
        ctx.fillRect(x - 2, y - half, 1, 2); ctx.fillRect(x + 2, y - half, 1, 2);
    }
    if (p.shield > 0) {
        // a hexagon of green sparks, thinning out in the last two seconds
        if (p.shield > 2 || (frame % 4) < 2) {
            ctx.fillStyle = "#39FF88";
            for (var t = 0; t < 12; t++) {
                var ang = t / 12 * 6.283 + frame * 0.05;
                ctx.fillRect(Math.round(x + Math.cos(ang) * 11), Math.round(y + Math.sin(ang) * 10), 1, 1);
            }
            ctx.strokeStyle = "#39FF88";
            ctx.globalAlpha = 0.45;
            ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }
}

function drawLaser(ctx, g, frame) {
    var p = g.p;
    if (!p.laserOn || !p.alive) return;
    var top = Math.max(0, Math.round(p.laserTop)), x = Math.round(p.x), y = Math.round(p.y) - 7;
    if (y <= top) return;
    ctx.fillStyle = (frame % 2) ? "#FF6EC7" : "#A855F7";
    ctx.fillRect(x - 1, top, 3, y - top);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x, top, 1, y - top);
    ctx.fillRect(x - 2, top, 5, 1);
}

// Draws one frame of the arena. "frame" drives the 2-frame animations.
function drawArena(ctx, g, frame, lowFx) {
    var W = C.ARENA_W, H = C.ARENA_H, i, s;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (g.shake > 0 && !lowFx) ctx.translate(Math.round(Math.sin(g.time * 70) * 2), Math.round(Math.cos(g.time * 53) * 1));
    // drifting neurotransmitters (parallax)
    if (!lowFx) {
        var sec = C.sectors[g.sector];
        ctx.fillStyle = sec.glow;
        ctx.globalAlpha = 0.5;
        for (i = 0; i < 18; i++) {
            var sp = 12 + (i % 5) * 9;
            var py = (i * 53 + g.time * sp) % H;
            ctx.fillRect((i * 97) % W, Math.floor(py), 1, 1 + (i % 2));
        }
        ctx.globalAlpha = 1;
    }
    // capsules
    for (i = 0; i < g.pickups.length; i++) {
        var u = g.pickups[i];
        if (!u.on) continue;
        sprite(ctx, "capsule", u.x, u.y, null, null, null);
        ctx.fillStyle = PICKUP_COLOR[u.type];
        ctx.fillRect(Math.round(u.x) - 2, Math.round(u.y) - 2, 3, 4);
        text(ctx, PICKUP_GLYPH[u.type], u.x, Math.round(u.y) - 2, "#05060C", true);
    }
    drawCoordLinks(ctx, g);
    for (i = 0; i < g.enemies.length; i++) drawEnemy(ctx, g, g.enemies[i], frame >> 3, lowFx);
    drawBoss(ctx, g, frame);
    // player shots
    for (i = 0; i < g.shots.length; i++) {
        s = g.shots[i];
        if (!s.on) continue;
        ctx.fillStyle = s.kind === 2 ? "#FFFFFF" : (s.kind === 1 ? "#B8FBFF" : "#00E5FF");
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 4);
    }
    drawLaser(ctx, g, frame);
    // enemy shots: red pellets, gold orbs; a white core keeps them readable
    for (i = 0; i < g.eshots.length; i++) {
        s = g.eshots[i];
        if (!s.on) continue;
        var ex = Math.round(s.x), ey = Math.round(s.y);
        if (s.kind === 2) {
            ctx.fillStyle = "#FFD166"; ctx.fillRect(ex - 1, ey - 1, 3, 3);
        } else {
            ctx.fillStyle = "#FF405C"; ctx.fillRect(ex - 1, ey - 1, 3, 3);
        }
        ctx.fillStyle = "#FFFFFF"; ctx.fillRect(ex, ey, 1, 1);
    }
    drawShip(ctx, g, frame);
    // neural pulse bomb
    if (g.bomb.on) {
        ctx.strokeStyle = "#00E5FF";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1 - g.bomb.t / C.weapons.bombTime;
        ctx.beginPath(); ctx.arc(g.bomb.x, g.bomb.y, g.bomb.r, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1;
    }
    // particles
    for (i = 0; i < g.particles.length; i++) {
        var q = g.particles[i];
        if (!q.on) continue;
        ctx.fillStyle = q.color;
        ctx.fillRect(Math.round(q.x), Math.round(q.y), q.size, q.size);
    }
    // score pop-ups
    for (i = 0; i < g.texts.length; i++) {
        var t = g.texts[i];
        if (t.on) text(ctx, t.text, t.x, t.y, t.color, true);
    }
    drawBossBar(ctx, g);
    ctx.restore();
    if (g.flashT > 0 && !lowFx) {
        ctx.fillStyle = "#FFFFFF";
        ctx.globalAlpha = Math.min(0.6, g.flashT * 3);
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
    }
}

// ---------------------------------------------------------------- frame

// Pre-drawn pictures (logo, banners): drawn once with fillRect into an
// ImageData through a small recorder, then blitted every frame.
var pictures = {};
var picturesOk = true;

function picture(ctx, key, w, h, draw) {
    var img = pictures[key];
    if (img !== undefined) return img;
    img = null;
    if (picturesOk) {
        try {
            img = ctx.createImageData(w, h);
            var data = img.data;
            var rec = {
                fillStyle: "#000000",
                fillRect: function(x, y, rw, rh) {
                    var rgb = hexToRgb(this.fillStyle);
                    for (var yy = Math.max(0, y); yy < Math.min(h, y + rh); yy++)
                        for (var xx = Math.max(0, x); xx < Math.min(w, x + rw); xx++) {
                            var o = (yy * w + xx) * 4;
                            data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = 255;
                        }
                }
            };
            draw(rec);
        } catch (err) {
            console.warn("NeuroDefender: pictures drawn pixel by pixel:", err);
            picturesOk = false;
            img = null;
        }
    }
    pictures[key] = img;
    return img;
}

function blitOrDraw(ctx, key, x, y, w, h, draw) {
    var img = picture(ctx, key, w, h, draw);
    if (img) { ctx.drawImage(img, x, y); return; }
    ctx.save(); ctx.translate(x, y); draw(ctx); ctx.restore();
}

function resetPictures() { pictures = {}; Art.resetCache(); }

// Banners: a big title (2x pixels, gradient, outline) and a smaller line.
// style: "warning" | "gold" | "mint" | "plain"
function drawBanner(ctx, lines, style, frame) {
    if (!lines || !lines.length) return;
    var W = C.ARENA_W, H = C.ARENA_H;
    var rows = style === "warning" ? Art.BLOOD : (style === "gold" ? Art.GOLD : (style === "mint" ? Art.MINT : Art.CHROME));
    var main = String(lines[0]).toUpperCase();
    var big = Art.width(main, 2) <= W - 16 ? 2 : 1;
    var bw = Art.width(main, big) + 8, bh = 12 * big;      // room for accents and the outline
    var y = Math.round(H / 2 - bh / 2 - (lines.length > 1 ? 6 : 0));
    if (style === "warning") {
        // hazard stripes above and below, flashing
        if ((frame >> 3) % 2) {
            for (var sx = 0; sx < W; sx += 8) {
                ctx.fillStyle = "#FF405C"; ctx.fillRect(sx, y - 8, 4, 4); ctx.fillRect(sx + 4, y + bh + 4, 4, 4);
                ctx.fillStyle = "#FFD166"; ctx.fillRect(sx + 4, y - 8, 4, 4); ctx.fillRect(sx, y + bh + 4, 4, 4);
            }
        }
    }
    blitOrDraw(ctx, "banner|" + main + style + big, Math.round(W / 2 - bw / 2), y, bw, bh, function(c) {
        Art.title(c, main, bw / 2, big, rows, big, "#05060C", null);
    });
    for (var i = 1; i < lines.length; i++)
        Art.fastText(ctx, String(lines[i]), W / 2, y + bh + 2 + (i - 1) * 10, "#FFFFFF", "center", "#05060C");
}

// One frame of the game screen: HUD strips and the arena between them.
function drawFrame(ctx, g, frame, lowFx, hud, banner, bannerStyle) {
    ctx.save();
    ctx.translate(0, HUD_TOP);
    drawArena(ctx, g, frame, lowFx);
    drawBanner(ctx, banner, bannerStyle, frame);
    ctx.restore();
    Art.drawHud(ctx, hud, frame);
}

// ---------------------------------------------------------------- title

// The attract screen: the chrome logo over a pulsing brain, a parade of
// nanobots and the ship. The menu itself is QML on top of this.
function drawTitle(ctx, time, frame, logo) {
    var W = C.ARENA_W, H = C.ARENA_H + 2 * HUD_TOP;
    ctx.fillStyle = "#06070F";
    ctx.fillRect(0, 0, W, H);
    // sparks drifting up
    for (var i = 0; i < 40; i++) {
        var sp = 6 + (i % 5) * 5;
        var py = H - ((i * 47 + time * sp) % H);
        ctx.fillStyle = i % 3 ? "#1B2A6B" : (i % 2 ? "#3D7BFF" : "#A855F7");
        ctx.fillRect((i * 83) % W, Math.floor(py), 1, 1 + (i % 2));
    }
    // a big faint brain, pulsing
    blitOrDraw(ctx, "brain", Math.round(W / 2 - 52), 70, 104, 68, function(c) {
        for (var r = 0; r < Art.BRAIN.length; r++)
            for (var k = 0; k < Art.BRAIN[r].length; k++) {
                var ch = Art.BRAIN[r].charAt(k);
                if (ch === ".") continue;
                c.fillStyle = ch === "a" ? "#16204A" : "#1F2E66";
                c.fillRect(k * 4, r * 4, 4, 4);
            }
    });
    var pulse = (frame >> 2) % 26;
    ctx.fillStyle = "#3D7BFF";
    ctx.fillRect(Math.round(W / 2 - 52 + pulse * 4), 70 + 24 + ((pulse * 7) % 20), 3, 3);
    // the logo: chrome letters with an outline and a purple drop shadow
    blitOrDraw(ctx, "logo|" + logo.title, Math.round(W / 2 - 124), 6, 248, 46, function(c) {
        Art.title(c, logo.title, 124, -2, Art.CHROME, 3, "#05060C", "#5B2A8A");
    });
    var sub = logo.subtitle.split("").join(" ");
    Art.fastText(ctx, sub, W / 2, 46, "#FFD166", "center", "#05060C");
    Art.fastText(ctx, logo.tagline, W / 2, 58, (frame >> 4) % 2 ? "#FFFFFF" : "#B8FBFF", "center", "#05060C");
    // the parade
    var cols = ["#00E5FF", "#A855F7", "#FF6EC7", "#FFD166", "#39FF88"];
    for (var n = 0; n < 8; n++) {
        var x = ((n * 46 + time * 18) % (W + 40)) - 20;
        var y = 208 + Math.sin(time * 2 + n * 0.8) * 3;
        sprite(ctx, (n % 3 === 1 ? "brute" : "drone") + ((frame >> 3) % 2), x, y, cols[n % 5], "#FFFFFF", null);
    }
    var shipName = "ship" + (Math.floor(time / 4) % 3);
    var shx = W / 2 + Math.sin(time * 0.8) * 60;
    sprite(ctx, shipName, shx, 240, "#00E5FF", "#A855F7", null);
    ctx.fillStyle = "#00E5FF";
    for (var q = 0; q < 4; q++) {
        var yy = Math.round(232 - ((time * 140 + q * 30) % 40));
        ctx.fillRect(Math.round(shx), yy, 1, 3);
    }
    ctx.fillStyle = (frame % 2) ? "#FFD166" : "#FF9A3D";
    ctx.fillRect(Math.round(shx) - 3, 246, 1, 2); ctx.fillRect(Math.round(shx) + 3, 246, 1, 2);
}
