/*
 * Tempo, plain JS. Mock backend.
 * Config, storage, session and roles, batches whose progress comes from elapsed time,
 * templates, a store-only zip writer and upload checks. No dependencies.
 * Swap T.api for fetch calls to the gateway when this is wired to the real platform.
 */
(function (global) {
  'use strict';
  var T = global.Tempo = global.Tempo || {};

  /* ---------- configuration ---------- */

  /* Products are a registry: the product list, pickers and report all read from it,
     so a new product is one more entry here (plus its backend). */
  T.config = {
    sessionMinutes: 120,
    purgeHour: 21,
    pollMs: 3000,
    queueMs: 900,
    stageMs: 1500,
    products: {
      eli: {
        id: 'eli', name: 'ELI Structured Investments', short: 'ELI', title: 'Term sheets',
        blurb: 'Upload counterparty term sheets and a tranche code mapping workbook to generate OCBC term sheets and Murex files.',
        sourceNoun: 'term sheet', accept: ['.doc', '.docx', '.xlsx'], acceptHint: '.doc, .docx and .xlsx', needsMapping: true,
        hasTemplates: true,
        stages: [
          { short: 'Validate', full: 'Validate uploads' },
          { short: 'Convert', full: 'Convert Word files to DOCX' },
          { short: 'Parse', full: 'Parse the term sheet' },
          { short: 'Template', full: 'Identify the variant and pick a template' },
          { short: 'Strategy', full: 'Look up the strategy code by RFQ ID' },
          { short: 'Generate', full: 'Generate term sheet and Murex file' }
        ],
        failStage: 4, refLabel: 'RFQ ID', codeLabel: 'Strategy code',
        outputs: [
          { suffix: '_OCBC.docx', label: 'Term sheet (DOCX)' },
          { suffix: '_OCBC.pdf', label: 'Term sheet (PDF)' },
          { suffix: '_Murex.xlsx', label: 'Murex file' }
        ],
        warnMsgs: [
          'Converted from .doc before parsing. Check the formatting of the generated term sheet.',
          'A date was read in a different format from the template. Check it in the generated files.'
        ],
        failMsgs: ['Strategy code not found for this RFQ ID.', 'No template matches this product variant.']
      },
      sn: {
        id: 'sn', name: 'TPN Structured Notes', short: 'TPN', title: 'Trade files',
        blurb: 'Generate OCBC trade booking, Murex and blotter files from third-party structured note documents.',
        sourceNoun: 'document', accept: ['.pdf', '.doc', '.docx'], acceptHint: '.pdf, .doc and .docx', needsMapping: false,
        hasTemplates: false, placeholder: true,
        stages: [
          { short: 'Extract', full: 'Extract text and tables' },
          { short: 'Map', full: 'Map attributes to the trade template' },
          { short: 'Transform', full: 'Transform values' },
          { short: 'Booking', full: 'Build the trade booking file' },
          { short: 'Murex', full: 'Build the Murex and blotter files' }
        ],
        failStage: 0, refLabel: 'Trade reference', codeLabel: 'Template',
        outputs: [
          { suffix: '_booking.xlsx', label: 'Trade booking' },
          { suffix: '_murex.xlsx', label: 'Murex file' },
          { suffix: '_blotter.xlsx', label: 'Blotter' }
        ],
        warnMsgs: [
          'A table layout was not recognised on page 3. The affected attributes were left blank.',
          'A table is split across two pages. Check the merged rows in the booking file.'
        ],
        failMsgs: ['The document could not be read as text. It may be a scan.']
      }
    },
    /* audience decides what the desk shows: 'user' sees outcomes, 'dev' also sees stages, timings and the event log */
    roles: {
      user: { label: 'Desk user', note: 'View and upload on every product', audience: 'user', view: ['eli', 'sn'], upload: ['eli', 'sn'], templates: true },
      viewer: { label: 'View only', note: 'Can see records, cannot upload', audience: 'user', view: ['eli', 'sn'], upload: [], templates: false },
      eli: { label: 'ELI only', note: 'No access to TPN', audience: 'user', view: ['eli'], upload: ['eli'], templates: true },
      dev: { label: 'Developer', note: 'Sees processing stages, timings and logs', audience: 'dev', view: ['eli', 'sn'], upload: ['eli', 'sn'], templates: true }
    }
  };

  T.productIds = function () { return Object.keys(T.config.products); };

  /* ---------- storage (every access guarded) ---------- */

  var memory = {};
  var PREFIX = 'tempo.plain.v1.';
  T.store = {
    get: function (key, fallback) {
      try {
        var raw = global.localStorage.getItem(PREFIX + key);
        if (raw !== null) return JSON.parse(raw);
      } catch (e) { /* storage blocked */ }
      return key in memory ? memory[key] : fallback;
    },
    set: function (key, value) {
      memory[key] = value;
      try { global.localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
    },
    remove: function (key) {
      delete memory[key];
      try { global.localStorage.removeItem(PREFIX + key); } catch (e) { /* storage blocked */ }
    }
  };

  /* ---------- formatting ---------- */

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  T.fmt = {
    time: function (ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); },
    clock: function (ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); },
    date: function (ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); },
    size: function (b) { return b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; },
    duration: function (ms) {
      var m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60);
      return h ? h + ' h ' + pad(m % 60) + ' m' : m + ' m';
    },
    seconds: function (ms) { return (ms / 1000).toFixed(1) + ' s'; },
    plural: function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  };

  T.nextPurge = function (now) {
    var t = now || Date.now();
    var d = new Date(t);
    d.setHours(T.config.purgeHour, 0, 0, 0);
    if (d.getTime() <= t) d.setDate(d.getDate() + 1);
    return d.getTime();
  };
  function lastPurge(now) { return T.nextPurge(now) - 86400000; }

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* ---------- session ---------- */

  T.session = {
    get: function () {
      var s = T.store.get('session', null);
      if (!s) return null;
      if (Date.now() > s.expires) {
        T.store.remove('session');
        T.store.set('flash', 'Your session expired. Sign in again to continue.');
        return null;
      }
      return s;
    },
    /* demo rule: the login ID "dev" signs in as a developer, anything else as a desk user */
    start: function (userId, role) {
      var r = role || (userId.toLowerCase() === 'dev' ? 'dev' : 'user');
      var s = { userId: userId, name: 'Haiming Wu', role: r, started: Date.now(), expires: Date.now() + T.config.sessionMinutes * 60000 };
      T.store.set('session', s);
      return s;
    },
    update: function (patch) {
      var s = T.store.get('session', null);
      if (!s) return null;
      for (var k in patch) s[k] = patch[k];
      T.store.set('session', s);
      return s;
    },
    end: function () { T.store.remove('session'); }
  };

  T.can = function (s, action, product) {
    var role = T.config.roles[s.role];
    if (action === 'view') return role.view.indexOf(product) !== -1;
    if (action === 'upload') return role.upload.indexOf(product) !== -1;
    if (action === 'templates') return role.templates;
    return false;
  };
  T.isDev = function (s) { return T.config.roles[s.role].audience === 'dev'; };

  /* ---------- batches ---------- */

  T.PEOPLE = ['Priya Nair', 'Daniel Tan', 'Haiming Wu'];

  function buildResults(product, files, forced) {
    var cfg = T.config.products[product];
    return files.filter(function (f) { return f.role === 'source'; }).map(function (f, i) {
      var base = f.name.replace(/\.[^.]+$/, '');
      var hv = hash(f.name);
      var status = forced && forced[i] ? forced[i] : 'done';
      if (!forced) {
        if (/error|fail/i.test(f.name)) status = 'failed';
        else if (/warn/i.test(f.name) || hv % 5 === 0) status = 'warning';
      }
      var warnings = [];
      /* a .doc always carries the conversion warning, so the message matches the file */
      if (status === 'warning') warnings.push(product === 'eli' ? cfg.warnMsgs[/\.doc$/i.test(f.name) ? 0 : 1] : cfg.warnMsgs[hv % cfg.warnMsgs.length]);
      if (status === 'failed') warnings.push(cfg.failMsgs[hv % cfg.failMsgs.length]);
      return {
        file: f.name,
        ref: product === 'eli' ? 'RFQ-' + (10000 + hv % 89999) : 'TPN-' + (20000 + hv % 79999),
        code: status === 'failed' ? null : product === 'eli' ? String(100000 + (hv >>> 4) % 899999) : 'Template ' + String.fromCharCode(65 + hv % 4),
        status: status,
        warnings: warnings,
        outputs: status === 'failed' ? [] : cfg.outputs.map(function (o) { return base + o.suffix; })
      };
    });
  }

  function batchId(ms) {
    var d = new Date(ms);
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  function makeBatch(product, user, createdAt, files, forced) {
    var results = buildResults(product, files, forced);
    var allFailed = results.length > 0 && results.every(function (r) { return r.status === 'failed'; });
    return { id: batchId(createdAt), product: product, user: user, createdAt: createdAt, files: files, results: results, failStage: allFailed ? T.config.products[product].failStage : null };
  }

  function seed() {
    var now = Date.now();
    /* sample batches never predate the last purge, or they would vanish the moment they are seeded */
    var floor = lastPurge(now) + 60000;
    var slot = 0;
    var scale = Math.min(1, Math.max(0.02, (now - floor) / (180 * 60000)));
    function ago(min) { slot += 1; return Math.max(floor + slot * 1000, now - min * 60000 * scale); }
    function src(names) { return names.map(function (n) { return { name: n, size: 90000 + (hash(n) % 180000), role: 'source' }; }); }
    var map = { name: 'OCBC Tranche Code Mapping_1.xlsx', size: 48200, role: 'mapping' };
    return [
      makeBatch('eli', 'Priya Nair', ago(171), [map].concat(src(['TS_Kestrel_RFQ-48198.docx', 'TS_Northgate_RFQ-48201.docx'])), ['done', 'done']),
      makeBatch('eli', 'Daniel Tan', ago(142), [map].concat(src(['TS_Harbourline_RFQ-48205.doc'])), ['warning']),
      makeBatch('eli', 'Haiming Wu', ago(96), [map].concat(src(['TS_Northgate_RFQ-48208.docx', 'TS_Kestrel_RFQ-48209.docx', 'TS_Harbourline_RFQ-48211.docx'])), ['done', 'done', 'done']),
      makeBatch('eli', 'Priya Nair', ago(52), [map].concat(src(['TS_Northgate_RFQ-48213.docx', 'TS_Harbourline_RFQ-48214.docx', 'TS_Kestrel_RFQ-48217.doc'])), ['done', 'done', 'warning']),
      makeBatch('eli', 'Daniel Tan', ago(31), [map].concat(src(['TS_Northgate_RFQ-48220.docx'])), ['done']),
      makeBatch('eli', 'Haiming Wu', ago(14), [map].concat(src(['TS_Harbourline_RFQ-48226.docx', 'TS_Kestrel_RFQ-48229.docx'])), ['done', 'failed']),
      makeBatch('sn', 'Priya Nair', ago(131), src(['Note_Termsheet_E.pdf', 'Note_Termsheet_F.pdf']), ['done', 'done']),
      makeBatch('sn', 'Daniel Tan', ago(109), src(['Note_Termsheet_G_scan.pdf']), ['failed']),
      makeBatch('sn', 'Haiming Wu', ago(88), src(['Note_Termsheet_D.pdf']), ['done']),
      makeBatch('sn', 'Daniel Tan', ago(44), src(['Note_Termsheet_A.pdf', 'Note_Termsheet_B.pdf']), ['done', 'warning']),
      makeBatch('sn', 'Priya Nair', ago(26), src(['Note_Termsheet_H.docx', 'Note_Termsheet_I.docx', 'Note_Termsheet_J.pdf']), ['done', 'warning', 'done']),
      makeBatch('sn', 'Haiming Wu', ago(9), src(['Note_Termsheet_C.docx']), ['done'])
    ];
  }

  function load() {
    var now = Date.now();
    /* the demo reseeds a sample day after every purge, so it never opens empty */
    var windowKey = String(lastPurge(now));
    var all = T.store.get('batches', null);
    if (!all || T.store.get('seededOn', '') !== windowKey) { all = seed(); T.store.set('seededOn', windowKey); }
    all = all.filter(function (b) { return b.createdAt >= lastPurge(now); });
    T.store.set('batches', all);
    return all;
  }

  /* Progress is derived from elapsed time, so it survives page changes and reloads. */
  T.status = function (b, now) {
    var n = T.config.products[b.product].stages.length;
    var e = (now || Date.now()) - b.createdAt;
    var warn = b.results.filter(function (r) { return r.status === 'warning'; }).length;
    var bad = b.results.filter(function (r) { return r.status === 'failed'; }).length;
    function out(state, stage) { return { state: state, stage: stage, n: n, warn: warn, bad: bad }; }
    if (e < T.config.queueMs) return out('queued', -1);
    var idx = Math.floor((e - T.config.queueMs) / T.config.stageMs);
    if (b.failStage !== null && idx >= b.failStage) return out('failed', b.failStage);
    if (idx < n) return out('running', idx);
    return warn + bad > 0 ? out('attention', n) : out('done', n);
  };
  T.finished = function (s) { return s.state === 'done' || s.state === 'attention'; };

  /* Fraction 0..1 through the stages, for the developer progress bar. */
  T.progress = function (b, now) {
    var n = T.config.products[b.product].stages.length;
    var e = (now || Date.now()) - b.createdAt;
    var f = e < T.config.queueMs ? 0 : (e - T.config.queueMs) / T.config.stageMs;
    if (b.failStage !== null) f = Math.min(f, b.failStage);
    return Math.max(0, Math.min(1, f / n));
  };

  /* Developer view: when each stage started and ended, and an event log. */
  T.stageTimes = function (b) {
    var cfg = T.config.products[b.product];
    return cfg.stages.map(function (st, i) {
      var start = b.createdAt + T.config.queueMs + i * T.config.stageMs;
      return { stage: st, start: start, end: start + T.config.stageMs };
    });
  };
  T.eventLog = function (b, now) {
    var t = now || Date.now();
    var s = T.status(b, t);
    var log = [{ at: b.createdAt, text: 'Batch received, ' + b.files.length + ' files', kind: 'info' }];
    T.stageTimes(b).forEach(function (x, i) {
      if (x.start > t) return;
      if (s.state === 'failed' && i === s.stage) { log.push({ at: x.start, text: x.stage.short + ' failed: ' + b.results[0].warnings[0], kind: 'bad' }); return; }
      if (s.state === 'failed' && i > s.stage) return;
      log.push({ at: x.start, text: x.stage.short + ' started', kind: 'info' });
      if (x.end <= t) log.push({ at: x.end, text: x.stage.short + ' finished in ' + T.fmt.seconds(T.config.stageMs), kind: 'ok' });
    });
    if (T.finished(s)) {
      b.results.forEach(function (r) { if (r.status !== 'done') log.push({ at: b.createdAt + T.config.queueMs + s.n * T.config.stageMs, text: r.file + ': ' + r.warnings[0], kind: r.status === 'failed' ? 'bad' : 'warn' }); });
    }
    return log.reverse();
  };

  function latency(fn) {
    return new Promise(function (resolve, reject) {
      global.setTimeout(function () {
        if (T.store.get('backend', 'up') === 'down') { reject(new Error('The product service did not respond.')); return; }
        try { resolve(fn()); } catch (e) { reject(e); }
      }, 220 + Math.random() * 200);
    });
  }

  T.api = {
    list: function (product) {
      return latency(function () {
        return load().filter(function (b) { return !product || b.product === product; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
      });
    },
    create: function (product, files, user) {
      return latency(function () {
        var all = load();
        var created = Date.now();
        while (all.some(function (x) { return x.id === batchId(created); })) created += 1000;
        var b = makeBatch(product, user, created, files, null);
        all.push(b);
        T.store.set('batches', all);
        return b;
      });
    },
    templates: function () {
      return latency(function () {
        var t = T.store.get('templates', null);
        var log = T.store.get('templateLog', null);
        if (!t || !log) {
          var day = 86400000, base = Date.now() - 9 * day;
          log = [
            { name: 'ELI_Template_A.docx', when: base, by: 'Priya Nair' },
            { name: 'ELI_Template_B.docx', when: base - 12 * day, by: 'Daniel Tan' },
            { name: 'ELI_Template_C.docx', when: base - 24 * day, by: 'Priya Nair' },
            { name: 'ELI_Template_A.docx', when: base - 31 * day, by: 'Daniel Tan' },
            { name: 'ELI_Template_B.docx', when: base - 47 * day, by: 'Priya Nair' }
          ];
          t = ['ELI_Template_A.docx', 'ELI_Template_B.docx', 'ELI_Template_C.docx'].map(function (n, i) {
            var last = log.filter(function (l) { return l.name === n; })[0];
            return { name: n, updated: last.when, by: last.by, size: 31000 + i * 2700 };
          });
          T.store.set('templates', t);
          T.store.set('templateLog', log);
        }
        return { list: t, log: log };
      });
    },
    replaceTemplate: function (name, size, by) {
      return latency(function () {
        var now = Date.now();
        var t = T.store.get('templates', []);
        t.forEach(function (x) { if (x.name === name) { x.updated = now; x.by = by; x.size = size; } });
        var log = [{ name: name, when: now, by: by }].concat(T.store.get('templateLog', []));
        T.store.set('templates', t);
        T.store.set('templateLog', log);
        return { list: t, log: log };
      });
    }
  };

  T.resetSample = function () {
    ['batches', 'seededOn', 'templates', 'templateLog'].forEach(function (k) { T.store.remove(k); });
  };

  /* ---------- simulated colleagues ---------- */

  var SIM = { eli: ['TS_Northgate_RFQ-', 'TS_Kestrel_RFQ-', 'TS_Harbourline_RFQ-'], sn: ['Note_Termsheet_'] };
  T.simulateColleague = function (product) {
    var who = T.PEOPLE[Math.floor(Math.random() * 2)];
    var count = 1 + Math.floor(Math.random() * 3);
    var files = product === 'eli' ? [{ name: 'OCBC Tranche Code Mapping_1.xlsx', size: 48200, role: 'mapping' }] : [];
    for (var i = 0; i < count; i++) {
      var stem = SIM[product][Math.floor(Math.random() * SIM[product].length)];
      var name = product === 'eli'
        ? stem + (48230 + Math.floor(Math.random() * 600)) + '.docx'
        : stem + String.fromCharCode(75 + Math.floor(Math.random() * 14)) + Math.floor(Math.random() * 9) + '.pdf';
      files.push({ name: name, size: 90000 + (hash(name) % 180000), role: 'source' });
    }
    return T.api.create(product, files, who).catch(function () { return null; });
  };

  /* ---------- zip and downloads ---------- */

  var crcTable = (function () {
    var t = [], c, n, k;
    for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /* Store-only zip: enough for a few small placeholder files. */
  T.zip = function (files) {
    var enc = new TextEncoder();
    var d = new Date();
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var parts = [], central = [], offset = 0, centralSize = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      var local = new Uint8Array(30 + name.length);
      var dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true);
      dv.setUint16(10, dosTime, true); dv.setUint16(12, dosDate, true); dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, name.length, true);
      local.set(name, 30);
      var c = new Uint8Array(46 + name.length);
      var cv = new DataView(c.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
      cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      c.set(name, 46);
      parts.push(local, data); central.push(c);
      offset += local.length + data.length; centralSize += c.length;
    });
    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  };

  function save(name, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    global.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function placeholder(b, name, kind) {
    return 'Tempo UI demo placeholder\nThis is not a real ' + kind + '. The real file comes from the product backend.\n\nFile: ' + name +
      '\nBatch: ' + b.id + '\nProduct: ' + T.config.products[b.product].name + '\n';
  }
  T.downloads = {
    single: function (b, name, kind) { save(name + '.demo.txt', new Blob([placeholder(b, name, kind)], { type: 'text/plain' })); },
    uploaded: function (b) { save('uploaded_' + b.id + '.zip', T.zip(b.files.map(function (f) { return { name: f.name + '.demo.txt', data: placeholder(b, f.name, 'uploaded file') }; }))); },
    generated: function (b) {
      var list = [];
      b.results.forEach(function (r) { r.outputs.forEach(function (o) { list.push({ name: o + '.demo.txt', data: placeholder(b, o, 'generated file') }); }); });
      save('generated_' + b.id + '.zip', T.zip(list));
    }
  };

  /* ---------- upload validation (client side; the gateway and backend still enforce) ---------- */

  T.classifyFile = function (cfg, file) {
    var m = /\.[^.]+$/.exec(file.name);
    var ext = m ? m[0].toLowerCase() : '';
    if (cfg.accept.indexOf(ext) === -1 || (ext === '.xlsx' && !cfg.needsMapping)) return { error: file.name + ' is not a supported type. Use ' + cfg.acceptHint + '.' };
    if (file.size === 0) return { error: file.name + ' is empty.' };
    return { role: ext === '.xlsx' ? 'mapping' : 'source' };
  };
  T.validateFiles = function (cfg, files) {
    var problems = [];
    var sources = files.filter(function (f) { return f.role === 'source'; });
    var maps = files.filter(function (f) { return f.role === 'mapping'; });
    if (cfg.needsMapping && maps.length === 0) problems.push('Add the tranche code mapping workbook (.xlsx).');
    if (maps.length > 1) problems.push('Only one mapping workbook can go in a batch.');
    if (sources.length === 0) problems.push('Add at least one ' + cfg.sourceNoun + '.');
    return problems;
  };
})(window);
