/* PWA + Mode Gelap untuk SIAKAD OBE
   File ini berdiri sendiri: tidak mengubah app.js.
   - Menyisipkan tombol tema (🌙/☀️) ke header setiap kali halaman digambar ulang.
   - Menyisipkan tombol "Pasang Aplikasi" bila browser mendukung.
   - Mendaftarkan service worker. */
(function () {
  'use strict';

  var KEY = 'siakad-theme';
  var root = document.documentElement;

  /* ---------- Tema ---------- */
  function savedTheme() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function currentTheme() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function applyTheme(theme, persist) {
    root.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b1120' : '#f6e3a8');
    if (persist) { try { localStorage.setItem(KEY, theme); } catch (e) {} }
    paintButtons();
  }
  function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  }

  // Ikuti pengaturan sistem selama pengguna belum memilih sendiri
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onSys = function (e) { if (!savedTheme()) applyTheme(e.matches ? 'dark' : 'light', false); };
    if (mq.addEventListener) mq.addEventListener('change', onSys);
    else if (mq.addListener) mq.addListener(onSys);
  }

  /* ---------- Tombol ---------- */
  function paintButtons() {
    var dark = currentTheme() === 'dark';
    document.querySelectorAll('[data-theme-btn]').forEach(function (b) {
      b.textContent = dark ? '☀️' : '🌙';
      b.title = dark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap';
      b.setAttribute('aria-label', b.title);
    });
  }

  function makeThemeBtn(floating) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-theme-btn', '1');
    b.id = floating ? 'themeFab' : 'themeBtn';
    b.className = floating ? 'theme-fab' : 'btn sm ghost';
    return b;
  }

  var deferredPrompt = null;

  function isStandalone() {
    return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  function makeInstallBtn(help) {
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'installBtn';
    if (help) b.setAttribute('data-help', '1');
    b.className = 'btn sm ghost';
    b.textContent = '📲 Pasang Aplikasi';
    return b;
  }

  // Cadangan: bila Chrome tidak memunculkan dialog pasang otomatis, tampilkan panduan manual
  function showInstallHelp() {
    var msg = isIOS
      ? 'Di iPhone/iPad (Safari):\n1. Ketuk tombol Bagikan (kotak dengan panah ke atas).\n2. Pilih "Tambah ke Layar Utama".\n3. Ketuk "Tambah".'
      : 'Di Android (Chrome):\n1. Ketuk menu ⋮ di pojok kanan atas.\n2. Pilih "Instal aplikasi" atau "Tambahkan ke layar utama".\n3. Ketuk "Instal".\n\nPastikan dibuka lewat Chrome, bukan browser di dalam WhatsApp/Instagram.';
    alert(msg);
  }

  function ensure() {
    var top = document.querySelector('header.top');
    var fab = document.getElementById('themeFab');

    if (top) {
      if (fab) fab.remove();
      if (!document.getElementById('themeBtn')) {
        var tb = makeThemeBtn(false);
        var who = top.querySelector('.who');
        if (who && who.nextSibling) top.insertBefore(tb, who.nextSibling);
        else top.appendChild(tb);
      }
      var ib = document.getElementById('installBtn');
      var wantHelp = !deferredPrompt && isMobile && !isStandalone();
      if (ib && ib.getAttribute('data-help') && !wantHelp) { ib.remove(); ib = null; }
      if ((deferredPrompt || wantHelp) && !ib) {
        var nb = makeInstallBtn(!deferredPrompt);
        var t = document.getElementById('themeBtn');
        if (t && t.nextSibling) top.insertBefore(nb, t.nextSibling);
        else top.appendChild(nb);
      } else if (!deferredPrompt && !wantHelp && ib) {
        ib.remove();
      }
    } else {
      // Halaman login: tombol melayang di pojok
      var old = document.getElementById('themeBtn');
      if (old) old.remove();
      var oi = document.getElementById('installBtn');
      if (oi) oi.remove();
      if (!fab && document.body) document.body.appendChild(makeThemeBtn(true));
    }
    paintButtons();
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; ensure(); });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-theme-btn]');
    if (t) { e.preventDefault(); toggleTheme(); return; }

    var i = e.target.closest && e.target.closest('#installBtn');
    if (i && !deferredPrompt) { e.preventDefault(); showInstallHelp(); return; }
    if (i && deferredPrompt) {
      e.preventDefault();
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () { deferredPrompt = null; schedule(); });
    }
  });

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    schedule();
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    schedule();
  });

  var appEl = document.getElementById('app');
  if (appEl) new MutationObserver(schedule).observe(appEl, { childList: true, subtree: true });
  ensure();

  /* ---------- Service Worker ---------- */
  if ('serviceWorker' in navigator) {
    var secure = location.protocol === 'https:' || location.hostname === 'localhost';
    if (secure) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').then(function (reg) {
          document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') reg.update().catch(function () {});
          });
        }).catch(function (err) { console.warn('Service worker gagal:', err); });
      });
    }
  }
})();