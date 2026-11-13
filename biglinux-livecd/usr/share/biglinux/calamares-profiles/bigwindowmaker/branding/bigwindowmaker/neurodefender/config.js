.pragma library
// NeuroDefender: Nanobot Crisis — every tunable in one place.
//
// Units: arena pixels (the arena is 320 x 240, drawn at 2x-ish), seconds,
// pixels per second. Nothing here allocates per frame; the engine reads
// these values when it builds entities.

var ARENA_W = 320;
var ARENA_H = 240;
var STEP = 1 / 60;               // fixed simulation step (deterministic)
var MAX_STEPS_PER_FRAME = 4;     // a slow frame never runs a long catch-up

// Pools: hard ceilings, so memory never grows during a long installation.
var MAX_PLAYER_SHOTS = 40;
var MAX_ENEMY_SHOTS = 72;
var MAX_ENEMIES = 40;
var MAX_PARTICLES = 220;
var MAX_PARTICLES_LOWFX = 70;
var MAX_PICKUPS = 6;
var MAX_TEXTS = 10;

var player = {
    speed: 118,
    zoneTop: 0.75,            // the ship lives in the lower 25 % of the arena
    margin: 8,
    hitRadius: 3,             // the glowing core only: no unfair deaths
    energy: 100,
    lives: 3,
    maxLives: 5,
    bombs: 2,
    maxBombs: 5,
    invulnerable: 2.0,
    respawnDelay: 1.1,
    shotSpeed: 270,
    fireCooldown: 0.21,
    rapidCooldown: 0.105,
    spreadAngles: [[0], [-0.10, 0.10], [-0.20, 0, 0.20]],
    bulletDamage: 1,
    bulletHit: 25,            // energy lost to an enemy shot
    ramHit: 40,               // energy lost touching a nanobot
    bossRamHit: 55,
    nearMissRadius: 9,
    nearMissScore: 25
};

var weapons = {
    rapidTime: 10,
    laserTime: 7,
    laserDps: 7,              // damage per second on strong targets
    laserWidth: 3,
    shieldTime: 8,
    repair: 45,
    bombRadius: 92,
    bombTime: 0.55,
    bombDamage: 3,
    bombBossDamage: 9
};

// Power-up table: weight = relative chance when a drop happens.
var pickups = {
    fallSpeed: 34,
    dropChance: 0.10,         // any kill
    carrierPerWave: 2,        // glowing nanobots that always drop
    types: [
        { id: "spread", weight: 26 },
        { id: "rapid", weight: 22 },
        { id: "laser", weight: 14 },
        { id: "shield", weight: 14 },
        { id: "bomb", weight: 11 },
        { id: "repair", weight: 10 },
        { id: "life", weight: 3 }
    ]
};

var combo = {
    window: 1.25,             // seconds between kills to keep the chain
    stepKills: 5,             // every 5 kills, +0.5x
    maxMultiplier: 4
};

var difficulty = {
    min: 0.85,
    max: 1.15,
    onDeath: -0.05,
    onPerfectWave: 0.03
};

// Base nanobots. Traits (below) are layered on top of these.
var enemyKinds = {
    drone: { hp: 1, radius: 5, score: 50, sprite: "drone" },
    brute: { hp: 3, radius: 6, score: 120, sprite: "brute" },
    mite:  { hp: 1, radius: 3, score: 30, sprite: "mite" }
};

// The evolution tree. Each sector unlocks one behaviour; later sectors keep
// using the earlier ones at a lower rate, and the Neural Core combines them.
var traitOrder = ["split", "shield", "cloak", "teleport", "dive", "coord", "regen"];
var traits = {
    split:    { score: 30 },
    shield:   { score: 40, shieldHp: 3 },
    cloak:    { score: 40, visible: 3.0, warn: 0.7, hidden: 2.2, alpha: 0.2 },
    teleport: { score: 60, cooldown: 2.6, warn: 0.12, minJump: 26, maxJump: 44, maxJumps: 4, sense: 56 },
    dive:     { score: 50 },
    coord:    { score: 50, bubble: 2, bubbleRegen: 4.0, linkRange: 46 },
    regen:    { score: 50, delay: 1.0, every: 1.4 }
};

var enemyFire = {
    baseRate: 0.13,           // shots per second per attacking nanobot ...
    formationRate: 0.018,     // ... and per nanobot holding formation
    rateGrowth: 0.012,        // added per sector
    speed: 72,
    speedGrowth: 3.5,         // per sector
    aimedFromSector: 2
};

var formation = {
    sway: 22,
    swaySpeed: 0.55,
    cellW: 26,
    cellH: 18,
    top: 30,
    entryGap: 0.075,          // between nanobots of one entry group
    groupGap: 0.55,
    attackEvery: 2.4,         // seconds between attack runs (sector 1)
    attackEveryMin: 1.0
};

// Nine brain sectors: palette, unlocked trait, boss.
// Colours: bg (arena), grid (synapses), glow (pulses), a/b (nanobot body).
var sectors = [
    { key: "gateway",   trait: null,       boss: "warden",   bg: "#080B18", grid: "#1A3A8A", glow: "#3D7BFF", a: "#5C8DFF", b: "#C8D8FF" },
    { key: "synaptic",  trait: "split",    boss: "mitosis",  bg: "#041418", grid: "#0E4A55", glow: "#00E5FF", a: "#00E5FF", b: "#B8FBFF" },
    { key: "memory",    trait: "shield",   boss: "bastion",  bg: "#0E0818", grid: "#3E1F6B", glow: "#A855F7", a: "#A855F7", b: "#E2C8FF" },
    { key: "dream",     trait: "cloak",    boss: "weaver",   bg: "#170816", grid: "#5A1E50", glow: "#FF6EC7", a: "#FF6EC7", b: "#FFD3EE" },
    { key: "labyrinth", trait: "teleport", boss: "shifter",  bg: "#141205", grid: "#5A4C0E", glow: "#FFD166", a: "#FFD166", b: "#FFF1C8" },
    { key: "phantom",   trait: "dive",     boss: "hive",     bg: "#03050F", grid: "#14204A", glow: "#2E5BFF", a: "#6E8BFF", b: "#C9D2FF" },
    { key: "inferno",   trait: "coord",    boss: "legion",   bg: "#170506", grid: "#5E1418", glow: "#FF405C", a: "#FF405C", b: "#FFC2C9" },
    { key: "quantum",   trait: "regen",    boss: "healer",   bg: "#03140A", grid: "#0F4D2A", glow: "#39FF88", a: "#39FF88", b: "#C6FFDD" },
    { key: "core",      trait: "hive",     boss: "overmind", bg: "#0A0A12", grid: "#3A2A5A", glow: "#FFFFFF", a: "#00E5FF", b: "#FFD166" }
];

var wavesPerSector = 3;
var bonusAfterSector = [2, 4, 6, 8];   // a challenge wave follows these bosses
var bonusEnemies = 24;
var bonusKillScore = 100;
var bonusPerfect = 5000;

// Timings of the game flow (seconds).
var flow = {
    sectorIntro: 2.4,
    ready: 1.2,
    waveClear: 1.5,
    bossWarning: 2.4,
    bonusResult: 2.6,
    victory: 6.0
};

// Mega-nanobots. Parts: core, turret, gen (shield generator).
// x/y: offsets from the boss centre. Patterns run on their own cooldowns.
var bosses = {
    warden: {
        hpScale: 1.0, speed: 26,
        parts: [ { kind: "core", x: 0, y: 0, hp: 40, r: 9 },
                 { kind: "turret", x: -24, y: 4, hp: 14, r: 6 },
                 { kind: "turret", x: 24, y: 4, hp: 14, r: 6 } ],
        patterns: [ { id: "fan", every: 2.6, count: 5, spread: 0.9 },
                    { id: "aimed", every: 1.7, from: "turret" } ]
    },
    mitosis: {
        hpScale: 1.05, speed: 30,
        parts: [ { kind: "core", x: 0, y: 0, hp: 46, r: 9 },
                 { kind: "turret", x: -26, y: 2, hp: 15, r: 6 },
                 { kind: "turret", x: 26, y: 2, hp: 15, r: 6 } ],
        patterns: [ { id: "summon", every: 5.5, count: 2, trait: "split" },
                    { id: "aimed", every: 1.8, from: "turret" },
                    { id: "fan", every: 3.2, count: 6, spread: 1.1 } ]
    },
    bastion: {
        hpScale: 1.1, speed: 22, shieldedCore: true,
        parts: [ { kind: "core", x: 0, y: 0, hp: 50, r: 10 },
                 { kind: "gen", x: -30, y: -2, hp: 18, r: 6 },
                 { kind: "gen", x: 30, y: -2, hp: 18, r: 6 } ],
        patterns: [ { id: "rain", every: 2.2, count: 4 },
                    { id: "fan", every: 2.8, count: 7, spread: 1.2 },
                    { id: "regenGen", every: 0.5, rebuild: 14.0 } ]
    },
    weaver: {
        hpScale: 1.15, speed: 28,
        parts: [ { kind: "core", x: 0, y: 0, hp: 54, r: 10 },
                 { kind: "turret", x: -26, y: 6, hp: 16, r: 6 },
                 { kind: "turret", x: 26, y: 6, hp: 16, r: 6 } ],
        patterns: [ { id: "spiral", every: 0.16, burst: 16, rest: 2.4 },
                    { id: "cloak", every: 6.0 },
                    { id: "aimed", every: 2.0, from: "turret" } ]
    },
    shifter: {
        hpScale: 1.2, speed: 0,
        parts: [ { kind: "core", x: 0, y: 0, hp: 58, r: 10 },
                 { kind: "turret", x: -24, y: 2, hp: 17, r: 6 },
                 { kind: "turret", x: 24, y: 2, hp: 17, r: 6 } ],
        patterns: [ { id: "teleport", every: 3.4 },
                    { id: "burst", every: 1.6, count: 3 },
                    { id: "fan", every: 3.0, count: 5, spread: 0.8 } ]
    },
    hive: {
        hpScale: 1.25, speed: 24,
        parts: [ { kind: "core", x: 0, y: 0, hp: 62, r: 11 },
                 { kind: "turret", x: -30, y: 0, hp: 18, r: 6 },
                 { kind: "turret", x: 30, y: 0, hp: 18, r: 6 } ],
        patterns: [ { id: "launch", every: 3.6, count: 2 },
                    { id: "aimed", every: 1.5, from: "turret" },
                    { id: "rain", every: 3.0, count: 5 } ]
    },
    legion: {
        hpScale: 1.3, speed: 30,
        parts: [ { kind: "core", x: 0, y: 0, hp: 64, r: 11 },
                 { kind: "turret", x: -34, y: 4, hp: 18, r: 6 },
                 { kind: "turret", x: -14, y: 10, hp: 14, r: 5 },
                 { kind: "turret", x: 14, y: 10, hp: 14, r: 5 },
                 { kind: "turret", x: 34, y: 4, hp: 18, r: 6 } ],
        patterns: [ { id: "crossfire", every: 2.0 },
                    { id: "fan", every: 3.4, count: 7, spread: 1.3 },
                    { id: "summon", every: 7.0, count: 2, trait: "coord" } ]
    },
    healer: {
        hpScale: 1.35, speed: 26,
        parts: [ { kind: "core", x: 0, y: 0, hp: 66, r: 11 },
                 { kind: "turret", x: -28, y: 4, hp: 18, r: 6 },
                 { kind: "turret", x: 28, y: 4, hp: 18, r: 6 } ],
        patterns: [ { id: "heal", every: 1.0, amount: 1.0, delay: 2.0 },
                    { id: "spiral", every: 0.2, burst: 12, rest: 2.6 },
                    { id: "aimed", every: 1.6, from: "turret" } ]
    },
    overmind: {
        hpScale: 1.0, speed: 22, final: true, shieldedCore: true,
        parts: [ { kind: "core", x: 0, y: 0, hp: 120, r: 13 },
                 { kind: "gen", x: -36, y: -6, hp: 20, r: 6 },
                 { kind: "gen", x: 36, y: -6, hp: 20, r: 6 },
                 { kind: "turret", x: -20, y: 12, hp: 18, r: 6 },
                 { kind: "turret", x: 20, y: 12, hp: 18, r: 6 } ],
        // Three phases, chosen by the core's remaining energy.
        phases: [
            { above: 0.66, patterns: [ { id: "fan", every: 2.2, count: 7, spread: 1.2 },
                                       { id: "aimed", every: 1.4, from: "turret" },
                                       { id: "rain", every: 2.6, count: 5 } ] },
            { above: 0.33, patterns: [ { id: "summon", every: 5.0, count: 3, trait: "split" },
                                       { id: "regenGen", every: 0.5, rebuild: 12.0 },
                                       { id: "spiral", every: 0.15, burst: 14, rest: 2.2 } ] },
            { above: 0.0,  patterns: [ { id: "teleport", every: 2.8 },
                                       { id: "crossfire", every: 1.9 },
                                       { id: "launch", every: 4.0, count: 2 },
                                       { id: "burst", every: 1.7, count: 3 } ] }
        ],
        patterns: []
    }
};

var scores = {
    bossPart: 300,
    bossCore: 5000,
    perfectWave: 1000,
    sectorClear: 2000
};

var achievements = ["firstBlood", "hunter", "perfectWave", "shieldMaster", "comboKing", "neuralHero"];

// Low-cost mode: fewer particles and no background pulses. Turned on by the
// player or automatically when frames take too long.
var autoLowFxMs = 11;         // average engine+paint time per frame
var autoEconomyMs = 22;       // above this, drop to 30 updates per second
