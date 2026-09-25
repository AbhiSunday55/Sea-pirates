/* ==========================================================================
   SEA-PIRATES — UI shell: screens, persistence, shop, i18n, HUD binding
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var stage, app;
  var cur = 'scr-title', backTo = 'scr-title', run = null, midRun = false;
  var mkTab = 'repair';

  function T(k, p) { return window.eazoI18n ? window.eazoI18n.t(k, p) : k; }
  function nf(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function mf(n) { return nf(n) + ' m'; }
  function num(n, i) { return { count: nf(n), n: n, i: i }; }

  /* ------------------------------------------------------------ persistence */
  var SAVE_KEY = 'seapirates.save.v1';
  var DEF = {
    gold: 0, ships: ['gull'], ship: 'gull', cannon: 1, plate: 0,
    crew: { cook: 0, navigator: 0, lookout: 0 },
    best: { dist: 0, bounty: 0, combo: 0 },
    runs: 0, kills: 0, bosses: 0, ghosts: 0, muted: false,
    ach: {}, daily: { date: '', prog: {}, claimed: {} }
  };
  var S = DEF;
  function load() {
    try {
      var raw = window.localStorage.getItem(SAVE_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        S = JSON.parse(JSON.stringify(DEF));
        for (var k in o) {
          if (k === 'crew' || k === 'best' || k === 'daily' || k === 'ach') continue;
          if (o[k] !== undefined) S[k] = o[k];
        }
        if (o.crew) for (var c in S.crew) if (o.crew[c]) S.crew[c] = o.crew[c];
        if (o.best) for (var b in S.best) if (o.best[b]) S.best[b] = o.best[b];
        if (o.ach) S.ach = o.ach;
        if (o.daily) {
          S.daily.date = o.daily.date || '';
          S.daily.prog = o.daily.prog || {};
          S.daily.claimed = o.daily.claimed || {};
        }
      }
    } catch (e) { S = JSON.parse(JSON.stringify(DEF)); }
    if (!S.ships || !S.ships.length) S.ships = ['gull'];
  }
  function save() {
    try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { }
  }

  /* ---------------------------------------------------------- achievements */
  var ACH = [
    { id: 'blood', of: 'kills', goal: 1 },
    { id: 'hundred', of: 'kills', goal: 100 },
    { id: 'rampage', of: 'combo', goal: 25 },
    { id: 'deep', of: 'dist', goal: 3000 },
    { id: 'leviathan', of: 'bosses', goal: 1 },
    { id: 'plunder', of: 'gold', goal: 10000 },
    { id: 'ghoul', of: 'ghosts', goal: 10 },
    { id: 'marked', of: 'wanted', goal: 5 }
  ];
  var DAILY_POOL = [
    { id: 'kills', of: 'kills', goal: 30, pay: 700 },
    { id: 'dist', of: 'dist', goal: 1200, pay: 800 },
    { id: 'gold', of: 'gold', goal: 900, pay: 900 },
    { id: 'combo', of: 'combo', goal: 15, pay: 650 },
    { id: 'runs', of: 'runs', goal: 3, pay: 600 }
  ];

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function dailySet() {
    var k = todayKey();
    if (S.daily.date !== k) {
      S.daily = { date: k, prog: {}, claimed: {} };
      save();
    }
    var seed = 0, i;
    for (i = 0; i < k.length; i++) seed = (seed * 31 + k.charCodeAt(i)) % 99991;
    var pool = DAILY_POOL.slice(), pick = [];
    for (i = 0; i < 3 && pool.length; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483647;
      pick.push(pool.splice(seed % pool.length, 1)[0]);
    }
    return pick;
  }

  function bumpDaily(of, value) {
    var set = dailySet();
    for (var i = 0; i < set.length; i++) {
      var d = set[i];
      if (d.of !== of) continue;
      var cur = S.daily.prog[d.id] || 0;
      if (of === 'kills' || of === 'gold' || of === 'runs') cur += value;
      else cur = Math.max(cur, value);
      S.daily.prog[d.id] = cur;
      if (cur >= d.goal && !S.daily.claimed[d.id]) {
        S.daily.claimed[d.id] = 1;
        S.gold += d.pay;
        toast(T('log.dailyDone', { n: d.pay }));
      }
    }
    save();
  }

  function grantAch(of, value) {
    var got = false;
    for (var i = 0; i < ACH.length; i++) {
      var a = ACH[i];
      if (a.of !== of || S.ach[a.id]) continue;
      if (value >= a.goal) {
        S.ach[a.id] = 1;
        S.gold += 500;
        got = true;
      }
    }
    if (got) save();
    return got;
  }

  /* -------------------------------------------------------------- screens */
  function show(name) {
    var scr = document.querySelectorAll('.screen');
    for (var i = 0; i < scr.length; i++) scr[i].classList.remove('on');
    var el = $(name);
    if (el) el.classList.add('on');
    if (name === 'scr-title') stage.classList.add('attract');
    else stage.classList.remove('attract');
    cur = name;
  }
  function goBack() { show(backTo); }

  var toastT = 0;
  function toast(msg) {
    var el = $('banner');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    toastT = 1.5;
  }

  /* ------------------------------------------------------------------ HUD */
  var lastHud = {};
  function hud(W) {
    if ($('hullFill').style.transform !== undefined) {
      var hp = Math.max(0, W.hp) / Math.max(1, W.maxHp);
      $('hullFill').style.transform = 'scaleX(' + hp.toFixed(3) + ')';
      $('hullFill').style.background = hp > 0.5 ? '#6FE3A6' : hp > 0.25 ? '#F5B93C' : '#F0645C';
    }
    var h = Math.ceil(Math.max(0, W.hp) / 2);
    if (lastHud.hearts !== h) {
      lastHud.hearts = h;
      var s = '';
      for (var i = 0; i < Math.ceil(W.maxHp / 2); i++) s += i < h ? '\u2665' : '\u2661';
      $('hearts').textContent = s;
    }
    var d = Math.round(W.dist);
    if (lastHud.dist !== d) { lastHud.dist = d; $('dist').textContent = mf(d); }
    var b = Math.round(W.bounty);
    if (lastHud.bounty !== b) { lastHud.bounty = b; $('bounty').textContent = nf(b); }
    if (lastHud.gold !== W.gold) { lastHud.gold = W.gold; $('gold').textContent = nf(W.gold); }

    var bm = ['biome.shallows', 'biome.pass', 'biome.abyss'][W.biome];
    if (lastHud.biome !== W.biome) { lastHud.biome = W.biome; $('biomeName').textContent = T(bm); }

    var wl = W.wind > 0.16 ? T('hud.tailwind') : W.wind < -0.16 ? T('hud.headwind') : T('hud.calm');
    if (lastHud.wl !== wl) { lastHud.wl = wl; $('windLabel').textContent = wl; }
    var lit = Math.round(Math.abs(W.wind) * 5);
    if (lastHud.lit !== lit + (W.wind < 0 ? 'b' : 'f')) {
      lastHud.lit = lit + (W.wind < 0 ? 'b' : 'f');
      var html = '';
      for (var a = 0; a < 5; a++) {
        var on = a < lit;
        html += '<i class="' + (on ? 'on' : '') + (W.wind < 0 ? ' back' : '') + '"></i>';
      }
      $('windArrows').innerHTML = html;
    }

    var sp = W.special / W.specialMax;
    if (lastHud.sp !== Math.round(sp * 40)) {
      lastHud.sp = Math.round(sp * 40);
      $('specialFill').style.transform = 'scaleX(' + sp.toFixed(3) + ')';
      $('specialBox').classList.toggle('ready', sp >= 1);
      $('specialBtn').classList.toggle('ready', sp >= 1);
    }
    if (lastHud.inf !== Math.round(W.infamy * 40)) {
      lastHud.inf = Math.round(W.infamy * 40);
      $('infamyFill').style.transform = 'scaleX(' + W.infamy.toFixed(3) + ')';
    }
    if (lastHud.wanted !== W.wanted) {
      lastHud.wanted = W.wanted;
      var st = '';
      for (var s2 = 0; s2 < 5; s2++) st += '<i class="' + (s2 < W.wanted ? ('on' + (W.wanted >= 5 ? ' max' : '')) : '') + '"></i>';
      $('wantedStars').innerHTML = st;
    }
    var mul = W.combo >= 50 ? 25 : W.combo >= 25 ? 10 : W.combo >= 10 ? 5 : W.combo >= 5 ? 2 : 1;
    var cEl = $('combo');
    if (W.combo >= 2) {
      cEl.classList.add('on');
      cEl.classList.toggle('hot', mul >= 5);
      var txt = 'x' + mul + '  ' + W.combo;
      if (cEl.textContent !== txt) cEl.textContent = txt;
    } else { cEl.classList.remove('on'); }
  }

  /* ------------------------------------------------------------ ship cards */
  function paintShip(cv2, id) {
    var spr = window.SP.shipSprite(id);
    if (!spr) return;
    cv2.width = spr.width; cv2.height = spr.height;
    var g = cv2.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, spr.width, spr.height);
    g.drawImage(spr, 0, 0);
  }

  function pips(n, max, cls) {
    var s = '';
    for (var i = 0; i < max; i++) s += '<i class="' + (i < n ? 'on ' + (cls || '') : '') + '"></i>';
    return s;
  }

  function renderShips() {
    var row = $('shipRow'), list = window.SP.SHIPS;
    row.innerHTML = '';
    list.forEach(function (sh) {
      var owned = S.ships.indexOf(sh.id) >= 0;
      var sel = S.ship === sh.id;
      var card = document.createElement('div');
      card.className = 'card' + (sel ? ' sel' : '') + (owned ? '' : ' lock');
      var cv2 = document.createElement('canvas');
      card.appendChild(cv2);
      paintShip(cv2, sh.id);
      var bars = '';
      bars += '<div class="statline"><span class="k">' + T('dock.hull') + '</span><div class="bar"><i style="transform:scaleX(' +
        Math.min(1, sh.hp / 8).toFixed(2) + ');background:#6FE3A6"></i></div></div>';
      bars += '<div class="statline"><span class="k">' + T('dock.speed') + '</span><div class="bar"><i style="transform:scaleX(' +
        Math.min(1, sh.speed / 1.6).toFixed(2) + ');background:#7FE3E8"></i></div></div>';
      bars += '<div class="statline"><span class="k">' + T('dock.fire') + '</span><div class="bar"><i style="transform:scaleX(' +
        Math.min(1, sh.dmg / 1.5).toFixed(2) + ');background:#F0645C"></i></div></div>';
      card.insertAdjacentHTML('beforeend',
        '<div class="cardName">' + sh.name + '</div>' +
        '<div class="cardBlurb">' + sh.blurb + '</div>' + bars +
        '<div class="cardFoot">' +
        (sel ? '<span class="tag gold">' + T('dock.selected') + '</span>' :
          owned ? '<button class="sbtn sm" data-pick="' + sh.id + '">' + T('dock.choose') + '</button>' :
            '<span class="tag gold">' + nf(sh.price) + '</span><button class="sbtn sm gold" data-buy="' + sh.id + '">' + T('market.buy') + '</button>') +
        '</div>');
      card.addEventListener('click', function (ev) {
        var b1 = ev.target.closest ? ev.target.closest('[data-pick]') : null;
        var b2 = ev.target.closest ? ev.target.closest('[data-buy]') : null;
        if (b1) { S.ship = b1.getAttribute('data-pick'); save(); window.SP.sfx('ui'); renderShips(); }
        else if (b2) { buyShip(b2.getAttribute('data-buy')); }
        else if (owned) { S.ship = sh.id; save(); window.SP.sfx('ui'); renderShips(); }
      });
      row.appendChild(card);
    });
    $('dockGold').textContent = nf(S.gold);
  }

  function buyShip(id) {
    var sh = null, i;
    for (i = 0; i < window.SP.SHIPS.length; i++) if (window.SP.SHIPS[i].id === id) sh = window.SP.SHIPS[i];
    if (!sh) return;
    if (S.gold < sh.price) { toast(T('market.poor')); window.SP.sfx('alarm'); return; }
    S.gold -= sh.price;
    S.ships.push(id);
    S.ship = id;
    save();
    window.SP.sfx('power');
    renderShips();
    toast(T('market.bought'));
  }

  /* --------------------------------------------------------------- market */
  function cannonCost(l) { return Math.round(900 * Math.pow(l, 1.55)); }
  function plateCost(l) { return Math.round(820 * Math.pow(l, 1.5)); }
  function crewCost(c, l) { return Math.round(c.price * (1 + l * 0.95)); }

  function liveState() { return window.SP.state(); }

  function spend(n) {
    if (S.gold < n) { toast(T('market.poor')); window.SP.sfx('alarm'); return false; }
    S.gold -= n; return true;
  }

  function renderMarket() {
    $('mkGold').textContent = nf(S.gold);
    var tabs = [
      ['repair', 'market.tab.repair'], ['arms', 'market.tab.arms'],
      ['crew', 'market.tab.crew'], ['ships', 'market.tab.ships']
    ];
    $('mkTabs').innerHTML = tabs.map(function (t) {
      return '<button class="tab' + (mkTab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + T(t[1]) + '</button>';
    }).join('');
    Array.prototype.forEach.call($('mkTabs').children, function (b) {
      b.addEventListener('click', function () { mkTab = b.getAttribute('data-tab'); window.SP.sfx('ui'); renderMarket(); });
    });

    var body = $('mkBody'), html = '';
    var W = liveState();
    var canRepair = !!(midRun && W && !W.attract);

    if (mkTab === 'repair') {
      var missing = canRepair ? Math.max(0, W.maxHp - W.hp) : 0;
      var patchCost = Math.max(60, Math.round(missing * 90));
      html += item('market.patch', 'market.patchDs' + '', canRepair && missing > 0 ? nf(patchCost) : T('market.noNeed'),
        canRepair && missing > 0 ? 'data-act="patch"' : '');
      html += item('market.fullRepair', 'market.fullRepairDs', nf(320), canRepair && missing > 0 ? 'data-act="full"' : T('market.noNeed'));
      html += item('market.plating', 'market.platingDs', S.plate < window.SP.PLATE_MAX ? nf(plateCost(S.plate + 1)) : T('market.maxed'),
        S.plate < window.SP.PLATE_MAX ? 'data-act="plate"' : '');
      html += '<div class="shopItem"><div class="info"><div class="nm">' + T('market.plating') +
        '</div><div class="pips">' + pips(S.plate, window.SP.PLATE_MAX, 'grn') + '</div></div></div>';
    } else if (mkTab === 'arms') {
      html += item('market.cannon', 'market.cannonDs', S.cannon < window.SP.CANNON_MAX ? nf(cannonCost(S.cannon)) : T('market.maxed'),
        S.cannon < window.SP.CANNON_MAX ? 'data-act="cannon"' : '');
      html += '<div class="shopItem"><div class="info"><div class="nm">' + T('market.cannonLv') +
        '</div><div class="pips">' + pips(S.cannon, window.SP.CANNON_MAX) + '</div></div></div>';
      html += item('market.crewBonus', 'market.crewBonusDs', T('market.crewHint'), '');
    } else if (mkTab === 'crew') {
      window.SP.CREW.forEach(function (c) {
        var lv = S.crew[c.id] || 0;
        var cost = lv < c.max ? crewCost(c, lv) : 0;
        html += '<div class="shopItem"><div class="info"><div class="nm">' + c.name + '</div>' +
          '<div class="ds">' + c.ds + '</div><div class="pips">' + pips(lv, c.max, 'grn') + '</div></div>' +
          (lv < c.max
            ? '<button class="sbtn sm gold" data-act="crew" data-id="' + c.id + '">' + nf(cost) + '</button>'
            : '<span class="tag gold">' + T('market.hired') + '</span>') + '</div>';
      });
    } else {
      window.SP.SHIPS.forEach(function (sh) {
        var owned = S.ships.indexOf(sh.id) >= 0;
        html += '<div class="shopItem"><div class="info"><div class="nm">' + sh.name + '</div>' +
          '<div class="ds">' + sh.blurb + '</div></div>' +
          (owned ? '<span class="tag gold">' + T('market.owned') + '</span>'
            : '<button class="sbtn sm gold" data-act="ship" data-id="' + sh.id + '">' + nf(sh.price) + '</button>') + '</div>';
      });
    }
    body.innerHTML = html;

    Array.prototype.forEach.call(body.querySelectorAll('[data-act]'), function (b) {
      if (!b.getAttribute('data-act')) return;
      b.addEventListener('click', function () { act(b.getAttribute('data-act'), b.getAttribute('data-id')); });
    });
  }

  function item(nameKey, dsKey, priceLabel, action) {
    var btn = action
      ? '<button class="sbtn sm gold" ' + action + '>' + priceLabel + '</button>'
      : '<span class="tag">' + priceLabel + '</span>';
    return '<div class="shopItem"><div class="info"><div class="nm">' + T(nameKey) + '</div>' +
      '<div class="ds">' + T(dsKey) + '</div></div>' + btn + '</div>';
  }

  function act(kind, id) {
    var W = liveState();
    if (kind === 'patch') {
      var missing = Math.max(0, W.maxHp - W.hp);
      var cost = Math.max(60, Math.round(missing * 90));
      if (!spend(cost)) return;
      W.hp = W.maxHp;
    } else if (kind === 'full') {
      if (!spend(320)) return;
      W.hp = W.maxHp;
    } else if (kind === 'plate') {
      var pc = plateCost(S.plate + 1);
      if (S.plate >= window.SP.PLATE_MAX ||
        (S.gold < pc && (toast(T('market.poor')), true))) return;
      if (!spend(pc)) return;
      S.plate++;
      if (W && !W.attract) { W.maxHp += 1; W.hp = Math.min(W.maxHp, W.hp + 1); }
    } else if (kind === 'cannon') {
      var cc = cannonCost(S.cannon);
      if (S.cannon >= window.SP.CANNON_MAX || !spend(cc)) return;
      S.cannon++;
      if (W && !W.attract) W.cannon = S.cannon;
    } else if (kind === 'crew') {
      var crew = null, i;
      for (i = 0; i < window.SP.CREW.length; i++) if (window.SP.CREW[i].id === id) crew = window.SP.CREW[i];
      if (!crew) return;
      var lv = S.crew[id] || 0;
      if (lv >= crew.max) return;
      var cost2 = crewCost(crew, lv);
      if (!spend(cost2)) return;
      S.crew[id] = lv + 1;
      if (W && !W.attract) W.cfg.crew = S.crew;
    } else if (kind === 'ship') {
      buyShip(id);
      renderMarket();
      return;
    }
    save();
    window.SP.sfx('power');
    renderMarket();
    updatePurse();
  }

  function updatePurse() {
    $('mkGold').textContent = nf(S.gold);
    $('dockGold').textContent = nf(S.gold);
    $('tGold').textContent = nf(S.gold);
  }

  /* ------------------------------------------------------- log / records */
  function recRow(labelKey, value) {
    return '<div class="rrow"><span class="k">' + T(labelKey) + '</span><span class="n cyn">' + value + '</span></div>';
  }

  function renderLog() {
    $('recList').innerHTML =
      recRow('log.bestDist', mf(S.best.dist)) +
      recRow('log.bestBounty', nf(S.best.bounty)) +
      recRow('log.bestCombo', 'x' + S.best.combo) +
      recRow('log.runs', nf(S.runs)) +
      recRow('log.sunk', nf(S.kills)) +
      recRow('log.leviathans', nf(S.bosses)) +
      recRow('log.bank', nf(S.gold) + ' g');

    var html = '';
    for (var i = 0; i < ACH.length; i++) {
      var a = ACH[i];
      var got = !!S.ach[a.id];
      var cur = 0;
      if (a.of === 'kills') cur = S.kills;
      if (a.of === 'ghosts') cur = S.ghosts;
      if (a.of === 'gold') cur = Math.max(S.gold, got ? a.goal : 0);
      if (a.of === 'bosses') cur = S.bosses;
      if (a.of === 'dist') cur = S.best.dist;
      if (a.of === 'combo') cur = S.best.combo;
      if (a.of === 'wanted') cur = got ? a.goal : 0;
      if (got) cur = Math.max(cur, a.goal);
      var pct = Math.min(100, Math.round(cur / a.goal * 100));
      html += '<div class="achItem' + (got ? ' got' : '') + '">' +
        '<span class="medal"></span><span class="t"><b>' + T('ach.' + a.id) + '</b>' +
        '<span>' + T('ach.' + a.id + 'Ds') + '</span></span>' +
        '<span class="pct">' + (got ? '100%' : pct + '%') + '</span></div>';
    }
    $('achList').innerHTML = html;

    var set = dailySet(), dh = '';
    for (var j = 0; j < set.length; j++) {
      var d = set[j];
      var p = S.daily.prog[d.id] || 0;
      var done = !!S.daily.claimed[d.id];
      var pc = Math.min(100, Math.round(p / d.goal * 100));
      dh += '<div class="achItem' + (done ? ' got' : '') + '">' +
        '<span class="medal"></span><span class="t"><b>' + T('daily.' + d.id, num(d.goal)) + '</b>' +
        '<span>' + nf(Math.min(p, d.goal)) + ' / ' + nf(d.goal) + ' \u00b7 +' + nf(d.pay) + ' g</span></span>' +
        '<span class="pct">' + (done ? '\u2713' : pc + '%') + '</span></div>';
    }
    $('dailyList').innerHTML = dh;
  }

  function renderHelp() {
    var keys = [
      ['W', 'help.up'], ['S', 'help.down'], ['A', 'help.left'], ['D', 'help.right'],
      ['SPACE', 'help.fire'], ['E', 'help.special'], ['ESC', 'help.pause']
    ];
    var touch = [
      ['\u25CF', 'help.drag'], ['\u25CF', 'help.hold'], ['E', 'help.tapSpecial']
    ];
    var h = '<div class="helpCol"><div class="k sec-k">' + T('help.keyboard') + '</div>';
    keys.forEach(function (k) {
      h += '<div class="hrow"><span class="key">' + k[0] + '</span><span class="txt">' + T(k[1]) + '</span></div>';
    });
    h += '</div><div class="helpCol"><div class="k sec-k">' + T('help.touch') + '</div>';
    touch.forEach(function (k) {
      h += '<div class="hrow"><span class="key">' + k[0] + '</span><span class="txt">' + T(k[1]) + '</span></div>';
    });
    h += '<div class="k sec-k">' + T('help.goal') + '</div><div class="hrow"><span class="txt">' +
      T('help.goalText') + '</span></div></div>';
    $('helpGrid').innerHTML = h;
  }

  /* ------------------------------------------------------------- report */
  function renderReport(res) {
    var best = res.dist > S.best.dist;
    $('reportGrid').innerHTML =
      '<div class="rcol">' +
      recRow('report.distance', mf(res.dist)) +
      recRow('report.bounty', nf(res.bounty)) +
      recRow('report.gold', nf(res.gold)) +
      recRow('report.kills', nf(res.kills)) +
      recRow('report.combo', 'x' + res.bestCombo) +
      recRow('report.bosses', nf(res.bosses)) +
      recRow('report.wanted', '\u2605'.repeat(res.wanted)) +
      '</div>' +
      '<div class="rcol">' +
      recRow('report.bestDist', mf(S.best.dist)) +
      recRow('report.bestBounty', nf(S.best.bounty)) +
      recRow('report.bestCombo', 'x' + S.best.combo) +
      recRow('report.totalRuns', nf(S.runs)) +
      recRow('report.totalKills', nf(S.kills)) +
      recRow('report.bank', nf(S.gold) + ' g') +
      '</div>';
    $('recordBanner').classList.toggle('on', best);
    updatePurse();
  }

  /* --------------------------------------------------------------- titles */
  function renderTitle() {
    $('tBestDist').textContent = mf(S.best.dist);
    $('tBestBounty').textContent = nf(S.best.bounty);
    $('tRuns').textContent = nf(S.runs);
    $('tGold').textContent = nf(S.gold);
    $('btnMute').textContent = T(S.muted ? 'title.soundOff' : 'title.soundOn');
  }

  function runConfig() {
    return {
      ship: S.ship, cannon: S.cannon, plate: S.plate,
      crew: { cook: S.crew.cook, navigator: S.crew.navigator, lookout: S.crew.lookout },
      bosses: 0
    };
  }

  /* ------------------------------------------------------------- lifecycle */
  function startRun() {
    midRun = true;
    hideAll();
    window.SP.sfx('ui');
    window.SP.start(runConfig());
  }

  function hideAll() {
    var scr = document.querySelectorAll('.screen');
    for (var i = 0; i < scr.length; i++) scr[i].classList.remove('on');
    cur = null;
  }

  function onDeath(res) {
    settle(res, false);
    show('scr-lost');
    window.SP.sfx('roar');
    setTimeout(function () {
      renderReport(res);
      renderTitle();
      show('scr-report');
    }, 1800);
  }

  /* ------------------------------------------------------------ market nav */
  var mkFrom = null, mkCat = 'scr-title';
  function openMarket(fromRun) {
    mkFrom = fromRun ? { run: true } : { screen: cur || 'scr-title' };
    midRun = fromRun;
    if (fromRun) window.SP.pause();
    renderMarket();
    show('scr-market');
  }
  function closeMarket() {
    if (mkFrom && mkFrom.run && midRun) { window.SP.resume(); hideAll(); return; }
    show(mkFrom && mkFrom.screen ? mkFrom.screen : 'scr-title');
    renderTitle();
  }

  function resumeRun() { window.SP.resume(); hideAll(); }

  function togglePause() {
    if (!midRun || !window.SP.isOn()) return;
    var W = window.SP.state();
    if (W.paused) { window.SP.resume(); hideAll(); window.SP.sfx('ui'); }
    else { window.SP.pause(); show('scr-pause'); window.SP.sfx('ui'); }
  }

  function settle(res, silent) {
    S.runs++;
    S.kills += res.kills;
    S.bosses += res.bosses;
    S.ghosts += (res.killsBy && res.killsBy.ghost) || 0;
    S.gold += res.gold;
    S.best.dist = Math.max(S.best.dist, res.dist);
    S.best.bounty = Math.max(S.best.bounty, res.bounty);
    S.best.combo = Math.max(S.best.combo, res.bestCombo);
    bumpDaily('kills', res.kills);
    bumpDaily('dist', res.dist);
    bumpDaily('gold', res.gold);
    bumpDaily('combo', res.bestCombo);
    bumpDaily('runs', 1);
    grantAch('kills', S.kills);
    grantAch('ghosts', S.ghosts);
    grantAch('bosses', S.bosses);
    grantAch('gold', S.gold);
    grantAch('dist', S.best.dist);
    grantAch('combo', S.best.combo);
    grantAch('wanted', res.wanted);
    save();
    if (!silent) midRun = false;
  }

  /* ---------------------------------------------------------------- titles */
  var BNR = {
    'SUNRISE SHALLOWS': 'banner.shallows', "SERPENT'S PASS": 'banner.pass', 'THE ABYSS': 'banner.abyss',
    'LEVIATHAN': 'banner.leviathan', 'BROADSIDE!': 'banner.broadside', 'SIREN SONG': 'banner.siren',
    'TENTACLE SEVERED': 'banner.tentacle', 'LEVIATHAN SLAIN': 'banner.slain', 'ELITE HUNTER': 'banner.elite',
    'HOBBY GAWKS': 'banner.w1', 'ROPE PIRATES': 'banner.w2', 'NAVY ARRIVES': 'banner.w3',
    'ELITE HUNTERS': 'banner.w4', 'THE ENTIRE SEA HUNTS YOU': 'banner.w5'
  };

  function showBanner(text, cls) {
    var el = $('banner');
    var key = BNR[text];
    var v = key ? T(key) : text;
    if (v === key) v = text;
    el.textContent = v;
    el.style.color = cls === 'red' ? '#F0645C' : '#F5B93C';
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  /* ------------------------------------------------------------------ boot */
  function orient() {
    var portrait = window.innerHeight > window.innerWidth * 1.05;
    var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    document.body.classList.toggle('portrait', portrait && touch);
    document.body.classList.toggle('touch', touch);
    if (window.SP) window.SP.resize();
  }

  function afterI18n() {
    if (window.eazoI18n) {
      var sel = document.querySelector('[data-i18n-locale-select]');
      if (sel) sel.value = window.eazoI18n.getPreference();
    }
    renderTitle();
    if ($('shipRow').children.length === 0 || cur === 'scr-dock') renderShips();
    if (cur === 'scr-market') renderMarket();
    if (cur === 'scr-log') renderLog();
    if (cur === 'scr-help') renderHelp();
  }

  function wire() {
    $('btnPlay').addEventListener('click', function () { window.SP.sfx('ui'); renderShips(); show('scr-dock'); });
    $('btnHelp').addEventListener('click', function () { window.SP.sfx('ui'); renderHelp(); show('scr-help'); });
    $('btnLog').addEventListener('click', function () { window.SP.sfx('ui'); renderLog(); show('scr-log'); });
    $('btnMarketTop').addEventListener('click', function () { window.SP.sfx('ui'); openMarket(false); });
    $('btnCastOff').addEventListener('click', startRun);
    $('btnResume').addEventListener('click', resumeRun);
    $('btnRestart').addEventListener('click', startRun);
    $('btnAgain').addEventListener('click', startRun);
    $('btnPortMid').addEventListener('click', function () { window.SP.sfx('ui'); openMarket(true); });
    $('btnPortEnd').addEventListener('click', function () { window.SP.sfx('ui'); openMarket(false); });
    $('btnMkBack').addEventListener('click', function () { window.SP.sfx('ui'); closeMarket(); });
    $('btnDockNow').addEventListener('click', function () { window.SP.sfx('ui'); midRun = true; renderMarket(); show('scr-market'); mkFrom = { run: true }; });
    $('btnSailOn').addEventListener('click', resumeRun);
    $('pauseBtn').addEventListener('click', function (ev) { ev.stopPropagation(); togglePause(); });
    $('specialBtn').addEventListener('pointerdown', function (ev) {
      ev.preventDefault(); ev.stopPropagation(); window.SP.tapSpecial();
    });
    $('btnMute').addEventListener('click', function () {
      S.muted = !S.muted; save();
      window.SP.setMuted(S.muted);
      renderTitle();
      if (!S.muted) window.SP.sfx('ui');
    });
    $('btnAbandon').addEventListener('click', function () {
      var W = window.SP.state();
      if (W && !W.attract) {
        settle({
          dist: Math.round(W.dist), bounty: W.bounty, gold: W.gold, kills: W.kills,
          bestCombo: W.bestCombo, bosses: W.cfg.bosses || 0, wanted: W.wanted, killsBy: W.killsBy
        }, true);
      }
      midRun = false;
      window.SP.attract();
      renderTitle();
      show('scr-title');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-back]'), function (b) {
      b.addEventListener('click', function () { window.SP.sfx('ui'); show(b.getAttribute('data-back')); });
    });
  }

  function boot() {
    load();
    stage = $('stage');
    app = document.querySelector('.app');
    if (!window.SP || !window.SP.init(stage, app)) return;
    window.SP.setMuted(S.muted);
    window.SP.hooks.hud = hud;
    window.SP.hooks.banner = showBanner;
    window.SP.hooks.death = onDeath;
    window.SP.hooks.pauseKey = togglePause;
    window.SP.hooks.port = function () {
      if (!midRun) return;
      window.SP.pause();
      window.SP.sfx('alarm');
      show('scr-dockprompt');
      mkFrom = { run: true };
    };
    wire();
    orient();
    renderTitle();
    renderShips();
    renderHelp();
    renderLog();
    show('scr-title');
    $('boot').classList.add('off');
    if (window.eazoI18n && window.eazoI18n.ready) {
      window.eazoI18n.ready.then(afterI18n, afterI18n);
    } else {
      setTimeout(afterI18n, 60);
    }
    window.addEventListener('eazo:localechange', afterI18n);
    window.addEventListener('resize', orient);
    window.addEventListener('orientationchange', function () { setTimeout(orient, 240); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && midRun) { window.SP.pause(); show('scr-pause'); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
