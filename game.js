/* ==========================================================================
   SEA-PIRATES — engine (canvas world, entities, physics, audio)
   Exposes window.SP. UI/DOM lives in app.js.
   ========================================================================== */
(function () {
  'use strict';

  var VH = 270;          // internal world height, always fixed
  var VW = 480;          // internal world width, re-derived from the viewport
  var SEA = 152;         // horizon line in world units
  var PPM = 3.6;         // world pixels scrolled per metre sailed

  var cv, ctx, host;
  var SPR = {};
  var hooks = { hud: null, banner: null, death: null, port: null, shake: null };
  var PAL = window.SP_PALETTE, ROWS = window.SP_ROWS, GHOST = window.SP_GHOST_OVERRIDE;

  /* ---------------------------------------------------------- sprite build */
  function toRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function mergePal(over) {
    var p = {}, k;
    for (k in PAL) p[k] = PAL[k];
    for (k in over) p[k] = over[k];
    return p;
  }
  function buildSprite(def, pal) {
    var c = document.createElement('canvas');
    c.width = def.w; c.height = def.h;
    var g = c.getContext('2d');
    var img = g.createImageData(def.w, def.h), d = img.data, cache = {};
    for (var y = 0; y < def.h; y++) {
      var row = def.rows[y];
      for (var x = 0; x < def.w; x++) {
        var ch = row.charAt(x), col;
        if (ch === '.' || ch === ' ' || !pal[ch]) continue;
        col = cache[ch] || (cache[ch] = toRgb(pal[ch]));
        var i = (y * def.w + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  var SHIP_PAL = {
    gull: {},                                                   // weathered default
    corsair: { R: '#C22B32', r: '#8A1C22', W: '#EFE2C6', S: '#C4B393', L: '#8A5528', D: '#54301A' },
    sparrow: { W: '#F6EFDC', S: '#D6C9A8', s: '#A99C7E', R: '#2A8A6E', r: '#12604E', L: '#8A5A32', D: '#54341C' },
    phantom: GHOST
  };

  function buildAll() {
    SPR.skiff = buildSprite(ROWS.skiff, PAL);
    SPR.frigate = buildSprite(ROWS.frigate, PAL);
    SPR.ghost = buildSprite(ROWS.galleon, mergePal(GHOST));
    SPR.siren = buildSprite(ROWS.siren, PAL);
    SPR.tentacle = buildSprite(ROWS.tentacle, PAL);
    SPR.kraken = buildSprite(ROWS.kraken, PAL);
    SPR.crate = buildSprite(ROWS.crate, PAL);
    SPR.coin = buildSprite(ROWS.coin, PAL);
    SPR.ball = buildSprite(ROWS.ball, PAL);
    SPR.ships = {};
    for (var k in SHIP_PAL) SPR.ships[k] = buildSprite(ROWS.galleon, mergePal(SHIP_PAL[k]));
  }

  /* ----------------------------------------------------------- data tables */
  var BIOMES = [
    { id: 'shallows', from: 0, skyTop: '#2A4A7A', skyBot: '#E99354', sea: '#1D4E6E', sea2: '#17415D',
      deep: '#0E2E44', ridge: '#132A3E', ridge2: '#1B3A52', foam: '#BFE9F5', star: 0.15, rain: 0,
      surf: '#3E86A8', accent: '#F5B93C' },
    { id: 'pass', from: 1000, skyTop: '#161E30', skyBot: '#4A3A52', sea: '#123244', sea2: '#0E2938',
      deep: '#081E2C', ridge: '#0C1A26', ridge2: '#132738', foam: '#8FC4D8', star: 0.35, rain: 1,
      surf: '#2A6480', accent: '#8FB4F0' },
    { id: 'abyss', from: 3000, skyTop: '#05060E', skyBot: '#120A22', sea: '#0A1A30', sea2: '#081426',
      deep: '#03080F', ridge: '#070C18', ridge2: '#0C1426', foam: '#7FE3C8', star: 0.6, rain: 0,
      surf: '#123A4E', accent: '#7FE3C8' }
  ];

  var SHIPS = [
    { id: 'gull', name: 'THE RUSTY GULL', hp: 6, speed: 1.0, dmg: 1.0, price: 0,
      blurb: 'An honest hull with honest rot. Balanced in every way that matters.' },
    { id: 'corsair', name: 'THE CRIMSON CORSAIR', hp: 5, speed: 1.05, dmg: 1.35, price: 3200,
      blurb: 'Heavier guns, thinner planks. Silas Drake\u2019s own command.' },
    { id: 'sparrow', name: 'SWIFT SPARROW', hp: 4, speed: 1.45, dmg: 0.85, price: 4500,
      blurb: 'Light, quick, and allergic to cannon fire.' },
    { id: 'phantom', name: 'THE PHANTOM', hp: 7, speed: 1.1, dmg: 1.1, price: 9000,
      blurb: 'Raised from the Abyss. Broadsides recharge far faster.' }
  ];

  var CREW = [
    { id: 'cook', name: 'MASTER COOK', price: 2000, per: 0.07, max: 5,
      ds: 'Hull patches itself while no shots are incoming.' },
    { id: 'navigator', name: 'NAVIGATOR', price: 2600, per: 0.04, max: 5,
      ds: 'Reads the wind. Raises sailing speed each level.' },
    { id: 'lookout', name: 'LOOKOUT', price: 3400, per: 0.05, max: 5,
      ds: 'Spots hulls sooner. Raises doubloons from every wreck.' }
  ];

  var CANNON_MAX = 5, PLATE_MAX = 5;

  var KIND = {
    skiff:   { hp: 1,  spd: 92,  r: 13, bounty: 60,  gold: [4, 12],  sprite: 'skiff',   score: 1 },
    frigate: { hp: 6,  spd: 40,  r: 20, bounty: 320, gold: [18, 46], sprite: 'frigate', score: 4 },
    ghost:   { hp: 8,  spd: 34,  r: 20, bounty: 420, gold: [26, 60], sprite: 'ghost',   score: 5 },
    siren:   { hp: 3,  spd: 58,  r: 14, bounty: 260, gold: [16, 40], sprite: 'siren',   score: 3 },
    bomb:    { hp: 2,  spd: 74,  r: 15, bounty: 220, gold: [14, 34], sprite: 'skiff',   score: 3 },
    fire:    { hp: 3,  spd: 86,  r: 16, bounty: 240, gold: [14, 34], sprite: 'skiff',   score: 3 },
    elite:   { hp: 16, spd: 46,  r: 24, bounty: 1400, gold: [120, 240], sprite: 'frigate', score: 10 }
  };

  /* ----------------------------------------------------------------- audio */
  var AC = null, muted = false, master = null;
  function audio() {
    if (AC || muted) return AC;
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain();
      master.gain.value = 0.35;
      master.connect(AC.destination);
    } catch (e) { AC = null; }
    return AC;
  }
  function tone(type, f0, f1, dur, vol, delay) {
    var a = audio(); if (!a) return;
    var t = a.currentTime + (delay || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, delay, q) {
    var a = audio(); if (!a) return;
    var t = a.currentTime + (delay || 0);
    var n = Math.floor(a.sampleRate * dur);
    var buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = a.createBufferSource(); src.buffer = buf;
    var f = a.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(freq || 900, t); f.Q.value = q || 1;
    var g = a.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }
  var SFX = {
    fire: function () { tone('square', 320, 120, 0.07, 0.14); },
    boom: function () { noise(0.38, 0.4, 700); tone('sawtooth', 150, 40, 0.3, 0.2); },
    bigboom: function () { noise(0.9, 0.55, 500); tone('sawtooth', 90, 28, 0.8, 0.3); },
    coin: function () { tone('square', 880, 880, 0.05, 0.16); tone('square', 1320, 1320, 0.07, 0.14, 0.05); },
    hit: function () { noise(0.16, 0.3, 1600); tone('square', 190, 90, 0.14, 0.2); },
    splinter: function () { noise(0.22, 0.26, 2200); },
    power: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone('square', f, f, 0.1, 0.16, i * 0.055); }); },
    alarm: function () { tone('sawtooth', 660, 220, 0.34, 0.2); tone('sawtooth', 660, 220, 0.34, 0.2, 0.38); },
    roar: function () { tone('sawtooth', 70, 34, 1.5, 0.4); noise(1.4, 0.3, 320, 0, 3); },
    ui: function () { tone('square', 440, 660, 0.05, 0.12); },
    damage: function () { tone('square', 240, 120, 0.28, 0.26); },
    win: function () { [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone('square', f, f, 0.14, 0.16, i * 0.09); }); }
  };

  /* ------------------------------------------------------------ world state */
  var W = null, rand = Math.random;
  function rr(a, b) { return a + rand() * (b - a); }
  function ri(a, b) { return Math.floor(rr(a, b + 1)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function blankState() {
    return {
      on: false, over: false, paused: false, t: 0,
      dist: 0, scroll: 0, mps: 18,
      px: 72, water: 200, pvy: 0, tilt: 0, bob: 0,
      hp: 6, maxHp: 6, hearts: 6,
      bounty: 0, gold: 0, kills: 0, combo: 0, comboT: 0, bestCombo: 0,
      wanted: 1, infamy: 0, infamyT: 0,
      wind: 0, windTarget: 0, windT: 6,
      special: 0, specialMax: 100, specialOn: 0,
      fireT: 0, rate: 0.26,
      shield: 0, rapid: 0, spread: 0, invuln: 1.2, reversed: 0,
      biome: 0, biomeFade: 1, prevBiome: 0,
      ents: [], shots: [], foeShots: [], pickups: [], parts: [], hazards: [], floaters: [],
      boss: null, bossIdx: 0, nextBoss: 1000, nextPort: 1500, portPending: false,
      spawnT: 1.5, shake: 0, hitFlash: 0, salvage: 0,
      cfg: null, shipCfg: SHIPS[0], crew: { cook: 0, navigator: 0, lookout: 0 },
      cannon: 1, plate: 0, killsBy: {}, shipsSunk: {}, elapsed: 0,
      keys: {}, down: false, pointerY: null, pointerX: null, autoFire: false
    };
  }

  function startRun(cfg) {
    var ship = SHIPS[0], i;
    for (i = 0; i < SHIPS.length; i++) if (SHIPS[i].id === cfg.ship) ship = SHIPS[i];
    W = blankState();
    W.cfg = cfg;
    W.shipCfg = ship;
    W.cannon = cfg.cannon || 1;
    W.plate = cfg.plate || 0;
    W.crew = cfg.crew || W.crew;
    W.maxHp = Math.round(ship.hp + W.plate);
    W.hp = W.maxHp;
    W.hearts = Math.ceil(W.maxHp / 2);
    W.on = true;
    W.savedHp = W.hp;
    if (cv) { resize(); }
    last = 0; acc = 0;
    if (!raf) raf = requestAnimationFrame(loop);
    emit();
  }

  /* ------------------------------------------------------------------ spawn */
  function pickKind() {
    var d = W.dist, pool = [];
    function add(k, w) { for (var i = 0, n = Math.max(1, Math.round(w * 12)); i < n; i++) pool.push(k); }
    add('skiff', 1.0);
    if (d > 220) add('fire', 0.3);
    if (d > 520) add('siren', 0.34);
    if (d > 780) add('bomb', 0.3);
    if (d > 1000) add('frigate', 0.7);
    if (d > 1600) add('ghost', 0.42);
    if (d > 3000) { add('frigate', 0.4); add('ghost', 0.55); add('bomb', 0.3); add('fire', 0.25); }
    return pool[(rand() * pool.length) | 0];
  }

  function makeEnemy(kind, y) {
    var k = KIND[kind];
    var s = 1 + W.dist / 3500;
    var e = {
      kind: kind, x: VW + 30 + rr(0, 40), y: y, hp: Math.max(1, Math.round(k.hp * s)),
      r: k.r, spd: k.spd * (1 + W.dist / 9000), t: 0, fireT: rr(0.9, 1.8),
      fade: 1, hit: 0, hold: rr(VW * 0.42, VW * 0.66), mode: 0,
      amp: rr(6, 16), ph: rr(0, 6.3), dropped: false
    };
    e.maxHp = e.hp;
    if (kind === 'siren') { e.y = clamp(y, SEA + 22, VH - 24); }
    if (kind === 'skiff') { e.spd *= rr(0.85, 1.2); }
    return e;
  }

  function spawnWave() {
    var d = W.dist;
    var n = 1;
    if (d > 1400 && rand() < 0.35) n = 2;
    if (d > 2600 && rand() < 0.25) n = 3;
    for (var i = 0; i < n; i++) {
      var y = rr(SEA + 26, VH - 22);
      W.ents.push(makeEnemy(pickKind(), y));
    }
    W.spawnT = Math.max(0.44, 1.55 - d / 1750) * rr(0.75, 1.3);
    if (W.wind < -0.2) W.spawnT *= 1.25;
  }

  function spawnElite() {
    var e = makeEnemy('elite', rr(SEA + 40, VH - 40));
    e.x = VW + 20;
    e.hp = e.maxHp = 16 + W.bossIdx * 4;
    W.ents.push(e);
    banner('ELITE HUNTER', 'red');
    SFX.alarm();
  }

  /* --------------------------------------------------------------- helpers */
  function emit() { if (hooks.hud && W) hooks.hud(W); }
  function banner(text, cls) { if (hooks.banner) hooks.banner(text, cls || 'gold'); }
  function shake(n) { W.shake = Math.min(9, W.shake + n); }

  function burst(x, y, n, cols, spd, life, gv) {
    for (var i = 0; i < n; i++) {
      var a = rand() * 6.283, s = rr(spd * 0.35, spd);
      W.parts.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.2,
        life: rr(life * 0.6, life), max: life, c: cols[(rand() * cols.length) | 0],
        sz: rand() < 0.3 ? 3 : 2, grav: gv === undefined ? 46 : gv
      });
    }
  }
  var FIRE = ['#FFF3E4', '#F5B93C', '#F5A030', '#C0392B'];
  var SPLASH = ['#BFE9F5', '#8FC4D8', '#E8DCC0'];
  var GOLDY = ['#FFE08A', '#F5B93C', '#8A6420'];
  var GHOSTC = ['#7FE3C8', '#3E8C78', '#BFF5E8'];
  var ABYSS = ['#C79BF5', '#6A4A9E', '#7FE3C8'];

  function floater(x, y, text, col) {
    W.floaters.push({ x: x, y: y, text: text, c: col || '#FFE08A', life: 0.9, max: 0.9 });
  }

  function addBounty(n) {
    W.bounty += Math.round(n * (1 + W.infamy * 0.5));
  }

  function comboMul() {
    if (W.combo >= 50) return 25;
    if (W.combo >= 25) return 10;
    if (W.combo >= 10) return 5;
    if (W.combo >= 5) return 2;
    return 1;
  }

  function updateWanted() {
    var b = W.bounty, w = 1;
    if (b > 20000) w = 5; else if (b > 11000) w = 4; else if (b > 5000) w = 3; else if (b > 1800) w = 2;
    if (w > W.wanted) {
      W.wanted = w;
      banner(['', 'HOBBY GAWKS', 'ROPE PIRATES', 'NAVY ARRIVES', 'ELITE HUNTERS', 'THE ENTIRE SEA HUNTS YOU'][w], 'red');
      SFX.alarm();
    }
  }

  function damagePlayer(n, src) {
    if (W.attract) return;
    if (W.invuln > 0 || W.shield > 0) {
      if (W.shield > 0) { burst(W.px + 19, W.water - 12, 8, GHOSTC, 60, 0.4, 0); }
      return;
    }
    W.hp -= n;
    W.invuln = 1.15;
    W.hitFlash = 0.32;
    shake(5 + n);
    SFX.damage();
    burst(W.px + 10, W.water - 14, 10, SPLASH, 80, 0.5);
    if (W.hp <= 0) { W.hp = 0; die(); }
  }

  function die() {
    if (W.over) return;
    W.over = true;
    W.deathT = 1.5;
    SFX.bigboom();
    shake(9);
    for (var i = 0; i < 5; i++) {
      burst(W.px + rr(-6, 30), W.water - rr(4, 26), 16, FIRE, 140, 1.0, 30);
    }
  }

  function hitEnemy(e, dmg) {
    e.hp -= dmg;
    e.hit = 0.12;
    if (e.hp <= 0) killEnemy(e);
    else {
      burst(e.x, e.y - 6, 3, SPLASH, 60, 0.3, 30);
      SFX.hit();
    }
  }

  function killEnemy(e, silent) {
    if (e.dead) return;
    e.dead = true;
    var k = KIND[e.kind];
    W.kills++;
    W.killsBy[e.kind] = (W.killsBy[e.kind] || 0) + 1;
    W.combo++;
    W.comboT = 2.7;
    if (W.combo > W.bestCombo) W.bestCombo = W.combo;
    var mul = comboMul();
    var b = k.bounty * mul * (W.cfg && W.cfg.crew.lookout ? 1 + 0.05 * W.cfg.crew.lookout : 1);
    addBounty(b);
    if (!silent) {
      floater(e.x, e.y - 14, '+' + Math.round(b), mul > 1 ? '#F0645C' : '#FFE08A');
      burst(e.x + 8, e.y - 8, e.kind === 'ghost' ? 14 : 18, e.kind === 'ghost' ? GHOSTC : FIRE, 120, 0.7, 40);
      if (e.kind === 'ghost') SFX.boom(); else SFX.boom();
      shake(2);
    }
    if (e.kind === 'bomb') explodeAt(e.x, e.y, 46, true);
    dropLoot(e);
    var goldBonus = 1 + (W.cfg && W.cfg.crew.lookout ? 0.05 * W.cfg.crew.lookout : 0);
    var amt = Math.round(rr(k.gold[0], k.gold[1]) * goldBonus * (1 + W.infamy * 0.4));
    W.salvage += amt;
    spawnCoin(e.x, e.y - 8, amt);
    W.special = Math.min(W.specialMax, W.special + (e.kind === 'frigate' || e.kind === 'ghost' ? 14 : 7));
  }

  function explodeAt(x, y, r, hurting) {
    burst(x, y, 26, FIRE, 150, 0.8, 34);
    burst(x, y, 12, SPLASH, 110, 0.7, 60);
    shake(5);
    SFX.boom();
    if (hurting) {
      var dx = (W.px + 19) - x, dy = (W.water - 12) - y;
      if (dx * dx + dy * dy < r * r) damagePlayer(2);
    }
  }

  function spawnCoin(x, y, amt) {
    W.pickups.push({ kind: 'gold', x: x, y: y, vy: -34, vx: -22, amt: amt, t: 0, life: 8 });
  }

  function dropLoot(e) {
    var roll = rand();
    if (e.kind === 'elite') { roll = 0.0; }
    if (roll > 0.9) W.pickups.push({ kind: 'heal', x: e.x, y: e.y - 10, vy: 0, vx: -26, t: 0, life: 8 });
    else if (roll > 0.86) W.pickups.push({ kind: 'shield', x: e.x, y: e.y - 10, vy: 0, vx: -26, t: 0, life: 8 });
    else if (roll > 0.82) W.pickups.push({ kind: 'rapid', x: e.x, y: e.y - 10, vy: 0, vx: -26, t: 0, life: 8 });
    else if (roll > 0.78) W.pickups.push({ kind: 'spread', x: e.x, y: e.y - 10, vy: 0, vx: -26, t: 0, life: 8 });
  }

  function applyPickup(p) {
    SFX.power();
    if (p.kind === 'gold') {
      W.gold += p.amt;
      floater(p.x, p.y, '+' + p.amt + ' g', '#FFE08A');
      return;
    }
    if (p.kind === 'heal') { W.hp = Math.min(W.maxHp, W.hp + 2); floater(p.x, p.y, '+HULL', '#6FE3A6'); }
    if (p.kind === 'shield') { W.shield = 9; floater(p.x, p.y, 'SHIELD', '#7FE3C8'); }
    if (p.kind === 'rapid') { W.rapid = 10; floater(p.x, p.y, 'RAPID FIRE', '#F5B93C'); }
    if (p.kind === 'spread') { W.spread = 12; floater(p.x, p.y, 'SPREAD', '#C79BF5'); }
  }

  /* ------------------------------------------------------------ core update */
  function baseSpeed() {
    var nav = W.cfg && W.cfg.crew.navigator ? 1 + 0.04 * W.cfg.crew.navigator : 1;
    return 18 * W.shipCfg.speed * nav;
  }

  function updatePlayer(dt) {
    var k = W.keys, rev = W.reversed > 0 ? -1 : 1;
    var up = (k['w'] || k['arrowup']) ? -1 : 0;
    var dn = (k['s'] || k['arrowdown']) ? 1 : 0;
    var lf = (k['a'] || k['arrowleft']) ? -1 : 0;
    var rt = (k['d'] || k['arrowright']) ? 1 : 0;

    if (W.pointerY !== null) {
      var ty = clamp(W.pointerY - 26, SEA + 20, VH - 16);
      W.water += clamp((ty - W.water) * Math.min(1, dt * 9), -520 * dt, 520 * dt);
      W.pvy = clamp((ty - W.water) * 4, -110, 110);
    }
    if (W.pointerX !== null) {
      var tx = clamp(W.pointerX - 19, 20, VW * 0.72);
      W.px += clamp((tx - W.px) * Math.min(1, dt * 7), -300 * dt, 300 * dt);
    }
    if (up || dn) {
      var acc = 620;
      W.pvy += (up + dn) * acc * dt * rev;
      W.pvy = clamp(W.pvy, -180, 180);
    } else if (W.pointerY === null) {
      W.pvy *= Math.pow(0.0015, dt);
    }
    W.water = clamp(W.water + W.pvy * dt, SEA + 20, VH - 16);
    if (W.water <= SEA + 20 || W.water >= VH - 16) W.pvy = 0;

    if (lf || rt) {
      W.px = clamp(W.px + (lf + rt) * 130 * dt * rev, 20, VW * 0.72);
      W.tilt = clamp(W.tilt + (lf + rt) * dt * 3, -1, 1);
    }
    W.tilt *= Math.pow(0.02, dt);
    W.bob += dt * 2.4;

    var firing = !!k[' '] || W.down || W.autoFire;
    W.fireT -= dt;
    if (firing && W.fireT <= 0) {
      var rate = W.rate / (W.rapid > 0 ? 2 : 1) / (W.shipCfg.id === 'phantom' ? 1.25 : 1);
      W.fireT = rate;
      var dmg = W.cannon * W.shipCfg.dmg;
      var ox = W.px + 34, oy = W.water - 9;
      var shots = [];
      if (W.spread > 0) shots = [[-40, -1], [-40, 0], [-40, 1]];
      else shots = [[0, 0]];
      for (var i = 0; i < shots.length; i++) {
        W.shots.push({ x: ox, y: oy, vx: 230, vy: shots[i][0], dmg: dmg, t: 0 });
      }
      burst(ox, oy, 3, FIRE, 40, 0.18, 0);
      SFX.fire();
    }
  }

  function fireSpecial() {
    if (W.special < W.specialMax || !W.on || W.paused) return;
    W.special = 0;
    W.invuln = Math.max(W.invuln, 1.4);
    W.specialOn = 0.5;
    shake(7);
    SFX.win();
    banner('BROADSIDE!', 'gold');
    for (var i = 0; i < 9; i++) {
      W.shots.push({
        x: W.px + 34, y: W.water - 9, vx: 250 + rr(-15, 25), vy: -150 + i * 38,
        dmg: W.cannon * W.shipCfg.dmg * 1.6 + 1, t: 0, big: true
      });
    }
    burst(W.px + 36, W.water - 10, 26, FIRE, 120, 0.5, 0);
  }

  function updateEnemy(e, dt) {
    e.t += dt;
    if (e.hit > 0) e.hit -= dt;
    e.x -= e.spd * dt * (1 - W.wind * 0.16);
    var k = KIND[e.kind];

    if (e.kind === 'skiff' || e.kind === 'bomb' || e.kind === 'fire') {
      e.y += Math.sin(e.t * 2.2 + e.ph) * e.amp * dt * 2.4;
      e.y += clamp((W.water - e.y), -1, 1) * dt * (e.kind === 'bomb' ? 26 : 12);
    } else if (e.kind === 'frigate') {
      if (e.x < e.hold) { e.x += 26 * dt; }
      e.y += Math.sin(e.t * 0.9 + e.ph) * 8 * dt;
      e.fireT -= dt;
      if (e.fireT <= 0 && e.x < VW + 10) {
        e.fireT = 2.6;
        e.aim = W.water - 8;
        e.telegraph = 0.55;
      }
      if (e.telegraph > 0) {
        e.telegraph -= dt;
        if (e.telegraph <= 0) {
          var dy = (W.water - e.y - 6);
          for (var i = -1; i <= 1; i++) {
            W.foeShots.push({ x: e.x, y: e.y, vx: -170, vy: dy * 0.4 + i * 26, r: 3, kind: 'ball', t: 0 });
          }
          SFX.fire();
        }
      }
    } else if (e.kind === 'ghost') {
      e.y += Math.sin(e.t * 1.1 + e.ph) * 16 * dt;
      e.fade = 0.55 + Math.sin(e.t * 0.75) * 0.45;
      e.fireT -= dt;
      if (e.fireT <= 0) {
        e.fireT = 2.2;
        for (var j = -1; j <= 1; j++) {
          W.foeShots.push({ x: e.x, y: e.y - 4, vx: -105, vy: j * 42, r: 4, kind: 'ghost', t: 0 });
        }
      }
    } else if (e.kind === 'siren') {
      e.y += Math.sin(e.t * 2.6 + e.ph) * 20 * dt;
      var near = Math.abs(e.x - W.px) < 60;
      if (near && W.reversed <= 0) {
        W.reversed = 4;
        banner('SIREN SONG', 'red');
        SFX.alarm();
      }
      if (e.x < -40) e.dead = true;
    } else if (e.kind === 'elite') {
      e.y += clamp((W.water - e.y), -1, 1) * dt * 46;
      e.fireT -= dt;
      if (e.fireT <= 0) {
        e.fireT = 1.7;
        var ang = Math.atan2((W.water - 8) - e.y, W.px - e.x);
        for (var m = -1; m <= 1; m++) {
          W.foeShots.push({
            x: e.x, y: e.y, vx: Math.cos(ang + m * 0.16) * 175,
            vy: Math.sin(ang + m * 0.16) * 175, r: 4, kind: 'elite', t: 0
          });
        }
        SFX.fire();
      }
      if (e.x < W.px + 60) e.x = W.px + 60;
    }

    if (e.kind === 'fire' && rand() < dt * 1.6) {
      W.hazards.push({ x: e.x, y: e.y + 4, r: 12, t: 0, life: 3.2 });
    }
    // despawn off the left
    if (e.x < -50) e.dead = true;
    // contact
    var dx = (W.px + 19) - (e.x + 6), dy = (W.water - 10) - e.y;
    if (dx * dx + dy * dy < Math.pow(e.r + 12, 2)) {
      damagePlayer(e.kind === 'bomb' ? 3 : e.kind === 'elite' ? 2 : 1);
      if (e.kind === 'skiff' || e.kind === 'bomb' || e.kind === 'fire') killEnemy(e, true);
      else e.x += 26;
    }
  }

  /* ------------------------------------------------------------------ boss */
  function spawnBoss() {
    W.bossIdx++;
    var hp = 50 + W.bossIdx * 34;
    var tents = [], i;
    for (i = 0; i < 4; i++) tents.push({ off: -84 + i * 56, ph: i * 1.4, hp: 10, dead: false });
    W.boss = {
      x: VW + 110, y: SEA + 62, hp: hp, maxHp: hp, t: 0, tents: tents,
      fireT: 2.4, slamT: 3.2, entering: true, dying: 0, hit: 0, aimY: SEA + 62
    };
    banner('LEVIATHAN', 'red');
    SFX.roar();
    shake(7);
  }

  function bossParts() {
    var b = W.boss, out = [];
    if (!b || b.dying) return out;
    out.push({ x: b.x, y: b.y, r: 26, dmg: 1 });
    for (var i = 0; i < b.tents.length; i++) {
      var tn = b.tents[i];
      if (tn.dead) continue;
      out.push({ x: b.x + tn.off, y: SEA + 86 + Math.sin(b.t * 1.6 + tn.ph) * 10 + 20, r: 14, dmg: 0.55, ti: i });
    }
    return out;
  }

  function hurtBoss(part, dmg) {
    var b = W.boss;
    if (!b || b.dying) return;
    var d = dmg * (part.dmg || 1);
    b.hp -= d;
    b.hit = 0.1;
    if (part.ti !== undefined) {
      var tn = b.tents[part.ti];
      tn.hp -= d;
      if (tn.hp <= 0 && !tn.dead) {
        tn.dead = true;
        banner('TENTACLE SEVERED', 'gold');
        SFX.boom();
        burst(b.x + tn.off, SEA + 110, 22, ABYSS, 120, 0.8, 50);
      }
    }
    if (rand() < 0.4) burst(part.x, part.y, 2, SPLASH, 60, 0.25, 20);
    if (b.hp <= 0) {
      b.dying = 2.4;
      SFX.bigboom();
      shake(9);
      banner('LEVIATHAN SLAIN', 'gold');
    }
  }

  function updateBoss(dt) {
    var b = W.boss; if (!b) return;
    b.t += dt;
    if (b.hit > 0) b.hit -= dt;

    if (b.dying > 0) {
      b.dying -= dt;
      b.y += 14 * dt;
      if (rand() < 0.5) {
        burst(b.x + rr(-60, 60), b.y + rr(-24, 30), 12, rand() < 0.5 ? FIRE : ABYSS, 130, 0.8, 30);
        SFX.splash ? 0 : 0;
      }
      if (b.dying <= 0) {
        for (var i = 0; i < 40; i++) burst(b.x + rr(-70, 70), b.y + rr(-30, 40), 8, FIRE, 160, 1.1, 40);
        W.pickups.push({ kind: 'gold', x: b.x, y: b.y, vx: -30, vy: -20, amt: 500 + W.bossIdx * 350, t: 0, life: 8 });
        W.pickups.push({ kind: 'heal', x: b.x + 20, y: b.y, vx: -30, vy: 0, amt: 0, t: 0, life: 8 });
        W.pickups.push({ kind: 'shield', x: b.x - 20, y: b.y, vx: -30, vy: 0, amt: 0, t: 0, life: 8 });
        addBounty(6000 * W.bossIdx);
        W.gold += 0;
        W.cfg.bosses = (W.cfg.bosses || 0) + 1;
        W.boss = null;
        return;
      }
      return;
    }

    if (b.entering) {
      b.x -= 42 * dt;
      if (b.x <= VW - 118) { b.x = VW - 118; b.entering = false; }
    } else {
      b.x = VW - 118 + Math.sin(b.t * 0.7) * 16;
    }
    b.y = SEA + 62 + Math.sin(b.t * 1.25) * 20;

    var alive = b.tents.filter(function (t) { return !t.dead; }).length;
    var fast = b.hp < b.maxHp * 0.5 ? 0.65 : 1;

    if (!b.entering) {
      b.fireT -= dt;
      if (b.fireT <= 0) {
        b.fireT = 2.1 * fast;
        var ang = Math.atan2((W.water - 8) - (b.y + 6), W.px - b.x);
        for (var m = 0; m < 3; m++) {
          W.foeShots.push({
            x: b.x - 8, y: b.y + 6,
            vx: Math.cos(ang + (m - 1) * 0.2) * 155,
            vy: Math.sin(ang + (m - 1) * 0.2) * 155,
            r: 5, kind: 'ink', t: 0
          });
        }
        SFX.fire();
      }
      b.slamT -= dt;
      if (b.slamT <= 0 && alive > 0) {
        b.slamT = 3.4 * fast;
        var pick = null;
        for (var q = 0; q < b.tents.length; q++) {
          if (!b.tents[q].dead) { pick = b.tents[q]; break; }
        }
        if (pick) {
          var tx = b.x + pick.off, ty = SEA + 120;
          W.hazards.push({ x: tx, y: ty, r: 20, t: 0, life: 1.6 });
          burst(tx, ty, 20, SPLASH, 130, 0.8, 50);
          SFX.boom();
          var ddx = (W.px + 19) - tx, ddy = (W.water - 10) - ty;
          if (ddx * ddx + ddy * ddy < 40 * 40) damagePlayer(2);
        }
      }
    }

    // body contact
    var dx = (W.px + 19) - b.x, dy = (W.water - 10) - b.y;
    if (dx * dx + dy * dy < 44 * 44) damagePlayer(1);
  }

  /* -------------------------------------------------------------- main tick */
  function update(dt) {
    if (!W || !W.on) return;
    var i, j, e, s;

    if (!W.over) { W.t += dt; W.elapsed += dt; }

    /* biome */
    var bi = 0;
    for (i = BIOMES.length - 1; i >= 0; i--) { if (W.dist >= BIOMES[i].from) { bi = i; break; } }
    if (bi !== W.biome) {
      W.prevBiome = W.biome; W.biome = bi; W.biomeFade = 1;
      banner(['SUNRISE SHALLOWS', "SERPENT'S PASS", 'THE ABYSS'][bi], 'gold');
      SFX.alarm();
    }
    if (W.biomeFade > 0) W.biomeFade = Math.max(0, W.biomeFade - dt * 0.5);

    /* wind */
    W.windT -= dt;
    if (W.windT <= 0) { W.windT = rr(14, 30); W.windTarget = rr(-1, 1); }
    W.wind += clamp(W.windTarget - W.wind, -1, 1) * dt * 0.4;

    /* speed + distance */
    W.mps = baseSpeed() * (1 + W.wind * 0.26);
    if (!W.over) {
      W.dist += W.mps * dt;
      W.scroll += W.mps * PPM * dt;
    }

    /* scheduling */
    if (!W.over) {
      if (!W.boss && W.dist >= W.nextBoss) { spawnBoss(); W.nextBoss += 1000; }
      if (!W.boss && W.dist >= W.nextPort) { W.nextPort += 1500; W.portPending = true; if (hooks.port) hooks.port(); }
      if (!W.boss) {
        W.spawnT -= dt;
        if (W.spawnT <= 0) spawnWave();
      }
    }

    /* infamy */
    if (W._pb === undefined) W._pb = 0;
    var gained = W.bounty - W._pb;
    W._pb = W.bounty;
    if (gained > 0 && !W.over) {
      W.infamy += gained / 24000;
      if (W.infamy >= 1) { W.infamy = 0; if (!W.boss) spawnElite(); }
    }
    W.infamy = clamp(W.infamy, 0, 1);
    updateWanted();

    /* player */
    if (!W.over) {
      updatePlayer(dt);
      W.special = Math.min(W.specialMax, W.special + dt * 1.7);
      W.cookT = (W.cookT || 0) + dt;
      if (W.cfg && W.cfg.crew.cook && W.cookT > 3 && W.hp < W.maxHp && W.hitFlash <= 0 && !W.lastHit) {
        W.cookT = 0; W.hp = Math.min(W.maxHp, W.hp + 1);
        floater(W.px + 20, W.water - 26, '+1', '#6FE3A6');
      }
    } else {
      W.deathT -= dt;
      if (W.deathT <= 0 && W.on) {
        W.on = false;
        if (hooks.death) hooks.death(snapshot());
      }
    }
    W.lastHit = W.hitFlash > 0;

    /* timers */
    if (W.invuln > 0) W.invuln -= dt;
    if (W.shield > 0) W.shield -= dt;
    if (W.rapid > 0) W.rapid -= dt;
    if (W.spread > 0) W.spread -= dt;
    if (W.reversed > 0) W.reversed -= dt;
    if (W.hitFlash > 0) W.hitFlash -= dt;
    if (W.specialOn > 0) W.specialOn -= dt;
    if (W.comboT > 0) { W.comboT -= dt; if (W.comboT <= 0) W.combo = 0; }
    if (W.shake > 0) W.shake = Math.max(0, W.shake - dt * 22);

    /* enemies */
    for (i = W.ents.length - 1; i >= 0; i--) {
      e = W.ents[i];
      if (e.dead) { W.ents.splice(i, 1); continue; }
      updateEnemy(e, dt);
    }
    updateBoss(dt);

    /* player shots */
    for (i = W.shots.length - 1; i >= 0; i--) {
      s = W.shots[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.t += dt;
      if (s.x > VW + 24 || s.y < 0 || s.y > VH) { W.shots.splice(i, 1); continue; }
      var hitSomething = false;
      for (j = 0; j < W.ents.length; j++) {
        e = W.ents[j];
        if (e.dead) continue;
        var rr2 = Math.pow(e.r + 5, 2);
        var ddx = s.x - e.x, ddy = s.y - (e.y - 6);
        if (ddx * ddx + ddy * ddy < rr2) {
          hitEnemy(e, s.dmg);
          if (s.big) burst(s.x, s.y, 4, FIRE, 50, 0.3, 0);
          hitSomething = true;
          break;
        }
      }
      if (hitSomething) { W.shots.splice(i, 1); continue; }
      if (W.boss) {
        var parts = bossParts();
        for (j = 0; j < parts.length; j++) {
          var p = parts[j], pdx = s.x - p.x, pdy = s.y - p.y;
          if (pdx * pdx + pdy * pdy < Math.pow(p.r + 4, 2)) {
            hurtBoss(p, s.dmg);
            burst(s.x, s.y, 3, SPLASH, 50, 0.3, 0);
            hitSomething = true;
            break;
          }
        }
      }
      if (hitSomething) W.shots.splice(i, 1);
    }

    /* enemy shots */
    for (i = W.foeShots.length - 1; i >= 0; i--) {
      s = W.foeShots[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.t += dt;
      if (s.x < -20 || s.y < SEA - 10 || s.y > VH + 10 || s.x > VW + 40) { W.foeShots.splice(i, 1); continue; }
      var qdx = s.x - (W.px + 19), qdy = s.y - (W.water - 10);
      if (!W.over && qdx * qdx + qdy * qdy < Math.pow(s.r + 13, 2)) {
        damagePlayer(s.kind === 'ink' ? 2 : 1);
        burst(s.x, s.y, 6, SPLASH, 70, 0.35, 20);
        W.foeShots.splice(i, 1);
      }
    }

    /* pickups */
    for (i = W.pickups.length - 1; i >= 0; i--) {
      var p = W.pickups[i];
      p.t += dt; p.life -= dt;
      p.vy += 90 * dt;
      var tdx = (W.px + 19) - p.x, tdy = (W.water - 10) - p.y;
      var td = Math.sqrt(tdx * tdx + tdy * tdy);
      if (p.kind === 'gold' && td < 90) {
        p.vx += (tdx / td) * 380 * dt; p.vy += (tdy / td) * 380 * dt;
        p.vx = clamp(p.vx, -260, 260);
      } else { p.vy = clamp(p.vy, -80, 60); }
      p.x += (p.vx - W.mps * PPM) * dt; p.y += p.vy * dt;
      if (p.y < SEA + 6) { p.y = SEA + 6; p.vy = Math.abs(p.vy) * 0.3; }
      if (p.y > VH - 8) { p.y = VH - 8; p.vy = -Math.abs(p.vy) * 0.3; }
      if (!W.over && td < 22) { applyPickup(p); W.pickups.splice(i, 1); continue; }
      if (p.life <= 0 || p.x < -20) W.pickups.splice(i, 1);
    }

    /* hazards */
    for (i = W.hazards.length - 1; i >= 0; i--) {
      var h = W.hazards[i];
      h.t += dt; h.life -= dt;
      h.x -= W.mps * PPM * dt * 0.55;
      if (rand() < dt * 6) burst(h.x + rr(-10, 10), h.y + rr(-8, 6), 1, FIRE, 30, 0.35, -20);
      if (!W.over) {
        var hdx = (W.px + 19) - h.x, hdy = (W.water - 10) - h.y;
        if (hdx * hdx + hdy * hdy < Math.pow(h.r + 12, 2)) damagePlayer(1);
      }
      if (h.life <= 0 || h.x < -30) W.hazards.splice(i, 1);
    }

    /* particles + floaters */
    for (i = W.parts.length - 1; i >= 0; i--) {
      var pt = W.parts[i];
      pt.life -= dt;
      if (pt.life <= 0) { W.parts.splice(i, 1); continue; }
      pt.vy += pt.grav * dt;
      pt.x += (pt.vx - W.mps * PPM * 0.4) * dt;
      pt.y += pt.vy * dt;
    }
    for (i = W.floaters.length - 1; i >= 0; i--) {
      var f = W.floaters[i];
      f.life -= dt; f.y -= 20 * dt; f.x -= W.mps * PPM * 0.5 * dt;
      if (f.life <= 0) W.floaters.splice(i, 1);
    }

    if (hooks.hud) hooks.hud(W);
  }

  function snapshot() {
    return {
      dist: Math.round(W.dist), bounty: W.bounty, gold: W.gold, kills: W.kills,
      bestCombo: W.bestCombo, bosses: W.cfg.bosses || 0, bossIdx: W.bossIdx,
      wanted: W.wanted, killsBy: W.killsBy, elapsed: W.elapsed
    };
  }

  /* -------------------------------------------------------------- rendering */
  function hash(n) {
    n = (n << 13) ^ n;
    return (((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 0x7fffffff);
  }
  var STAR_FIELD = null;
  function starField() {
    if (STAR_FIELD && STAR_FIELD.w === VW) return STAR_FIELD;
    var s = { w: VW, pts: [] };
    for (var i = 0; i < 90; i++) {
      s.pts.push({ x: rand() * VW, y: rand() * (SEA - 30), s: rand() < 0.3 ? 2 : 1, tw: rand() * 6.3 });
    }
    STAR_FIELD = s;
    return s;
  }

  function lerpCol(a, b, t) { return t <= 0 ? a : t >= 1 ? b : b; }

  function drawSky(b) {
    var g = ctx.createLinearGradient(0, 0, 0, SEA + 8);
    g.addColorStop(0, b.skyTop);
    g.addColorStop(1, b.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, SEA + 8);
    if (W.over) { ctx.fillStyle = 'rgba(80,10,10,.22)'; ctx.fillRect(0, 0, VW, VH); }
  }

  function drawStars(b) {
    if (b.star <= 0.01) return;
    var sf = starField(), t = W.t;
    for (var i = 0; i < sf.pts.length; i++) {
      var p = sf.pts[i];
      var x = (p.x - W.scroll * 0.012) % VW; if (x < 0) x += VW;
      var tw = 0.55 + 0.45 * Math.sin(t * 1.6 + p.tw);
      ctx.fillStyle = 'rgba(255,246,224,' + (b.star * tw).toFixed(2) + ')';
      ctx.fillRect(x | 0, p.y | 0, p.s, p.s);
    }
  }

  function drawPeak(x, base, w, h, col) {
    ctx.fillStyle = col;
    var steps = Math.max(3, Math.round(w / 3));
    for (var i = 0; i < steps; i++) {
      var f = i / steps, x0 = x + f * w;
      var t = 1 - Math.abs(2 * f - 1);
      var hh = Math.max(1, Math.round(h * Math.pow(t, 0.62) / 2) * 2);
      ctx.fillRect(x0 | 0, (base - hh) | 0, Math.ceil(w / steps) + 1, hh);
    }
  }

  function drawRidge(b, par, base, maxH, col, density, kinds) {
    var span = 190;
    var start = Math.floor((W.scroll * par - 40) / span) - 1;
    var n = Math.ceil(VW / span) + 3;
    for (var i = 0; i < n; i++) {
      var idx = start + i;
      var h1 = hash(idx * 3 + 11);
      if (h1 > density) continue;
      var x = idx * span - W.scroll * par + hash(idx + 5) * 60;
      var w = 46 + hash(idx * 7 + 3) * 96;
      var h = maxH * (0.35 + hash(idx * 13 + 7) * 0.65);
      if (kinds === 'spires') {
        drawPeak(x, base, w * 0.42, h * 1.5, col);
        drawPeak(x + w * 0.5, base, w * 0.3, h * 1.15, col);
      } else if (kinds === 'ruins') {
        ctx.fillStyle = col;
        ctx.fillRect(x | 0, (base - h) | 0, Math.round(w * 0.5), h | 0);
        ctx.fillRect((x + w * 0.62) | 0, (base - h * 0.6) | 0, Math.round(w * 0.2), (h * 0.6) | 0);
        ctx.fillRect((x - w * 0.06) | 0, (base - h * 1.12) | 0, Math.round(w * 0.12), (h * 1.12) | 0);
      } else {
        drawPeak(x, base, w, h, col);
      }
    }
  }

  function drawSea(b) {
    var g = ctx.createLinearGradient(0, SEA, 0, VH);
    g.addColorStop(0, b.sea);
    g.addColorStop(0.55, b.sea2);
    g.addColorStop(1, b.deep);
    ctx.fillStyle = g;
    ctx.fillRect(0, SEA, VW, VH - SEA);
    ctx.fillStyle = b.foam;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, SEA, VW, 1);
    ctx.globalAlpha = 1;

    // scrolling wave bands
    for (var row = 0; row < 16; row++) {
      var y = SEA + 6 + row * 7.4;
      var par = 0.5 + row * 0.075;
      var off = -(W.scroll * par) % 46;
      var alpha = 0.05 + row * 0.011;
      ctx.fillStyle = b.foam;
      ctx.globalAlpha = alpha;
      for (var k = -1; k < VW / 46 + 1; k++) {
        var x = k * 46 + off + (row % 2 ? 22 : 0);
        var w = 14 + ((row * 7 + k * 13) % 12);
        ctx.fillRect(x | 0, y | 0, w, row < 5 ? 1 : 2);
      }
      ctx.globalAlpha = 1;
    }
    // bioluminescence
    if (b.id === 'abyss') {
      for (var q = 0; q < 26; q++) {
        var rx = (hash(q * 17) * VW - W.scroll * 0.6) % VW; if (rx < 0) rx += VW;
        var ry = SEA + 10 + hash(q * 29) * (VH - SEA - 20);
        var pulse = 0.3 + 0.7 * Math.abs(Math.sin(W.t * 0.9 + q));
        ctx.fillStyle = 'rgba(127,227,200,' + (pulse * 0.5).toFixed(2) + ')';
        ctx.fillRect(rx | 0, ry | 0, 2, 2);
      }
    }
  }

  function drawRain(b) {
    if (!b.rain) return;
    ctx.strokeStyle = 'rgba(180,205,225,.34)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    var shift = (W.t * 620) % 60;
    for (var i = 0; i < 70; i++) {
      var x = (hash(i * 31) * (VW + 80) - shift * (0.6 + hash(i * 7)));
      x = ((x % (VW + 80)) + VW + 80) % (VW + 80) - 40;
      var y = (hash(i * 53) * VH + W.t * 460) % VH;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3.5, y + 11);
    }
    ctx.stroke();
    if (Math.sin(W.t * 0.7) > 0.985) {
      ctx.fillStyle = 'rgba(255,255,255,.30)';
      ctx.fillRect(0, 0, VW, VH);
    }
  }

  function drawForeground(b) {
    // rolling crests in front of everything, cheap and readable
    ctx.fillStyle = b.foam;
    for (var k = -1; k < VW / 70 + 1; k++) {
      var x = k * 70 - (W.scroll * 1.25) % 70;
      var h = 9 + ((k * 37) % 7);
      ctx.globalAlpha = 0.16;
      ctx.fillRect(x | 0, VH - h | 0, 46, h);
      ctx.globalAlpha = 0.3;
      ctx.fillRect((x + 8) | 0, (VH - h + 3) | 0, 26, 2);
      ctx.globalAlpha = 1;
    }
  }

  function blit(img, x, y, flip, alpha) {
    if (!img) return;
    ctx.save();
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
    if (flip) {
      ctx.translate(Math.round(x) + img.width, Math.round(y));
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
    } else {
      ctx.drawImage(img, Math.round(x), Math.round(y));
    }
    ctx.restore();
  }

  function drawWake(x, y, len, a) {
    ctx.fillStyle = '#BFE9F5';
    ctx.globalAlpha = a;
    for (var i = 0; i < len; i += 5) {
      var w = 5 - (i / len) * 3;
      ctx.fillRect((x - i) | 0, (y + Math.sin((i + W.scroll) * 0.3) * 1.5) | 0, Math.max(1, w) | 0, 1);
    }
    ctx.globalAlpha = 1;
  }

  function enemyAnchor(kind) {
    if (kind === 'skiff') return 11;
    if (kind === 'frigate') return 25;
    if (kind === 'ghost') return 21;
    if (kind === 'siren') return 9;
    if (kind === 'elite') return 24;
    return 21;
  }
  function enemySprite(e) {
    if (e.kind === 'ghost') return SPR.ghost;
    if (e.kind === 'frigate' || e.kind === 'elite') return SPR.frigate;
    if (e.kind === 'skiff' || e.kind === 'bomb' || e.kind === 'fire') return SPR.skiff;
    if (e.kind === 'siren') return SPR.siren;
    return SPR.skiff;
  }

  function drawPlayer() {
    var spr = SPR.ships[W.shipCfg.id];
    var y = W.water - 21 + Math.sin(W.bob) * 1.2;
    var blinking = W.invuln > 0 && W.specialOn <= 0 && Math.floor(W.t * 16) % 2 === 0;
    if (!blinking) {
      drawWake(W.px - 3, W.water + 3, 26, 0.55);
      blit(spr, W.px, y, false, W.over ? 0.6 : 1);
    }
    if (W.shield > 0) {
      ctx.strokeStyle = 'rgba(127,227,200,' + (0.45 + 0.3 * Math.sin(W.t * 8)).toFixed(2) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(W.px + 19, W.water - 12, 27, 0, 6.283);
      ctx.stroke();
    }
    if (W.reversed > 0 && W.over === false) {
      ctx.fillStyle = 'rgba(240,100,92,' + (0.25 + 0.2 * Math.sin(W.t * 12)).toFixed(2) + ')';
      ctx.fillRect(W.px - 6, y - 4, 50, 32);
    }
  }

  function drawEnemy(e) {
    var spr = enemySprite(e);
    var ghostA = e.kind === 'ghost' ? clamp(e.fade, 0.18, 1) : 1;
    var a = ghostA * (e.hit > 0 ? 1 : 1);
    if (e.hit > 0) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      blit(spr, e.x, e.y - enemyAnchor(e.kind), true, a);
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#FFF3E4';
      ctx.fillRect((e.x - 20) | 0, (e.y - enemyAnchor(e.kind)) | 0, spr.width, spr.height);
      ctx.restore();
    } else {
      blit(spr, e.x, e.y - enemyAnchor(e.kind), true, a);
    }
    if (e.kind === 'bomb') {
      var pulse = 0.4 + 0.6 * Math.abs(Math.sin(e.t * 7));
      ctx.fillStyle = 'rgba(240,100,92,' + pulse.toFixed(2) + ')';
      ctx.fillRect((e.x + 2) | 0, (e.y - 13) | 0, 4, 4);
    }
    if (e.kind === 'fire') {
      for (var i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 ? '#F5A030' : '#F0645C';
        ctx.fillRect((e.x + 1 + i * 3) | 0, (e.y - 13 - ((W.t * 40 + i * 7) % 9)) | 0, 2, 4);
      }
    }
    if (e.kind === 'frigate' && e.telegraph > 0) {
      ctx.fillStyle = 'rgba(240,100,92,' + (0.25 + 0.45 * Math.abs(Math.sin(W.t * 22))).toFixed(2) + ')';
      ctx.fillRect(0, (e.y - 3) | 0, e.x | 0, 2);
    }
    if (e.kind === 'elite') {
      ctx.fillStyle = '#FFE08A';
      ctx.fillRect((e.x - 24) | 0, (e.y + 6) | 0, 3, 3);
      ctx.fillRect((e.x + 22) | 0, (e.y + 6) | 0, 3, 3);
    }
    if (e.kind === 'siren') {
      ctx.fillStyle = 'rgba(127,227,200,' + (0.2 + 0.2 * Math.sin(e.t * 6)).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(e.x + 6, e.y, 16, 0, 6.283);
      ctx.fill();
    }
    // small hp pips for tanky hulls
    if (e.maxHp > 4 && e.hp < e.maxHp) {
      var w = 22, f = e.hp / e.maxHp;
      ctx.fillStyle = '#090B12';
      ctx.fillRect((e.x - w / 2) | 0, (e.y - enemyAnchor(e.kind) - 6) | 0, w, 3);
      ctx.fillStyle = f > 0.4 ? '#6FE3A6' : '#F0645C';
      ctx.fillRect((e.x - w / 2) | 0, (e.y - enemyAnchor(e.kind) - 6) | 0, (w * f) | 0, 3);
    }
  }

  function drawBoss() {
    var b = W.boss; if (!b) return;
    for (var i = 0; i < b.tents.length; i++) {
      var tn = b.tents[i];
      if (tn.dead) continue;
      var tx = b.x + tn.off, ty = SEA + 26 + Math.sin(b.t * 1.6 + tn.ph) * 10;
      var sway = Math.sin(b.t * 1.1 + tn.ph) * 4;
      var img = SPR.tentacle;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.translate(Math.round(tx + sway + 8), Math.round(ty));
      ctx.rotate(Math.sin(b.t * 0.8 + tn.ph) * 0.12);
      ctx.drawImage(img, -8, 0);
      ctx.restore();
      ctx.fillStyle = '#BFE9F5';
      ctx.fillRect((tx + sway - 8) | 0, (ty + 40) | 0, 18, 2);
    }
    blit(SPR.kraken, b.x - 28, b.y - 15, true, b.dying > 0 ? clamp(b.dying / 2.4, 0.2, 1) : 1);
    if (b.hit > 0) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#FFF3E4';
      ctx.fillRect((b.x - 28) | 0, (b.y - 15) | 0, 56, 30);
      ctx.globalAlpha = 1;
    }
  }

  function drawShots() {
    for (var i = 0; i < W.shots.length; i++) {
      var s = W.shots[i], big = s.big;
      ctx.fillStyle = '#FFF3E4';
      ctx.fillRect((s.x) | 0, (s.y - (big ? 2 : 1)) | 0, big ? 5 : 3, big ? 4 : 2);
      ctx.fillStyle = '#F5A030';
      ctx.fillRect((s.x - 4) | 0, (s.y - (big ? 1 : 0)) | 0, 4, big ? 2 : 1);
    }
    for (var j = 0; j < W.foeShots.length; j++) {
      var f = W.foeShots[j];
      var col = f.kind === 'ghost' ? '#7FE3C8' : f.kind === 'ink' ? '#6A4A9E' : f.kind === 'elite' ? '#F0645C' : '#3A3E4A';
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,246,224,.5)';
      ctx.fillRect((f.x - f.r * 0.4) | 0, (f.y - f.r * 0.6) | 0, 2, 2);
    }
  }

  function drawPickups() {
    for (var i = 0; i < W.pickups.length; i++) {
      var p = W.pickups[i];
      var blink = p.life < 2 && Math.floor(p.life * 8) % 2 === 0;
      if (blink) continue;
      if (p.kind === 'gold') {
        blit(SPR.coin, p.x - 3, p.y - 3, false, 1);
      } else {
        var col = p.kind === 'heal' ? '#6FE3A6' : p.kind === 'shield' ? '#7FE3C8' : p.kind === 'rapid' ? '#F5B93C' : '#C79BF5';
        var gy = p.y - 5 + Math.sin(W.t * 3 + i) * 1.5;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(p.x + 5, gy);
        ctx.lineTo(p.x + 10, gy + 5);
        ctx.lineTo(p.x + 5, gy + 10);
        ctx.lineTo(p.x, gy + 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#07090E';
        ctx.fillRect((p.x + 4) | 0, (gy + 4) | 0, 2, 2);
      }
    }
  }

  function drawHazards() {
    for (var i = 0; i < W.hazards.length; i++) {
      var h = W.hazards[i];
      var a = clamp(h.life / 1.6, 0, 1);
      ctx.globalAlpha = 0.55 * a;
      ctx.fillStyle = '#F5A030';
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, 6.283);
      ctx.fill();
      ctx.globalAlpha = 0.8 * a;
      ctx.fillStyle = '#FFF3E4';
      for (var k = 0; k < 4; k++) {
        var fx = h.x + Math.sin(h.t * 6 + k * 2) * h.r * 0.5;
        var fy = h.y + Math.cos(h.t * 5 + k) * h.r * 0.5;
        ctx.fillRect(fx | 0, fy | 0, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawParts() {
    for (var i = 0; i < W.parts.length; i++) {
      var p = W.parts[i];
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x | 0, p.y | 0, p.sz, p.sz);
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    for (var i = 0; i < W.floaters.length; i++) {
      var f = W.floaters[i];
      ctx.globalAlpha = clamp(f.life / f.max, 0, 1);
      ctx.fillStyle = '#07090E';
      ctx.fillText(f.text, (f.x + 1) | 0, (f.y + 1) | 0);
      ctx.fillStyle = f.c;
      ctx.fillText(f.text, f.x | 0, f.y | 0);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function drawBossBar() {
    var b = W.boss; if (!b) return;
    var w = VW * 0.52, x = (VW - w) / 2, y = 34;
    ctx.fillStyle = 'rgba(7,9,14,.85)';
    ctx.fillRect(x - 2, y - 2, w + 4, 12);
    ctx.fillStyle = '#2B3046';
    ctx.fillRect(x, y, w, 8);
    var f = clamp(b.hp / b.maxHp, 0, 1);
    ctx.fillStyle = b.hp < b.maxHp * 0.35 ? '#F0645C' : '#C79BF5';
    ctx.fillRect(x, y, (w * f) | 0, 8);
    ctx.fillStyle = '#FFE08A';
    for (var i = 1; i < 4; i++) ctx.fillRect((x + (w / 4) * i) | 0, y - 2, 1, 12);
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = '#C79BF5';
    ctx.textAlign = 'center';
    ctx.fillText('LEVIATHAN', VW / 2, y - 6);
    ctx.textAlign = 'left';
  }

  function draw() {
    if (!W) return;
    var b = BIOMES[W.biome];
    var sx = 0, sy = 0;
    if (W.shake > 0) { sx = (Math.random() - 0.5) * W.shake * 2; sy = (Math.random() - 0.5) * W.shake * 2; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VW, VH);
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));

    drawSky(b);
    drawStars(b);
    drawRidge(b, 0.10, SEA + 3, 46, b.ridge2, 0.5, 'islands');
    drawRidge(b, 0.24, SEA + 5, 66, b.ridge, 0.44,
      b.id === 'abyss' ? 'spires' : b.id === 'pass' ? 'ruins' : 'islands');
    drawSea(b);

    drawHazards();
    drawPickups();
    for (var i = 0; i < W.ents.length; i++) if (!W.ents[i].dead) drawEnemy(W.ents[i]);
    drawBoss();
    if (!W.over && !W.attract) drawPlayer();
    drawShots();
    drawParts();
    drawFloaters();

    drawForeground(b);
    drawRain(b);
    ctx.restore();

    if (W.hitFlash > 0) {
      ctx.fillStyle = 'rgba(194,43,50,' + (W.hitFlash * 0.9).toFixed(2) + ')';
      ctx.fillRect(0, 0, VW, VH);
    }
    if (W.biomeFade > 0) {
      ctx.fillStyle = 'rgba(255,246,224,' + (W.biomeFade * 0.5).toFixed(2) + ')';
      ctx.fillRect(0, 0, VW, VH);
    }
    if (W.specialOn > 0) {
      ctx.fillStyle = 'rgba(255,224,138,' + (W.specialOn * 0.7).toFixed(2) + ')';
      ctx.fillRect(0, 0, VW, VH);
    }
    drawBossBar();
  }

  /* ---------------------------------------------------------------- runtime */
  var last = 0, acc = 0, raf = 0, appEl = null;

  function resize() {
    if (!cv || !appEl) return;
    var ar = appEl.getBoundingClientRect();
    var availW = Math.max(200, ar.width), availH = Math.max(120, ar.height);
    var scale = availH / VH;
    var worldW = availW / scale;
    if (worldW > 760) { worldW = 760; host.style.width = (760 * scale).toFixed(2) + 'px'; }
    else { host.style.width = ''; }
    VW = Math.max(300, Math.round(worldW));
    cv.width = VW;
    cv.height = VH;
    ctx.imageSmoothingEnabled = false;
    host.style.setProperty('--u', scale.toFixed(4) + 'px');
    STAR_FIELD = null;
    if (W) W.px = clamp(W.px, 20, VW * 0.72);
  }

  function attractUpdate(dt) {
    W.t += dt;
    W.scroll += 20 * PPM * dt;
    W.bob += dt * 2.4;
    W.spawnT -= dt;
    if (W.spawnT <= 0) {
      W.spawnT = rr(1.2, 2.6);
      W.ents.push(makeEnemy(rand() < 0.62 ? 'skiff' : 'frigate', rr(SEA + 28, VH - 26)));
    }
    var i;
    for (i = W.ents.length - 1; i >= 0; i--) {
      var e = W.ents[i];
      if (e.dead) { W.ents.splice(i, 1); continue; }
      updateEnemy(e, dt);
    }
    for (i = W.parts.length - 1; i >= 0; i--) {
      var p = W.parts[i];
      p.life -= dt; if (p.life <= 0) { W.parts.splice(i, 1); continue; }
      p.vy += p.grav * dt; p.x += (p.vx - 20 * PPM * 0.4) * dt; p.y += p.vy * dt;
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!last) last = ts;
    var dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.2) dt = 0.2;
    if (W && W.on && !W.paused) {
      if (W.attract) {
        attractUpdate(dt);
      } else {
        acc += dt;
        var step = 1 / 60, guard = 0;
        while (acc >= step && guard++ < 5) { update(step); acc -= step; }
        if (guard >= 5) acc = 0;
      }
    }
    draw();
  }

  function toWorld(ev) {
    var r = cv.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) / Math.max(1, r.width) * VW,
      y: (ev.clientY - r.top) / Math.max(1, r.height) * VH
    };
  }

  function bindInput() {
    window.addEventListener('keydown', function (ev) {
      var k = (ev.key || '').toLowerCase();
      if (!W) return;
      W.keys[k] = true;
      if (k === ' ' || k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright') {
        if (ev.preventDefault) ev.preventDefault();
      }
      if (k === 'e') fireSpecial();
      if (k === 'p' || k === 'escape') { if (hooks.pauseKey) hooks.pauseKey(); }
    }, { passive: false });
    window.addEventListener('keyup', function (ev) {
      if (W) W.keys[(ev.key || '').toLowerCase()] = false;
    });
    window.addEventListener('blur', function () { if (W) { W.keys = {}; W.down = false; W.pointerY = null; W.pointerX = null; } });

    var touchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    cv.addEventListener('pointerdown', function (ev) {
      if (!W || !W.on || W.paused) return;
      audio();
      W.down = true;
      var p = toWorld(ev);
      W.pointerY = p.y;
      W.pointerX = touchDevice ? null : null;
      W.touchX = p.x;
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { }
      if (ev.preventDefault) ev.preventDefault();
    }, { passive: false });

    cv.addEventListener('pointermove', function (ev) {
      if (!W || !W.down || W.paused) return;
      var p = toWorld(ev);
      W.pointerY = p.y;
      W.pointerX = p.x;
      if (ev.preventDefault) ev.preventDefault();
    }, { passive: false });

    function release() {
      if (!W) return;
      W.down = false;
      W.pointerY = null;
      W.pointerX = null;
    }
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', release);
    cv.addEventListener('pointerleave', release);
    window.addEventListener('contextmenu', function (e) { if (e.target === cv) e.preventDefault(); });
  }

  /* ------------------------------------------------------------------- api */
  window.SP = {
    init: function (stage, app) {
      host = stage;
      appEl = app;
      cv = stage.querySelector('#world');
      ctx = cv.getContext('2d', { alpha: false });
      if (ctx) ctx.imageSmoothingEnabled = false;
      buildAll();
      bindInput();
      resize();
      W = blankState();
      W.on = true;
      W.attract = true;
      W.spawnT = 0.4;
      draw();
      raf = requestAnimationFrame(loop);
      return true;
    },
    start: function (cfg) { acc = 0; last = 0; startRun(cfg); },
    attract: function () {
      W = blankState();
      W.on = true; W.attract = true; W.spawnT = 0.3;
      last = 0; acc = 0;
    },
    pause: function () { if (W) { W.paused = true; W.down = false; W.pointerY = null; W.pointerX = null; W.keys = {}; } },
    resume: function () { if (W) { W.paused = false; last = 0; acc = 0; } },
    isOn: function () { return !!(W && W.on && !W.attract); },
    fireSpecial: fireSpecial,
    resize: resize,
    state: function () { return W; },
    unlock: audio,
    setMuted: function (m) { muted = !!m; if (master) master.gain.value = m ? 0 : 0.35; },
    setAutoFire: function (v) { if (W) W.autoFire = !!v; },
    tapSpecial: function () { audio(); fireSpecial(); },
    hooks: hooks,
    SHIPS: SHIPS, CREW: CREW, CANNON_MAX: CANNON_MAX, PLATE_MAX: PLATE_MAX, KIND: KIND,
    sprite: function (n) { return SPR[n]; },
    shipSprite: function (id) { return SPR.ships[id] || SPR.ships.gull; },
    sfx: function (name) { if (SFX[name]) SFX[name](); }
  };

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 220); });
})();
