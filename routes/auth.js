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

const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);
const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, must_change: !!u.must_change });

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    const ok = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok || !user.active) return res.status(401).json({ error: 'Username atau password salah' });
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
    const oldPw = String(req.body.old_password || '');
    const newPw = String(req.body.new_password || '');
    const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!row || !bcrypt.compareSync(oldPw, row.password_hash)) return res.status(400).json({ error: 'Password lama salah' });
    if (newPw.length < 8) return res.status(400).json({ error: 'Password baru minimal 8 karakter' });
    if (newPw === oldPw) return res.status(400).json({ error: 'Password baru harus berbeda dari yang lama' });
    await db.prepare('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?').run(bcrypt.hashSync(newPw, 10), req.user.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal ganti password' });
  }
});

router.get('/announcements', auth, async (req, res) => {
  try {
    res.json(await db.prepare('SELECT id, title, body, created_at FROM announcements ORDER BY id DESC LIMIT 20').all());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal ambil pengumuman' });
  }
});

module.exports = router;