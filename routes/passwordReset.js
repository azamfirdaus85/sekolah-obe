const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const db = require('../db');
const { auth, role } = require('../authMiddleware');

const router = express.Router();

const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Terlalu banyak permintaan. Coba lagi dalam 15 menit.'
  }
});

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;

  if (db.ready) {
    await db.ready;
  }

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      handled_at TEXT,
      handled_by INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run();

  tableReady = true;
}

// Pengguna mengajukan reset password
router.post('/request', requestLimiter, async (req, res) => {
  try {
    await ensureTable();

    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!username || !email) {
      return res.status(400).json({
        success: false,
        message: 'Username dan email wajib diisi.'
      });
    }

    const user = await db.prepare(`
      SELECT id
      FROM users
      WHERE LOWER(TRIM(username)) = LOWER(TRIM(?))
        AND LOWER(TRIM(email)) = ?
        AND (active IS NULL OR active = 1)
      LIMIT 1
    `).get(username, email);

    // Pesan dibuat sama agar informasi akun tidak mudah ditebak.
    if (!user) {
      return res.json({
        success: true,
        message: 'Jika data cocok, permintaan reset akan diteruskan ke admin.'
      });
    }

    const existing = await db.prepare(`
      SELECT id
      FROM password_reset_requests
      WHERE user_id = ?
        AND status = 'pending'
      LIMIT 1
    `).get(user.id);

    if (!existing) {
      await db.prepare(`
        INSERT INTO password_reset_requests (user_id)
        VALUES (?)
      `).run(user.id);
    }

    return res.json({
      success: true,
      message: 'Jika data cocok, permintaan reset akan diteruskan ke admin.'
    });

  } catch (err) {
    console.error('Password reset request:', err);

    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server.'
    });
  }
});

// Admin melihat permintaan reset
router.get('/admin/requests', auth, role('admin'), async (req, res) => {
  try {
    await ensureTable();

    const rows = await db.prepare(`
      SELECT
        pr.id,
        pr.user_id,
        pr.status,
        pr.created_at,
        u.username,
        u.name,
        u.email,
        u.role
      FROM password_reset_requests pr
      JOIN users u ON u.id = pr.user_id
      WHERE pr.status = 'pending'
      ORDER BY pr.created_at ASC
    `).all();

    return res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error('Get reset requests:', err);

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil permintaan reset.'
    });
  }
});

// Admin menyetujui permintaan
router.post('/admin/:id/approve', auth, role('admin'), async (req, res) => {
  try {
    await ensureTable();

    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID permintaan tidak valid.'
      });
    }

    const request = await db.prepare(`
      SELECT *
      FROM password_reset_requests
      WHERE id = ?
        AND status = 'pending'
    `).get(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Permintaan tidak ditemukan atau sudah diproses.'
      });
    }

    const temporaryPassword = crypto
      .randomBytes(12)
      .toString('base64url');

    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    // Satu transaksi: password hanya diganti kalau permintaan ini MASIH pending.
    // Klik ganda tidak akan menimpa password sementara yang sudah ditampilkan.
    const result = await db.batch([
      [
        `UPDATE users
         SET password_hash = ?,
             must_change = 1
         WHERE id = ?
           AND EXISTS (
             SELECT 1 FROM password_reset_requests
             WHERE id = ? AND status = 'pending'
           )`,
        [passwordHash, request.user_id, id]
      ],
      [
        `UPDATE password_reset_requests
         SET status = 'approved',
             handled_at = CURRENT_TIMESTAMP,
             handled_by = ?
         WHERE id = ? AND status = 'pending'`,
        [req.user.id, id]
      ]
    ]);

    if (!result[1].changes) {
      return res.status(404).json({
        success: false,
        message: 'Permintaan tidak ditemukan atau sudah diproses.'
      });
    }

    return res.json({
      success: true,
      message: 'Permintaan berhasil disetujui.',
      temporaryPassword
    });

  } catch (err) {
    console.error('Approve reset:', err);

    return res.status(500).json({
      success: false,
      message: 'Gagal menyetujui permintaan reset.'
    });
  }
});

// Admin menolak permintaan
router.post('/admin/:id/reject', auth, role('admin'), async (req, res) => {
  try {
    await ensureTable();

    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID permintaan tidak valid.'
      });
    }

    const result = await db.prepare(`
      UPDATE password_reset_requests
      SET status = 'rejected',
          handled_at = CURRENT_TIMESTAMP,
          handled_by = ?
      WHERE id = ?
        AND status = 'pending'
    `).run(req.user.id, id);

    if (!result.changes) {
      return res.status(404).json({
        success: false,
        message: 'Permintaan tidak ditemukan atau sudah diproses.'
      });
    }

    return res.json({
      success: true,
      message: 'Permintaan berhasil ditolak.'
    });

  } catch (err) {
    console.error('Reject reset:', err);

    return res.status(500).json({
      success: false,
      message: 'Gagal menolak permintaan reset.'
    });
  }
});

module.exports = router;