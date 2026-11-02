/*
 * Tempo, plain JS. Motion helpers that replace motion, GSAP SplitText and the React Bits components.
 * Every helper checks prefers-reduced-motion and falls back to an instant change.
 */
(function (global) {
  'use strict';
  var T = global.Tempo = global.Tempo || {};
  var EASE = 'cubic-bezier(.22, 1, .36, 1)';
  var mq = global.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = function () { return mq.matches; };

  T.motion = {
    reduced: reduced,

    /* FLIP: measure keyed children, run the DOM change, then animate each child from where it was.
       Children carry data-key. New children fade down into place. */
    flip: function (container, mutate) {
      var before = {};
      Array.prototype.forEach.call(container.children, function (el) {
        if (el.dataset.key) before[el.dataset.key] = el.getBoundingClientRect();
      });
      mutate();
      if (reduced()) return;
      Array.prototype.forEach.call(container.children, function (el) {
        var old = before[el.dataset.key];
        if (!old) {
          el.animate([{ opacity: 0, transform: 'translateY(-10px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE });
          return;
        }
        var now = el.getBoundingClientRect();
        var dy = old.top - now.top, dx = old.left - now.left;
        if (Math.abs(dy) < 1 && Math.abs(dx) < 1) return;
        el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 480, easing: EASE });
      });
    },

    /* Removes an element after a short fade, so lists never jump. */
    leave: function (el, done) {
      if (reduced() || !el.animate) { el.remove(); if (done) done(); return; }
      var a = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }], { duration: 200, easing: 'ease-in' });
      a.onfinish = function () { el.remove(); if (done) done(); };
    },

    /* Counts from the last value shown to the new one with an ease-out curve. */
    countUp: function (el, to, ms) {
      var from = typeof el._value === 'number' ? el._value : 0;
      el._value = to;
      if (el._raf) cancelAnimationFrame(el._raf);
      if (reduced() || from === to) { el.textContent = to.toLocaleString(); return; }
      var dur = ms || 900, t0 = performance.now();
      (function step(t) {
        var p = Math.min(1, (t - t0) / dur);
        var e = 1 - Math.pow(2, -10 * p);
        el.textContent = Math.round(from + (to - from) * (p === 1 ? 1 : e)).toLocaleString();
        if (p < 1) el._raf = requestAnimationFrame(step);
      })(t0);
    },

    /* Magnet: the inner element leans toward the pointer when it comes within `padding` px.
       Returns a function that removes the listeners. */
    magnet: function (wrap, inner, opts) {
      var o = opts || {};
      var padding = o.padding || 70, strength = o.strength || 4;
      var tx = 0, ty = 0, x = 0, y = 0, raf = 0;
      function loop() {
        x += (tx - x) * 0.18; y += (ty - y) * 0.18;
        inner.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';
        if (Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1) raf = requestAnimationFrame(loop);
        else { raf = 0; if (!tx && !ty) inner.style.transform = ''; }
      }
      function kick() { if (!raf) raf = requestAnimationFrame(loop); }
      function move(e) {
        if (reduced() || (o.disabled && o.disabled())) { tx = ty = 0; kick(); return; }
        var r = wrap.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var inside = e.clientX > r.left - padding && e.clientX < r.right + padding && e.clientY > r.top - padding && e.clientY < r.bottom + padding;
        tx = inside ? (e.clientX - cx) / strength : 0;
        ty = inside ? (e.clientY - cy) / strength : 0;
        kick();
      }
      global.addEventListener('pointermove', move, { passive: true });
      return function () { global.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
    },

    /* SplitText: wraps each rendered line of `el` in a clipping mask so CSS can raise it into view.
       Runs after the web font loads so the line breaks are the final ones. */
    splitLines: function (el) {
      var text = el.textContent.trim();
      function split() {
        if (reduced()) { el.classList.remove('splitting'); return; }
        el.textContent = '';
        var words = text.split(/\s+/).map(function (w, i) {
          var s = document.createElement('span');
          s.className = 'word';
          s.textContent = w;
          el.appendChild(s);
          el.appendChild(document.createTextNode(i < text.length - 1 ? ' ' : ''));
          return s;
        });
        var lines = [], top = null;
        words.forEach(function (w) {
          if (w.offsetTop !== top) { lines.push([]); top = w.offsetTop; }
          lines[lines.length - 1].push(w.textContent);
        });
        el.textContent = '';
        lines.forEach(function (l, i) {
          var mask = document.createElement('span');
          mask.className = 'line-mask';
          var line = document.createElement('span');
          line.className = 'line';
          line.style.setProperty('--i', i);
          line.textContent = l.join(' ');
          mask.appendChild(line);
          el.appendChild(mask);
        });
        el.classList.remove('splitting');
        el.classList.add('split');
      }
      el.classList.add('splitting');
      (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(split);
    },

    /* Shared element transition (View Transitions API). Older browsers just run the change. */
    transition: function (change) {
      if (reduced() || !document.startViewTransition) { change(); return Promise.resolve(); }
      return document.startViewTransition(change).finished.catch(function () {});
    },

    /* Slides a highlight under the active item of a tab or segmented group. */
    thumb: function (group, thumb, active, instant) {
      if (!active) { thumb.style.opacity = '0'; return; }
      var g = group.getBoundingClientRect(), a = active.getBoundingClientRect();
      if (instant || reduced()) thumb.style.transition = 'none';
      thumb.style.opacity = '1';
      thumb.style.width = a.width + 'px';
      thumb.style.transform = 'translateX(' + (a.left - g.left - parseFloat(getComputedStyle(group).paddingLeft || 0) + 0) + 'px)';
      if (instant || reduced()) { thumb.getBoundingClientRect(); thumb.style.transition = ''; }
    }
  };
})(window);
