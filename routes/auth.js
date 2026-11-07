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

// Helper biar jalan di Turso (async) & Lokal (sync)
async function qGet(sql, args = []) {
  if (db.isTurso) {
    const r = await db.client.execute({ sql, args });
    return r.rows[0];
  }
  return db.prepare(sql).get(...args);
}
async function qAll(sql, args = []) {
  if (db.isTurso) {
    const r = await db.client.execute({ sql, args });
    return r.rows;
  }
  return db.prepare(sql).all(...args);
}
async function qRun(sql, args = []) {
  if (db.isTurso) {
    const r = await db.client.execute({ sql, args });
    return { lastInsertRowid: r.lastInsertRowId ? Number(r.lastInsertRowId) : 0, changes: r.rowsAffected || 0 };
  }
  return db.prepare(sql).run(...args);
}

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const user = await qGet('SELECT * FROM users WHERE username = ?', [username]);
    const ok = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH);
    // FIX: active NULL dianggap aktif. Cuma blokir kalau active === 0
    if (!user || !ok || user.active === 0) return res.status(401).json({ error: 'Username atau password salah' });
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
    const row = await qGet('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!row || !bcrypt.compareSync(oldPw, row.password_hash)) return res.status(400).json({ error: 'Password lama salah' });
    if (newPw.length < 8) return res.status(400).json({ error: 'Password baru minimal 8 karakter' });
    if (newPw === oldPw) return res.status(400).json({ error: 'Password baru harus berbeda dari yang lama' });
    await qRun('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?', [bcrypt.hashSync(newPw, 10), req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal ganti password' });
  }
});

router.get('/announcements', auth, async (req, res) => {
  try {
    res.json(await qAll('SELECT id, title, body, created_at FROM announcements ORDER BY id DESC LIMIT 20'));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal ambil pengumuman' });
  }
});

module.exports = router;