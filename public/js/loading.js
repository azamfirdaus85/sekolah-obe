/* =====================================================
   LOADING ANIMASI SIAKAD OBE
   File mandiri: tidak mengubah app.js sama sekali.
   - Layar pembuka (splash) saat aplikasi pertama dibuka
   - Garis emas tipis di atas layar tiap kali data dimuat
   - Kartu "Memuat..." di tengah jika proses lebih dari 0,12 detik
   ===================================================== */
(function () {
  'use strict';

  if (window.__siakadLoading) return;
  window.__siakadLoading = true;

  // Panggilan latar belakang yang tidak perlu menampilkan loading
  var IGNORE = /\/api\/(notif|search|dashboard\/kunjungan)/;

  // Lama minimal tampil (ms), supaya tetap terlihat walau server lokal sangat cepat
  var MIN_BOOT = 800;
  var MIN_BAR = 450;
  var MIN_CARD = 400;
  var CARD_DELAY = 120;

  var CSS = '' +
    '#ld-bar{position:fixed;top:0;left:0;right:0;height:3px;z-index:10000;pointer-events:none;opacity:0}' +
    '#ld-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#b8902a,#f3d97a,#d4af37);box-shadow:0 0 8px rgba(212,175,55,.7);border-radius:0 3px 3px 0}' +
    '#ld-bar.run{opacity:1}' +
    '#ld-bar.run i{width:85%;transition:width 8s cubic-bezier(.1,.7,.2,1)}' +
    '#ld-bar.done{opacity:0;transition:opacity .35s ease .15s}' +
    '#ld-bar.done i{width:100%;transition:width .2s ease}' +

    '#ld-card{position:fixed;left:50%;top:38%;z-index:9998;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:12px;' +
    'padding:20px 28px;border-radius:18px;background:rgba(255,253,246,.96);border:1px solid #efe3bd;box-shadow:0 12px 36px rgba(60,45,10,.18);' +
    'color:#5b5240;font:600 .85rem system-ui,-apple-system,"Segoe UI",sans-serif;' +
    'opacity:0;transform:translate(-50%,-8px) scale(.96);transition:opacity .2s ease,transform .2s ease;visibility:hidden}' +
    '#ld-card.show{opacity:1;transform:translate(-50%,0) scale(1);visibility:visible}' +

    '.ld-ring{width:38px;height:38px;border-radius:50%;border:4px solid #f1e6c2;border-top-color:#d4af37;animation:ld-spin .8s linear infinite}' +
    '.ld-dots{display:inline-flex;gap:3px;margin-left:2px}' +
    '.ld-dots b{width:4px;height:4px;border-radius:50%;background:#d4af37;animation:ld-bounce 1.1s ease-in-out infinite}' +
    '.ld-dots b:nth-child(2){animation-delay:.15s}.ld-dots b:nth-child(3){animation-delay:.3s}' +

    '#ld-boot{position:fixed;inset:0;z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;' +
    'background:#fdf8ec;color:#3b2f10;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;transition:opacity .3s ease}' +
    '#ld-boot.out{opacity:0;pointer-events:none}' +
    '#ld-boot .mk{position:relative;width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#e7c658,#b8902a);color:#fff;font-weight:800;font-size:32px;display:grid;place-items:center;box-shadow:0 8px 24px rgba(184,144,42,.35)}' +
    '#ld-boot .mk:after{content:"";position:absolute;inset:-9px;border-radius:50%;border:3px solid transparent;border-top-color:#d4af37;border-right-color:#e9d58f;animation:ld-spin 1s linear infinite}' +
    '#ld-boot h1{margin:0;font-size:1.25rem;font-weight:800;letter-spacing:.01em}' +
    '#ld-boot p{margin:0;color:#8a7d5c;font-size:.82rem;display:flex;align-items:center}' +

    '[data-theme="dark"] #ld-boot{background:#0b1120;color:#f1f5f9}' +
    '[data-theme="dark"] #ld-boot p{color:#94a3b8}' +
    '[data-theme="dark"] #ld-card{background:rgba(17,24,39,.96);border-color:#334155;color:#cbd5e1;box-shadow:0 12px 36px rgba(0,0,0,.5)}' +
    '[data-theme="dark"] .ld-ring{border-color:#334155;border-top-color:#d4af37}' +

    '@keyframes ld-spin{to{transform:rotate(360deg)}}' +
    '@keyframes ld-bounce{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-4px);opacity:1}}' +
    '@media (prefers-reduced-motion:reduce){.ld-ring,#ld-boot .mk:after{animation-duration:2.4s}.ld-dots b{animation:none;opacity:.8}}';

  var root = document.documentElement;
  var pending = 0;
  var booting = true;
  var showTimer = null;
  var doneTimer = null;
  var bar, card, boot;
  var t0 = Date.now();
  var shownAt = 0;
  var barAt = 0;

  function el(tag, id, html) {
    var e = document.createElement(tag);
    if (id) e.id = id;
    if (html) e.innerHTML = html;
    root.appendChild(e);
    return e;
  }

  try {
    var st = document.createElement('style');
    st.textContent = CSS;
    (document.head || root).appendChild(st);

    bar = el('div', 'ld-bar', '<i></i>');
    card = el('div', 'ld-card', '<div class="ld-ring"></div><span>Memuat<span class="ld-dots"><b></b><b></b><b></b></span></span>');
    boot = el('div', 'ld-boot',
      '<div class="mk">S</div><h1>SIAKAD OBE</h1><p>Memuat aplikasi<span class="ld-dots"><b></b><b></b><b></b></span></p>');
    boot.setAttribute('role', 'status');
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
  } catch (e) {
    return; // loading hanya pemanis, jangan sampai mengganggu aplikasi
  }

  function hideBoot() {
    if (!booting) return;
    var wait = MIN_BOOT - (Date.now() - t0);
    if (wait > 0) { setTimeout(hideBoot, wait); return; }
    booting = false;
    boot.classList.add('out');
    setTimeout(function () { if (boot && boot.parentNode) boot.parentNode.removeChild(boot); }, 400);
  }

  function startBar() {
    bar.className = '';
    void bar.offsetWidth; // ulangi animasi dari awal
    bar.className = 'run';
    barAt = Date.now();
  }

  function begin() {
    pending++;
    clearTimeout(doneTimer);
    if (pending === 1) {
      startBar();
      clearTimeout(showTimer);
      showTimer = setTimeout(function () {
        if (pending > 0 && !booting) { card.classList.add('show'); shownAt = Date.now(); }
      }, CARD_DELAY);
    }
  }

  function settle() {
    if (pending > 0) return;
    var now = Date.now();
    var wait = MIN_BAR - (now - barAt);
    if (card.classList.contains('show')) wait = Math.max(wait, MIN_CARD - (now - shownAt));
    if (wait > 0) { doneTimer = setTimeout(settle, wait); return; }
    clearTimeout(showTimer);
    card.classList.remove('show');
    bar.className = 'done';
    hideBoot();
  }

  function end() {
    pending = Math.max(0, pending - 1);
    if (pending > 0) return;
    // jeda singkat: banyak halaman memanggil beberapa API berurutan
    clearTimeout(doneTimer);
    doneTimer = setTimeout(settle, 120);
  }

  var origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (IGNORE.test(url)) return origFetch.apply(this, arguments);
      begin();
      var p = origFetch.apply(this, arguments);
      p.then(end, end);
      return p;
    };
  }

  // Pengaman: layar pembuka tidak boleh menutup aplikasi selamanya
  setTimeout(hideBoot, 10000);
  window.addEventListener('load', function () {
    setTimeout(function () { if (pending === 0) hideBoot(); }, 1500);
  });
})();