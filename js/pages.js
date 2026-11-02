/*
 * Tempo, plain JS. Pages: sign in, products, the generate desk, report and templates.
 * Each page is mount(root, ctx) and returns a function that tears it down.
 * The desk has two audiences: users see outcomes only, developers also see stages, timings and the event log.
 */
(function (global) {
  'use strict';
  var T = global.Tempo = global.Tempo || {};
  var h = T.h, icon = T.icon, fmt = T.fmt;
  T.pages = {};

  function head(eyebrow, title, blurb, right) {
    return h('div', { class: 'page-head' },
      h('div', null, h('div', { class: 'eyebrow' }, eyebrow), title, blurb ? h('p', null, blurb) : null),
      right || null);
  }
  function stat(label) {
    var num = h('span', { class: 'stat-num' }, '0');
    var el = h('div', { class: 'stat glass' }, num, h('span', { class: 'stat-label' }, label));
    return { el: el, set: function (v, warn) { el.classList.toggle('warn', !!warn); T.motion.countUp(num, v); } };
  }
  function pill(state, text) { return h('span', { class: 'pill ' + state }, text || T.pillText[state]); }
  function who(name, session) { return name === session.name ? 'You' : name; }

  /* ---------- sign in ---------- */

  T.pages.signin = function (root, onSignedIn) {
    var flash = T.store.get('flash', null);
    T.store.remove('flash');
    var error = h('div', { class: 'form-error', role: 'alert', hidden: !flash }, icon('alert', 16), h('span', null, flash || ''));
    var id = h('input', { autocomplete: 'username', id: 'login-id' });
    var pw = h('input', { type: 'password', autocomplete: 'current-password', id: 'login-pw' });
    var btn = h('button', { class: 'btn btn-primary btn-lg' }, 'Continue', icon('right', 17));
    var title = h('h1', null, 'Term sheets and trade files, generated while you watch.');
    var card = h('form', { class: 'signin-card glass', novalidate: true },
      h('h2', null, 'Sign in'),
      h('p', null, 'Use your OCBC network login.'),
      error,
      h('label', { class: 'field' }, h('span', null, 'Login ID'), id),
      h('label', { class: 'field' }, h('span', null, 'Password'), pw),
      btn,
      h('p', { class: 'form-note' }, 'Demo: any ID and password works. Use the ID dev to see the developer view, or the password wrong to see a failed sign-in.'));

    function fail(msg) {
      error.hidden = false;
      error.lastChild.textContent = msg;
      if (!T.motion.reduced()) card.animate([{ transform: 'translateX(-8px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 380, easing: 'ease-out' });
    }
    card.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!id.value.trim() || !pw.value) { fail('Enter your login ID and password.'); return; }
      btn.disabled = true;
      btn.textContent = 'Signing in';
      global.setTimeout(function () {
        if (pw.value === 'wrong') {
          btn.disabled = false;
          T.clear(btn).append('Continue', icon('right', 17));
          fail('That login ID and password did not match. Check them and try again.');
          return;
        }
        onSignedIn(T.session.start(id.value.trim()));
      }, 600);
    });

    root.appendChild(h('div', { class: 'signin' },
      h('div', { class: 'signin-copy' },
        h('div', { class: 'brand rise', style: { '--d': '0ms' } }, h('img', { src: 'ocbc-logo.png', alt: '' }), 'Tempo'),
        title,
        h('p', { class: 'rise', style: { '--d': '420ms' } }, 'Upload the counterparty documents, follow each batch, and download the OCBC files when they are ready.'),
        h('div', { class: 'signin-points' },
          h('span', { class: 'glass rise', style: { '--d': '500ms' } }, icon('check', 15), 'Every product on one desk'),
          h('span', { class: 'glass rise', style: { '--d': '560ms' } }, icon('clock', 15), 'Records clear at 21:00'))),
      card));
    card.classList.add('rise');
    card.style.setProperty('--d', '260ms');
    T.motion.splitLines(title);
    id.focus();
    return function () {};
  };

  /* ---------- products ---------- */

  T.pages.products = function (root, ctx) {
    var s = ctx.session, dev = T.isDev(s);
    var last = T.store.get('lastProduct', null);
    var query = '';
    var hour = new Date().getHours();
    var greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    var grid = h('div', { class: 'products' });
    var empty = h('div', { class: 'empty glass', hidden: true }, h('strong', null, 'No products match'), 'Try a different name or code.');
    var search = h('label', { class: 'search big' }, icon('search', 16), h('span', { class: 'sr-only' }, 'Find a product'),
      h('input', { placeholder: 'Find a product', oninput: function (e) { query = e.target.value.trim().toLowerCase(); render(); } }));

    var cards = {};
    T.productIds().forEach(function (pid) {
      var cfg = T.config.products[pid];
      var locked = !T.can(s, 'view', pid);
      var stats = { batches: h('strong', null, '0'), running: h('strong', null, '0'), ready: h('strong', null, '0') };
      var foot = h('span', { class: 'tag' });
      var card = h(locked ? 'div' : 'a', {
        class: 'product glass' + (locked ? ' locked' : ''), href: locked ? null : '#/p/' + pid, 'aria-disabled': locked ? 'true' : null,
        onclick: function () { if (!locked) T.store.set('lastProduct', pid); }
      },
        h('div', { class: 'product-top' },
          h('span', { class: 'mark' }, cfg.short),
          h('div', null, h('div', { class: 'tag' }, cfg.name), h('h2', null, cfg.title))),
        h('p', null, cfg.blurb),
        dev ? h('div', { class: 'stage-chips', 'aria-label': 'Stages' }, cfg.stages.map(function (st) { return h('span', null, st.short); })) : null,
        h('div', { class: 'product-stats' },
          h('div', null, stats.batches, h('span', null, 'Batches today')),
          h('div', null, stats.running, h('span', null, 'Processing')),
          h('div', null, stats.ready, h('span', null, 'Ready'))),
        h('div', { class: 'product-foot' }, foot,
          locked ? h('span', { class: 'tag' }, icon('lock', 15), ' No access') : h('span', { class: 'product-go' }, 'Open', icon('right', 16))));
      card.dataset.key = pid;
      foot.textContent = pid === last && !locked ? 'Last opened' : cfg.placeholder && dev ? 'Stage names are placeholders' : 'Accepts ' + cfg.acceptHint;
      cards[pid] = { el: card, stats: stats, cfg: cfg };
    });

    function render() {
      var ids = T.productIds().slice().sort(function (a, b) { return (b === last) - (a === last); });
      var shown = ids.filter(function (id) {
        var c = T.config.products[id];
        return !query || (c.name + ' ' + c.title + ' ' + c.short).toLowerCase().indexOf(query) !== -1;
      });
      T.motion.flip(grid, function () {
        T.clear(grid);
        shown.forEach(function (id) { grid.appendChild(cards[id].el); });
      });
      empty.hidden = shown.length > 0;
    }

    root.appendChild(head(greet + ', ' + s.name.split(' ')[0], h('h1', null, 'Products'),
      'Pick a product to upload files or follow today\'s batches. New products appear here as they are added to the platform.', search));
    root.appendChild(grid);
    root.appendChild(empty);
    render();

    return T.watchBatches(null, function (list) {
      Object.keys(cards).forEach(function (pid) {
        var mine = list.filter(function (b) { return b.product === pid; });
        var st = mine.map(function (b) { return T.status(b).state; });
        T.motion.countUp(cards[pid].stats.batches, mine.length);
        T.motion.countUp(cards[pid].stats.running, st.filter(function (x) { return x === 'running' || x === 'queued'; }).length);
        T.motion.countUp(cards[pid].stats.ready, st.filter(function (x) { return x === 'done'; }).length);
      });
    });
  };

  /* ---------- desk ---------- */

  T.pages.desk = function (root, ctx, pid) {
    var s = ctx.session, dev = T.isDev(s);
    var cfg = T.config.products[pid];
    var list = null, error = null, checkedAt = null;
    var filter = 'all', query = '', openId = null, shownKey = '';
    var rows = {};
    var stops = [];
    T.store.set('lastProduct', pid);

    /* header: the title is the product switcher, so the nav never has to list products */
    var picker = T.productPicker({ session: s, value: pid, big: true, label: 'Switch product', onChange: function (id) { ctx.go('p/' + id); } });
    var right = dev ? h('span', { class: 'dev-note glass' }, icon('code', 16), 'Developer view: stages, timings and logs are shown') : null;
    root.appendChild(head(h('span', null, h('a', { href: '#/products' }, 'Products'), ' / ', cfg.name), h('h1', { class: 'title-picker' }, picker), cfg.blurb, right));

    var banner = h('div', { class: 'banner glass bad', role: 'alert', hidden: true });
    root.appendChild(banner);

    var st = { all: stat('Batches today'), run: stat('Processing'), att: stat('Need a look'), ready: stat('Files ready') };
    root.appendChild(h('div', { class: 'stats' }, st.all.el, st.run.el, st.att.el, st.ready.el));

    /* list panel */
    var rowsEl = h('ul', { class: 'rows' });
    var placeholder = h('div', { class: 'rows' }, [0, 1, 2, 3].map(function () { return h('div', { class: 'skeleton' }); }));
    var empty = h('div', { class: 'empty', hidden: true });
    var seg = T.segmented({ label: 'Filter batches', value: 'all', onChange: function (v) { filter = v; renderList(); }, options: [
      { value: 'all', label: 'All' }, { value: 'mine', label: 'Mine' }, { value: 'attention', label: 'Need a look' }] });
    var listPanel = h('section', { class: 'panel glass', 'aria-label': 'Today\'s batches' },
      h('div', { class: 'list-head' }, seg,
        h('label', { class: 'search' }, icon('search', 16), h('span', { class: 'sr-only' }, 'Search by file or person'),
          h('input', { placeholder: 'File or person', oninput: function (e) { query = e.target.value.trim().toLowerCase(); renderList(); } }))),
      placeholder, rowsEl, empty);

    var left = T.can(s, 'upload', pid) ? uploader() : h('section', { class: 'panel glass uploader' },
      h('div', { class: 'readonly-note' }, icon('lock', 18), h('span', null, 'Your role can view batches but cannot upload. Ask the desk lead if you need upload access.')));
    root.appendChild(h('div', { class: 'desk' }, left, listPanel));

    /* ----- rows ----- */

    function buildRow(b) {
      var r = {};
      r.dot = h('span', { class: 'dot' });
      r.label = h('span', null);
      var first = b.results[0] ? b.results[0].file : b.files[0].name;
      var more = b.results.length - 1;
      if (dev) {
        r.ticks = h('span', { class: 'ticks' }, cfg.stages.map(function () { return h('i'); }));
        r.bar = r.ticks;
      } else {
        r.fill = h('span');
        r.bar = h('span', { class: 'prog-bar' }, r.fill);
      }
      r.btn = h('button', { type: 'button', class: 'row', onclick: function () { openSheet(b.id); } },
        r.dot,
        h('span', { class: 'row-main' },
          h('span', { class: 'title' }, h('span', { class: 'file' }, first), more > 0 ? h('span', { class: 'more' }, '+' + more + ' more') : null),
          h('span', { class: 'sub' }, fmt.clock(b.createdAt) + (dev ? ', batch ' + b.id : ', ' + fmt.plural(b.results.length, cfg.sourceNoun)))),
        h('span', { class: 'who col-who' }, who(b.user, s)),
        h('span', { class: 'prog' }, r.bar, h('span', { class: 'prog-label' }, r.label)),
        icon('right', 16));
      var li = h('li', null, r.btn);
      li.dataset.key = b.id;
      li._r = r;
      li._key = '';
      return li;
    }

    function updateRow(li, b, now) {
      var r = li._r, s2 = T.status(b, now);
      var key = s2.state + s2.stage;
      if (li._key === key) return;
      li._key = key;
      r.dot.className = 'dot ' + s2.state;
      r.dot.setAttribute('aria-label', T.pillText[s2.state]);
      r.label.textContent = T.stateText(b, s2, dev);
      if (dev) {
        Array.prototype.forEach.call(r.ticks.children, function (t, i) {
          t.className = s2.state === 'failed' && i === s2.stage ? 'failed' : i < s2.stage || T.finished(s2) ? 'done' : i === s2.stage ? 'now' : '';
        });
      } else {
        /* users get a calm moving bar while processing, never the stage */
        var busy = s2.state === 'running' || s2.state === 'queued';
        r.bar.className = 'prog-bar ' + (busy ? 'indeterminate' : s2.state);
      }
    }

    function visible(now) {
      return (list || []).filter(function (b) {
        var s2 = T.status(b, now);
        if (filter === 'mine' && b.user !== s.name) return false;
        if (filter === 'attention' && s2.state !== 'attention' && s2.state !== 'failed') return false;
        if (query && b.user.toLowerCase().indexOf(query) === -1 && !b.results.some(function (r) { return r.file.toLowerCase().indexOf(query) !== -1; })) return false;
        return true;
      });
    }

    function renderList() {
      if (!list) return;
      var now = Date.now();
      var shown = visible(now);
      var key = shown.map(function (b) { return b.id; }).join('|');
      placeholder.hidden = true;
      empty.hidden = shown.length > 0;
      if (!shown.length) {
        T.clear(empty).append(h('strong', null, list.length ? 'No batches match' : 'No batches yet today'),
          list.length ? 'Try another filter or clear the search.' : 'Upload ' + cfg.sourceNoun + 's on the left to start one.');
      }
      if (key === shownKey) return;
      shownKey = key;
      T.motion.flip(rowsEl, function () {
        T.clear(rowsEl);
        shown.forEach(function (b) {
          if (!rows[b.id]) rows[b.id] = buildRow(b);
          updateRow(rows[b.id], b, now);
          rowsEl.appendChild(rows[b.id]);
        });
      });
    }

    function tick() {
      if (!list) return;
      var now = Date.now();
      var states = list.map(function (b) { return T.status(b, now); });
      list.forEach(function (b) { if (rows[b.id]) updateRow(rows[b.id], b, now); });
      st.all.set(list.length);
      st.run.set(states.filter(function (x) { return x.state === 'running' || x.state === 'queued'; }).length);
      var att = states.filter(function (x) { return x.state === 'attention' || x.state === 'failed'; }).length;
      st.att.set(att, att > 0);
      st.ready.set(list.reduce(function (n, b, i) { return n + (T.finished(states[i]) ? b.results.filter(function (r) { return r.status !== 'failed'; }).length : 0); }, 0));
      if (filter === 'attention') renderList();
      if (openId) renderSheet();
    }

    stops.push(T.watchBatches(pid, function (l, at) {
      list = l; error = null; checkedAt = at;
      banner.hidden = true;
      renderList();
      tick();
    }, function (msg) {
      error = msg;
      banner.hidden = false;
      T.clear(banner).append(icon('offline', 17), msg + ' ' + (checkedAt ? 'Showing the list from ' + fmt.time(checkedAt) + '.' : 'Nothing to show yet.') + ' It retries every few seconds.');
    }));
    var timer = global.setInterval(tick, 250);
    stops.push(function () { global.clearInterval(timer); });

    /* ----- sheet: a native dialog that grows out of the row through a view transition ----- */

    var panel = h('div', { class: 'sheet' });
    var dlg = h('dialog', { class: 'sheet-dialog', 'aria-labelledby': 'sheet-title' }, panel);
    var sheetKey = '';
    dlg.addEventListener('click', function (e) { if (e.target === dlg) closeSheet(); });
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); closeSheet(); });
    root.appendChild(dlg);

    function openSheet(id) {
      var row = rows[id] && rows[id]._r.btn;
      openId = id;
      sheetKey = '';
      renderSheet();
      if (row) row.style.viewTransitionName = 'batch';
      T.motion.transition(function () {
        if (row) row.style.viewTransitionName = '';
        panel.style.viewTransitionName = 'batch';
        dlg.showModal();
      }).then(function () { panel.style.viewTransitionName = ''; var c = panel.querySelector('.icon-btn'); if (c) c.focus(); });
    }
    function closeSheet() {
      var row = openId && rows[openId] && rows[openId]._r.btn;
      openId = null;
      panel.style.viewTransitionName = 'batch';
      T.motion.transition(function () {
        panel.style.viewTransitionName = '';
        dlg.close();
        if (row) row.style.viewTransitionName = 'batch';
      }).then(function () { if (row) { row.style.viewTransitionName = ''; row.focus(); } });
    }

    function renderSheet() {
      var b = (list || []).filter(function (x) { return x.id === openId; })[0];
      if (!b) return;
      var now = Date.now();
      var s2 = T.status(b, now);
      var key = s2.state + s2.stage;
      if (key === sheetKey) return;
      sheetKey = key;
      var done = T.finished(s2);
      var busy = s2.state === 'running' || s2.state === 'queued';

      var body = h('div', { class: 'sheet-body' });
      if (dev) {
        var times = T.stageTimes(b);
        body.appendChild(h('div', null, h('div', { class: 'section-label' }, 'Stages'),
          h('div', { class: 'stages' }, cfg.stages.map(function (stg, i) {
            var cls = s2.state === 'failed' && i === s2.stage ? 'failed' : i < s2.stage || done ? 'done' : i === s2.stage && s2.state === 'running' ? 'now' : '';
            var note = cls === 'done' ? fmt.seconds(times[i].end - times[i].start) : cls === 'now' ? 'running' : cls === 'failed' ? 'failed' : '';
            return h('div', { class: 'stage ' + cls, title: stg.full }, h('i'), h('span', null, stg.short), h('small', null, note));
          }))));
      } else if (busy) {
        body.appendChild(h('div', { class: 'sheet-status' }, h('span', { class: 'prog-bar indeterminate' }, h('span')),
          h('p', null, 'Generating the files. This updates by itself, so you can close it and come back.')));
      } else if (s2.state === 'failed') {
        body.appendChild(h('div', { class: 'result-msg failed' }, 'This batch could not be processed. The reason is shown on each file below. Fix the file and upload it again, or contact the platform team.'));
      }

      body.appendChild(h('div', null, h('div', { class: 'section-label' }, 'Files'),
        h('ul', { class: 'results' }, b.results.map(function (r) {
          var rs = busy ? 'running' : r.status;
          return h('li', { class: 'result' },
            h('div', { class: 'result-top' },
              h('span', { class: 'dot ' + (rs === 'warning' ? 'attention' : rs === 'done' ? 'done' : rs) }),
              h('span', { class: 'name' }, r.file),
              pill(rs, rs === 'done' ? 'Ready' : rs === 'warning' ? 'Check' : rs === 'failed' ? 'Failed' : 'Processing')),
            h('div', { class: 'result-meta' }, h('span', null, cfg.refLabel + ' ' + r.ref), done && r.code ? h('span', null, cfg.codeLabel + ' ' + r.code) : null),
            (done || s2.state === 'failed') ? r.warnings.map(function (w) { return h('div', { class: 'result-msg ' + r.status }, w); }) : null,
            done && r.outputs.length ? h('div', { class: 'outputs' }, r.outputs.map(function (o, i) {
              return h('button', { class: 'chip-btn', title: o, onclick: function () { T.downloads.single(b, o, 'generated file'); } }, icon('download', 14), dev ? o : cfg.outputs[i].label);
            })) : null);
        }))));

      if (dev) {
        body.appendChild(h('div', null, h('div', { class: 'section-label' }, 'Event log'),
          h('ol', { class: 'event-log' }, T.eventLog(b, now).map(function (e) {
            return h('li', { class: e.kind }, h('time', null, fmt.time(e.at)), h('span', null, e.text));
          }))));
      }

      body.appendChild(h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn btn-primary', disabled: !done || b.results.every(function (r) { return r.status === 'failed'; }), onclick: function () { T.downloads.generated(b); } }, icon('download', 16), 'Download generated files'),
        h('button', { class: 'btn btn-plain', onclick: function () { T.downloads.uploaded(b); } }, icon('file', 16), 'Uploaded files')));

      T.clear(panel).append(
        h('div', { class: 'sheet-head' },
          h('div', null,
            h('h2', { id: 'sheet-title' }, dev ? 'Batch ' + b.id : cfg.title + ' from ' + fmt.clock(b.createdAt)),
            h('p', null, dev ? cfg.short + ', ' + b.user + ', received ' + fmt.time(b.createdAt) : who(b.user, s) + ', ' + fmt.plural(b.results.length, cfg.sourceNoun))),
          h('div', { class: 'sheet-head-right' }, pill(s2.state),
            h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: closeSheet }, icon('x', 17)))),
        body);
    }

    /* ----- uploader ----- */

    function uploader() {
      var files = [], rejected = [], failed = null, busy = false;
      var input = h('input', { type: 'file', multiple: true, hidden: true,
        accept: cfg.accept.filter(function (a) { return cfg.needsMapping || a !== '.xlsx'; }).join(','),
        onchange: function (e) { add(e.target.files); e.target.value = ''; } });
      var drop = h('div', { class: 'drop', role: 'button', tabindex: '0' },
        h('span', { class: 'drop-icon' }, icon('upload', 22)),
        h('strong', null, 'Drop files or choose them'),
        h('small', null, cfg.needsMapping ? cfg.acceptHint + '. One mapping workbook per batch.' : cfg.acceptHint),
        input);
      var queue = h('ul', { class: 'queue' });
      var checks = h('ul', { class: 'checks' });
      var errs = h('div', { class: 'upload-errors', role: 'alert' });
      var clearBtn = h('button', { class: 'btn btn-link', hidden: true, onclick: function () { files = []; rejected = []; paint(); } }, 'Clear');
      var gen = h('button', { class: 'btn btn-primary btn-lg', onclick: generate }, 'Generate');
      var magInner = h('div', { class: 'magnet-inner' }, gen);
      var magWrap = h('div', { class: 'generate' }, magInner);

      drop.addEventListener('click', function (e) { if (e.target !== input) input.click(); });
      drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.dataset.over = 'true'; });
      drop.addEventListener('dragleave', function () { drop.dataset.over = 'false'; });
      drop.addEventListener('drop', function (e) { e.preventDefault(); drop.dataset.over = 'false'; add(e.dataTransfer.files); });
      stops.push(T.motion.magnet(magWrap, magInner, { padding: 70, strength: 4, disabled: function () { return gen.disabled; } }));

      function add(fileList) {
        if (!fileList) return;
        rejected = [];
        failed = null;
        Array.prototype.forEach.call(fileList, function (f) {
          var c = T.classifyFile(cfg, f);
          if (c.error) rejected.push(c.error);
          else if (!files.some(function (x) { return x.name === f.name; })) files.push({ name: f.name, size: f.size, role: c.role });
        });
        paint();
      }

      function paint() {
        T.clear(queue);
        files.forEach(function (f) {
          queue.appendChild(h('li', null, icon('file', 16), h('span', { class: 'name', title: f.name }, f.name),
            h('span', { class: 'role' }, f.role === 'mapping' ? 'Mapping' : fmt.size(f.size)),
            h('button', { 'aria-label': 'Remove ' + f.name, onclick: function () { files = files.filter(function (x) { return x !== f; }); paint(); } }, icon('x', 14))));
        });
        queue.hidden = !files.length;
        clearBtn.hidden = !files.length;
        var sources = files.filter(function (f) { return f.role === 'source'; }).length;
        var hasMap = files.some(function (f) { return f.role === 'mapping'; });
        T.clear(checks);
        if (cfg.needsMapping) checks.appendChild(h('li', { class: hasMap ? 'ok' : '' }, icon(hasMap ? 'check' : 'file', 15), 'Tranche code mapping workbook'));
        checks.appendChild(h('li', { class: sources ? 'ok' : '' }, icon(sources ? 'check' : 'file', 15), sources ? fmt.plural(sources, cfg.sourceNoun) : 'At least one ' + cfg.sourceNoun));
        var msgs = rejected.concat(failed ? [failed] : []);
        T.clear(errs);
        msgs.forEach(function (m) { errs.appendChild(h('div', null, icon('alert', 15), m)); });
        errs.hidden = !msgs.length;
        var problems = T.validateFiles(cfg, files);
        gen.disabled = busy || problems.length > 0;
        gen.title = problems.join(' ');
        gen.textContent = busy ? 'Starting batch' : 'Generate';
      }

      function generate() {
        var sources = files.filter(function (f) { return f.role === 'source'; }).length;
        busy = true;
        failed = null;
        paint();
        T.api.create(pid, files, s.name).then(function (b) {
          files = []; rejected = []; busy = false;
          paint();
          T.toast('Batch started with ' + fmt.plural(sources, cfg.sourceNoun), 'check');
          list = [b].concat(list || []);
          renderList();
          T.announce();
          openSheet(b.id);
        }).catch(function (e) {
          busy = false;
          failed = e.message + ' Your files are still here. Try again in a moment.';
          paint();
        });
      }

      paint();
      return h('section', { class: 'panel glass uploader', 'aria-label': 'New batch' },
        h('div', { class: 'panel-title' }, h('h2', null, 'New batch'), clearBtn),
        drop, queue, checks, errs, magWrap);
    }

    return function () {
      stops.forEach(function (f) { f(); });
      if (dlg.open) dlg.close();
    };
  };

  /* ---------- report ---------- */

  T.pages.report = function (root, ctx) {
    var s = ctx.session, dev = T.isDev(s);
    var allowed = T.productIds().filter(function (id) { return T.can(s, 'view', id); });
    var pid = T.store.get('lastProduct', null);
    if (allowed.indexOf(pid) === -1) pid = allowed[0];
    var stop = null;
    var st = { files: stat('Files processed'), ready: stat('Ready'), check: stat('To check'), failed: stat('Failed') };
    var filesBody = h('tbody');
    var peopleBody = h('tbody');
    var filesHead = h('thead');
    var count = h('span', { class: 'tag' });

    var picker = allowed.length > 1 ? T.productPicker({ session: s, value: pid, label: 'Report product', onChange: function (id) { pid = id; watch(); } }) : null;
    root.appendChild(head('Report for ' + fmt.date(Date.now()), h('h1', null, 'Today on the desk'),
      'Everything processed since the last 21:00 clear. Records here go when the next clear runs.', picker));
    root.appendChild(h('div', { class: 'stats' }, st.files.el, st.ready.el, st.check.el, st.failed.el));
    root.appendChild(h('div', { class: 'two-col' },
      h('section', { class: 'panel glass' }, h('div', { class: 'panel-title' }, h('h2', null, 'Files'), count),
        h('div', { class: 'table-scroll' }, h('table', { class: 'table' }, filesHead, filesBody))),
      h('section', { class: 'panel glass' }, h('div', { class: 'panel-title' }, h('h2', null, 'By person')),
        h('div', { class: 'legend' }, h('span', null, h('i', { style: { background: 'var(--ok)' } }), 'Ready'),
          h('span', null, h('i', { style: { background: 'var(--warn)' } }), 'Check'), h('span', null, h('i', { style: { background: 'var(--bad)' } }), 'Failed')),
        h('table', { class: 'table' }, h('thead', null, h('tr', null, h('th', null, 'Person'), h('th', { class: 'num' }, 'Batches'), h('th', { style: { width: '45%' } }, 'Files'))), peopleBody))));

    function draw(list) {
      var cfg = T.config.products[pid];
      var now = Date.now();
      var rows = [];
      list.forEach(function (b) {
        var s2 = T.status(b, now);
        var fin = T.finished(s2) || s2.state === 'failed';
        b.results.forEach(function (r) { rows.push({ b: b, r: r, st: fin ? r.status : 'running' }); });
      });
      function n(k) { return rows.filter(function (x) { return x.st === k; }).length; }
      st.files.set(rows.length); st.ready.set(n('done')); st.check.set(n('warning'), n('warning') > 0); st.failed.set(n('failed'));
      count.textContent = fmt.plural(rows.length, 'file');
      T.clear(filesHead).append(h('tr', null, h('th', null, 'Time'), dev ? h('th', null, 'Batch') : null, h('th', null, 'File'), h('th', null, 'By'), h('th', null, cfg.refLabel), h('th', null, 'Result')));
      T.clear(filesBody);
      rows.forEach(function (x) {
        filesBody.appendChild(h('tr', null, h('td', null, fmt.clock(x.b.createdAt)), dev ? h('td', { class: 'mono' }, x.b.id) : null,
          h('td', { class: 'clip', title: x.r.file }, x.r.file), h('td', null, who(x.b.user, s)), h('td', null, x.r.ref),
          h('td', null, pill(x.st, x.st === 'done' ? 'Ready' : x.st === 'warning' ? 'Check' : x.st === 'failed' ? 'Failed' : 'Processing'))));
      });
      var people = {};
      rows.forEach(function (x) {
        var p = people[x.b.user] = people[x.b.user] || { name: x.b.user, ids: {}, files: 0, ok: 0, warn: 0, bad: 0 };
        p.ids[x.b.id] = 1; p.files += 1;
        if (x.st === 'done') p.ok += 1; else if (x.st === 'warning') p.warn += 1; else if (x.st === 'failed') p.bad += 1;
      });
      T.clear(peopleBody);
      Object.keys(people).map(function (k) { return people[k]; }).sort(function (a, b) { return b.files - a.files; }).forEach(function (p) {
        peopleBody.appendChild(h('tr', null, h('td', null, who(p.name, s)), h('td', { class: 'num' }, Object.keys(p.ids).length),
          h('td', null, h('div', { class: 'bar-cell' }, h('span', { class: 'mini' },
            h('i', { style: { background: 'var(--ok)', width: (p.ok / p.files * 100) + '%' } }),
            h('i', { style: { background: 'var(--warn)', width: (p.warn / p.files * 100) + '%' } }),
            h('i', { style: { background: 'var(--bad)', width: (p.bad / p.files * 100) + '%' } })), h('span', { class: 'num-label' }, p.files)))));
      });
    }

    function watch() {
      if (stop) stop();
      T.store.set('lastProduct', pid);
      stop = T.watchBatches(pid, draw);
    }
    watch();
    return function () { if (stop) stop(); };
  };

  /* ---------- templates ---------- */

  T.pages.templates = function (root, ctx) {
    var s = ctx.session;
    var withTemplates = T.productIds().filter(function (id) { return T.config.products[id].hasTemplates && T.can(s, 'view', id); });
    var cfg = T.config.products[withTemplates[0] || 'eli'];
    root.appendChild(head(cfg.name, h('h1', null, 'Templates'), 'The Word templates the generator fills in. A replacement applies to every batch started after it.'));
    if (!T.can(s, 'templates')) {
      root.appendChild(h('section', { class: 'panel glass' }, h('div', { class: 'readonly-note' }, icon('lock', 18), h('span', null, 'Your role cannot manage templates.'))));
      return function () {};
    }
    var listEl = h('ul', { class: 'tpl-list' }, [0, 1, 2].map(function () { return h('li', { class: 'skeleton' }); }));
    var logEl = h('ul', { class: 'log' });
    var target = null;
    var input = h('input', { type: 'file', accept: '.docx', hidden: true, onchange: function (e) { replace(e.target.files[0]); e.target.value = ''; } });
    root.appendChild(h('div', { class: 'two-col' },
      h('section', { class: 'panel glass' }, h('div', { class: 'panel-title' }, h('h2', null, 'Current templates')), listEl, input),
      h('section', { class: 'panel glass' }, h('div', { class: 'panel-title' }, h('h2', null, 'History')), logEl)));

    function draw(data) {
      T.clear(listEl);
      data.list.forEach(function (t) {
        listEl.appendChild(h('li', { class: 'tpl' }, h('span', { class: 'tpl-icon' }, icon('template', 20)),
          h('span', { class: 'meta' }, h('strong', null, t.name), h('span', null, 'Updated ' + fmt.date(t.updated) + ' by ' + t.by + ', ' + fmt.size(t.size))),
          h('button', { class: 'btn btn-plain', onclick: function () { target = t.name; input.click(); } }, icon('upload', 16), 'Replace')));
      });
      T.clear(logEl);
      data.log.forEach(function (l) { logEl.appendChild(h('li', null, h('strong', null, l.name), h('span', null, fmt.date(l.when) + ', ' + l.by))); });
    }
    function replace(f) {
      if (!f || !target) return;
      if (!/\.docx$/i.test(f.name)) { T.toast('Templates must be .docx files', 'alert'); return; }
      T.api.replaceTemplate(target, f.size, s.name).then(function (d) { draw(d); T.toast(target + ' replaced', 'check'); })
        .catch(function (e) { T.toast(e.message, 'alert'); });
    }
    T.api.templates().then(draw).catch(function (e) { T.clear(listEl).append(h('li', { class: 'readonly-note' }, e.message + ' Reload to try again.')); });
    return function () {};
  };
})(window);
