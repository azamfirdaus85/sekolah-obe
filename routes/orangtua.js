// Portal orang tua / wali.
// Semua alamat yang memuat :sid hanya bisa dibuka kalau anak tersebut memang
// terhubung dengan akun orang tua yang sedang login (tabel parent_student_links).
// Perizinan anak ada di routes/izin.js (alamat /api/izin/anak/:sid).
const router = require('express').Router();
const db = require('../db');
const { auth, role } = require('../authMiddleware');
const { buildReport } = require('../rapor');
const { buildStudentReport } = require('../laporan');

router.use(auth, role('orang_tua'));

const bad = (res, msg) => res.status(400).json({ error: msg });
const clip = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const fail = (res, e, msg = 'Terjadi kesalahan pada server.') => {
  console.error(e);
  return res.status(500).json({ error: msg });
};

// Batas aman untuk Vercel (isi permintaan maksimal ~4,5 MB, base64 menambah sepertiga)
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function validImageDataUrl(value) {
  if (typeof value !== 'string') return false;

  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return false;

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return false;

  const type = match[1];
  if (type === 'jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (type === 'png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === 'webp') {
    return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

// Pagar akses: anak harus milik akun ini. Hasilnya tersedia di req.child
router.param('sid', async (req, res, next, sid) => {
  try {
    const id = Number(sid);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ error: 'Data anak tidak ditemukan' });
    }

    const child = await db.prepare(`
      SELECT s.id, s.user_id, s.nis, s.class_id, u.name, c.name AS class_name, l.relationship
      FROM parent_student_links l
      JOIN students s ON s.id = l.student_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN classes c ON c.id = s.class_id
      WHERE l.parent_user_id = ? AND s.id = ?
    `).get(req.user.id, id);

    if (!child) return res.status(404).json({ error: 'Data anak tidak ditemukan' });

    req.child = child;
    next();
  } catch (e) {
    return fail(res, e);
  }
});

// Daftar anak yang terhubung dengan akun ini
router.get('/anak', async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT s.id AS student_id, u.name, s.nis, s.class_id, c.name AS class_name, l.relationship
      FROM parent_student_links l
      JOIN students s ON s.id = l.student_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN classes c ON c.id = s.class_id
      WHERE l.parent_user_id = ?
      ORDER BY u.name
    `).all(req.user.id);

    res.json(rows);
  } catch (e) {
    return fail(res, e, 'Gagal memuat data anak');
  }
});

// Nilai & capaian per mata pelajaran (bentuk sama dengan halaman siswa)
router.get('/anak/:sid/nilai', async (req, res) => {
  try {
    const c = req.child;
    res.json(await buildStudentReport({
      id: c.id,
      nis: c.nis,
      class_id: c.class_id,
      class_name: c.class_name
    }));
  } catch (e) {
    return fail(res, e, 'Gagal memuat nilai');
  }
});

// E-Rapor anak (untuk dicetak)
router.get('/anak/:sid/rapor', async (req, res) => {
  try {
    const semester = req.query.semester ? String(req.query.semester).slice(0, 40) : null;
    const d = await buildReport(Number(req.child.user_id), semester);
    if (!d) return res.status(404).json({ error: 'Data siswa tidak ditemukan' });
    res.json(d);
  } catch (e) {
    return fail(res, e, 'Gagal memuat rapor');
  }
});

// Kehadiran: rekap + riwayat 200 catatan terakhir
router.get('/anak/:sid/kehadiran', async (req, res) => {
  try {
    const c = req.child;

    const counts = await db.prepare(`
      SELECT status, COUNT(*) AS n
      FROM student_attendance
      WHERE student_id = ?
      GROUP BY status
    `).all(c.id);

    const summary = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
    for (const r of counts) {
      if (r.status in summary) summary[r.status] = Number(r.n);
    }

    const rows = await db.prepare(`
      SELECT a.date, a.status, a.note, s.name AS subject_name
      FROM student_attendance a
      JOIN teaching t ON t.id = a.teaching_id
      JOIN subjects s ON s.id = t.subject_id
      WHERE a.student_id = ?
      ORDER BY a.date DESC, a.id DESC
      LIMIT 200
    `).all(c.id);

    res.json({ nis: c.nis, summary, rows });
  } catch (e) {
    return fail(res, e, 'Gagal memuat kehadiran');
  }
});

// Tagihan SPP anak
router.get('/anak/:sid/tagihan', async (req, res) => {
  try {
    const c = req.child;

    const rows = await db.prepare(`
      SELECT
        i.*,
        COALESCE((SELECT SUM(p.amount) FROM spp_payments p WHERE p.invoice_id = i.id), 0) AS amount_paid,
        (SELECT pr.status FROM spp_payment_proofs pr WHERE pr.invoice_id = i.id ORDER BY pr.id DESC LIMIT 1) AS last_proof_status
      FROM spp_invoices i
      WHERE i.student_id = ?
      ORDER BY i.id DESC
    `).all(c.id);

    // Nama, NIS, dan kelas dipakai oleh cetak invoice
    res.json({
      rows: rows.map((r) => ({ ...r, student_name: c.name, nis: c.nis, class_name: c.class_name }))
    });
  } catch (e) {
    return fail(res, e, 'Gagal memuat tagihan');
  }
});

// Orang tua mengunggah bukti transfer SPP untuk anaknya
router.post('/anak/:sid/tagihan/:id/bukti', async (req, res) => {
  try {
    const body = req.body || {};
    const invoiceId = Number(req.params.id);
    const amount = Math.floor(Number(body.amount));
    const note = clip(body.note, 300);

    if (!Number.isInteger(invoiceId) || invoiceId <= 0) return bad(res, 'Tagihan tidak valid');
    if (!Number.isSafeInteger(amount) || amount <= 0) return bad(res, 'Nominal pembayaran tidak valid');
    if (!validImageDataUrl(body.proof)) {
      return bad(res, 'Bukti harus berupa gambar JPG, PNG, atau WEBP maksimal 3 MB');
    }

    const invoice = await db.prepare(`
      SELECT i.*,
        COALESCE((SELECT SUM(p.amount) FROM spp_payments p WHERE p.invoice_id = i.id), 0) AS amount_paid
      FROM spp_invoices i
      WHERE i.id = ? AND i.student_id = ?
    `).get(invoiceId, req.child.id);

    if (!invoice) return bad(res, 'Tagihan tidak ditemukan');

    const remaining = Number(invoice.amount) - Number(invoice.amount_paid);
    if (remaining <= 0) return bad(res, 'Tagihan sudah lunas');
    if (amount > remaining) return bad(res, 'Nominal melebihi sisa tagihan');

    // Atomik: hanya tersimpan bila belum ada bukti lain yang menunggu verifikasi
    const r = await db.prepare(`
      INSERT INTO spp_payment_proofs (invoice_id, student_id, amount, proof_data, note)
      SELECT ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM spp_payment_proofs WHERE invoice_id = ? AND status = 'menunggu'
      )
    `).run(
      invoiceId,
      req.child.id,
      amount,
      body.proof,
      ('[Dikirim orang tua/wali] ' + note).trim(),
      invoiceId
    );

    if (!r.changes) return bad(res, 'Masih ada bukti pembayaran yang menunggu verifikasi');

    res.json({ ok: true, message: 'Bukti pembayaran berhasil dikirim' });
  } catch (e) {
    return fail(res, e, 'Gagal mengunggah bukti pembayaran');
  }
});

module.exports = router;