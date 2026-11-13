.pragma library
.import "config.js" as C
// NeuroDefender: Nanobot Crisis — game engine.
//
// Pure JavaScript, no QML types: the same file runs in the installer and in
// the Node.js tests (tests/neurodefender). Deterministic: a seeded random
// generator and a fixed 1/60 s step, so a seed and a list of inputs always
// produce the same game.
//
// Memory: every entity lives in a fixed pool allocated by create(); the loop
// only flips "on" flags and rewrites fields. Events for the interface (sound,
// banners, achievements) are short strings in a reused array.

// Nanobot states (finite-state machine). Cloaking, shields, regeneration and
// teleport warnings are timers that run alongside these.
var SPAWNING = 0;     // flying in along an entry path
var FORMATION = 1;    // holding its slot in the swaying formation
var ATTACKING = 2;    // on an attack path (swoop, dive, pincer, choreography)
var RETREATING = 3;   // flying back to its slot from the top of the arena
var DESTROYED = 4;

// ---------------------------------------------------------------- random

function rnd(g) {
    // mulberry32: small, fast and good enough for a game
    var t = (g.rng += 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rndRange(g, a, b) { return a + (b - a) * rnd(g); }
function rndInt(g, n) { return Math.floor(rnd(g) * n); }

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

// ---------------------------------------------------------------- pools

function makePool(n, factory) {
    var a = new Array(n);
    for (var i = 0; i < n; i++) a[i] = factory();
    return a;
}
function take(pool) {
    for (var i = 0; i < pool.length; i++)
        if (!pool[i].on) return pool[i];
    return null;
}
function count(pool) {
    var n = 0;
    for (var i = 0; i < pool.length; i++) if (pool[i].on) n++;
    return n;
}

function newShot() { return { on: false, x: 0, y: 0, vx: 0, vy: 0, kind: 0, near: false, nearDone: false, hit: false }; }
function newParticle() { return { on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: "#fff", size: 1 }; }
function newPickup() { return { on: false, x: 0, y: 0, type: "spread", t: 0 }; }
function newText() { return { on: false, x: 0, y: 0, text: "", life: 0, color: "#fff" }; }
function newEnemy() {
    return {
        on: false, id: 0, kind: "drone", sprite: "drone", hp: 1, maxHp: 1, r: 5, score: 50,
        split: false, shield: false, cloak: false, teleport: false, dive: false, coord: false, regen: false,
        state: SPAWNING, slotX: 0, slotY: 0, x: 0, y: 0, offX: 0, delay: 0,
        segs: [], seg: 0, segT: 0, pathEnd: 0, attack: "", kamikaze: false, bonus: false, minion: false,
        shieldHp: 0, shieldMax: 0, cloakPhase: 0, cloakT: 0, tpCool: 0, tpCount: 0, tpWarn: 0, tpTarget: 0,
        lastHit: 9, regenT: 0, bubble: 0, bubbleT: 0, link: -1, carrier: false, flash: 0, gen: 0,
        fireCool: 0, bombMark: 0, wobble: 0
    };
}
function newPart() { return { kind: "core", ox: 0, oy: 0, hp: 1, maxHp: 1, r: 6, alive: true, flash: 0, bombMark: 0 }; }

// ---------------------------------------------------------------- create

function create(seed) {
    var g = {
        rng: (seed >>> 0) || 1,
        seed: seed >>> 0,
        mode: "play",                 // "play" or "demo"
        time: 0, acc: 0,
        phase: "idle", phaseT: 0,
        sector: 0, wave: 0, bonusWave: false,
        score: 0, best: 0,
        skill: 1.0,
        combo: 0, comboT: 0, mult: 1,
        p: { x: 160, y: 214, alive: true, energy: 100, lives: 3, bombs: 2, inv: 0, cool: 0,
             spread: 0, rapid: 0, laser: 0, shield: 0, flash: 0, deadT: 0, tilt: 0, laserTop: 0, laserOn: false },
        shots: makePool(C.MAX_PLAYER_SHOTS, newShot),
        eshots: makePool(C.MAX_ENEMY_SHOTS, newShot),
        enemies: makePool(C.MAX_ENEMIES, newEnemy),
        particles: makePool(C.MAX_PARTICLES, newParticle),
        pickups: makePool(C.MAX_PICKUPS, newPickup),
        texts: makePool(C.MAX_TEXTS, newText),
        boss: { on: false, id: "", def: null, x: 160, y: -40, t: 0, dir: 1, parts: makePool(5, newPart), nparts: 0,
                pats: [], phaseIdx: 0, cloakT: 0, teleT: 0, teleX: 0, lastHit: 9, dying: 0, entering: 0, rebuildT: 0 },
        bomb: { on: false, x: 0, y: 0, t: 0, r: 0, mark: 0 },
        attackT: 2, waveT: 0, waveDamaged: false, spawnLeft: 0, nextId: 1,
        bonusKills: 0, bonusTotal: 0, pendingBonus: false,
        stats: { shots: 0, hits: 0, kills: 0, maxCombo: 0, bossKills: 0, shieldBlocks: 0, nearMisses: 0 },
        seen: {},
        achieved: {},
        events: [],
        banner: "", bannerArg: "", bannerT: 0,
        lowFx: false,
        shake: 0,
        flashT: 0
    };
    return g;
}

function emit(g, ev) { if (g.events.length < 32) g.events.push(ev); }

function setBanner(g, key, arg, t) {
    g.banner = key; g.bannerArg = arg === undefined ? "" : String(arg); g.bannerT = t;
}

// ---------------------------------------------------------------- flow

// mode: "play" or "demo"; sector: 0..8 (the demo starts anywhere)
function startGame(g, mode, seed, sector) {
    var best = g.best, seen = g.seen, achieved = g.achieved, lowFx = g.lowFx;
    var fresh = create(seed);
    for (var k in fresh) g[k] = fresh[k];
    g.best = best; g.seen = seen; g.achieved = achieved; g.lowFx = lowFx;
    g.mode = mode;
    g.sector = sector || 0;
    var p = g.p;
    p.lives = C.player.lives; p.bombs = C.player.bombs; p.energy = C.player.energy;
    p.x = C.ARENA_W / 2; p.y = C.ARENA_H - 26;
    beginSector(g);
}

function beginSector(g) {
    g.wave = 0;
    g.bonusWave = false;
    clearField(g);
    g.phase = "sectorIntro"; g.phaseT = C.flow.sectorIntro;
    setBanner(g, "sector", g.sector + 1, C.flow.sectorIntro);
    var tr = C.sectors[g.sector].trait;
    if (tr) { g.seen[tr] = true; emit(g, "sfx:evolve"); }
}

function clearField(g) {
    var i;
    for (i = 0; i < g.enemies.length; i++) g.enemies[i].on = false;
    for (i = 0; i < g.eshots.length; i++) g.eshots[i].on = false;
    for (i = 0; i < g.shots.length; i++) g.shots[i].on = false;
    for (i = 0; i < g.pickups.length; i++) g.pickups[i].on = false;
    g.boss.on = false;
}

function nextPhase(g) {
    switch (g.phase) {
    case "sectorIntro":
        g.phase = "ready"; g.phaseT = C.flow.ready; setBanner(g, "ready", "", C.flow.ready);
        break;
    case "ready":
        startWave(g);
        break;
    case "waveClear":
        if (g.bonusWave) { finishBonus(g); break; }
        g.wave++;
        if (g.wave >= C.wavesPerSector) {
            g.phase = "bossWarning"; g.phaseT = C.flow.bossWarning;
            setBanner(g, "warning", "", C.flow.bossWarning); emit(g, "sfx:warning");
        } else {
            g.phase = "ready"; g.phaseT = C.flow.ready; setBanner(g, "wave", g.wave + 1, C.flow.ready);
        }
        break;
    case "bossWarning":
        startBoss(g);
        break;
    case "bossDown":
        afterBoss(g);
        break;
    case "bonusResult":
        advanceSector(g);
        break;
    case "dying":
        g.phase = "gameover"; g.phaseT = 0;
        if (g.score > g.best) { g.best = g.score; emit(g, "record"); }
        emit(g, "sfx:gameover");
        break;
    case "victory":
        g.phase = "won"; g.phaseT = 0;
        if (g.score > g.best) { g.best = g.score; emit(g, "record"); }
        break;
    }
}

function afterBoss(g) {
    if (C.sectors[g.sector].boss === "overmind") {
        g.phase = "victory"; g.phaseT = C.flow.victory;
        setBanner(g, "victory", "", C.flow.victory); emit(g, "sfx:victory");
        achieve(g, "neuralHero");
        return;
    }
    if (C.bonusAfterSector.indexOf(g.sector + 1) >= 0) {
        startBonus(g);
        return;
    }
    advanceSector(g);
}

function advanceSector(g) {
    g.sector = Math.min(g.sector + 1, C.sectors.length - 1);
    beginSector(g);
}

// ---------------------------------------------------------------- paths

// Cubic Bézier segment: [x0,y0, x1,y1, x2,y2, x3,y3, duration]
function seg(x0, y0, x1, y1, x2, y2, x3, y3, dur) { return [x0, y0, x1, y1, x2, y2, x3, y3, dur]; }
function bez(a, b, c, d, t) {
    var u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

function formationX(g, e) {
    return e.slotX + Math.sin(g.time * C.formation.swaySpeed) * C.formation.sway;
}
function formationY(g, e) {
    return e.slotY + Math.sin(g.time * 1.3 + e.slotX * 0.05) * 2;
}

function followPath(g, e, dt) {
    var s = e.segs[e.seg];
    if (!s) return true;
    e.segT += dt / s[8];
    if (e.segT >= 1) {
        e.seg++;
        e.segT = 0;
        if (e.seg >= e.segs.length) {
            e.x = s[6]; e.y = s[7];
            return true;
        }
        s = e.segs[e.seg];
    }
    e.x = bez(s[0], s[2], s[4], s[6], e.segT);
    e.y = bez(s[1], s[3], s[5], s[7], e.segT);
    return false;
}

function retreat(g, e) {
    // back to the slot, entering from the top of the arena
    var tx = formationX(g, e), ty = formationY(g, e);
    var sx = clamp(e.x, 10, C.ARENA_W - 10);
    e.segs = [seg(sx, -14, sx, 30, tx, ty - 30, tx, ty, 1.3)];
    e.seg = 0; e.segT = 0; e.x = sx; e.y = -14;
    e.state = RETREATING;
}

// ---------------------------------------------------------------- waves

function sectorTraits(g) {
    // traits a nanobot of this sector may carry, with weights
    var s = g.sector, list = [];
    var cur = C.sectors[s].trait;
    if (cur === "hive") {
        for (var i = 0; i < C.traitOrder.length; i++) list.push([C.traitOrder[i], 1]);
        return list;
    }
    var idx = C.traitOrder.indexOf(cur);
    for (var j = 0; j < idx; j++) list.push([C.traitOrder[j], 0.09]);
    if (cur) list.push([cur, 0.38 + 0.1 * g.wave]);
    return list;
}

function giveTrait(g, e, t) {
    e[t] = true;
    g.seen[t] = true;
    e.score += C.traits[t].score;
    if (t === "shield") { e.shieldMax = C.traits.shield.shieldHp + Math.floor(g.sector / 4); e.shieldHp = e.shieldMax; }
    if (t === "regen") { e.maxHp += 1; e.hp = e.maxHp; }
    if (t === "cloak") { e.cloakPhase = 0; e.cloakT = rndRange(g, 0.5, C.traits.cloak.visible); }
}

function resetEnemy(g, e, kind) {
    var k = C.enemyKinds[kind];
    e.on = true; e.id = g.nextId++; e.kind = kind; e.sprite = k.sprite;
    e.hp = k.hp; e.maxHp = k.hp; e.r = k.radius; e.score = k.score;
    e.split = e.shield = e.cloak = e.teleport = e.dive = e.coord = e.regen = false;
    e.state = SPAWNING; e.offX = 0; e.delay = 0; e.segs = []; e.seg = 0; e.segT = 0;
    e.attack = ""; e.kamikaze = false; e.bonus = false; e.minion = false;
    e.shieldHp = 0; e.shieldMax = 0; e.cloakPhase = 0; e.cloakT = 0;
    e.tpCool = 0; e.tpCount = 0; e.tpWarn = 0; e.tpTarget = 0;
    e.lastHit = 9; e.regenT = 0; e.bubble = 0; e.bubbleT = 0; e.link = -1;
    e.carrier = false; e.flash = 0; e.gen = 0; e.fireCool = 0; e.bombMark = 0; e.wobble = rnd(g) * 6.28;
}

function startWave(g) {
    g.phase = "wave"; g.phaseT = 0; g.waveT = 0; g.waveDamaged = false;
    g.attackT = 2.5;
    var s = g.sector, w = g.wave;
    var rows = Math.min(4, 2 + Math.floor((s + w + 1) / 3));
    var cols = Math.min(8, 6 + (w >= 1 ? 1 : 0) + (s >= 4 ? 1 : 0));
    var bruteChance = s >= 2 ? 0.12 + 0.03 * s : 0;
    var traitList = sectorTraits(g);
    var hive = C.sectors[s].trait === "hive";
    var made = [];
    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            var e = take(g.enemies);
            if (!e) break;
            resetEnemy(g, e, rnd(g) < bruteChance && r === 0 ? "brute" : "drone");
            e.slotX = C.ARENA_W / 2 + (c - (cols - 1) / 2) * C.formation.cellW;
            e.slotY = C.formation.top + r * C.formation.cellH;
            if (hive) {
                // collective intelligence: zero to two traits, more later in the sector
                var n = rnd(g) < 0.3 + 0.12 * w ? 2 : (rnd(g) < 0.8 ? 1 : 0);
                for (var q = 0; q < n; q++) {
                    var t = C.traitOrder[rndInt(g, C.traitOrder.length)];
                    if (!e[t]) giveTrait(g, e, t);
                }
            } else {
                for (var m = 0; m < traitList.length; m++)
                    if (rnd(g) < traitList[m][1]) giveTrait(g, e, traitList[m][0]);
            }
            made.push(e);
        }
    }
    // carriers always drop a power-up
    for (var k = 0; k < C.pickups.carrierPerWave && made.length; k++)
        made[rndInt(g, made.length)].carrier = true;
    // entry: groups of up to 8 sweep in from alternating sides
    var group = 0, delay = 0.2;
    for (var i = 0; i < made.length; i++) {
        if (i > 0 && i % 8 === 0) { group++; delay += C.formation.groupGap; }
        var en = made[i];
        var side = group % 2 === 0 ? -1 : 1;
        var sx = side < 0 ? -16 : C.ARENA_W + 16;
        var tx = en.slotX, ty = en.slotY;
        en.segs = [seg(sx, 40 + 10 * (group % 2), C.ARENA_W / 2 - side * 40, 150,
                       tx + side * 70, ty + 80, tx, ty, 1.6)];
        en.x = sx; en.y = -20;
        en.delay = delay + (i % 8) * C.formation.entryGap;
    }
    g.spawnLeft = made.length;
    emit(g, "sfx:wave");
}

function startBonus(g) {
    g.bonusWave = true;
    g.bonusKills = 0;
    g.bonusTotal = C.bonusEnemies;
    g.phase = "ready"; g.phaseT = C.flow.ready;
    setBanner(g, "bonus", "", C.flow.ready);
    // the wave itself starts from nextPhase("ready") -> startWave, but the
    // bonus has its own choreography, so build it here and hold it back
    g.pendingBonus = true;
}

function buildBonus(g) {
    g.phase = "wave"; g.phaseT = 0; g.waveT = 0; g.waveDamaged = false;
    g.pendingBonus = false;
    var W = C.ARENA_W;
    var per = C.bonusEnemies / 4;
    for (var grp = 0; grp < 4; grp++) {
        var left = grp % 2 === 0;
        for (var i = 0; i < per; i++) {
            var e = take(g.enemies);
            if (!e) break;
            resetEnemy(g, e, grp === 3 ? "brute" : "drone");
            e.hp = 1; e.maxHp = 1;           // one shot each: precision matters
            e.bonus = true;
            e.state = ATTACKING;
            var x0 = left ? -14 : W + 14;
            var mid = left ? W * 0.7 : W * 0.3;
            var loopY = 60 + grp * 18;
            // a loop through the arena, then out the other side; never into
            // the ship's zone, and no shots: pure target practice
            e.segs = [
                seg(x0, 20 + grp * 10, W / 2, -10, mid, loopY + 90, W / 2, loopY + 60, 1.8),
                seg(W / 2, loopY + 60, W - mid, loopY + 30, W - mid + (left ? 40 : -40), loopY - 50, left ? W + 16 : -16, 30, 1.9)
            ];
            e.x = x0; e.y = -20;
            e.delay = 0.3 + grp * 1.7 + i * 0.16;
        }
    }
    g.spawnLeft = C.bonusEnemies;
    emit(g, "sfx:wave");
}

function finishBonus(g) {
    g.bonusWave = false;
    var perfect = g.bonusKills >= g.bonusTotal;
    if (perfect) addScore(g, C.bonusPerfect, C.ARENA_W / 2, 110, "#FFD166");
    g.phase = "bonusResult"; g.phaseT = C.flow.bonusResult;
    setBanner(g, perfect ? "bonusPerfect" : "bonusResult", g.bonusKills + "/" + g.bonusTotal, C.flow.bonusResult);
}

// ---------------------------------------------------------------- bosses

function startBoss(g) {
    var id = C.sectors[g.sector].boss;
    var def = C.bosses[id];
    var b = g.boss;
    b.on = true; b.id = id; b.def = def;
    b.x = C.ARENA_W / 2; b.y = -40; b.t = 0; b.dir = 1;
    b.entering = 2.2; b.dying = 0; b.cloakT = 0; b.teleT = 0; b.lastHit = 9; b.phaseIdx = 0; b.rebuildT = 0;
    var scale = def.hpScale * (0.9 + 0.1 * g.skill);
    b.nparts = def.parts.length;
    for (var i = 0; i < b.parts.length; i++) {
        var pt = b.parts[i];
        if (i < def.parts.length) {
            var d = def.parts[i];
            pt.kind = d.kind; pt.ox = d.x; pt.oy = d.y; pt.r = d.r;
            pt.maxHp = Math.round(d.hp * scale); pt.hp = pt.maxHp; pt.alive = true; pt.flash = 0; pt.bombMark = 0;
        } else {
            pt.alive = false;
        }
    }
    setPatterns(g, def.phases ? def.phases[0].patterns : def.patterns);
    g.seen["boss_" + id] = true;
    g.phase = "boss"; g.phaseT = 0; g.waveDamaged = false;
}

function setPatterns(g, list) {
    var b = g.boss;
    b.pats = [];
    for (var i = 0; i < list.length; i++)
        b.pats.push({ d: list[i], t: list[i].every * (0.6 + 0.3 * i), left: 0, angle: 0 });
}

function bossCore(g) { return g.boss.parts[0]; }
function bossCoreShielded(g) {
    var b = g.boss;
    if (!b.def.shieldedCore) return false;
    for (var i = 1; i < b.nparts; i++)
        if (b.parts[i].alive && b.parts[i].kind === "gen") return true;
    return false;
}

function updateBoss(g, dt) {
    var b = g.boss;
    if (!b.on) return;
    b.t += dt;
    b.lastHit += dt;
    var i, pt;
    for (i = 0; i < b.nparts; i++) if (b.parts[i].flash > 0) b.parts[i].flash -= dt;
    if (b.dying > 0) {
        b.dying -= dt;
        if (rnd(g) < 0.35) explode(g, b.x + rndRange(g, -30, 30), b.y + rndRange(g, -12, 12), C.sectors[g.sector].glow, 10);
        if (b.dying <= 0) {
            b.on = false;
            explode(g, b.x, b.y, "#FFFFFF", 40);
            g.shake = 0.6;
            g.phase = "bossDown"; g.phaseT = 1.6;
            setBanner(g, "sectorClear", g.sector + 1, 1.6);
            addScore(g, C.scores.sectorClear, b.x, b.y + 20, "#FFD166");
        }
        return;
    }
    if (b.entering > 0) {
        b.entering -= dt;
        b.y += (52 - b.y) * Math.min(1, dt * 2.2);
        return;
    }
    // final boss: phases follow the core's remaining energy
    if (b.def.phases) {
        var frac = bossCore(g).hp / bossCore(g).maxHp;
        var want = 0;
        while (want < b.def.phases.length - 1 && frac <= b.def.phases[want].above) want++;
        if (want !== b.phaseIdx) {
            b.phaseIdx = want;
            setPatterns(g, b.def.phases[want].patterns);
            setBanner(g, "phase", want + 1, 1.6);
            emit(g, "sfx:evolve");
            g.flashT = 0.3;
            if (want === 1) reviveGens(g);
        }
    }
    // movement
    if (b.teleT > 0) {
        b.teleT -= dt;
        if (b.teleT <= 0) {
            explode(g, b.x, b.y, "#FFFFFF", 8);
            b.x = b.teleX;
            emit(g, "sfx:teleport");
        }
    } else if (b.def.speed > 0) {
        b.x += b.dir * b.def.speed * dt;
        if (b.x < 70) { b.x = 70; b.dir = 1; }
        if (b.x > C.ARENA_W - 70) { b.x = C.ARENA_W - 70; b.dir = -1; }
    }
    b.y = 52 + Math.sin(b.t * 0.9) * 6;
    if (b.cloakT > 0) b.cloakT -= dt;
    // attack patterns
    for (i = 0; i < b.pats.length; i++) {
        var pat = b.pats[i];
        pat.t -= dt;
        if (pat.t > 0) continue;
        firePattern(g, pat);
    }
}

function partX(b, pt) { return b.x + pt.ox; }
function partY(b, pt) { return b.y + pt.oy; }

function firePattern(g, pat) {
    var b = g.boss, d = pat.d, p = g.p, i, pt, a;
    var core = bossCore(g);
    var speed = (C.enemyFire.speed + C.enemyFire.speedGrowth * g.sector) * g.skill;
    pat.t = d.every;
    switch (d.id) {
    case "fan":
        for (i = 0; i < d.count; i++) {
            a = Math.PI / 2 + (i - (d.count - 1) / 2) * (d.spread / Math.max(1, d.count - 1));
            enemyShot(g, b.x, b.y + 8, Math.cos(a) * speed, Math.sin(a) * speed, 1);
        }
        emit(g, "sfx:eshot");
        break;
    case "aimed":
        for (i = 1; i < b.nparts; i++) {
            pt = b.parts[i];
            if (!pt.alive || pt.kind !== "turret") continue;
            aimShot(g, partX(b, pt), partY(b, pt) + 4, speed * 1.1, 0);
        }
        break;
    case "burst":
        for (i = 0; i < d.count; i++) aimShot(g, b.x, b.y + 8, speed * 1.2, (i - (d.count - 1) / 2) * 0.12);
        emit(g, "sfx:eshot");
        break;
    case "rain":
        for (i = 0; i < d.count; i++)
            enemyShot(g, b.x + rndRange(g, -50, 50), b.y + 6, rndRange(g, -12, 12), speed * 0.75, 2);
        break;
    case "spiral":
        if (pat.left <= 0) pat.left = d.burst;
        a = pat.angle;
        enemyShot(g, b.x, b.y, Math.cos(a) * speed * 0.8, Math.abs(Math.sin(a)) * speed * 0.8 + 18, 0);
        pat.angle += 0.55;
        pat.left--;
        if (pat.left <= 0) pat.t = d.rest;
        break;
    case "crossfire":
        for (i = 1; i < b.nparts; i++) {
            pt = b.parts[i];
            if (!pt.alive || pt.kind !== "turret") continue;
            // outer turrets aim beside the ship to close the escape routes
            var side = pt.ox < 0 ? -1 : 1;
            var tx = p.x + side * (Math.abs(pt.ox) > 20 ? 28 : -4);
            var dx = tx - partX(b, pt), dy = p.y - partY(b, pt);
            var len = Math.sqrt(dx * dx + dy * dy) || 1;
            enemyShot(g, partX(b, pt), partY(b, pt), dx / len * speed, dy / len * speed, 0);
        }
        emit(g, "sfx:eshot");
        break;
    case "summon":
        for (i = 0; i < d.count; i++) summonMinion(g, d.trait, i, d.count);
        emit(g, "sfx:evolve");
        break;
    case "launch":
        for (i = 0; i < d.count; i++) launchDiver(g, i);
        break;
    case "regenGen":
        // once every generator is down, a visible countdown runs before they
        // come back at half strength: the opening to hit the core is fair
        if (!bossCoreShielded(g) && hasGens(g)) {
            if (b.rebuildT <= 0) b.rebuildT = d.rebuild;
            else {
                b.rebuildT -= d.every;
                if (b.rebuildT <= 0 && reviveGens(g)) { b.rebuildT = 0; setBanner(g, "shieldRebuilt", "", 1.2); emit(g, "sfx:shield"); }
            }
        }
        break;
    case "cloak":
        b.cloakT = 2.6;
        emit(g, "sfx:cloak");
        break;
    case "teleport":
        b.teleT = 0.45;
        var nx;
        do { nx = rndRange(g, 70, C.ARENA_W - 70); } while (Math.abs(nx - b.x) < 50);
        b.teleX = nx;
        break;
    case "heal":
        if (b.lastHit > d.delay) {
            for (i = 0; i < b.nparts; i++) {
                pt = b.parts[i];
                if (pt.alive && pt.hp < pt.maxHp) pt.hp = Math.min(pt.maxHp, pt.hp + d.amount);
            }
        }
        break;
    }
}

function hasGens(g) {
    var b = g.boss;
    for (var i = 1; i < b.nparts; i++) if (b.parts[i].kind === "gen") return true;
    return false;
}

function reviveGens(g) {
    var b = g.boss, any = false;
    if (bossCore(g).hp <= 0) return false;
    for (var i = 1; i < b.nparts; i++) {
        var pt = b.parts[i];
        if (pt.kind === "gen" && !pt.alive) {
            pt.alive = true; pt.hp = Math.round(pt.maxHp * 0.5); any = true;
        }
    }
    return any;
}

function summonMinion(g, trait, i, n) {
    var e = take(g.enemies);
    if (!e) return;
    var b = g.boss;
    resetEnemy(g, e, "drone");
    if (trait) giveTrait(g, e, trait);
    e.minion = true;
    e.slotX = clamp(b.x + (i - (n - 1) / 2) * 40, 24, C.ARENA_W - 24);
    e.slotY = 98 + (i % 2) * 12;
    e.x = b.x; e.y = b.y;
    e.segs = [seg(b.x, b.y, b.x, b.y + 30, e.slotX, e.slotY - 30, e.slotX, e.slotY, 0.9)];
    e.state = SPAWNING;
}

function launchDiver(g, i) {
    var e = take(g.enemies);
    if (!e) return;
    var b = g.boss, p = g.p;
    resetEnemy(g, e, "mite");
    giveTrait(g, e, "dive");
    e.kamikaze = true;
    e.state = ATTACKING; e.attack = "dive";
    var sx = b.x + (i === 0 ? -24 : 24);
    var tx = clamp(p.x + (i === 0 ? -12 : 12), 10, C.ARENA_W - 10);
    e.x = sx; e.y = b.y;
    e.segs = [seg(sx, b.y, sx + (i === 0 ? -60 : 60), b.y + 40, tx, p.y - 50, tx, C.ARENA_H + 20, 1.9)];
    emit(g, "sfx:dive");
}

// ---------------------------------------------------------------- shots

function enemyShot(g, x, y, vx, vy, kind) {
    if (g.bonusWave) return;
    var s = take(g.eshots);
    if (!s) return;
    s.on = true; s.x = x; s.y = y; s.vx = vx; s.vy = vy; s.kind = kind;
    s.near = false; s.nearDone = false; s.hit = false;
}

function aimShot(g, x, y, speed, angleOffset) {
    var p = g.p;
    var a = Math.atan2(p.y - y, p.x - x) + angleOffset;
    // never shoot upwards: keeps the bullets readable
    if (Math.sin(a) < 0.25) a = Math.PI / 2 + (p.x < x ? 0.6 : -0.6);
    enemyShot(g, x, y, Math.cos(a) * speed, Math.sin(a) * speed, 0);
}

function playerFire(g) {
    var p = g.p;
    var angles = C.player.spreadAngles[p.spread];
    for (var i = 0; i < angles.length; i++) {
        var s = take(g.shots);
        if (!s) break;
        s.on = true; s.x = p.x + (angles.length === 2 ? (i === 0 ? -3 : 3) : 0); s.y = p.y - 7;
        s.vx = Math.sin(angles[i]) * C.player.shotSpeed;
        s.vy = -Math.cos(angles[i]) * C.player.shotSpeed;
        s.kind = p.spread; s.hit = false;
        g.stats.shots++;
    }
    p.cool = p.rapid > 0 ? C.player.rapidCooldown : C.player.fireCooldown;
    emit(g, "sfx:shot");
}

// ---------------------------------------------------------------- effects

function explode(g, x, y, color, n) {
    var limit = g.lowFx ? C.MAX_PARTICLES_LOWFX : C.MAX_PARTICLES;
    var used = 0;
    for (var i = 0; i < g.particles.length && n > 0; i++) {
        var q = g.particles[i];
        if (q.on) { used++; if (used >= limit) break; continue; }
        var a = rnd(g) * 6.283, sp = rndRange(g, 20, 90);
        q.on = true; q.x = x; q.y = y; q.vx = Math.cos(a) * sp; q.vy = Math.sin(a) * sp;
        q.max = q.life = rndRange(g, 0.25, 0.7);
        q.color = rnd(g) < 0.3 ? "#FFFFFF" : color;
        q.size = rnd(g) < 0.25 ? 2 : 1;
        n--; used++;
    }
}

function floatText(g, x, y, text, color) {
    var t = take(g.texts);
    if (!t) return;
    t.on = true; t.x = x; t.y = y; t.text = text; t.life = 0.9; t.color = color;
}

function addScore(g, pts, x, y, color) {
    g.score += pts;
    if (x !== undefined) floatText(g, x, y, "+" + pts, color || "#FFFFFF");
}

function achieve(g, id) {
    if (g.mode !== "play" || g.achieved[id]) return;
    g.achieved[id] = true;
    emit(g, "ach:" + id);
}

// ---------------------------------------------------------------- damage

// Returns true when the shot is consumed (blocked or hit).
function damageEnemy(g, e, dmg, sx, svx, svy, laser) {
    if (e.state === DESTROYED || !e.on) return false;
    // a coordinator's protective bubble absorbs whole hits
    if (e.bubble > 0 && !laser) {
        e.bubble--; e.flash = 0.08;
        explode(g, e.x, e.y, "#FFFFFF", 3);
        emit(g, "sfx:block");
        return true;
    }
    // directional shield: blocks shots coming straight up from below
    if (e.shield && e.shieldHp > 0) {
        var straight = laser || Math.abs(svx) < Math.abs(svy) * 0.35;
        if (straight && (laser || svy < 0)) {
            e.shieldHp -= laser ? dmg * 2 : dmg;
            e.flash = 0.06;
            if (e.shieldHp <= 0) {
                e.shieldHp = 0;
                explode(g, e.x, e.y + 5, C.sectors[g.sector].b, 8);
                emit(g, "sfx:shieldbreak");
            } else emit(g, "sfx:block");
            return true;
        }
    }
    e.lastHit = 0;
    e.regenT = 0;
    e.flash = 0.08;
    if (e.split && e.gen === 0) {
        splitEnemy(g, e);
        return true;
    }
    e.hp -= dmg;
    if (e.hp <= 0) killEnemy(g, e);
    else emit(g, "sfx:hit");
    return true;
}

function splitEnemy(g, e) {
    // two smaller, faster clones; clones never split again
    var x = e.x, y = e.y, sx = e.slotX, sy = e.slotY, st = e.state;
    e.on = false; e.state = DESTROYED;
    explode(g, x, y, C.sectors[g.sector].a, 6);
    emit(g, "sfx:split");
    for (var i = 0; i < 2; i++) {
        var c = take(g.enemies);
        if (!c) break;
        resetEnemy(g, c, "mite");
        c.gen = 1;
        c.slotX = clamp(sx + (i === 0 ? -7 : 7), 10, C.ARENA_W - 10); c.slotY = sy;
        c.x = x + (i === 0 ? -4 : 4); c.y = y;
        c.minion = e.minion;
        if (st === FORMATION || st === SPAWNING) c.state = FORMATION;
        else { c.state = ATTACKING; c.attack = "swoop"; c.segs = [seg(c.x, c.y, c.x + (i ? 40 : -40), c.y + 30, c.x + (i ? 20 : -20), c.y + 70, c.x, C.ARENA_H + 20, 1.6)]; c.seg = 0; c.segT = 0; }
    }
    g.stats.kills++;
    addScore(g, Math.round(e.score * g.mult), x, y - 6, C.sectors[g.sector].b);
}

function killEnemy(g, e) {
    var diving = e.state === ATTACKING && e.attack === "dive";
    e.state = DESTROYED;
    e.on = false;
    var sec = C.sectors[g.sector];
    explode(g, e.x, e.y, e.carrier ? "#FFD166" : sec.a, e.kind === "brute" ? 16 : 10);
    emit(g, e.kind === "brute" ? "sfx:boom" : "sfx:pop");
    // combo chain
    if (g.comboT > 0) g.combo++; else g.combo = 1;
    g.comboT = C.combo.window;
    g.mult = Math.min(C.combo.maxMultiplier, 1 + Math.floor(g.combo / C.combo.stepKills) * 0.5);
    if (g.combo > g.stats.maxCombo) g.stats.maxCombo = g.combo;
    if (g.mult >= C.combo.maxMultiplier) achieve(g, "comboKing");
    var pts = e.score * (diving ? 2 : 1);   // shot down mid-dive: double
    if (e.bonus) { pts = C.bonusKillScore; g.bonusKills++; }
    addScore(g, Math.round(pts * g.mult), e.x, e.y - 6, e.carrier ? "#FFD166" : sec.b);
    g.stats.kills++;
    achieve(g, "firstBlood");
    if (g.stats.kills >= 100) achieve(g, "hunter");
    if (!e.bonus && (e.carrier || rnd(g) < C.pickups.dropChance)) dropPickup(g, e.x, e.y);
}

function damagePart(g, pt, dmg) {
    var b = g.boss;
    if (!pt.alive || b.dying > 0 || b.entering > 0) return false;
    if (pt.kind === "core" && bossCoreShielded(g)) {
        pt.flash = 0.05;
        emit(g, "sfx:block");
        return true;
    }
    pt.hp -= dmg;
    pt.flash = 0.06;
    b.lastHit = 0;
    if (pt.hp <= 0) {
        pt.hp = 0;
        pt.alive = false;
        explode(g, partX(b, pt), partY(b, pt), C.sectors[g.sector].glow, 18);
        emit(g, "sfx:boom");
        if (pt.kind === "core") {
            b.dying = 1.6;
            g.stats.bossKills++;
            addScore(g, C.scores.bossCore, b.x, b.y, "#FFD166");
            for (var i = 0; i < g.eshots.length; i++) g.eshots[i].on = false;
            for (var j = 0; j < g.enemies.length; j++)
                if (g.enemies[j].on) killEnemy(g, g.enemies[j]);
        } else {
            addScore(g, C.scores.bossPart, partX(b, pt), partY(b, pt), "#FFD166");
        }
    }
    return true;
}

// ---------------------------------------------------------------- pickups

function dropPickup(g, x, y) {
    var u = take(g.pickups);
    if (!u) return;
    var total = 0, i, types = C.pickups.types;
    for (i = 0; i < types.length; i++) total += types[i].weight;
    var r = rnd(g) * total;
    for (i = 0; i < types.length; i++) { r -= types[i].weight; if (r <= 0) break; }
    u.on = true; u.x = x; u.y = y; u.t = 0;
    u.type = types[Math.min(i, types.length - 1)].id;
}

function collect(g, u) {
    var p = g.p;
    u.on = false;
    switch (u.type) {
    case "spread": if (p.spread < 2) p.spread++; else addScore(g, 500, p.x, p.y - 12, "#FFD166"); break;
    case "rapid": p.rapid = C.weapons.rapidTime; break;
    case "laser": p.laser = C.weapons.laserTime; break;
    case "shield": p.shield = C.weapons.shieldTime; break;
    case "bomb": if (p.bombs < C.player.maxBombs) p.bombs++; else addScore(g, 500, p.x, p.y - 12, "#FFD166"); break;
    case "repair": p.energy = Math.min(C.player.energy, p.energy + C.weapons.repair); break;
    case "life": if (p.lives < C.player.maxLives) p.lives++; else addScore(g, 2000, p.x, p.y - 12, "#FFD166"); break;
    }
    floatText(g, p.x, p.y - 14, u.type.toUpperCase(), "#39FF88");
    emit(g, "sfx:powerup");
    emit(g, "pickup:" + u.type);
}

// ---------------------------------------------------------------- player

function hurtPlayer(g, dmg) {
    var p = g.p;
    if (!p.alive || p.inv > 0) return;
    if (p.shield > 0) {
        g.stats.shieldBlocks++;
        if (g.stats.shieldBlocks >= 10) achieve(g, "shieldMaster");
        emit(g, "sfx:block");
        explode(g, p.x, p.y, "#00E5FF", 4);
        return;
    }
    p.energy -= dmg;
    p.flash = 0.25;
    g.shake = 0.2;
    g.waveDamaged = true;
    emit(g, "sfx:hurt");
    if (p.energy <= 0) loseLife(g);
}

function loseLife(g) {
    var p = g.p;
    p.energy = 0;
    p.alive = false;
    p.lives--;
    p.deadT = C.player.respawnDelay;
    p.spread = Math.max(0, p.spread - 1);
    p.rapid = 0; p.laser = 0; p.shield = 0; p.laserOn = false;
    g.skill = clamp(g.skill + C.difficulty.onDeath, C.difficulty.min, C.difficulty.max);
    g.combo = 0; g.mult = 1; g.comboT = 0;
    explode(g, p.x, p.y, "#00E5FF", 30);
    explode(g, p.x, p.y, "#FFFFFF", 12);
    g.shake = 0.5;
    emit(g, "sfx:death");
    if (p.lives <= 0) { g.phase = "dying"; g.phaseT = 1.6; }
}

function updatePlayer(g, dt, input) {
    var p = g.p;
    if (p.inv > 0) p.inv -= dt;
    if (p.flash > 0) p.flash -= dt;
    if (p.rapid > 0) p.rapid -= dt;
    if (p.laser > 0) p.laser -= dt;
    if (p.shield > 0) p.shield -= dt;
    if (p.cool > 0) p.cool -= dt;
    if (!p.alive) {
        if (g.phase === "dying") return;
        p.deadT -= dt;
        if (p.deadT <= 0) {
            p.alive = true; p.energy = C.player.energy; p.inv = C.player.invulnerable;
            p.x = C.ARENA_W / 2; p.y = C.ARENA_H - 26;
        }
        return;
    }
    var dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    var dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (input.pointer) {
        // mouse steering: head for the pointer while the button is held
        var tx = input.px - p.x, ty = input.py - p.y;
        dx = Math.abs(tx) > 2 ? (tx > 0 ? 1 : -1) * Math.min(1, Math.abs(tx) / 12) : 0;
        dy = Math.abs(ty) > 2 ? (ty > 0 ? 1 : -1) * Math.min(1, Math.abs(ty) / 12) : 0;
    }
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1) { dx /= len; dy /= len; }   // diagonals are not faster
    p.x = clamp(p.x + dx * C.player.speed * dt, C.player.margin, C.ARENA_W - C.player.margin);
    p.y = clamp(p.y + dy * C.player.speed * dt, C.ARENA_H * C.player.zoneTop, C.ARENA_H - C.player.margin);
    p.tilt += (dx - p.tilt) * Math.min(1, dt * 10);
    var firing = input.fire && g.phase !== "sectorIntro";
    p.laserOn = firing && p.laser > 0;
    if (firing && !p.laserOn && p.cool <= 0) playerFire(g);
    if (input.bomb) useBomb(g);
}

function useBomb(g) {
    var p = g.p, bm = g.bomb;
    if (!p.alive || p.bombs <= 0 || bm.on) return;
    p.bombs--;
    bm.on = true; bm.x = p.x; bm.y = p.y; bm.t = 0; bm.r = 0; bm.mark++;
    g.flashT = 0.15;
    emit(g, "sfx:bomb");
}

function updateBomb(g, dt) {
    var bm = g.bomb;
    if (!bm.on) return;
    bm.t += dt;
    var f = bm.t / C.weapons.bombTime;
    bm.r = C.weapons.bombRadius * Math.min(1, f);
    var r2 = bm.r * bm.r, i, dx, dy;
    for (i = 0; i < g.eshots.length; i++) {
        var s = g.eshots[i];
        if (!s.on) continue;
        dx = s.x - bm.x; dy = s.y - bm.y;
        if (dx * dx + dy * dy < r2) { s.on = false; addScore(g, 5); }
    }
    for (i = 0; i < g.enemies.length; i++) {
        var e = g.enemies[i];
        if (!e.on || e.bombMark === bm.mark || e.delay > 0) continue;
        dx = e.x - bm.x; dy = e.y - bm.y;
        if (dx * dx + dy * dy < r2) {
            e.bombMark = bm.mark;
            e.shieldHp = 0; e.bubble = 0;
            damageEnemy(g, e, C.weapons.bombDamage, bm.x, 0, -1, false);
        }
    }
    var b = g.boss;
    if (b.on) {
        for (i = 0; i < b.nparts; i++) {
            var pt = b.parts[i];
            if (!pt.alive || pt.bombMark === bm.mark) continue;
            dx = partX(b, pt) - bm.x; dy = partY(b, pt) - bm.y;
            if (dx * dx + dy * dy < r2) { pt.bombMark = bm.mark; damagePart(g, pt, C.weapons.bombBossDamage); }
        }
    }
    if (f >= 1) bm.on = false;
}

// ---------------------------------------------------------------- enemies

function scheduleAttack(g) {
    var cands = [], i, e;
    for (i = 0; i < g.enemies.length; i++) {
        e = g.enemies[i];
        if (e.on && e.state === FORMATION && !e.bonus && e.tpWarn <= 0) cands.push(e);
    }
    if (!cands.length) return;
    e = cands[rndInt(g, cands.length)];
    // clones are more mobile: prefer them
    for (i = 0; i < cands.length; i++) if (cands[i].gen > 0 && rnd(g) < 0.5) { e = cands[i]; break; }
    if (e.coord) {
        // coordinated pincer: a second nanobot attacks the other flank
        var mate = null;
        for (i = 0; i < cands.length; i++) if (cands[i] !== e && (cands[i].coord || rnd(g) < 0.3)) { mate = cands[i]; break; }
        launchAttack(g, e, "pincer", -1);
        if (mate) launchAttack(g, mate, "pincer", 1);
        emit(g, "sfx:dive");
        return;
    }
    launchAttack(g, e, e.dive ? "dive" : "swoop", 0);
    if (e.dive) emit(g, "sfx:dive");
}

function launchAttack(g, e, kind, side) {
    var p = g.p, x = e.x, y = e.y, W = C.ARENA_W, H = C.ARENA_H;
    e.state = ATTACKING; e.attack = kind; e.seg = 0; e.segT = 0;
    e.fireCool = rndRange(g, 0.3, 1.2);
    if (kind === "dive") {
        // Galaxian-style curving dive through the ship's position
        var tx = clamp(p.x + rndRange(g, -16, 16), 10, W - 10);
        var away = x < W / 2 ? 1 : -1;
        e.segs = [seg(x, y, x - away * 50, y - 26, tx + away * 60, p.y - 70, tx, p.y - 10, 1.2),
                  seg(tx, p.y - 10, tx - away * 20, p.y + 20, tx - away * 30, H, tx - away * 30, H + 20, 0.5)];
    } else if (kind === "pincer") {
        var px = clamp(p.x + side * 34, 10, W - 10);
        var sx = side < 0 ? 10 : W - 10;
        e.segs = [seg(x, y, sx, y + 40, sx, p.y - 60, px, p.y - 22, 1.5),
                  seg(px, p.y - 22, px - side * 16, p.y + 4, p.x, H, p.x - side * 20, H + 20, 0.9)];
    } else {
        // zigzag swoop that stays above the ship, then home
        var dir = rnd(g) < 0.5 ? -1 : 1;
        var x1 = clamp(x + dir * 46, 14, W - 14), x2 = clamp(x - dir * 40, 14, W - 14);
        e.segs = [seg(x, y, x + dir * 10, y + 30, x1, y + 30, x1, y + 62, 0.9),
                  seg(x1, y + 62, x1, y + 90, x2, y + 70, x2, y + 108, 0.9),
                  seg(x2, y + 108, x2, y + 140, x, y + 70, formationX(g, e), formationY(g, e), 1.2)];
    }
}

function enemyFireRate(g, e) {
    var rate = e.state === ATTACKING ? C.enemyFire.baseRate : C.enemyFire.formationRate;
    rate += C.enemyFire.rateGrowth * g.sector * (e.state === ATTACKING ? 1 : 0.3);
    return rate * g.skill;
}

function updateEnemies(g, dt) {
    var p = g.p, W = C.ARENA_W, i, j, e, s;
    var shotSpeed = (C.enemyFire.speed + C.enemyFire.speedGrowth * g.sector) * g.skill;
    var alive = 0, protectors = 0;
    for (i = 0; i < g.enemies.length; i++) {
        e = g.enemies[i];
        if (!e.on) continue;
        alive++;
        if (e.flash > 0) e.flash -= dt;
        e.lastHit += dt;
        e.wobble += dt * (e.gen > 0 ? 9 : 4);
        // waiting for its turn to enter
        if (e.delay > 0) { e.delay -= dt; if (e.delay <= 0) g.spawnLeft--; continue; }
        // --- movement by state
        var done;
        switch (e.state) {
        case SPAWNING:
        case RETREATING:
            done = followPath(g, e, dt);
            if (done) e.state = FORMATION;
            break;
        case FORMATION:
            var tx = formationX(g, e) + e.offX + (e.gen > 0 ? Math.sin(e.wobble) * 3 : 0);
            var ty = formationY(g, e);
            e.x += (tx - e.x) * Math.min(1, dt * 8);
            e.y += (ty - e.y) * Math.min(1, dt * 8);
            break;
        case ATTACKING:
            done = followPath(g, e, dt);
            e.x += e.offX;
            if (done) {
                if (e.bonus || e.kamikaze) { e.on = false; e.state = DESTROYED; continue; }
                if (e.y > C.ARENA_H) retreat(g, e); else e.state = FORMATION;
            }
            break;
        }
        if (e.offX !== 0 && e.state !== ATTACKING) e.offX *= Math.max(0, 1 - dt * 0.6);
        if (e.state === ATTACKING && e.offX !== 0) { e.x -= e.offX; e.offX *= Math.max(0, 1 - dt * 0.8); e.x += e.offX; }
        if (e.bonus) continue;
        // --- behaviours layered on the state machine
        if (e.cloak) updateCloak(g, e, dt);
        if (e.teleport) updateTeleport(g, e, dt);
        if (e.regen && e.hp < e.maxHp && e.lastHit > C.traits.regen.delay) {
            e.regenT += dt;
            if (e.regenT >= C.traits.regen.every) {
                e.regenT = 0; e.hp = Math.min(e.maxHp, e.hp + 1);
                floatText(g, e.x, e.y - 8, "+", "#39FF88");
            }
        }
        if (e.coord) {
            protectors++;
            e.bubbleT -= dt;
            if (e.bubbleT <= 0) { e.bubbleT = C.traits.coord.bubbleRegen; shieldAlly(g, e); }
        }
        // --- shooting (hidden nanobots hold their fire: fair play)
        if (e.state !== SPAWNING && e.state !== RETREATING && !(e.cloak && e.cloakPhase === 2) && p.alive) {
            e.fireCool -= dt;
            if (e.fireCool <= 0) {
                e.fireCool = 0.5;
                if (rnd(g) < enemyFireRate(g, e) * 0.5 && e.y < p.y - 30) {
                    if (g.sector + 1 >= C.enemyFire.aimedFromSector && e.state === ATTACKING) aimShot(g, e.x, e.y + 4, shotSpeed, 0);
                    else enemyShot(g, e.x, e.y + 4, 0, shotSpeed * 0.85, e.kind === "brute" ? 2 : 0);
                }
            }
        }
        // --- touching the ship
        if (p.alive) {
            var dx = e.x - p.x, dy = e.y - p.y, rr = e.r + C.player.hitRadius;
            if (dx * dx + dy * dy < rr * rr && !(e.cloak && e.cloakPhase === 2 && e.state !== ATTACKING)) {
                if (p.shield > 0 || p.inv > 0) { if (p.shield > 0) killEnemy(g, e); }
                else { killEnemy(g, e); hurtPlayer(g, C.player.ramHit); }
            }
        }
    }
    // attack runs
    if (g.phase === "wave" || g.phase === "boss") {
        g.attackT -= dt;
        if (g.attackT <= 0) {
            var every = Math.max(C.formation.attackEveryMin, C.formation.attackEvery - 0.16 * g.sector);
            if (g.waveT > 40) every *= 0.5;      // no stalemates: a lingering wave gets aggressive
            g.attackT = every / g.skill;
            scheduleAttack(g);
        }
    }
    return alive;
}

function updateCloak(g, e, dt) {
    var c = C.traits.cloak;
    e.cloakT -= dt;
    if (e.cloakT > 0) return;
    e.cloakPhase = (e.cloakPhase + 1) % 3;   // 0 visible, 1 warning flicker, 2 hidden
    e.cloakT = e.cloakPhase === 0 ? c.visible : (e.cloakPhase === 1 ? c.warn : c.hidden);
    if (e.cloakPhase === 2) emit(g, "sfx:cloak");
}

function updateTeleport(g, e, dt) {
    var t = C.traits.teleport;
    if (e.tpCool > 0) e.tpCool -= dt;
    if (e.tpWarn > 0) {
        e.tpWarn -= dt;
        if (e.tpWarn <= 0) {
            explode(g, e.x, e.y, "#FFFFFF", 5);
            e.offX += e.tpTarget - e.x;
            if (e.state !== ATTACKING) e.x = e.tpTarget;
            emit(g, "sfx:teleport");
        }
        return;
    }
    if (e.tpCool > 0 || e.tpCount >= t.maxJumps || e.state === SPAWNING || e.state === RETREATING) return;
    // sense an incoming shot just below
    for (var i = 0; i < g.shots.length; i++) {
        var s = g.shots[i];
        if (!s.on) continue;
        var dy = s.y - e.y;
        if (dy > 0 && dy < t.sense && Math.abs(s.x - e.x) < e.r + 3) {
            var dir = s.x < e.x ? 1 : -1;
            if (e.x + dir * t.maxJump > C.ARENA_W - 10 || e.x + dir * t.maxJump < 10) dir = -dir;
            e.tpTarget = clamp(e.x + dir * rndRange(g, t.minJump, t.maxJump), 10, C.ARENA_W - 10);
            e.tpWarn = t.warn;
            e.tpCool = t.cooldown;
            e.tpCount++;
            return;
        }
    }
}

function shieldAlly(g, e) {
    var best = null, bd = C.traits.coord.linkRange * C.traits.coord.linkRange;
    e.link = -1;
    for (var i = 0; i < g.enemies.length; i++) {
        var o = g.enemies[i];
        if (!o.on || o === e || o.bubble > 0 || o.bonus) continue;
        var dx = o.x - e.x, dy = o.y - e.y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = o; e.link = i; }
    }
    if (best) best.bubble = C.traits.coord.bubble;
}

// ---------------------------------------------------------------- shots update + collisions

function updateShots(g, dt, input) {
    var p = g.p, i, j, s, e, dx, dy, b = g.boss;
    var H = C.ARENA_H, W = C.ARENA_W;
    // player shots
    for (i = 0; i < g.shots.length; i++) {
        s = g.shots[i];
        if (!s.on) continue;
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.y < -6 || s.x < -6 || s.x > W + 6) { s.on = false; continue; }
        var used = false;
        if (b.on && b.entering <= 0) {
            for (j = 0; j < b.nparts && !used; j++) {
                var pt = b.parts[j];
                if (!pt.alive) continue;
                dx = s.x - partX(b, pt); dy = s.y - partY(b, pt);
                if (dx * dx + dy * dy < pt.r * pt.r) used = damagePart(g, pt, C.player.bulletDamage);
            }
        }
        for (j = 0; j < g.enemies.length && !used; j++) {
            e = g.enemies[j];
            if (!e.on || e.delay > 0) continue;
            dx = s.x - e.x; dy = s.y - e.y;
            var rr = e.r + 1;
            if (dx * dx + dy * dy < rr * rr) used = damageEnemy(g, e, C.player.bulletDamage, s.x, s.vx, s.vy, false);
        }
        if (used) { s.on = false; g.stats.hits++; }
    }
    // neural laser: a narrow beam; pierces weak nanobots, burns strong ones
    p.laserTop = 0;
    if (p.laserOn && p.alive) {
        var top = -4, hw = C.weapons.laserWidth;
        var stopper = null, stopPart = null;
        for (j = 0; j < g.enemies.length; j++) {
            e = g.enemies[j];
            if (!e.on || e.delay > 0 || e.y > p.y || Math.abs(e.x - p.x) > e.r + hw) continue;
            var strong = e.maxHp > 1 || (e.shield && e.shieldHp > 0) || e.bubble > 0;
            if (!strong) { damageEnemy(g, e, 1, p.x, 0, -1, true); continue; }
            if (e.y > top) { top = e.y; stopper = e; }
        }
        if (b.on && b.entering <= 0) {
            for (j = 0; j < b.nparts; j++) {
                var bp = b.parts[j];
                if (!bp.alive || Math.abs(partX(b, bp) - p.x) > bp.r + hw) continue;
                var py = partY(b, bp) + bp.r;
                if (py > top) { top = py; stopper = null; stopPart = bp; }
            }
        }
        p.laserTop = top;
        var burn = C.weapons.laserDps * dt;
        if (stopPart) damagePart(g, stopPart, burn);
        else if (stopper) damageEnemy(g, stopper, burn, p.x, 0, -1, true);
        if (Math.floor(g.time * 8) !== Math.floor((g.time - dt) * 8)) emit(g, "sfx:laser");
    }
    // enemy shots
    var nm2 = C.player.nearMissRadius * C.player.nearMissRadius;
    var hr = C.player.hitRadius + 1.5;
    for (i = 0; i < g.eshots.length; i++) {
        s = g.eshots[i];
        if (!s.on) continue;
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.y > H + 6 || s.y < -10 || s.x < -6 || s.x > W + 6) { s.on = false; continue; }
        if (!p.alive) continue;
        dx = s.x - p.x; dy = s.y - p.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < hr * hr) {
            s.on = false;
            hurtPlayer(g, C.player.bulletHit);
            continue;
        }
        if (d2 < nm2) s.near = true;
        else if (s.near && !s.nearDone && s.y > p.y + 4 && p.inv <= 0 && p.shield <= 0) {
            s.nearDone = true;
            g.stats.nearMisses++;
            addScore(g, Math.round(C.player.nearMissScore * g.mult), p.x, p.y - 12, "#00E5FF");
            emit(g, "near");
        }
    }
    // boss body
    if (b.on && b.entering <= 0 && b.dying <= 0 && p.alive) {
        var core = bossCore(g);
        dx = b.x - p.x; dy = b.y - p.y;
        var br = core.r + 8;
        if (dx * dx + dy * dy < br * br) hurtPlayer(g, C.player.bossRamHit);
    }
}

function updateFx(g, dt) {
    var i, q, H = C.ARENA_H;
    for (i = 0; i < g.particles.length; i++) {
        q = g.particles[i];
        if (!q.on) continue;
        q.life -= dt;
        if (q.life <= 0) { q.on = false; continue; }
        q.x += q.vx * dt; q.y += q.vy * dt;
        q.vx *= 0.96; q.vy *= 0.96;
    }
    for (i = 0; i < g.texts.length; i++) {
        q = g.texts[i];
        if (!q.on) continue;
        q.life -= dt; q.y -= 14 * dt;
        if (q.life <= 0) q.on = false;
    }
    for (i = 0; i < g.pickups.length; i++) {
        q = g.pickups[i];
        if (!q.on) continue;
        q.t += dt;
        q.y += C.pickups.fallSpeed * dt;
        q.x += Math.sin(q.t * 3) * 6 * dt;
        if (q.y > H + 8) { q.on = false; continue; }
        var p = g.p;
        if (p.alive) {
            var dx = q.x - p.x, dy = q.y - p.y;
            if (dx * dx + dy * dy < 100) collect(g, q);
        }
    }
    if (g.comboT > 0) { g.comboT -= dt; if (g.comboT <= 0) { g.combo = 0; g.mult = 1; } }
    if (g.shake > 0) g.shake -= dt;
    if (g.flashT > 0) g.flashT -= dt;
    if (g.bannerT > 0) { g.bannerT -= dt; if (g.bannerT <= 0) g.banner = ""; }
}

// ---------------------------------------------------------------- step

function step(g, dt, input) {
    g.time += dt;
    if (g.phase === "gameover" || g.phase === "won" || g.phase === "idle") { updateFx(g, dt); return; }
    if (g.phaseT > 0) {
        g.phaseT -= dt;
        if (g.phaseT <= 0) {
            if (g.phase === "ready" && g.pendingBonus) buildBonus(g);
            else nextPhase(g);
        }
    }
    updatePlayer(g, dt, input);
    input.bomb = false;              // one bomb per press
    updateBomb(g, dt);
    updateShots(g, dt, input);
    var alive = updateEnemies(g, dt);
    updateBoss(g, dt);
    updateFx(g, dt);
    if (g.phase === "wave") {
        g.waveT += dt;
        if (alive === 0 && g.spawnLeft <= 0) {
            if (!g.waveDamaged && !g.bonusWave) {
                addScore(g, C.scores.perfectWave, C.ARENA_W / 2, 120, "#FFD166");
                g.skill = clamp(g.skill + C.difficulty.onPerfectWave, C.difficulty.min, C.difficulty.max);
                achieve(g, "perfectWave");
            }
            g.phase = "waveClear"; g.phaseT = C.flow.waveClear;
            if (!g.bonusWave) setBanner(g, "waveClear", "", C.flow.waveClear);
            emit(g, "sfx:clear");
        }
    }
}

// Advances the game by a frame's worth of real time. Returns the number of
// fixed steps taken.
function update(g, dt, input) {
    g.events.length = 0;
    g.acc += Math.min(dt, C.STEP * C.MAX_STEPS_PER_FRAME);
    var n = 0;
    while (g.acc >= C.STEP && n < C.MAX_STEPS_PER_FRAME) {
        if (g.mode === "demo") autopilot(g, input);
        step(g, C.STEP, input);
        g.acc -= C.STEP;
        n++;
    }
    if (g.acc > C.STEP) g.acc = 0;
    return n;
}

// ---------------------------------------------------------------- demo

// The attract-mode pilot: aims at the nearest nanobot, dodges shots that
// are about to hit, picks up capsules and bombs when the screen is crowded.
function autopilot(g, input) {
    var p = g.p, i, s, e;
    input.left = input.right = input.up = input.down = false;
    input.fire = true; input.bomb = false; input.pointer = false;
    if (!p.alive) return;
    var target = p.x, best = 1e9;
    var b = g.boss;
    var flight = (p.y - 52) / C.player.shotSpeed;       // time for a shot to climb
    if (b.on && b.entering <= 0) {
        for (i = 0; i < b.nparts; i++) {
            var pt = b.parts[i];
            if (!pt.alive || (pt.kind === "core" && bossCoreShielded(g))) continue;
            target = partX(b, pt) + (b.teleT > 0 ? 0 : b.dir * b.def.speed * flight);
            break;
        }
    } else {
        for (i = 0; i < g.enemies.length; i++) {
            e = g.enemies[i];
            if (!e.on || e.delay > 0) continue;
            var d = Math.abs(e.x - p.x) + (C.ARENA_H - e.y) * 0.3;
            if (d < best) { best = d; target = e.x; }
        }
    }
    for (i = 0; i < g.pickups.length; i++) {
        var u = g.pickups[i];
        if (u.on && u.y > 120 && Math.abs(u.x - p.x) < 60) target = u.x;
    }
    // danger: shots heading into a box above the ship
    var threat = 0, push = 0;
    for (i = 0; i < g.eshots.length; i++) {
        s = g.eshots[i];
        if (!s.on || s.y > p.y + 4 || s.vy <= 0) continue;
        var eta = (p.y - s.y) / s.vy;
        if (eta > 0.45) continue;                       // far away: keep aiming
        var fx = s.x + s.vx * eta;
        if (Math.abs(fx - p.x) < 8) { threat++; push += fx < p.x ? 1 : -1; }
    }
    if (threat >= 5 && p.bombs > 0 && rnd(g) < 0.05) input.bomb = true;
    if (threat > 0) {
        var dir = push >= 0 ? 1 : -1;
        if ((dir > 0 && p.x > C.ARENA_W - 20) || (dir < 0 && p.x < 20)) dir = -dir;
        if (dir > 0) input.right = true; else input.left = true;
        input.down = true;
    } else if (Math.abs(target - p.x) > 3) {
        if (target > p.x) input.right = true; else input.left = true;
    }
}

// Snapshot of the numbers the HUD and the Game Over screen show.
function accuracy(g) {
    return g.stats.shots > 0 ? Math.round(100 * g.stats.hits / g.stats.shots) : 0;
}
