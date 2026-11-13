.pragma library
.import "config.js" as C
// NeuroDefender: the 1997 look outside the battle itself — a 5x7 pixel font
// (with the accents Portuguese needs), the gradient logo, the HUD strips,
// the cabinet side panels and the pictures of the nanobot database.
//
// Two ways to draw text:
//  - text(): pixel by pixel with fillRect — for canvases painted once
//    (menus, panels), any context;
//  - fastText(): glyphs rasterised once into ImageData and blitted — for
//    the arena canvas, painted every frame. Its cache belongs to that one
//    canvas (ImageData is not shared between canvases).

// ---------------------------------------------------------------- font

// 5x7 glyphs, 7 rows of 5 bits. Cell: 6 wide (1 spacing) x 10 tall:
// 2 rows above for accents, 7 for the letter, 1 below for the cedilla.
var GLYPHS = {
    "A": "01110100011000111111100011000110001", "B": "11110100011000111110100011000111110",
    "C": "01110100011000010000100001000101110", "D": "11100100101000110001100011001011100",
    "E": "11111100001000011110100001000011111", "F": "11111100001000011110100001000010000",
    "G": "01110100011000010111100011000101111", "H": "10001100011000111111100011000110001",
    "I": "01110001000010000100001000010001110", "J": "00111000100001000010000101001001100",
    "K": "10001100101010011000101001001010001", "L": "10000100001000010000100001000011111",
    "M": "10001110111010110101100011000110001", "N": "10001100011100110101100111000110001",
    "O": "01110100011000110001100011000101110", "P": "11110100011000111110100001000010000",
    "Q": "01110100011000110001101011001001101", "R": "11110100011000111110101001001010001",
    "S": "01111100001000001110000010000111110", "T": "11111001000010000100001000010000100",
    "U": "10001100011000110001100011000101110", "V": "10001100011000110001100010101000100",
    "W": "10001100011000110101101011010101010", "X": "10001100010101000100010101000110001",
    "Y": "10001100010101000100001000010000100", "Z": "11111000010001000100010001000011111",
    "0": "01110100011001110101110011000101110", "1": "00100011000010000100001000010001110",
    "2": "01110100010000100010001000100011111", "3": "11111000100010000010000011000101110",
    "4": "00010001100101010010111110001000010", "5": "11111100001111000001000011000101110",
    "6": "00110010001000011110100011000101110", "7": "11111000010001000100010000100001000",
    "8": "01110100011000101110100011000101110", "9": "01110100011000101111000010001001100",
    " ": "00000000000000000000000000000000000", ".": "00000000000000000000000000110001100",
    ":": "00000011000110000000011000110000000", "-": "00000000000000011111000000000000000",
    "+": "00000001000010011111001000010000000", "x": "00000000001000101010001000101010001",
    "/": "00001000010001000100010001000010000", "!": "00100001000010000100001000000000100",
    "?": "01110100010000100010001000000000100", "·": "00000000000000001100011000000000000",
    "%": "11000110010001000100010001001100011", "(": "00010001000100001000010000010000010",
    ")": "01000001000001000010000100010001000", "'": "00100001000100000000000000000000000",
    ",": "00000000000000000000011000010001000", "\"": "01010010100000000000000000000000000",
    ">": "01000001000001000001000100010001000", "<": "00010001000100010000010000010000010",
    "=": "00000000001111100000111110000000000", "#": "01010010101111101010111110101001010",
    "|": "00100001000010000100001000010000100", ";": "00000011000110000000011000010001000",
    "_": "00000000000000000000000000000011111"
};

// accented capitals: base letter + mark (above, or the cedilla below)
var ACCENTS = {
    "Á": ["A", "acute"], "À": ["A", "grave"], "Â": ["A", "circ"], "Ã": ["A", "tilde"],
    "É": ["E", "acute"], "Ê": ["E", "circ"], "Í": ["I", "acute"], "Ó": ["O", "acute"],
    "Ô": ["O", "circ"], "Õ": ["O", "tilde"], "Ú": ["U", "acute"], "Ç": ["C", "cedilla"],
    "Ü": ["U", "uml"]
};
var MARKS = {
    acute: ["00010", "00100"], grave: ["01000", "00100"], circ: ["00100", "01010"],
    tilde: ["01101", "10110"], uml: ["00000", "01010"], cedilla: ["00100"]
};

var CELL_W = 6, CELL_H = 10;

// Pixels of one character as [x, y] pairs inside its 5x10 cell.
var pixelCache = {};
function charPixels(ch) {
    var hit = pixelCache[ch];
    if (hit) return hit;
    var base = ch, mark = null;
    if (ACCENTS[ch]) { base = ACCENTS[ch][0]; mark = ACCENTS[ch][1]; }
    var bits = GLYPHS[base] || GLYPHS["?"];
    var px = [], i;
    for (i = 0; i < 35; i++)
        if (bits.charAt(i) === "1") px.push([i % 5, 2 + Math.floor(i / 5)]);
    if (mark) {
        var rows = MARKS[mark];
        var top = mark === "cedilla" ? 9 : 0;
        for (var r = 0; r < rows.length; r++)
            for (var c = 0; c < 5; c++)
                if (rows[r].charAt(c) === "1") px.push([c, top + r]);
    }
    pixelCache[ch] = px;
    return px;
}

function width(str, scale) {
    str = String(str);
    return Math.max(0, str.length * CELL_W - 1) * (scale || 1);
}

// Pixel-by-pixel text. opts: scale, align ("left"|"center"|"right"),
// shadow (colour drawn 1 pixel down-right), rows (a colour per cell row:
// the gradient of logos and titles).
function text(ctx, str, x, y, color, opts) {
    opts = opts || {};
    str = String(str).toUpperCase();
    var s = opts.scale || 1;
    var w = width(str, s);
    var x0 = Math.round(opts.align === "center" ? x - w / 2 : (opts.align === "right" ? x - w : x));
    var y0 = Math.round(y);
    var pass, i, k, p, list;
    for (pass = opts.shadow ? 0 : 1; pass < 2; pass++) {
        var off = pass === 0 ? s : 0;
        for (i = 0; i < str.length; i++) {
            list = charPixels(str.charAt(i));
            for (k = 0; k < list.length; k++) {
                p = list[k];
                ctx.fillStyle = pass === 0 ? opts.shadow : (opts.rows ? opts.rows[p[1]] : color);
                ctx.fillRect(x0 + (i * CELL_W + p[0]) * s + off, y0 + p[1] * s + off, s, s);
            }
        }
    }
    return w;
}

// Splits a paragraph into lines that fit "maxW" pixels.
function wrap(str, maxW, scale) {
    var words = String(str).split(/\s+/), lines = [], line = "";
    var maxChars = Math.max(1, Math.floor((maxW / (scale || 1) + 1) / CELL_W));
    for (var i = 0; i < words.length; i++) {
        var tryLine = line ? line + " " + words[i] : words[i];
        if (tryLine.length > maxChars && line) { lines.push(line); line = words[i]; }
        else line = tryLine;
    }
    if (line) lines.push(line);
    return lines;
}

// ---------------------------------------------------------------- fast text

var glyphCache = {};
var fastOk = true;

function resetCache() { glyphCache = {}; }

function hexRgb(h) {
    var v = parseInt(String(h).slice(1, 7), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function glyphImage(ctx, ch, color, scale) {
    var key = ch + color + scale;
    var img = glyphCache[key];
    if (img !== undefined) return img;
    img = null;
    if (fastOk) {
        try {
            var w = 5 * scale, h = CELL_H * scale;
            img = ctx.createImageData(w, h);
            var rgb = hexRgb(color), list = charPixels(ch);
            for (var k = 0; k < list.length; k++)
                for (var dy = 0; dy < scale; dy++)
                    for (var dx = 0; dx < scale; dx++) {
                        var o = ((list[k][1] * scale + dy) * w + list[k][0] * scale + dx) * 4;
                        img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255;
                    }
        } catch (err) {
            console.warn("NeuroDefender: ImageData unavailable for text, drawing pixel by pixel:", err);
            fastOk = false;
            img = null;
        }
    }
    glyphCache[key] = img;
    return img;
}

// Same result as text() with a shadow, from cached glyph images.
function fastText(ctx, str, x, y, color, align, shadow, scale) {
    str = String(str).toUpperCase();
    scale = scale || 1;
    var w = width(str, scale);
    var x0 = Math.round(align === "center" ? x - w / 2 : (align === "right" ? x - w : x));
    var y0 = Math.round(y);
    if (!fastOk) { text(ctx, str, x0, y0, color, { shadow: shadow, scale: scale }); return w; }
    for (var pass = shadow ? 0 : 1; pass < 2; pass++) {
        var col = pass === 0 ? shadow : color, off = pass === 0 ? scale : 0;
        for (var i = 0; i < str.length; i++) {
            var ch = str.charAt(i);
            if (ch === " ") continue;
            var img = glyphImage(ctx, ch, col, scale);
            if (img) ctx.drawImage(img, x0 + i * CELL_W * scale + off, y0 + off);
            else { text(ctx, str, x0, y0, color, { shadow: shadow, scale: scale }); return w; }
        }
    }
    return w;
}

// ---------------------------------------------------------------- palettes

// gradient rows (one colour per cell row) for logos and big titles
var CHROME = ["#FFFFFF", "#FFFFFF", "#FFFFFF", "#D8FDFF", "#8CF6FF", "#00E5FF", "#00B4E0", "#6F7BFF", "#A855F7", "#7A2FC4"];
var GOLD = ["#FFF6D8", "#FFF6D8", "#FFF6D8", "#FFE9A8", "#FFD166", "#FFC044", "#F4A21C", "#D9821A", "#B8641A", "#8A4A12"];
var BLOOD = ["#FFE0E5", "#FFE0E5", "#FFE0E5", "#FFB0BC", "#FF7488", "#FF405C", "#E02848", "#B81D3A", "#86142C", "#5E0E1E"];
var MINT = ["#E6FFF0", "#E6FFF0", "#E6FFF0", "#B6FFD4", "#79FFAE", "#39FF88", "#22D86C", "#18AE56", "#108440", "#0A5C2C"];

// big title with an outline: every pixel of the text drawn around in "edge"
function title(ctx, str, x, y, rows, scale, edge, shadow) {
    var o = { scale: scale, align: "center", rows: rows };
    if (shadow) text(ctx, str, x + scale * 2, y + scale * 2, shadow, { scale: scale, align: "center" });
    if (edge) {
        text(ctx, str, x - scale, y, edge, { scale: scale, align: "center" });
        text(ctx, str, x + scale, y, edge, { scale: scale, align: "center" });
        text(ctx, str, x, y - scale, edge, { scale: scale, align: "center" });
        text(ctx, str, x, y + scale, edge, { scale: scale, align: "center" });
    }
    text(ctx, str, x, y, null, o);
}

// ---------------------------------------------------------------- bevels

// a raised (or sunken) 1997 metal panel
function panel(ctx, x, y, w, h, sunken, face) {
    ctx.fillStyle = face || "#22263A";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = sunken ? "#05060C" : "#6B7194";
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = sunken ? "#6B7194" : "#05060C";
    ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
}

// ---------------------------------------------------------------- HUD

var MINI_SHIP = ["...w...", "..cwc..", ".pcbcp.", "pcc.ccp", "p.....p"];
var MINI_BOMB = [".ppp.", "pbwbp", "pwwwp", "pbwbp", ".ppp."];

function mini(ctx, rows, x, y, pal) {
    for (var r = 0; r < rows.length; r++)
        for (var c = 0; c < rows[r].length; c++) {
            var ch = rows[r].charAt(c);
            if (ch === ".") continue;
            ctx.fillStyle = pal[ch];
            ctx.fillRect(x + c, y + r, 1, 1);
        }
}
var SHIP_PAL = { w: "#FFFFFF", c: "#00E5FF", p: "#A855F7", b: "#B8FBFF" };
var BOMB_PAL = { p: "#A855F7", b: "#E2C8FF", w: "#FFFFFF" };

// The two HUD strips: 12 pixels above and below the 240-pixel arena.
// h: { score, best, beating, stage, lives, bombs, energy, weapon, mult,
//      shield, label: {score, best} }
function drawHud(ctx, h, frame) {
    var W = C.ARENA_W, top = 0, bot = 252;
    // metal strips
    stripe(ctx, top, 12);
    stripe(ctx, bot, 12);
    // top: score, record, stage
    fastText(ctx, h.label.score, 4, top + 1, "#8C93B8", "left", "#05060C");
    var lw = width(h.label.score) + 5;
    fastText(ctx, pad(h.score), 4 + lw, top + 1, "#FFFFFF", "left", "#05060C");
    var hiCol = h.beating && (frame >> 4) % 2 ? "#FFFFFF" : "#FFD166";
    var hiText = h.label.best + " " + pad(h.best);
    // the record sits halfway between the score and the stage
    var scoreEnd = 4 + lw + width(pad(h.score)), stageStart = W - 4 - width(h.stage);
    fastText(ctx, hiText, Math.round((scoreEnd + stageStart) / 2), top + 1, hiCol, "center", "#05060C");
    fastText(ctx, h.stage, W - 4, top + 1, h.boss ? "#FF405C" : "#00E5FF", "right", "#05060C");
    // bottom: lives and bombs as icons
    var x = 4, i;
    for (i = 0; i < Math.min(h.lives, 5); i++) { mini(ctx, MINI_SHIP, x, bot + 4, SHIP_PAL); x += 8; }
    x = Math.max(x, 4 + 5 * 8) + 2;
    for (i = 0; i < Math.min(h.bombs, 5); i++) { mini(ctx, MINI_BOMB, x, bot + 4, BOMB_PAL); x += 6; }
    // energy: a sunken bar of 20 segments in the middle
    var bw = 102, bx = Math.round((W - bw) / 2) - 6, by = bot + 3;
    panel(ctx, bx, by, bw, 7, true, "#05060C");
    var segs = Math.round(20 * Math.max(0, h.energy) / 100);
    var col = h.energy > 50 ? "#39FF88" : (h.energy > 25 ? "#FFD166" : "#FF405C");
    var dark = h.energy > 50 ? "#1E8A4A" : (h.energy > 25 ? "#9A7A2A" : "#8A1E30");
    var blink = h.energy <= 25 && (frame >> 3) % 2;
    for (i = 0; i < 20; i++) {
        ctx.fillStyle = i < segs ? (blink ? "#FFFFFF" : col) : "#1A1D2C";
        ctx.fillRect(bx + 2 + i * 5, by + 2, 4, 3);
        if (i < segs && !blink) { ctx.fillStyle = dark; ctx.fillRect(bx + 2 + i * 5, by + 4, 4, 1); }
    }
    fastText(ctx, "E", bx - 7, bot + 1, "#8C93B8", "left", "#05060C");
    // weapon and combo on the right
    var right = W - 4;
    var mult = "x" + h.mult.toFixed(1);
    var mw = fastText(ctx, mult, right, bot + 1, h.mult > 1 ? ((frame >> 3) % 2 ? "#FFD166" : "#FFFFFF") : "#5A6080", "right", "#05060C");
    var wx = right - mw - 6;
    var ww = fastText(ctx, h.weapon, wx, bot + 1, "#00E5FF", "right", "#05060C");
    if (h.shield > 0) {
        // shield: its capsule (as in the side panel) and the seconds left
        var sx = wx - ww - 6;
        var sw = fastText(ctx, String(h.shield), sx, bot + 1, "#39FF88", "right", "#05060C");
        capsule(ctx, sx - sw - 11, bot, "shield");
    }
}

function stripe(ctx, y, h) {
    var rows = ["#3A3F5C", "#2A2E46", "#22263A", "#1C2032", "#1A1D2E", "#181B2A", "#16192A", "#15182A", "#141726", "#121522", "#10121E", "#0C0E18"];
    for (var i = 0; i < h; i++) { ctx.fillStyle = rows[i] || "#0C0E18"; ctx.fillRect(0, y + i, C.ARENA_W, 1); }
    ctx.fillStyle = y === 0 ? "#05060C" : "#5A6080";
    ctx.fillRect(0, y === 0 ? y + h - 1 : y, C.ARENA_W, 1);
}

function pad(n) { var s = String(Math.max(0, Math.floor(n))); while (s.length < 7) s = "0" + s; return s; }

// ---------------------------------------------------------------- side panels

// The brain emblem: two hemispheres of folded gyri, in the sector's colour.
var BRAIN = [
    "......aaaaaa..aaaaaa......",
    "....aabbbbbaaaabbbbbaa....",
    "...abbaaabbbaabbbaaabba...",
    "..abaabbbaabbaabbaabbaba..",
    ".abbaabbbbaabaabaabbbbaba.",
    ".abaabaaabbabbaabbaaabaaba",
    "abbbaabbaaabaabbaabbaabbba",
    "ababbaabbbabaabaabbbaabbaa",
    "abaabbaaabbabbaabbaaabbaba",
    "abbaabbbaabaabbaabaabbabba",
    ".abbaaabbabbaabbabbaaabba.",
    ".aabbbaaabbaaaabbaaabbbaa.",
    "..aaabbbbaa....aabbbbaaa..",
    "....aaaaa........aaaaa....",
    "..........aaaaaa..........",
    "...........abba...........",
    "............aa............"
];

function emblem(ctx, x, y, a, b, pulse) {
    for (var r = 0; r < BRAIN.length; r++)
        for (var c = 0; c < BRAIN[r].length; c++) {
            var ch = BRAIN[r].charAt(c);
            if (ch === ".") continue;
            ctx.fillStyle = ch === "a" ? a : b;
            ctx.fillRect(x + c, y + r, 1, 1);
        }
    if (pulse) {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(x + 6 + (pulse % 14), y + 6, 1, 1);
        ctx.fillRect(x + 19 - (pulse % 12), y + 8, 1, 1);
    }
}

// Left cabinet panel: emblem, game name, the nine-sector map.
// p: { sector, labels: {map, sectors[]}, width, height }
function drawLeftPanel(ctx, p) {
    var w = p.width, h = p.height;
    bezel(ctx, w, h);
    var s = C.sectors[p.sector];
    emblem(ctx, Math.round((w - 26) / 2), 8, s.glow, "#FFFFFF", 0);
    text(ctx, "NEURO", w / 2, 30, null, { align: "center", rows: CHROME, shadow: "#05060C" });
    text(ctx, "DEFENDER", w / 2, 40, null, { align: "center", rows: CHROME, shadow: "#05060C" });
    ctx.fillStyle = "#3A3F5C"; ctx.fillRect(6, 54, w - 12, 1);
    text(ctx, p.labels.map, w / 2, 58, "#FFD166", { align: "center", shadow: "#05060C" });
    // nine linked neurons, cleared ones lit, the current one ringed
    var top = 72, step = Math.min(18, Math.floor((h - top - 46) / 8));
    for (var i = 0; i < 9; i++) {
        var cx = Math.round(w / 2 + (i % 2 === 0 ? -10 : 10)), cy = top + i * step;
        if (i < 8) {
            var nx = Math.round(w / 2 + ((i + 1) % 2 === 0 ? -10 : 10));
            line(ctx, cx, cy, nx, cy + step, i < p.sector ? C.sectors[i].glow : "#2A2F45");
        }
    }
    for (var j = 0; j < 9; j++) {
        var x = Math.round(w / 2 + (j % 2 === 0 ? -10 : 10)), y = top + j * step;
        var col = j < p.sector ? C.sectors[j].glow : (j === p.sector ? "#FFFFFF" : "#3A3F5C");
        ctx.fillStyle = "#05060C"; ctx.fillRect(x - 4, y - 4, 9, 9);
        ctx.fillStyle = col; ctx.fillRect(x - 3, y - 3, 7, 7);
        if (j === p.sector) { ctx.fillStyle = C.sectors[j].glow; ctx.fillRect(x - 2, y - 2, 5, 5); }
        text(ctx, String(j + 1), j % 2 === 0 ? x - 8 : x + 8, y - 6, j <= p.sector ? "#FFFFFF" : "#5A6080",
             { align: j % 2 === 0 ? "right" : "left" });
    }
    var name = wrap(p.labels.sectors[p.sector].toUpperCase(), w - 8, 1);
    for (var k = 0; k < name.length; k++)
        text(ctx, name[k], w / 2, h - 12 - (name.length - 1 - k) * 10, s.glow, { align: "center", shadow: "#05060C" });
}

// Right cabinet panel: the capsules and the main keys.
// p: { labels: {capsules, short{}, keys[[key, label]]}, width, height }
function drawRightPanel(ctx, p) {
    var w = p.width, h = p.height;
    bezel(ctx, w, h);
    text(ctx, p.labels.capsules, w / 2, 8, "#FFD166", { align: "center", shadow: "#05060C" });
    var ids = ["spread", "rapid", "laser", "shield", "bomb", "repair", "life"];
    var y = 22;
    for (var i = 0; i < ids.length; i++) {
        capsule(ctx, 6, y, ids[i]);
        text(ctx, p.labels.short[ids[i]], 17, y + 1, "#FFFFFF", { shadow: "#05060C" });
        y += 13;
    }
    ctx.fillStyle = "#3A3F5C"; ctx.fillRect(6, y + 2, w - 12, 1);
    y += 8;
    for (var k = 0; k < p.labels.keys.length && y < h - 12; k++) {
        keycap(ctx, 6, y, p.labels.keys[k][0]);
        text(ctx, p.labels.keys[k][1], 6 + width(p.labels.keys[k][0]) + 8, y + 1, "#AEB4D6", { shadow: "#05060C" });
        y += 13;
    }
}

function bezel(ctx, w, h) {
    // dark cabinet with a faint circuit grid and a metal frame
    ctx.fillStyle = "#0E1020"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#151830";
    for (var y = 4; y < h; y += 8) ctx.fillRect(0, y, w, 1);
    for (var x = 4; x < w; x += 8) ctx.fillRect(x, 0, 1, h);
    panelEdges(ctx, 0, 0, w, h);
}

function panelEdges(ctx, x, y, w, h) {
    ctx.fillStyle = "#6B7194"; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = "#05060C"; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillStyle = "#2A2F45"; ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + 1, 1, h - 2);
}

function line(ctx, x0, y0, x1, y1, color) {
    ctx.fillStyle = color;
    var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (var i = 0; i <= n; i++)
        ctx.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1);
}

// a keyboard key: grey keycap with the label
function keycap(ctx, x, y, label) {
    var w = width(label) + 6;
    ctx.fillStyle = "#AEAAAE"; ctx.fillRect(x, y, w, 11);
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, 11);
    ctx.fillStyle = "#555555"; ctx.fillRect(x, y + 10, w, 1); ctx.fillRect(x + w - 1, y, 1, 11);
    text(ctx, label, x + 3, y, "#05060C");
    return w;
}

var CAPSULE_COLOR = { spread: "#00E5FF", rapid: "#FFD166", laser: "#FF6EC7", shield: "#39FF88",
                      bomb: "#A855F7", repair: "#FFFFFF", life: "#FF405C" };
var CAPSULE_GLYPH = { spread: "S", rapid: "R", laser: "L", shield: "O", bomb: "B", repair: "+", life: "1" };

// capsule icon, 9 x 11, letter inside
function capsule(ctx, x, y, id) {
    var col = CAPSULE_COLOR[id];
    ctx.fillStyle = "#05060C"; ctx.fillRect(x + 1, y, 7, 11); ctx.fillRect(x, y + 1, 9, 9);
    ctx.fillStyle = col; ctx.fillRect(x + 1, y + 1, 7, 9);
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(x + 2, y + 1, 5, 1); ctx.fillRect(x + 1, y + 2, 1, 6);
    text(ctx, CAPSULE_GLYPH[id], x + 2, y, "#05060C");
}

// ---------------------------------------------------------------- database pictures

// Draws the picture of a database entry centred in w x h (logical pixels).
// "sprite" is render.js's sprite function, passed in to avoid a cycle.
function drawEntry(ctx, key, w, h, known, sprite, sector) {
    ctx.fillStyle = "#05060C"; ctx.fillRect(0, 0, w, h);
    panelEdges(ctx, 0, 0, w, h);
    var s = C.sectors[Math.max(0, Math.min(8, sector))];
    var cx = w / 2, cy = h / 2 + 1;
    // not met yet: the same picture as a dark silhouette
    var a = known ? s.a : "#1E2238", b = known ? s.b : "#262B44";
    if (key.indexOf("boss_") === 0) { bossPicture(ctx, key.substring(5), cx, cy, a, b, known ? s.glow : b); return; }
    if (key === "ship") {
        // the player's ship in its three forms
        sprite(ctx, "ship0", cx - 16, cy + 1, "#00E5FF", "#A855F7", null, true);
        sprite(ctx, "ship1", cx, cy + 1, "#00E5FF", "#A855F7", null, true);
        sprite(ctx, "ship2", cx + 18, cy + 1, "#00E5FF", "#A855F7", null, true);
        return;
    }
    // nanobots: double size, so their details show
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(2, 2);
    cx = 0; cy = 0;
    entryNanobot(ctx, key, cx, cy, a, b, sprite, known);
    ctx.restore();
}

function entryNanobot(ctx, key, cx, cy, a, b, sprite, known) {
    var white = known ? "#FFFFFF" : b, gold = known ? "#FFD166" : b, green = known ? "#39FF88" : b, orange = known ? "#FF9A3D" : b;
    if (!known) { sprite(ctx, key === "shield" || key === "regen" ? "brute0" : "drone0", cx, cy, a, b, b, true); return; }
    switch (key) {
    case "basic": sprite(ctx, "drone0", cx, cy, a, b, null, true); break;
    case "split":
        sprite(ctx, "drone0", cx - 6, cy, a, b, null, true);
        sprite(ctx, "mite0", cx + 6, cy - 3, a, b, null, true);
        sprite(ctx, "mite1", cx + 6, cy + 3, a, b, null, true);
        break;
    case "shield":
        sprite(ctx, "brute0", cx, cy - 1, b, a, null, true);
        ctx.fillStyle = white; ctx.fillRect(cx - 5, cy + 4, 11, 1); ctx.fillRect(cx - 6, cy + 3, 1, 1); ctx.fillRect(cx + 6, cy + 3, 1, 1);
        break;
    case "cloak":
        ctx.globalAlpha = 0.3; sprite(ctx, "drone0", cx + 5, cy, a, b, null, true); ctx.globalAlpha = 1;
        sprite(ctx, "drone1", cx - 5, cy, a, b, null, true);
        break;
    case "teleport":
        sprite(ctx, "drone0", cx - 6, cy, a, b, null, true);
        ctx.fillStyle = white;
        var tx = cx + 7;
        ctx.fillRect(tx - 6, cy - 5, 3, 1); ctx.fillRect(tx - 6, cy - 5, 1, 3); ctx.fillRect(tx + 4, cy - 5, 3, 1); ctx.fillRect(tx + 6, cy - 5, 1, 3);
        ctx.fillRect(tx - 6, cy + 5, 3, 1); ctx.fillRect(tx - 6, cy + 3, 1, 3); ctx.fillRect(tx + 4, cy + 5, 3, 1); ctx.fillRect(tx + 6, cy + 3, 1, 3);
        break;
    case "dive":
        sprite(ctx, "drone0", cx + 3, cy + 2, a, b, null, true);
        ctx.fillStyle = orange;
        for (var i = 1; i < 4; i++) ctx.fillRect(cx + 3 - i * 2, cy - 3 - i * 2, 2, 1);
        break;
    case "coord":
        sprite(ctx, "drone0", cx - 6, cy, a, b, null, true);
        sprite(ctx, "drone1", cx + 6, cy, a, b, null, true);
        ctx.fillStyle = gold; ctx.fillRect(cx - 6, cy - 6, 1, 2); ctx.fillRect(cx - 7, cy - 7, 3, 1);
        ring(ctx, cx + 6, cy, 6, gold);
        break;
    case "regen":
        sprite(ctx, "brute1", cx, cy, b, a, null, true);
        ctx.fillStyle = green; ctx.fillRect(cx + 6, cy - 7, 3, 1); ctx.fillRect(cx + 7, cy - 8, 1, 3);
        ctx.fillRect(cx - 9, cy - 5, 3, 1); ctx.fillRect(cx - 8, cy - 6, 1, 3);
        break;
    }
}

function ring(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    for (var t = 0; t < 32; t++) {
        var a = t / 32 * 6.283;
        ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1);
    }
}

function blob(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    for (var dy = -r; dy <= r; dy++) {
        var w = Math.round(Math.sqrt(r * r - dy * dy));
        ctx.fillRect(Math.round(x) - w, Math.round(y) + dy, w * 2 + 1, 1);
    }
}

// a boss in miniature, half size, from its parts in config.js
function bossPicture(ctx, id, cx, cy, a, b, glow) {
    var def = C.bosses[id];
    if (!def) return;
    var k = 0.5, minX = 0, maxX = 0, i;
    for (i = 1; i < def.parts.length; i++) { minX = Math.min(minX, def.parts[i].x * k); maxX = Math.max(maxX, def.parts[i].x * k); }
    ctx.fillStyle = "#2A2F45"; ctx.fillRect(Math.round(cx + minX), cy - 2, Math.round(maxX - minX) + 1, 4);
    for (i = 1; i < def.parts.length; i++) {
        var p = def.parts[i], px = Math.round(cx + p.x * k), py = Math.round(cy + p.y * k);
        if (p.kind === "gen") { ctx.fillStyle = a; ctx.fillRect(px - 1, py - 2, 3, 5); ctx.fillRect(px - 2, py - 1, 5, 3); ctx.fillStyle = "#FFFFFF"; ctx.fillRect(px, py, 1, 1); }
        else { ctx.fillStyle = "#2A2F45"; ctx.fillRect(px - 2, py - 2, 5, 5); ctx.fillStyle = a; ctx.fillRect(px - 1, py - 1, 3, 3); ctx.fillStyle = "#FFFFFF"; ctx.fillRect(px, py + 2, 1, 2); }
    }
    var r = Math.round(def.parts[0].r * 0.7);
    blob(ctx, cx, cy, r, a);
    blob(ctx, cx, cy, Math.max(1, r - 2), b);
    blob(ctx, cx, cy, 1, "#FFFFFF");
    ctx.fillStyle = "#05060C"; ctx.fillRect(cx - r + 2, cy, r * 2 - 3, 1);
    if (def.final) for (var c = 0; c < 9; c++) { ctx.fillStyle = C.sectors[c].glow; ctx.fillRect(cx - 4 + c, cy - r - 2, 1, 1); }
}

// ---------------------------------------------------------------- screens

var SCREEN_W = 320, SCREEN_H = 264;

function backdrop(ctx) {
    ctx.fillStyle = "#080A16"; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.fillStyle = "#10132A";
    for (var y = 6; y < SCREEN_H; y += 8) ctx.fillRect(0, y, SCREEN_W, 1);
    for (var x = 6; x < SCREEN_W; x += 8) ctx.fillRect(x, 0, 1, SCREEN_H);
    panelEdges(ctx, 0, 0, SCREEN_W, SCREEN_H);
}

// HOW TO PLAY: story, keys and capsules. t = the language table.
function drawHelp(ctx, t) {
    backdrop(ctx);
    title(ctx, t.howTo, SCREEN_W / 2, 6, CHROME, 2, "#05060C", null);
    var story = wrap(t.story.toUpperCase(), SCREEN_W - 24, 1), y = 34, i;
    for (i = 0; i < story.length; i++) { text(ctx, story[i], SCREEN_W / 2, y, "#B8FBFF", { align: "center", shadow: "#05060C" }); y += 10; }
    y += 6;
    var top = y;
    panel(ctx, 6, top - 3, 152, 8 + 13 * t.helpKeys.length + 12, false, "#141832");
    panel(ctx, 162, top - 3, 152, 8 + 13 * t.helpKeys.length + 12, false, "#141832");
    text(ctx, t.controlsTitle, 82, top, "#FFD166", { align: "center", shadow: "#05060C" });
    text(ctx, t.pickupsTitle, 238, top, "#FFD166", { align: "center", shadow: "#05060C" });
    y = top + 13;
    for (i = 0; i < t.helpKeys.length; i++) {
        var kw = keycap(ctx, 11, y, t.helpKeys[i][0]);
        text(ctx, t.helpKeys[i][1], 11 + kw + 5, y + 1, "#FFFFFF", { shadow: "#05060C" });
        y += 13;
    }
    var ids = ["spread", "rapid", "laser", "shield", "bomb", "repair", "life"];
    y = top + 13;
    for (i = 0; i < ids.length; i++) {
        capsule(ctx, 168, y, ids[i]);
        text(ctx, t.pickupMedium[ids[i]], 182, y + 1, "#FFFFFF", { shadow: "#05060C" });
        y += 14;
    }
}

// NANOBOT DATABASE: four entries per page, each with its picture.
var CODEX_PER_PAGE = 4;
function codexPages(t) { return Math.ceil(t.codexEntries.length / CODEX_PER_PAGE); }

function drawCodex(ctx, t, page, seen, sprite) {
    backdrop(ctx);
    var pages = codexPages(t);
    title(ctx, t.codex, SCREEN_W / 2, 6, CHROME, 2, "#05060C", null);
    text(ctx, (page + 1) + "/" + pages, SCREEN_W - 8, 28, "#8C93B8", { align: "right" });
    for (var i = 0; i < CODEX_PER_PAGE; i++) {
        var e = t.codexEntries[page * CODEX_PER_PAGE + i];
        if (!e) break;
        var known = e[0] === "basic" || e[0] === "ship" || seen[e[0]] === true;
        var y = 38 + i * 50;
        panel(ctx, 6, y, SCREEN_W - 12, 46, false, "#141832");
        // the picture, in its own small window
        ctx.save();
        ctx.translate(11, y + 7);
        var sector = e[0].indexOf("boss_") === 0 ? bossSector(e[0].substring(5)) : traitSector(e[0]);
        drawEntry(ctx, e[0], 52, 32, known, sprite, sector);
        ctx.restore();
        text(ctx, known ? e[1] : "???", 70, y + 4, known ? "#FFD166" : "#5A6080", { shadow: "#05060C" });
        var desc = wrap((known ? e[2] : t.codexUnknown).toUpperCase(), SCREEN_W - 84, 1);
        for (var l = 0; l < Math.min(3, desc.length); l++)
            text(ctx, desc[l], 70, y + 15 + l * 10, known ? "#FFFFFF" : "#5A6080", { shadow: "#05060C" });
    }
}

function traitSector(key) {
    if (key === "basic" || key === "ship") return 0;
    var i = C.traitOrder.indexOf(key);
    return i < 0 ? 0 : i + 1;
}
function bossSector(id) {
    for (var i = 0; i < C.sectors.length; i++) if (C.sectors[i].boss === id) return i;
    return 0;
}

// PAUSE: the frozen battle shows through a dark veil.
function drawPause(ctx, t) {
    ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = "#05060C";
    ctx.fillRect(0, 12, SCREEN_W, 240);
    ctx.globalAlpha = 1;
    title(ctx, t.paused, SCREEN_W / 2, 52, CHROME, 3, "#05060C", "#5B2A8A");
    text(ctx, t.menuHint, SCREEN_W / 2, 92, "#8C93B8", { align: "center" });
}

// GAME OVER / MIND RESTORED with the numbers of the game.
// r = { won, score, best, sector, wave, kills, accuracy, record }
function drawResult(ctx, t, r) {
    ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#05060C";
    ctx.fillRect(0, 12, SCREEN_W, 240);
    ctx.globalAlpha = 1;
    title(ctx, r.won ? t.victoryTitle : t.gameOver, SCREEN_W / 2, 24, r.won ? MINT : BLOOD, 2, "#05060C", null);
    var rows = [[t.finalScore, String(r.score)], [t.best, String(r.best)],
                [t.reached, t.sector + " " + r.sector + " · " + t.wave + " " + r.wave],
                [t.kills, String(r.kills)], [t.accuracy, r.accuracy + "%"]];
    panel(ctx, 40, 58, 240, 8 + rows.length * 12, true, "#0E1020");
    for (var i = 0; i < rows.length; i++) {
        var y = 62 + i * 12;
        text(ctx, rows[i][0], 48, y, "#8C93B8");
        text(ctx, rows[i][1], 272, y, i === 1 ? "#FFD166" : "#FFFFFF", { align: "right" });
    }
}
