/*
 * Tempo, plain JS. Shared UI: DOM builder, icons, toasts, segmented control, product picker,
 * batch polling and status wording for users and developers.
 */
(function (global) {
  'use strict';
  var T = global.Tempo = global.Tempo || {};

  /* ---------- DOM builder (text only, never innerHTML with data) ---------- */

  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(el, c); }); return; }
    el.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  T.h = function (tag, attrs) {
    var el = document.createElement(tag);
    var a = attrs || {};
    for (var k in a) {
      var v = a[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  };
  T.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /* ---------- icons (24px grid, 1.6 stroke, drawn for Tempo) ---------- */

  var ICONS = {
    upload: 'M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V14',
    file: 'M14 3H7.5A1.5 1.5 0 006 4.5v15A1.5 1.5 0 007.5 21h9a1.5 1.5 0 001.5-1.5V7l-4-4zM14 3v4h4M9 13h6M9 16.5h4',
    download: 'M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14',
    right: 'M9.5 6l6 6-6 6',
    down: 'M6 9.5l6 6 6-6',
    x: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    alert: 'M12 4.5l8.5 15h-17L12 4.5zM12 10.5v4M12 17.2h.01',
    lock: 'M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 017 0v3',
    search: 'M11 4.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM20 20l-4.2-4.2',
    refresh: 'M19.5 12a7.5 7.5 0 11-2.2-5.3M19.5 4.5v4h-4',
    logout: 'M9.5 4.5H6A1.5 1.5 0 004.5 6v12A1.5 1.5 0 006 19.5h3.5M15 8l4 4-4 4M19 12H9.5',
    clock: 'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM12 7.5V12l3 2',
    users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20a6 6 0 0112 0M16 4.3a3.5 3.5 0 010 6.4M18 14.5a6 6 0 013 5.5',
    offline: 'M3.5 3.5l17 17M8.5 16a5 5 0 017 0M5 12.5a10 10 0 015-2.6M14 9.9a10 10 0 015 2.6M2 9a15 15 0 015.3-3.2M12 19.5h.01',
    grid: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z',
    chart: 'M4.5 19.5h15M7.5 16v-5M12 16V7M16.5 16v-3',
    template: 'M5.5 4.5h13v15h-13zM9 9h6M9 12.5h6M9 16h3',
    code: 'M8.5 8L4.5 12l4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13',
    plus: 'M12 5v14M5 12h14'
  };
  T.icon = function (name, size) {
    var s = size || 18;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', s); svg.setAttribute('height', s); svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ico');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', ICONS[name] || '');
    svg.appendChild(p);
    return svg;
  };

  /* ---------- toasts ---------- */

  var toastWrap;
  T.toast = function (text, icon) {
    if (!toastWrap) {
      toastWrap = T.h('div', { class: 'toast-wrap', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(toastWrap);
    }
    var t = T.h('div', { class: 'toast' }, icon ? T.icon(icon, 17) : null, text);
    toastWrap.appendChild(t);
    while (toastWrap.children.length > 3) toastWrap.firstChild.remove();
    global.setTimeout(function () { T.motion.leave(t); }, 3200);
  };

  /* ---------- events ---------- */

  /* Anything that changes batches announces it, so every open list refreshes at once. */
  T.announce = function () { global.dispatchEvent(new Event('tempo:changed')); };

  /* Polls like the real desk. On a failed poll the last good list stays and onError says it is stale.
     Returns a stop function. */
  T.watchBatches = function (product, onList, onError) {
    var alive = true;
    function load() {
      T.api.list(product).then(function (l) { if (alive) onList(l, Date.now()); })
        .catch(function (e) { if (alive && onError) onError(e.message || 'The product service did not respond.'); });
    }
    load();
    var timer = global.setInterval(load, T.config.pollMs);
    global.addEventListener('tempo:changed', load);
    return function () { alive = false; global.clearInterval(timer); global.removeEventListener('tempo:changed', load); };
  };

  /* Closes a popover on outside click or Escape. Returns a stop function. */
  T.dismissable = function (root, close) {
    function onDown(e) { if (!root.contains(e.target)) close(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return function () { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  };

  /* ---------- segmented control with a sliding thumb ---------- */

  T.segmented = function (opts) {
    var thumb = T.h('span', { class: 'seg-thumb', 'aria-hidden': 'true' });
    var group = T.h('div', { class: 'seg', role: 'group', 'aria-label': opts.label }, thumb);
    var value = opts.value;
    var buttons = opts.options.map(function (o) {
      var b = T.h('button', { type: 'button', 'aria-pressed': String(o.value === value), onclick: function () { set(o.value, true); } }, o.label);
      b.dataset.value = o.value;
      group.appendChild(b);
      return b;
    });
    function place(instant) { T.motion.thumb(group, thumb, buttons.filter(function (b) { return b.dataset.value === value; })[0], instant); }
    function set(v, fire) {
      value = v;
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.value === v)); });
      place(false);
      if (fire) opts.onChange(v);
    }
    /* first placement waits for layout; later resizes keep the thumb in place */
    requestAnimationFrame(function () { place(true); });
    if (global.ResizeObserver) new ResizeObserver(function () { place(true); }).observe(group);
    group.set = set;
    return group;
  };

  /* ---------- product picker (scales to any number of products) ---------- */

  T.productPicker = function (opts) {
    var session = opts.session;
    var ids = T.productIds().filter(function (id) { return T.can(session, 'view', id); });
    var current = opts.value;
    var open = false, stop = null;
    var label = T.h('span', { class: 'picker-label' });
    var btn = T.h('button', { type: 'button', class: 'picker-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
      label, T.icon('down', 16));
    var list = T.h('div', { class: 'picker-list', role: 'listbox', 'aria-label': opts.label || 'Product' });
    var root = T.h('div', { class: 'picker' + (opts.big ? ' big' : '') }, btn, list);

    function paint() {
      var cfg = T.config.products[current];
      T.clear(label).append(opts.big ? cfg.title : cfg.short + ', ' + cfg.title);
      T.clear(list);
      ids.forEach(function (id) {
        var c = T.config.products[id];
        list.appendChild(T.h('button', {
          type: 'button', role: 'option', class: 'picker-item', 'aria-selected': String(id === current),
          onclick: function () { toggle(false); if (id !== current) { current = id; paint(); opts.onChange(id); } }
        }, T.h('span', { class: 'mark sm' }, c.short), T.h('span', null, T.h('strong', null, c.title), T.h('small', null, c.name)),
        id === current ? T.icon('check', 16) : null));
      });
    }
    function toggle(v) {
      open = v;
      root.classList.toggle('open', v);
      btn.setAttribute('aria-expanded', String(v));
      if (v) stop = T.dismissable(root, function () { toggle(false); });
      else if (stop) { stop(); stop = null; }
    }
    btn.addEventListener('click', function () { toggle(!open); });
    paint();
    return root;
  };

  /* ---------- status wording ---------- */

  T.pillText = { queued: 'Queued', running: 'Processing', done: 'Ready', attention: 'Check', failed: 'Failed' };

  /* Users see outcomes only. Developers see the stage that is running. */
  T.stateText = function (b, s, dev) {
    var cfg = T.config.products[b.product];
    if (s.state === 'queued') return dev ? 'Queued' : 'Waiting to start';
    if (s.state === 'running') return dev ? cfg.stages[s.stage].short + ' (' + (s.stage + 1) + ' of ' + s.n + ')' : 'Processing';
    if (s.state === 'failed') return dev ? 'Failed at ' + cfg.stages[s.stage].short.toLowerCase() : 'Could not be processed';
    if (s.state === 'attention') return s.bad ? s.bad + ' failed' + (s.warn ? ', ' + s.warn + ' to check' : '') : s.warn + ' to check';
    return 'Ready to download';
  };
})(window);
