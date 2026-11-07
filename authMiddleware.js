const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');

let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  SECRET = 'dev-secret-jangan-dipakai-produksi-12345';
  console.warn('[PERINGATAN] JWT_SECRET belum diatur di .env');
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 8 * 60 * 60 * 1000
};

function sign(user) {
  return jwt.sign({ id: user.id }, SECRET, { expiresIn: '8h' });
}

async function auth(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Belum login' });
  try {
    const payload = jwt.verify(token, SECRET);
    let user;
    if (db.isTurso) {
      const r = await db.client.execute({
        sql: 'SELECT id, username, name, role, active, must_change FROM users WHERE id = ?',
        args: [payload.id]
      });
      user = r.rows[0];
    } else {
      user = db.prepare('SELECT id, username, name, role, active, must_change FROM users WHERE id = ?').get(payload.id);
    }
    // FIX: active NULL = aktif. Cuma tolak kalau active === 0
    if (!user || user.active === 0) return res.status(401).json({ error: 'Akun tidak aktif' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesi berakhir, silakan login lagi' });
  }
}

function role(...roles) {
  return (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Akses ditolak' });
}

module.exports = { sign, auth, role, cookieOptions };