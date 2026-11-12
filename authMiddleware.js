const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('./db');

const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

// Rahasia untuk menandatangani token login.
// Urutan: JWT_SECRET -> turunan dari TURSO_AUTH_TOKEN -> (hanya lokal) nilai bawaan.
// Di produksi, nilai bawaan yang diketahui publik TIDAK PERNAH dipakai.
function resolveSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  if (process.env.TURSO_AUTH_TOKEN) {
    console.warn(
      '[PERINGATAN] JWT_SECRET belum diatur. Sementara dipakai rahasia turunan dari TURSO_AUTH_TOKEN. ' +
      'Atur JWT_SECRET (string acak panjang) di .env / Environment Variables Vercel.'
    );
    return crypto
      .createHash('sha256')
      .update('siakad-jwt-v1:' + process.env.TURSO_AUTH_TOKEN)
      .digest('hex');
  }

  if (IS_PROD) {
    throw new Error('JWT_SECRET wajib diatur di Environment Variables.');
  }

  console.warn('[PERINGATAN] JWT_SECRET belum diatur di .env, memakai nilai bawaan (hanya untuk lokal).');
  return 'dev-secret-hanya-untuk-lokal-12345';
}

const SECRET = resolveSecret();

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 8 * 60 * 60 * 1000
};

function sign(user) {
  return jwt.sign({ id: user.id }, SECRET, { expiresIn: '8h', algorithm: 'HS256' });
}

// Akun yang wajib ganti password hanya boleh memakai tiga endpoint ini
const MUST_CHANGE_ALLOWED = new Set(['/api/me', '/api/logout', '/api/change-password']);

// Cek login. Mengisi req.user = { id, username, name, role, active, must_change }
async function auth(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Belum login' });

  let payload;
  try {
    payload = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
  } catch (e) {
    return res.status(401).json({ error: 'Sesi berakhir, silakan login lagi' });
  }

  try {
    await db.ready; // pastikan tabel sudah siap (penting di Turso/Vercel)
    const user = await db.prepare(
      'SELECT id, username, name, role, active, must_change FROM users WHERE id = ?'
    ).get(payload.id);

    // active NULL dianggap aktif. Tolak hanya jika active === 0
    if (!user || Number(user.active) === 0) {
      return res.status(401).json({ error: 'Akun tidak aktif' });
    }

    // Paksa ganti password di sisi server (bukan hanya disembunyikan di tampilan)
    if (Number(user.must_change) === 1) {
      const path = String(req.originalUrl || '').split('?')[0];
      if (!MUST_CHANGE_ALLOWED.has(path)) {
        return res.status(403).json({
          error: 'Anda harus mengganti password terlebih dahulu.',
          must_change: true
        });
      }
    }

    req.user = user;
    next();
  } catch (e) {
    // Kegagalan database BUKAN berarti sesi berakhir: jangan membuat pengguna ter-logout
    console.error('Auth: database error:', e && e.message);
    return res.status(503).json({ error: 'Layanan sedang sibuk, coba lagi sebentar.' });
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