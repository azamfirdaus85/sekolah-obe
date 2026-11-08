const jwt = require('jsonwebtoken');
const db = require('./db');

let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  SECRET = 'dev-secret-jangan-dipakai-produksi-12345';
  console.warn('[PERINGATAN] JWT_SECRET belum diatur di .env / Environment Variables Vercel');
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

// Cek login. Mengisi req.user = { id, username, name, role, active, must_change }
async function auth(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Belum login' });
  try {
    const payload = jwt.verify(token, SECRET);
    await db.ready; // pastikan tabel sudah siap (penting di Turso/Vercel)
    const user = await db.prepare(
      'SELECT id, username, name, role, active, must_change FROM users WHERE id = ?'
    ).get(payload.id);
    // active NULL dianggap aktif. Tolak hanya jika active === 0
    if (!user || user.active === 0) return res.status(401).json({ error: 'Akun tidak aktif' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesi berakhir, silakan login lagi' });
  }
}

// Batasi akses berdasarkan role. Contoh: router.use(auth, role('guru'))
function role(...roles) {
  return (req, res, next) =>
    req.user && roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ error: 'Akses ditolak' });
}

module.exports = { sign, auth, role, cookieOptions };