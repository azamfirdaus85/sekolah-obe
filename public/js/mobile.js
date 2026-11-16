/* =====================================================
   TAMPILAN HP - SIAKAD OBE
   File mandiri, tidak mengubah app.js maupun style.css.
   - Tabel yang lebih lebar dari layar otomatis bisa digeser ke samping,
     lengkap dengan petunjuk "Geser ke samping"
   - Menu samping bisa di-scroll sampai item terakhir
   - Form, tab, kartu, dan jendela pop-up menyesuaikan lebar layar HP
   ===================================================== */
(function () {
  'use strict';

  if (window.__siakadMobile) return;
  window.__siakadMobile = true;

  var CSS = '' +
    /* ---------- berlaku di semua ukuran layar ---------- */
    'html{-webkit-text-size-adjust:100%}' +
    '.main,.content{min-width:0;max-width:100%}' +
    'img,svg,video,canvas{max-width:100%;height:auto}' +
    'input,select,textarea{max-width:100%}' +
    'pre{max-width:100%;overflow-x:auto}' +
    '.tscroll,.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%}' +
    '.side{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}' +
    '.tscroll-hint{display:flex;align-items:center;gap:.35rem;margin:.15rem 0 .4rem;font-size:.72rem;font-weight:600;color:#8a7d5c}' +
    '.tscroll-hint[hidden]{display:none}' +
    '.tscroll-hint i{font-style:normal;display:inline-block;animation:ms-nudge 1.3s ease-in-out infinite}' +
    '[data-theme="dark"] .tscroll-hint{color:#94a3b8}' +
    '@keyframes ms-nudge{0%,100%{transform:translateX(0)}50%{transform:translateX(6px)}}' +
    '@media (prefers-reduced-motion:reduce){.tscroll-hint i{animation:none}}' +

    /* ---------- khusus layar HP / tablet kecil ---------- */
    '@media (max-width:768px){' +
      '.content{padding-bottom:calc(28px + env(safe-area-inset-bottom))}' +
      '.side{max-height:100vh;max-height:100dvh;padding-bottom:7rem}' +
      '.top{flex-wrap:wrap;row-gap:.45rem}' +
      '.top .gsearch{order:10;flex:1 1 100%;max-width:none}' +
      '.form.inline{flex-wrap:wrap}' +
      '.form.inline .field{flex:1 1 100%;min-width:0}' +
      '.grid2{grid-template-columns:minmax(0,1fr) !important}' +
      '.tabs{display:flex;flex-wrap:nowrap;overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch}' +
      '.tabs>*{flex:0 0 auto}' +
      '.actions{flex-wrap:wrap}' +
      '.modal{width:calc(100vw - 24px) !important;max-width:none !important;max-height:88vh;max-height:88dvh;overflow:auto}' +
      '.tscroll>table.tw,.table-wrap>table.tw{min-width:560px}' +
    '}';

  try {
    var st = document.createElement('style');
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  } catch (e) { return; }

  var HINT = '<i>&#8596;</i> Geser ke samping untuk melihat semua kolom';
  var raf = 0;

  function refresh(w) {
    var over = w.scrollWidth > w.clientWidth + 4;
    w.classList.toggle('can-scroll', over);
    if (w._hint) w._hint.hidden = !over || !!w._seen;
  }

  function prepare(t) {
    // Rapor yang dicetak punya tata letak sendiri
    if (t.closest('#raporView')) return;

    var p = t.parentElement;
    if (!p) return;

    var w;
    if (p.classList.contains('tscroll') || p.classList.contains('table-wrap')) {
      w = p;
    } else {
      w = document.createElement('div');
      w.className = 'tscroll';
      p.insertBefore(w, t);
      w.appendChild(t);
    }

    var cols = t.rows && t.rows[0] ? t.rows[0].cells.length : 0;
    t.classList.toggle('tw', cols >= 4);

    if (!w._hint) {
      var h = document.createElement('div');
      h.className = 'tscroll-hint';
      h.innerHTML = HINT;
      h.hidden = true;
      w.parentNode.insertBefore(h, w);
      w._hint = h;
      w.addEventListener('scroll', function () {
        if (!w._seen && w.scrollLeft > 8) {
          w._seen = true;
          if (w._hint) w._hint.hidden = true;
        }
      }, { passive: true });
    }

    refresh(w);
  }

  function scan() {
    raf = 0;
    var tables = document.querySelectorAll('table');
    for (var i = 0; i < tables.length; i++) prepare(tables[i]);
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(scan);
  }

  function refreshAll() {
    var ws = document.querySelectorAll('.tscroll, .table-wrap');
    for (var i = 0; i < ws.length; i++) refresh(ws[i]);
  }

  function start() {
    scan();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', refreshAll);
    window.addEventListener('orientationchange', function () { setTimeout(refreshAll, 250); });
    window.addEventListener('load', function () { setTimeout(refreshAll, 300); });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();