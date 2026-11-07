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

router.post('/login', loginLimiter, (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  const ok = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok || !user.active) return res.status(401).json({ error: 'Username atau password salah' });
  res.cookie('token', sign(user), cookieOptions);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { ...cookieOptions, maxAge: undefined });
  res.json({ ok: true });
});

router.get('/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

router.post('/change-password', auth, (req, res) => {
  const oldPw = String(req.body.old_password || '');
  const newPw = String(req.body.new_password || '');
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(oldPw, row.password_hash)) return res.status(400).json({ error: 'Password lama salah' });
  if (newPw.length < 8) return res.status(400).json({ error: 'Password baru minimal 8 karakter' });
  if (newPw === oldPw) return res.status(400).json({ error: 'Password baru harus berbeda dari yang lama' });
  db.prepare('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?').run(bcrypt.hashSync(newPw, 10), req.user.id);
  res.json({ ok: true });
});

router.get('/announcements', auth, (req, res) => {
  res.json(db.prepare('SELECT id, title, body, created_at FROM announcements ORDER BY id DESC LIMIT 20').all());
});

module.exports = router;
