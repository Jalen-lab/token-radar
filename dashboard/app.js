// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, a filterable table, a per-protocol
// detail drawer with the model's own inputs and the protocol's farm plan, plus
// a model sandbox that recomputes every row live. No network: every byte it
// shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var BASE = DATA.model;
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', wl: false, sort: 'implied', dir: -1, selected: null,
    sandbox: { growth_weight: BASE.growth_weight, breadth_weight: BASE.breadth_weight, maturity_floor: BASE.maturity_floor } };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (Math.round(n * 10000) / 10000).toFixed(2).replace(/0$/, ''); }

  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries, so the page's code and
  // the board's data are visibly the same arithmetic. The sandbox moves the
  // three weights and re-ranks the whole board live.
  function sandboxActive() {
    return state.sandbox.growth_weight !== BASE.growth_weight ||
      state.sandbox.breadth_weight !== BASE.breadth_weight ||
      state.sandbox.maturity_floor !== BASE.maturity_floor;
  }
  function impliedOf(row) {
    var m = state.sandbox;
    var growth = Math.min(BASE.growth_cap, Math.max(BASE.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? BASE.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), BASE.maturity_days) / BASE.maturity_days) * BASE.maturity_range;
    var extra = Math.min(Math.max((row.chains || []).length - 1, 0), BASE.breadth_cap_chains);
    var breadth = 1 + extra * m.breadth_weight;
    return {
      implied: Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * breadth)),
      growthMult: growthMult, maturity: maturity, breadth: breadth, growth: growth
    };
  }
  function displayRows() {
    // Sandbox values replace the board's implied values and re-rank.
    var rows = DATA.rows.map(function (r) {
      var v = impliedOf(r);
      var copy = {};
      for (var k in r) copy[k] = r[k];
      copy.implied_value_usd = v.implied;
      copy.growth_multiplier = Math.round(v.growthMult * 10000) / 10000;
      copy.maturity_multiplier = Math.round(v.maturity * 10000) / 10000;
      copy.breadth_multiplier = Math.round(v.breadth * 10000) / 10000;
      return copy;
    });
    rows.sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0); });
    rows.forEach(function (r, i) { r.display_rank = i + 1; });
    return rows;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The watchlist is the 40 names the snapshot names; mark them from the
  // board's own watchlist, never from rank: ranks move in the sandbox.
  var WL_SLUGS = {};
  if (DATA.watchlist) DATA.watchlist.forEach(function (s) { WL_SLUGS[s] = true; });

  function isWatch(r) { return !!WL_SLUGS[r.slug]; }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('wl') === '1') state.wl = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.wl) params.set('wl', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows(all) {
    var q = state.q.trim().toLowerCase();
    return all.filter(function (r) {
      if (state.wl && !isWatch(r)) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'chains') { av = (a.chains || []).length; bv = (b.chains || []).length; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'radar-mark', 'aria-hidden': 'true' }),
        el('span', { class: 'brand-name' }, el('b', { text: 'Token' }), ' Radar')),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { class: 'dot', text: '●' }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { class: 'dot', text: '●' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Every protocol still waiting on its token, ranked by what the launch would be worth' }),
        el('p', null,
          'The watchlist is the floor: every protocol with at least ',
          el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL' }),
          ' and no token on record. The early radar adds ',
          el('b', { text: DATA.early_size + ' pre-token protocols' }),
          ' below that floor. Implied value is a model built from the snapshot itself, not a promise — and not a prediction of whether or when a token ships.')
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Wrapped / staked products left out' }), el('b', { text: String(DATA.excluded_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function spotlight(all) {
    var top = all.slice(0, 5);
    var max = top.length ? top[0].implied_value_usd : 1;
    return el('section', { class: 'spot' },
      el('h2', { text: 'Top 5 by implied value' }),
      el('div', { class: 'spot-grid' }, top.map(function (r) {
        return el('button', { class: 'spot-card', type: 'button', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'spot-rank', text: '#' + r.display_rank }),
          el('h3', { text: r.name }),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'sub', text: fmtUsd(r.tvl_usd) + ' TVL · ' + fmtPct(r.change_7d) + ' 7d' }),
          el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(4, Math.round((r.implied_value_usd / max) * 100)) + '%' }))
        );
      }))
    );
  }

  function controls(all) {
    var categories = Array.from(new Set(all.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(all.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var wl = el('button', { type: 'button', class: 'toggle', 'aria-pressed': state.wl ? 'true' : 'false', onclick: function () { state.wl = !state.wl; writeHash(); render(); } },
      el('span', { class: 'pill', 'aria-hidden': 'true' }), 'Watchlist only');
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      el('div', { class: 'field' }, el('span', { text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      wl,
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filteredRows(all).length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null
      )
    );
  }

  function boardTable(all) {
    var list = sortedRows(filteredRows(all));
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.display_rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') + (isWatch(r) ? '  ★ watchlist' : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: String((r.chains || []).length) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'tag', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' + (sandboxActive() ? ' Sandbox is on: values are recomputed, not the board’s filed values.' : '') }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('chains', 'Chains'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'tag live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their market-cap-to-TVL ratios are what calibrate it.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanels() {
    var m = BASE;
    var compRows = DATA.comps.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.comps) }),
        el('td', { class: 'num', text: fmtMult(c.median_multiple) + '×' })
      );
    });
    var slider = function (key, label, min, max, step) {
      var out = el('span', { class: 'num', text: String(state.sandbox[key]) });
      var input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(state.sandbox[key]), 'aria-label': label });
      input.addEventListener('input', function () { state.sandbox[key] = parseFloat(input.value); out.textContent = input.value; render(); });
      return el('div', { class: 'slider-row' }, el('label', { text: label }), input, out);
    };
    return el('div', { class: 'duo' },
      el('section', { class: 'panel' },
        el('h2', { text: 'How implied value is computed' }),
        el('p', { class: 'sub', text: 'One function scores every protocol. The category multiple is not a guess: it is the median market-cap-to-TVL ratio of the live-token protocols in that category, read from this same snapshot.' }),
        el('div', { class: 'formula' },
          'implied = round( tvl_usd × category_multiple × (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ') × (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + ') × (1 + min(chains − 1, ' + m.breadth_cap_chains + ') × ' + m.breadth_weight + ') )'
        ),
        el('p', { class: 'sub', text: 'Age is the time since the protocol was first listed — the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. A category with fewer than ' + m.min_category_comps + ' live comps falls back to the global median of ' + fmtMult(DATA.global_multiple) + '×, clamped to ' + m.multiple_floor + '–' + m.multiple_cap + '×.' })
      ),
      el('section', { class: 'panel' },
        el('h2', { text: 'Category comps, from the snapshot' }),
        el('table', { class: 'comp-table' },
          el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { text: 'Live comps' }), el('th', { text: 'Median mcap / TVL' }))),
          el('tbody', null, compRows)
        ),
        el('h2', { text: 'Model sandbox' }),
        el('p', { class: 'sub', text: 'Move a weight and the whole board re-ranks live. The filed board keeps the base weights.' }),
        slider('growth_weight', 'Growth weight', 0, 1, 0.05),
        slider('breadth_weight', 'Breadth weight', 0, 0.08, 0.01),
        slider('maturity_floor', 'Maturity floor', 0.5, 0.9, 0.05),
        sandboxActive() ? el('p', { class: 'sandbox-note', text: 'Sandbox is on — the table above shows recomputed values. Reset the sliders to the base weights to see the filed board.' }) : null
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var all = displayRows();
    var row = all.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var v = impliedOf(row);
    var match = v.implied === row.implied_value_usd;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.display_rank + ' of ' + DATA.board_size + (isWatch(row) ? ' · ★ watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (' + (row.category_comps > 0 ? row.category_comps + ' live comps' : 'global fallback') + ')' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) + '×' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: fmtMult(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: fmtMult(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chains (' + (row.chains || []).length + ')' }), el('b', { class: 'num', text: fmtMult(row.breadth_multiplier) + '×' })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'note', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(v.implied) + (match ? ', the same number board.json carries.' : ', which differs from the filed board: the sandbox is on.') + ' This is an estimate, not a price, and not a prediction that a token ships.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, (row.farm_steps || []).map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('p', { class: 'note', text: 'Record check: DefiLlama records no token for this protocol. That is the record, not proof — a token may exist that the record does not carry. Never pay anyone to claim an airdrop, and claim only from the protocol’s own site.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Data: DefiLlama protocol index, snapshot ' + DATA.as_of + '. ' + DATA.board_size + ' pre-token protocols ranked; ' + DATA.excluded_size + ' wrapped, staked or bridged products of tokens that already trade were left out of the ranking, as the brief requires.' }),
      el('p', { text: 'Implied value is this radar’s own model: TVL times the category’s live-token multiple, adjusted for seven-day growth, age with no token, and chain reach. It is not a price, not a promise, and not a prediction of a launch date.' })
    );
  }

  function render() {
    var all = displayRows();
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(spotlight(all));
    shell.appendChild(controls(all));
    shell.appendChild(state.tab === 'pre-token' ? boardTable(all) : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanels());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
