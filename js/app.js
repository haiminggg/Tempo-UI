/*
 * Tempo, plain JS. App shell: session, hash router, the top bar with centred tabs,
 * the account menu (demo controls) and simulated colleagues.
 * Routes: #/products, #/p/<product id>, #/report, #/templates
 */
(function (global) {
  'use strict';
  var T = global.Tempo;
  var h = T.h, icon = T.icon;
  var app = document.getElementById('app');
  var session = null, shell = null, dispose = null, simTimer = null;

  /* Tabs never list products: products live on the Products page and in the switcher on each desk. */
  var TABS = [
    { route: 'products', label: 'Products', icon: 'grid' },
    { route: 'report', label: 'Report', icon: 'chart' },
    { route: 'templates', label: 'Templates', icon: 'template' }
  ];

  function parse() {
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    if (parts[0] === 'p' && T.config.products[parts[1]]) return { page: 'desk', product: parts[1], tab: 'products' };
    if (parts[0] === 'report' || parts[0] === 'templates') return { page: parts[0], tab: parts[0] };
    return { page: 'products', tab: 'products' };
  }
  function go(route) { location.hash = '/' + route; }

  /* ?demo=user|viewer|eli|dev skips sign-in */
  function boot() {
    var demo = new URLSearchParams(location.search).get('demo');
    if (demo && T.config.roles[demo]) return T.session.start(demo === 'dev' ? 'dev' : 'demo', demo);
    return T.session.get();
  }

  function render() {
    if (dispose) { dispose(); dispose = null; }
    if (!session) {
      shell = null;
      stopSim();
      T.clear(app);
      dispose = T.pages.signin(app, function (s) { session = s; go('products'); render(); });
      return;
    }
    if (!shell) buildShell();
    var r = parse();
    if (r.page === 'desk' && !T.can(session, 'view', r.product)) { go('products'); return; }
    shell.setTab(r.tab);
    var main = h('main', { class: 'page' });
    shell.main.replaceWith(main);
    shell.main = main;
    var ctx = { session: session, go: go };
    if (r.page === 'desk') dispose = T.pages.desk(main, ctx, r.product);
    else dispose = T.pages[r.page](main, ctx);
    global.scrollTo(0, 0);
  }

  function buildShell() {
    T.clear(app);
    var thumb = h('span', { class: 'seg-thumb', 'aria-hidden': 'true' });
    var tabs = TABS.map(function (t) {
      var a = h('a', { href: '#/' + t.route }, icon(t.icon, 16), h('span', null, t.label));
      a.dataset.tab = t.route;
      return a;
    });
    var nav = h('nav', { class: 'seg tabs', 'aria-label': 'Main' }, thumb, tabs);
    var devBadge = h('span', { class: 'dev-badge', title: 'Stages, timings and logs are shown' }, icon('code', 15), 'Developer');
    var right = h('div', { class: 'top-right' }, devBadge, purgeChip(), account());
    var bar = h('header', { class: 'topbar glass' },
      h('a', { class: 'brand', href: '#/products', 'aria-label': 'Tempo home' }, h('img', { src: 'ocbc-logo.png', alt: '' }), 'Tempo'),
      nav, right);
    var main = h('main', { class: 'page' });
    app.appendChild(h('div', { class: 'shell' }, bar, main));

    var current = null;
    function place(instant) { T.motion.thumb(nav, thumb, tabs.filter(function (a) { return a.dataset.tab === current; })[0], instant); }
    if (global.ResizeObserver) new ResizeObserver(function () { place(true); }).observe(nav);
    shell = {
      main: main,
      setTab: function (tab) {
        var first = current === null;
        current = tab;
        tabs.forEach(function (a) { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
        requestAnimationFrame(function () { place(first); });
      },
      refreshRole: function () { devBadge.hidden = !T.isDev(session); }
    };
    shell.refreshRole();
    startSim();
  }

  function purgeChip() {
    var text = h('span');
    function paint() { text.textContent = 'Clears in ' + T.fmt.duration(T.nextPurge() - Date.now()); }
    paint();
    global.setInterval(paint, 30000);
    return h('span', { class: 'purge-chip', title: 'Records are cleared every day at 21:00' }, icon('clock', 15), text);
  }

  function account() {
    var open = false, stop = null;
    var btn = h('button', { class: 'avatar', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Account and demo controls' });
    var menu = h('div', { class: 'menu glass', role: 'menu' });
    var root = h('div', { class: 'account' }, btn, menu);

    function sw(on) { return h('span', { class: 'switch', 'data-on': String(on) }); }
    function paint() {
      btn.textContent = session.name.split(' ').map(function (p) { return p[0]; }).join('');
      var colleagues = T.store.get('colleagues', true);
      var down = T.store.get('backend', 'up') === 'down';
      T.clear(menu).append(
        h('div', { class: 'menu-head' }, h('strong', null, session.name),
          h('span', null, T.config.roles[session.role].label + ', session ends ' + T.fmt.clock(session.expires))),
        h('div', { class: 'menu-label' }, 'View as'),
        Object.keys(T.config.roles).map(function (r) {
          var role = T.config.roles[r];
          return h('button', { class: 'menu-item', role: 'menuitemradio', 'aria-checked': String(session.role === r), onclick: function () {
            session = T.session.update({ role: r });
            shell.refreshRole();
            paint();
            render();
          } }, h('span', null, role.label, h('small', null, role.note)), session.role === r ? h('span', { class: 'pill done' }, 'Current') : null);
        }),
        h('div', { class: 'menu-sep' }),
        h('button', { class: 'menu-item', role: 'menuitemcheckbox', 'aria-checked': String(colleagues), onclick: function () {
          T.store.set('colleagues', !colleagues); paint(); startSim();
        } }, h('span', null, 'Simulated colleagues', h('small', null, 'Others submit batches now and then')), sw(colleagues)),
        h('button', { class: 'menu-item', role: 'menuitemcheckbox', 'aria-checked': String(down), onclick: function () {
          T.store.set('backend', down ? 'up' : 'down'); paint(); T.announce();
        } }, h('span', null, 'Product service unreachable', h('small', null, 'Shows the error and stale states')), sw(down)),
        h('button', { class: 'menu-item', role: 'menuitem', onclick: function () { T.resetSample(); T.announce(); T.toast('Sample data reset', 'refresh'); toggle(false); } },
          h('span', null, 'Reset sample data'), icon('refresh', 16)),
        h('div', { class: 'menu-sep' }),
        h('button', { class: 'menu-item', role: 'menuitem', onclick: function () { toggle(false); T.session.end(); session = null; render(); } },
          h('span', null, 'Sign out'), icon('logout', 16)));
    }
    function toggle(v) {
      open = v;
      root.classList.toggle('open', v);
      btn.setAttribute('aria-expanded', String(v));
      if (v) { paint(); stop = T.dismissable(root, function () { toggle(false); }); }
      else if (stop) { stop(); stop = null; }
    }
    btn.addEventListener('click', function () { toggle(!open); });
    paint();
    return root;
  }

  function stopSim() { if (simTimer) { global.clearInterval(simTimer); simTimer = null; } }
  function startSim() {
    stopSim();
    if (!T.store.get('colleagues', true)) return;
    simTimer = global.setInterval(function () {
      if (!session) return;
      var allowed = T.config.roles[session.role].view;
      var pid = allowed[Math.floor(Math.random() * allowed.length)];
      T.simulateColleague(pid).then(function (b) {
        if (!b) return;
        T.announce();
        T.toast(b.user + ' started a ' + T.config.products[pid].short + ' batch', 'users');
      });
    }, 16000);
  }

  global.addEventListener('hashchange', render);
  session = boot();
  render();
})(window);
