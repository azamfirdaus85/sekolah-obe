const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { sign, auth, cookieOptions } = require('../authMiddleware');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi 15 menit lagi.' }
});

// Hash palsu supaya waktu respons sama baik username ada maupun tidak
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  name: u.name,
  role: u.role,
  must_change: !!Number(u.must_change)
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    await db.ready;
    const body = req.body || {};
    const username = String(body.username || '').trim().slice(0, 100);
    const password = String(body.password || '').slice(0, 200);

    // Ambil kolom yang dibutuhkan saja (jangan SELECT * karena ada foto profil berukuran besar)
    const user = await db.prepare(
      'SELECT id, username, name, role, active, must_change, password_hash FROM users WHERE username = ?'
    ).get(username);

    // bcrypt versi async supaya server tidak macet saat banyak orang login bersamaan
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

    // active NULL dianggap aktif. Cuma blokir kalau active === 0
    if (!user || !ok || Number(user.active) === 0) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    res.cookie('token', sign(user), cookieOptions);
    res.json({ user: publicUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login gagal' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { ...cookieOptions, maxAge: undefined });
  res.json({ ok: true });
});

router.get('/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

router.post('/change-password', auth, async (req, res) => {
  try {
    const body = req.body || {};
    const oldPw = String(body.old_password || '');
    const newPw = String(body.new_password || '');

    const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!row || !(await bcrypt.compare(oldPw, row.password_hash))) {
      return res.status(400).json({ error: 'Password lama salah' });
    }
    if (newPw.length < 8) return res.status(400).json({ error: 'Password baru minimal 8 karakter' });
    if (newPw.length > 72) return res.status(400).json({ error: 'Password baru maksimal 72 karakter' });
    if (newPw === oldPw) return res.status(400).json({ error: 'Password baru harus berbeda dari yang lama' });

    await db.prepare('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?')
      .run(await bcrypt.hash(newPw, 10), req.user.id);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal ganti password' });
  }
});

router.get('/announcements', auth, async (req, res) => {
  try {
    res.json(await db.prepare(
      'SELECT id, title, body, created_at FROM announcements ORDER BY id DESC LIMIT 20'
    ).all());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal ambil pengumuman' });
  }
});

module.exports = router;