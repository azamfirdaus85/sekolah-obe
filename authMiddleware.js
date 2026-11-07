const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');

let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[PERINGATAN] JWT_SECRET belum diatur di .env. Memakai kunci acak sementara; semua sesi login akan hilang saat server restart.');
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 8 * 60 * 60 * 1000
};

function sign(user) {
  return jwt.sign({ id: user.id }, SECRET, { expiresIn: '8h' });
}

function auth(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Belum login' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = db
      .prepare('SELECT id, username, name, role, active, must_change FROM users WHERE id = ?')
      .get(payload.id);
    if (!user || !user.active) return res.status(401).json({ error: 'Akun tidak aktif' });
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
