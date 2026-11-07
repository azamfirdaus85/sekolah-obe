const jwt = require('jsonwebtoken');
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

// INI YANG DIBENERIN: tambahin async + await
async function auth(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Belum login' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = await db
      .prepare('SELECT id, username, name, role, active, must_change FROM users WHERE id = ?')
      .get(payload.id);
    if (!user || !user.active) return res.status(401).json({ error: 'Akun tidak aktif' });
    req.user = user;
    next();
  } catch (e) {
    console.log('Auth gagal:', e.message);
    return res.status(401).json({ error: 'Sesi berakhir, silakan login lagi' });
  }
}

function role(...roles) {
  return (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Akses ditolak' });
}

module.exports = { sign, auth, role, cookieOptions };