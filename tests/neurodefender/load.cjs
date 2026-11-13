// Loads the game's QML JavaScript libraries into Node, the way the QML
// engine does: ".pragma library" files whose ".import" lines become
// namespace objects. Top-level "var" and "function" declarations are the
// exported names.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = path.resolve(__dirname, "../../biglinux-livecd/usr/share/biglinux/calamares-profiles/bigwindowmaker/branding/bigwindowmaker/neurodefender");

const cache = {};
function load(name) {
    if (cache[name]) return cache[name];
    const src = fs.readFileSync(path.join(DIR, name), "utf8");
    const ctx = { Math, console };
    const body = src.split("\n").map((line) => {
        const m = line.match(/^\.import\s+"([^"]+)"\s+as\s+(\w+)/);
        if (m) { ctx[m[2]] = load(m[1]); return ""; }
        return line.startsWith(".pragma") ? "" : line;
    }).join("\n");
    vm.createContext(ctx);
    vm.runInContext(body, ctx, { filename: name });
    cache[name] = ctx;
    return ctx;
}
module.exports = { load, DIR };
