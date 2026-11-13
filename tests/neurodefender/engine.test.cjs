// NeuroDefender engine tests: node --test tests/neurodefender/
// Deterministic: fixed seeds, fixed 1/60 s steps, scenarios built by hand.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.cjs");

const C = load("config.js");
const E = load("engine.js");
const R = load("render.js");
const S = load("strings.js");

const DT = 1 / 60;
function noInput() {
    return { left: false, right: false, up: false, down: false, fire: false, bomb: false, pointer: false, px: 0, py: 0 };
}
function game(seed = 42, sector = 0) {
    const g = E.create(seed);
    E.startGame(g, "play", seed, sector);
    return g;
}
// skip the intro banners: straight into a running wave
function inWave(seed = 42, sector = 0) {
    const g = game(seed, sector);
    g.phase = "ready"; g.phaseT = DT / 2;
    E.update(g, DT, noInput());
    assert.equal(g.phase, "wave");
    return g;
}
function run(g, seconds, input = noInput()) {
    for (let i = 0; i < Math.round(seconds * 60); i++) E.update(g, DT, input);
}
function alive(pool) { return pool.filter((o) => o.on); }
function clearEnemies(g) { for (const e of g.enemies) e.on = false; g.spawnLeft = 0; }
// a single nanobot holding a slot right above the ship
function placeEnemy(g, opts = {}) {
    const e = g.enemies.find((o) => !o.on);
    E.resetEnemy(g, e, opts.kind || "drone");
    e.state = E.FORMATION; e.delay = 0;
    e.slotX = opts.x ?? g.p.x; e.slotY = opts.y ?? 80;
    e.x = E.formationX(g, e); e.y = e.slotY;
    for (const t of opts.traits || []) E.giveTrait(g, e, t);
    return e;
}
function shotAt(g, x, y, vx = 0, vy = -C.player.shotSpeed) {
    const s = g.shots.find((o) => !o.on);
    Object.assign(s, { on: true, x, y, vx, vy, kind: 0, hit: false });
    return s;
}

// ------------------------------------------------------------ movement

test("ship moves, stays in its zone and diagonals are not faster", () => {
    const g = inWave();
    clearEnemies(g);
    const p = g.p, x0 = p.x;
    run(g, 0.5, { ...noInput(), right: true });
    const straight = p.x - x0;
    assert.ok(Math.abs(straight - C.player.speed * 0.5) < 2, `moved ${straight}`);
    p.x = 160; p.y = 200;
    run(g, 0.25, { ...noInput(), right: true, up: true });
    const dx = p.x - 160, dy = 200 - p.y;
    const diag = Math.hypot(dx, dy);
    assert.ok(Math.abs(diag - C.player.speed * 0.25) < 2, `diagonal ${diag}`);
    run(g, 5, { ...noInput(), left: true, up: true });
    assert.equal(p.x, C.player.margin);
    assert.equal(p.y, C.ARENA_H * C.player.zoneTop, "never above the lower quarter");
    run(g, 5, { ...noInput(), right: true, down: true });
    assert.equal(p.x, C.ARENA_W - C.player.margin);
    assert.equal(p.y, C.ARENA_H - C.player.margin);
});

test("mouse steering heads for the pointer", () => {
    const g = inWave();
    clearEnemies(g);
    run(g, 2, { ...noInput(), pointer: true, px: 60, py: 230 });
    assert.ok(Math.abs(g.p.x - 60) < 3 && g.p.y > 222);
});

// ------------------------------------------------------------ shooting

test("holding fire respects the cooldown and the shot pool", () => {
    const g = inWave();
    clearEnemies(g);
    run(g, 1, { ...noInput(), fire: true });
    const expected = Math.ceil(1 / C.player.fireCooldown);
    assert.ok(Math.abs(g.stats.shots - expected) <= 1, `shots ${g.stats.shots}`);
    g.p.rapid = 5; g.p.spread = 2; g.stats.shots = 0;
    run(g, 1, { ...noInput(), fire: true });
    assert.ok(g.stats.shots > expected * 4, "triple rapid fire fires more");
    assert.ok(alive(g.shots).length <= C.MAX_PLAYER_SHOTS);
    // spread shots fan out
    g.p.rapid = 0; g.p.cool = 0;
    for (const s of g.shots) s.on = false;
    E.playerFire(g);
    const vx = alive(g.shots).map((s) => Math.sign(Math.round(s.vx)));
    assert.equal(JSON.stringify([...vx].sort()), "[-1,0,1]");
});

test("a shot destroys a drone and scores", () => {
    const g = inWave();
    clearEnemies(g);
    const e = placeEnemy(g);
    shotAt(g, e.x, e.y + 20);
    run(g, 0.2);
    assert.equal(e.on, false);
    assert.equal(g.stats.kills, 1);
    assert.ok(g.score >= C.enemyKinds.drone.score);
    assert.equal(g.achieved.firstBlood, true);
});

test("combo multiplier grows with quick kills and resets", () => {
    const g = inWave();
    clearEnemies(g);
    for (let i = 0; i < 6; i++) {
        const e = placeEnemy(g, { x: 40 + i * 30 });
        E.killEnemy(g, e);
    }
    assert.equal(g.combo, 6);
    assert.equal(g.mult, 1.5);
    run(g, C.combo.window + 0.1);
    assert.equal(g.mult, 1);
});

// ------------------------------------------------------------ damage

test("enemy shots hurt, invulnerability protects, lives run out", () => {
    const g = inWave();
    clearEnemies(g);
    const p = g.p;
    E.hurtPlayer(g, C.player.bulletHit);
    assert.equal(p.energy, C.player.energy - C.player.bulletHit);
    E.hurtPlayer(g, 200);
    assert.equal(p.alive, false);
    assert.equal(p.lives, C.player.lives - 1);
    run(g, C.player.respawnDelay + 0.05);
    assert.equal(p.alive, true);
    assert.ok(p.inv > 0);
    E.hurtPlayer(g, 200);
    assert.equal(p.lives, C.player.lives - 1, "invulnerable after respawn");
    p.inv = 0; E.hurtPlayer(g, 200);
    run(g, C.player.respawnDelay + 0.05);
    p.inv = 0; E.hurtPlayer(g, 200);
    assert.equal(p.lives, 0);
    assert.equal(g.phase, "dying");
    run(g, 2);
    assert.equal(g.phase, "gameover");
    assert.equal(g.best, g.score);
});

test("a real enemy bullet hits the ship's core only", () => {
    const g = inWave();
    clearEnemies(g);
    const p = g.p;
    E.enemyShot(g, p.x + 8, p.y - 30, 0, 90, 0);       // passes 8 px to the side: a near miss
    run(g, 0.8);
    assert.equal(p.energy, C.player.energy, "no damage from a miss");
    assert.equal(g.stats.nearMisses, 1, "near miss bonus");
    E.enemyShot(g, p.x, p.y - 30, 0, 90, 0);
    run(g, 0.6);
    assert.equal(p.energy, C.player.energy - C.player.bulletHit);
});

test("ramming a nanobot hurts and destroys it", () => {
    const g = inWave();
    clearEnemies(g);
    const e = placeEnemy(g, { x: g.p.x, y: g.p.y });
    e.state = E.ATTACKING; e.segs = [E.seg(e.x, e.y, e.x, e.y, e.x, e.y, e.x, e.y, 5)];
    run(g, DT);
    assert.equal(e.on, false);
    assert.equal(g.p.energy, C.player.energy - C.player.ramHit);
});

// ------------------------------------------------------------ power-ups

test("every capsule does what it says", () => {
    const g = inWave();
    clearEnemies(g);
    const p = g.p;
    const take = (type) => { const u = g.pickups.find((o) => !o.on); u.on = true; u.type = type; u.x = p.x; u.y = p.y; E.collect(g, u); };
    take("spread"); take("spread"); take("spread");
    assert.equal(p.spread, 2, "spread caps at three ways");
    take("rapid"); assert.equal(p.rapid, C.weapons.rapidTime);
    take("laser"); assert.equal(p.laser, C.weapons.laserTime);
    take("shield"); assert.equal(p.shield, C.weapons.shieldTime);
    const bombs = p.bombs; take("bomb"); assert.equal(p.bombs, bombs + 1);
    p.energy = 20; take("repair"); assert.equal(p.energy, 20 + C.weapons.repair);
    take("repair"); take("repair"); assert.equal(p.energy, C.player.energy, "repair caps");
    p.lives = C.player.maxLives; const sc = g.score; take("life");
    assert.equal(p.lives, C.player.maxLives, "life caps");
    assert.ok(g.score > sc, "a capped life becomes points");
});

test("the shield absorbs hits and expires", () => {
    const g = inWave();
    clearEnemies(g);
    g.p.shield = C.weapons.shieldTime;
    for (let i = 0; i < 10; i++) E.hurtPlayer(g, 50);
    assert.equal(g.p.energy, C.player.energy);
    assert.equal(g.achieved.shieldMaster, true);
    run(g, C.weapons.shieldTime + 0.1);
    assert.ok(g.p.shield <= 0);
});

test("the neural bomb clears shots and damages nanobots near it", () => {
    const g = inWave();
    clearEnemies(g);
    const p = g.p;
    const near = placeEnemy(g, { x: p.x + 30, y: p.y - 40 });
    const far = placeEnemy(g, { x: 20, y: 30 });
    E.enemyShot(g, p.x + 20, p.y - 20, 0, 5, 0);
    const bombs = p.bombs;
    run(g, 0.02, { ...noInput(), bomb: true });
    run(g, C.weapons.bombTime + 0.1);
    assert.equal(p.bombs, bombs - 1);
    assert.equal(near.on, false);
    assert.equal(far.on, true);
    assert.equal(alive(g.eshots).length, 0);
});

test("the laser pierces weak nanobots and burns strong ones", () => {
    const g = inWave();
    clearEnemies(g);
    const p = g.p;
    const weak = placeEnemy(g, { x: p.x, y: 120 });
    const strong = placeEnemy(g, { x: p.x, y: 60, kind: "brute" });
    p.laser = 5;
    run(g, 0.3, { ...noInput(), fire: true });
    assert.equal(weak.on, false, "pierced");
    assert.ok(strong.on && strong.hp < strong.maxHp, "burning");
    run(g, 1.5, { ...noInput(), fire: true });
    assert.equal(strong.on, false);
});

// ------------------------------------------------------------ evolution

test("splitters divide once into two faster clones", () => {
    const g = inWave(5, 1);
    clearEnemies(g);
    const e = placeEnemy(g, { traits: ["split"] });
    E.damageEnemy(g, e, 1, e.x, 0, -270, false);
    const clones = alive(g.enemies);
    assert.equal(clones.length, 2);
    assert.ok(clones.every((c) => c.kind === "mite" && c.gen === 1));
    E.damageEnemy(g, clones[0], 1, 0, 0, -270, false);
    assert.equal(alive(g.enemies).length, 1, "clones die, never split again");
});

test("frontal shields stop straight shots, not angled ones", () => {
    const g = inWave(5, 2);
    clearEnemies(g);
    const e = placeEnemy(g, { traits: ["shield"] });
    const max = e.shieldHp;
    assert.ok(max > 0);
    E.damageEnemy(g, e, 1, e.x, 0, -270, false);
    assert.equal(e.hp, e.maxHp, "blocked");
    assert.equal(e.shieldHp, max - 1);
    E.damageEnemy(g, e, 1, e.x, 120, -200, false);    // angled shot
    assert.equal(e.on, false, "angled shot gets through");
    const f = placeEnemy(g, { traits: ["shield"] });
    for (let i = 0; i < max; i++) E.damageEnemy(g, f, 1, f.x, 0, -270, false);
    assert.equal(f.shieldHp, 0, "breaks after enough straight hits");
    E.damageEnemy(g, f, 1, f.x, 0, -270, false);
    assert.equal(f.on, false);
});

test("cloaking warns, hides (without firing) and comes back", () => {
    const g = inWave(5, 3);
    clearEnemies(g);
    const e = placeEnemy(g, { traits: ["cloak"] });
    e.cloakT = 0.01;
    const seen = new Set();
    for (let i = 0; i < 60 * 7; i++) { E.update(g, DT, noInput()); seen.add(e.cloakPhase); }
    assert.deepEqual([...seen].sort(), [0, 1, 2], "visible, warning, hidden");
    // hidden phantoms hold their fire
    e.cloakPhase = 2; e.cloakT = 100; e.state = E.ATTACKING;
    e.segs = [E.seg(e.x, 60, e.x, 60, e.x, 60, e.x, 60, 100)];
    for (const s of g.eshots) s.on = false;
    for (let i = 0; i < 600; i++) E.update(g, DT, noInput());
    assert.equal(alive(g.eshots).length, 0);
});

test("jumpers sense a shot, warn, teleport aside, with cooldown and a limit", () => {
    const g = inWave(5, 4);
    clearEnemies(g);
    const e = placeEnemy(g, { x: 160, traits: ["teleport"] });
    const x0 = e.x;
    shotAt(g, e.x, e.y + C.traits.teleport.sense - 2);   // the moment it senses the shot
    E.update(g, DT, noInput());
    assert.ok(e.tpWarn > 0, "warning marker first");
    run(g, 0.4);
    assert.equal(e.on, true, "dodged");
    assert.ok(Math.abs(e.x - x0) >= C.traits.teleport.minJump - 6, `moved ${e.x - x0}`);
    assert.ok(Math.abs(e.x - x0) <= C.traits.teleport.maxJump + C.formation.sway);
    shotAt(g, e.x, e.y + 30);
    E.update(g, DT, noInput());
    assert.ok(e.tpWarn <= 0, "cooldown blocks an instant second jump");
    e.tpCount = C.traits.teleport.maxJumps; e.tpCool = 0;
    shotAt(g, e.x, e.y + 30);
    run(g, 0.3);
    assert.equal(e.on, false, "out of jumps: hit");
});

test("kamikazes dive along a curve through the ship's position", () => {
    const g = inWave(5, 5);
    clearEnemies(g);
    const e = placeEnemy(g, { x: 60, traits: ["dive"] });
    g.p.x = 200;
    E.launchAttack(g, e, "dive", 0);
    let closest = 1e9;
    for (let i = 0; i < 90; i++) {
        E.update(g, DT, noInput());
        if (!e.on) break;
        closest = Math.min(closest, Math.abs(e.x - 200) + Math.abs(e.y - g.p.y));
    }
    assert.ok(closest < 30, `passed ${closest}px from the ship`);
});

test("coordinators shield a neighbour and attack in pincers", () => {
    const g = inWave(5, 6);
    clearEnemies(g);
    const c = placeEnemy(g, { x: 150, traits: ["coord"] });
    const ally = placeEnemy(g, { x: 172 });
    c.bubbleT = 0;
    E.update(g, DT, noInput());
    assert.equal(ally.bubble, C.traits.coord.bubble);
    E.damageEnemy(g, ally, 1, ally.x, 0, -270, false);
    assert.equal(ally.on, true, "the bubble absorbed it");
    const mate = placeEnemy(g, { x: 100, traits: ["coord"] });
    g.attackT = 0;
    const before = alive(g.enemies).filter((e) => e.state === E.ATTACKING).length;
    // force the coordinator to be picked
    for (const e of g.enemies) if (e.on && e !== c && e !== mate) e.state = E.RETREATING;
    mate.state = E.FORMATION;
    E.scheduleAttack(g);
    const attackers = alive(g.enemies).filter((e) => e.state === E.ATTACKING);
    assert.ok(attackers.length - before >= 2, "two at once");
    assert.ok(attackers.every((e) => e.attack === "pincer"));
});

test("regenerators heal when left alone and stop when hit", () => {
    const g = inWave(5, 7);
    clearEnemies(g);
    const e = placeEnemy(g, { kind: "brute", traits: ["regen"] });
    e.hp = 1;
    run(g, C.traits.regen.delay + C.traits.regen.every * 2 + 0.1);
    assert.ok(e.hp >= 3, `healed to ${e.hp}`);
    const hp = e.hp;
    for (let i = 0; i < 4; i++) { E.damageEnemy(g, e, 0.01, e.x, 100, -100, false); run(g, 0.5); }
    assert.ok(e.hp <= hp, "no healing while under fire");
});

test("each sector's waves introduce that sector's behaviour", () => {
    for (let s = 1; s < 8; s++) {
        const g = inWave(11, s);
        const t = C.sectors[s].trait;
        const n = alive(g.enemies).filter((e) => e[t]).length;
        assert.ok(n > 0, `sector ${s + 1} has ${t}`);
    }
    const core = inWave(11, 8);
    const multi = alive(core.enemies).filter((e) => C.traitOrder.filter((t) => e[t]).length >= 2).length;
    assert.ok(multi > 0, "the Neural Core combines behaviours");
});

test("the state machine goes SPAWNING -> FORMATION -> ATTACKING -> back", () => {
    const g = inWave(3, 0);
    const states = new Set();
    for (let i = 0; i < 60 * 25; i++) {
        E.update(g, DT, noInput());
        for (const e of g.enemies) if (e.on) states.add(e.state);
        g.p.inv = 1;     // keep the ship alive: this is about the nanobots
    }
    for (const s of [E.SPAWNING, E.FORMATION, E.ATTACKING]) assert.ok(states.has(s), `state ${s}`);
});

// ------------------------------------------------------------ campaign

test("waves lead to the boss; bonus waves after even sectors", () => {
    const g = inWave(9, 1);
    for (let w = 0; w < C.wavesPerSector; w++) {
        clearEnemies(g);
        run(g, 0.05);
        assert.equal(g.phase, "waveClear");
        run(g, C.flow.waveClear + 0.05);
        if (w < C.wavesPerSector - 1) { run(g, C.flow.ready + 0.05); assert.equal(g.phase, "wave"); }
    }
    assert.equal(g.phase, "bossWarning");
    assert.equal(g.banner, "warning");
    run(g, C.flow.bossWarning + 0.05);
    assert.equal(g.phase, "boss");
    assert.equal(g.boss.id, "mitosis");
    E.damagePart(g, g.boss.parts[0], 0);         // still entering: immune
    run(g, 3);
    E.damagePart(g, g.boss.parts[0], 9999);
    run(g, 2);
    assert.equal(g.phase, "bossDown");
    run(g, 2);
    // sector 2 is followed by a challenge wave without enemy fire
    run(g, C.flow.ready + 0.1);
    assert.equal(g.phase, "wave");
    assert.equal(g.bonusWave, true);
    run(g, 3);
    assert.ok(alive(g.enemies).length > 0 && alive(g.enemies).every((e) => e.bonus));
    assert.equal(alive(g.eshots).length, 0, "no shots in the challenge");
    clearEnemies(g);
    run(g, 0.1);
    run(g, C.flow.waveClear + 0.1);
    assert.equal(g.phase, "bonusResult");
    run(g, C.flow.bonusResult + 0.1);
    assert.equal(g.sector, 2);
    assert.equal(g.phase, "sectorIntro");
});

test("every boss is beatable by the demo pilot in reasonable time", () => {
    for (let s = 0; s < 9; s++) {
        const g = E.create(7);
        E.startGame(g, "demo", 7 + s, s);
        g.phase = "bossWarning"; g.phaseT = 0.01; g.p.lives = 99;
        let t = 0;
        for (; t < 60 * 240; t++) {
            E.update(g, DT, noInput());
            if (g.phase === "bossDown" || g.phase === "victory") break;
        }
        assert.ok(t < 60 * 240, `boss ${C.sectors[s].boss} not beaten in 4 minutes`);
        if (s === 8) { run(g, 2); assert.equal(g.phase, "victory"); }
    }
});

test("the Overmind changes phase and its generators shield the core", () => {
    const g = game(1, 8);
    g.phase = "bossWarning"; g.phaseT = 0.01;
    run(g, 3);
    const b = g.boss, core = b.parts[0];
    assert.equal(b.id, "overmind");
    assert.equal(E.bossCoreShielded(g), true);
    const hp = core.hp;
    E.damagePart(g, core, 5);
    assert.equal(core.hp, hp, "shielded core takes nothing");
    for (let i = 1; i < b.nparts; i++) if (b.parts[i].kind === "gen") E.damagePart(g, b.parts[i], 999);
    assert.equal(E.bossCoreShielded(g), false);
    E.damagePart(g, core, core.maxHp * 0.5);
    run(g, 0.1);
    assert.equal(b.phaseIdx, 1);
    assert.equal(E.bossCoreShielded(g), true, "phase 2 rebuilds the generators");
});

test("victory after the Neural Core; game restarts without a reload", () => {
    const g = game(1, 8);
    g.phase = "bossWarning"; g.phaseT = 0.01;
    run(g, 3);
    for (let i = 1; i < g.boss.nparts; i++) E.damagePart(g, g.boss.parts[i], 999);
    E.damagePart(g, g.boss.parts[0], 9999);
    run(g, 2 + 2 + C.flow.victory + 0.5);
    assert.equal(g.phase, "won");
    assert.equal(g.achieved.neuralHero, true);
    const best = g.best;
    E.startGame(g, "play", 2, 0);
    assert.equal(g.score, 0);
    assert.equal(g.p.lives, C.player.lives);
    assert.equal(g.best, best, "the session's best score survives a restart");
    assert.equal(g.achieved.neuralHero, true);
});

// ------------------------------------------------------------ robustness

test("same seed, same inputs, same game", () => {
    const a = game(77, 3), b = game(77, 3);
    const inp = () => ({ ...noInput(), fire: true, right: true });
    for (let i = 0; i < 60 * 30; i++) { E.update(a, DT, inp()); E.update(b, DT, inp()); }
    assert.equal(a.score, b.score);
    assert.equal(a.p.x, b.p.x);
    assert.deepEqual(a.enemies.map((e) => [e.on, e.x]), b.enemies.map((e) => [e.on, e.x]));
});

test("long demo runs stay inside every pool and never throw", () => {
    const g = E.create(1);
    let maxP = 0, maxE = 0, maxS = 0;
    for (let run = 0; run < 3; run++) {
        E.startGame(g, "demo", 500 + run, run * 3);
        for (let i = 0; i < 60 * 120; i++) {
            E.update(g, DT, noInput());
            maxP = Math.max(maxP, alive(g.particles).length);
            maxE = Math.max(maxE, alive(g.enemies).length);
            maxS = Math.max(maxS, alive(g.eshots).length);
            assert.ok(g.events.length <= 32);
        }
    }
    assert.ok(maxP <= C.MAX_PARTICLES && maxE <= C.MAX_ENEMIES && maxS <= C.MAX_ENEMY_SHOTS);
});

test("a slow frame never runs an unbounded catch-up", () => {
    const g = game();
    assert.equal(E.update(g, 5, noInput()), C.MAX_STEPS_PER_FRAME);
});

test("the engine is cheap: 10 simulated minutes of combat", () => {
    const g = E.create(1);
    E.startGame(g, "demo", 3, 6);
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 60 * 600; i++) {
        E.update(g, DT, noInput());
        if (g.phase === "gameover") E.startGame(g, "demo", i, 6);
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`  engine: ${(ms / (60 * 600) * 1000).toFixed(1)} µs per step`);
    assert.ok(ms / (60 * 600) < 1, "under 1 ms per step");
});

test("the renderer draws every screen without throwing", () => {
    const counts = {};
    const ctx = new Proxy({}, {
        get(t, k) {
            if (k === "createImageData") return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
            if (k in t) return t[k];
            return () => { counts[k] = (counts[k] || 0) + 1; };
        },
        set(t, k, v) { t[k] = v; return true; }
    });
    for (let s = 0; s < 9; s++) R.drawBackground(ctx, s, 320, 480);
    R.drawTitle(ctx, 1.5, 3);
    const g = E.create(4);
    E.startGame(g, "demo", 4, 8);
    for (let i = 0; i < 60 * 60; i++) {
        E.update(g, DT, noInput());
        if (i % 7 === 0) { R.drawArena(ctx, g, i, false); R.drawArena(ctx, g, i, true); }
    }
    assert.ok(counts.drawImage > 0, "sprites are blitted");
});

test("texts exist in English and Portuguese with the same keys", () => {
    const keys = (o) => Object.keys(o).sort();
    assert.deepEqual(keys(S.pt), keys(S.en));
    assert.deepEqual(keys(S.pt.banner), keys(S.en.banner));
    assert.deepEqual(keys(S.pt.achievements), keys(S.en.achievements));
    assert.equal(S.forLocale("pt_BR"), S.pt);
    assert.equal(S.forLocale("de_DE"), S.en);
    for (const id of C.achievements) assert.ok(S.en.achievements[id] && S.pt.achievements[id], id);
    for (const t of C.traitOrder) assert.ok(S.en.codexEntries.some((e) => e[0] === t), t);
    for (const b of Object.keys(C.bosses)) assert.ok(S.en.codexEntries.some((e) => e[0] === "boss_" + b), b);
    assert.equal(S.en.sectors.length, C.sectors.length);
});
