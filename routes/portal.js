const router = require('express').Router();
const db = require('../db');
const { auth, role } = require('../authMiddleware');

/* =====================================================
   PORTAL (TAHAP 4): Layanan Pengaduan, Administrasi, Akademik, Akun
   Semua endpoint di bawah /api/portal
   ===================================================== */

const TZ = 'Asia/Jakarta';
const DAY_NAMES = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const CATEGORIES = ['Akademik', 'Sarana & Prasarana', 'Layanan Administrasi', 'Keamanan & Kenyamanan', 'Lainnya'];
const COMPLAINT_STATUS = ['baru', 'diproses', 'selesai', 'ditolak'];
const DOC_TYPES = ['Surat Masuk', 'Surat Keluar', 'SK / Keputusan', 'Arsip', 'Lainnya'];
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_PHONE = /^[0-9+\-\s()]{6,20}$/;

const todayStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const fail = (res, e, msg) => { console.error(e); res.status(500).json({ error: msg }); };
const bad = (res, msg) => res.status(400).json({ error: msg });
// Batas ukuran gambar. Vercel menolak isi permintaan di atas ~4,5 MB, dan base64
// menambah ukuran sekitar sepertiga, jadi 3 MB adalah batas yang aman.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function validImageDataUrl(value) {
  if (typeof value !== 'string') return false;

  const match = value.match(
    /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/
  );

  if (!match) return false;

  const buffer = Buffer.from(match[2], 'base64');

  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return false;

  const type = match[1];

  if (type === 'jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (type === 'png') {
    return buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
  }

  if (type === 'webp') {
    return buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP';
  }

  return false;
}

function isValidDate(s) {
  if (!RE_DATE.test(s || '')) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

router.use(auth);

/* ======================= LAYANAN PENGADUAN ======================= */

// Pengaduan milik sendiri (siswa & guru)
router.get('/pengaduan/saya', role('siswa', 'guru'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT id, category, subject, body, status, response, responded_at, created_at
      FROM complaints WHERE user_id = ? ORDER BY id DESC LIMIT 100`).all(req.user.id);
    res.json({ categories: CATEGORIES, rows });
  } catch (e) { fail(res, e, 'Gagal memuat pengaduan'); }
});

router.post('/pengaduan', role('siswa', 'guru'), async (req, res) => {
  try {
    const category = clip(req.body.category, 40);
    const subject = clip(req.body.subject, 120);
    const body = clip(req.body.body, 2000);
    if (!CATEGORIES.includes(category)) return bad(res, 'Pilih kategori pengaduan');
    if (subject.length < 3) return bad(res, 'Judul pengaduan minimal 3 karakter');
    if (body.length < 10) return bad(res, 'Isi pengaduan minimal 10 karakter');
    const open = await db.prepare("SELECT COUNT(*) AS n FROM complaints WHERE user_id = ? AND status = 'baru'").get(req.user.id);
    if (Number(open.n) >= 10) return bad(res, 'Terlalu banyak pengaduan yang belum ditanggapi');
    const r = await db.prepare('INSERT INTO complaints (user_id, category, subject, body) VALUES (?, ?, ?, ?)')
      .run(req.user.id, category, subject, body);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) { fail(res, e, 'Gagal mengirim pengaduan'); }
});

// Pelapor boleh menarik pengaduan selama belum ditanggapi
router.delete('/pengaduan/:id', role('siswa', 'guru'), async (req, res) => {
  try {
    const r = await db.prepare("DELETE FROM complaints WHERE id = ? AND user_id = ? AND status = 'baru'")
      .run(Number(req.params.id), req.user.id);
    if (!r.changes) return bad(res, 'Pengaduan tidak bisa dihapus (sudah ditanggapi atau bukan milik Anda)');
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'Gagal menghapus pengaduan'); }
});

// Admin & kepala sekolah: lihat semua pengaduan
router.get('/pengaduan', role('admin', 'kepsek'), async (req, res) => {
  try {
    const status = clip(req.query.status, 10);
    const filter = COMPLAINT_STATUS.includes(status) ? ' WHERE c.status = ?' : '';
    const rows = await db.prepare(`
      SELECT c.id, c.category, c.subject, c.body, c.status, c.response, c.responded_at, c.created_at,
             u.name AS user_name, u.role AS user_role
      FROM complaints c
      JOIN users u ON u.id = c.user_id${filter}
      ORDER BY c.id DESC LIMIT 300`).all(...(filter ? [status] : []));
    const cnt = await db.prepare('SELECT status, COUNT(*) AS n FROM complaints GROUP BY status').all();
    const counts = { baru: 0, diproses: 0, selesai: 0, ditolak: 0 };
    for (const c of cnt) if (c.status in counts) counts[c.status] = Number(c.n);
    res.json({ counts, rows });
  } catch (e) { fail(res, e, 'Gagal memuat pengaduan'); }
});

router.put('/pengaduan/:id', role('admin', 'kepsek'), async (req, res) => {
  try {
    const status = clip(req.body.status, 10);
    const response = clip(req.body.response, 1000);
    if (!COMPLAINT_STATUS.includes(status)) return bad(res, 'Status tidak valid');
    if ((status === 'selesai' || status === 'ditolak') && response.length < 3) return bad(res, 'Isi tanggapan terlebih dahulu');
    // COALESCE: mengubah status tanpa mengetik tanggapan baru tidak menghapus tanggapan sebelumnya
    const r = await db.prepare(
      'UPDATE complaints SET status = ?, response = COALESCE(?, response), responded_by = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(status, response || null, req.user.id, Number(req.params.id));
    if (!r.changes) return res.status(404).json({ error: 'Pengaduan tidak ditemukan' });
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'Gagal menyimpan tanggapan'); }
});

/* ============================ ADMINISTRASI ============================ */

router.get('/administrasi', role('admin', 'kepsek'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT d.id, d.type, d.title, d.description, d.doc_date, d.created_at, u.name AS created_by_name
      FROM admin_documents d
      LEFT JOIN users u ON u.id = d.created_by
      ORDER BY d.doc_date DESC, d.id DESC LIMIT 300`).all();
    res.json({ types: DOC_TYPES, rows });
  } catch (e) { fail(res, e, 'Gagal memuat dokumen'); }
});

router.post('/administrasi', role('admin'), async (req, res) => {
  try {
    const type = clip(req.body.type, 30);
    const title = clip(req.body.title, 150);
    const description = clip(req.body.description, 500) || null;
    const docDate = clip(req.body.doc_date, 10) || todayStr();
    if (!DOC_TYPES.includes(type)) return bad(res, 'Pilih jenis dokumen');
    if (title.length < 3) return bad(res, 'Judul dokumen minimal 3 karakter');
    if (!isValidDate(docDate)) return bad(res, 'Tanggal tidak valid');
    const r = await db.prepare('INSERT INTO admin_documents (type, title, description, doc_date, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(type, title, description, docDate, req.user.id);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) { fail(res, e, 'Gagal menyimpan dokumen'); }
});

router.delete('/administrasi/:id', role('admin'), async (req, res) => {
  try {
    await db.prepare('DELETE FROM admin_documents WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'Gagal menghapus dokumen'); }
});

/* ============================== AKADEMIK ============================== */

// Kalender akademik (semua role boleh melihat)
router.get('/akademik/kalender', async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT id, title, start_date, end_date, description FROM academic_calendar ORDER BY start_date, id LIMIT 300'
    ).all();
    res.json({ today: todayStr(), rows });
  } catch (e) { fail(res, e, 'Gagal memuat kalender'); }
});

router.post('/akademik/kalender', role('admin'), async (req, res) => {
  try {
    const title = clip(req.body.title, 150);
    const start = clip(req.body.start_date, 10);
    const end = clip(req.body.end_date, 10) || null;
    const description = clip(req.body.description, 500) || null;
    if (title.length < 3) return bad(res, 'Judul kegiatan minimal 3 karakter');
    if (!isValidDate(start)) return bad(res, 'Tanggal mulai tidak valid');
    if (end && (!isValidDate(end) || end < start)) return bad(res, 'Tanggal selesai harus sama atau setelah tanggal mulai');
    const r = await db.prepare('INSERT INTO academic_calendar (title, start_date, end_date, description) VALUES (?, ?, ?, ?)')
      .run(title, start, end, description);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) { fail(res, e, 'Gagal menyimpan kegiatan'); }
});

router.delete('/akademik/kalender/:id', role('admin'), async (req, res) => {
  try {
    await db.prepare('DELETE FROM academic_calendar WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'Gagal menghapus kegiatan'); }
});

// Jadwal mingguan: guru = jadwal mengajarnya, siswa = jadwal kelasnya, admin/kepsek = semua
router.get('/akademik/jadwal', async (req, res) => {
  try {
    let where = '1 = 1';
    const args = [];
    if (req.user.role === 'guru') {
      where = 't.teacher_id = ?';
      args.push(req.user.id);
    } else if (req.user.role === 'siswa') {
      const me = await db.prepare('SELECT class_id FROM students WHERE user_id = ?').get(req.user.id);
      if (!me || !me.class_id) return res.json({ rows: [] });
      where = 't.class_id = ?';
      args.push(me.class_id);
    }
    const rows = await db.prepare(`
      SELECT sch.id, sch.day_of_week, sch.start_time, sch.end_time, sch.room,
             s.name AS subject_name, c.name AS class_name, u.name AS teacher_name
      FROM schedules sch
      JOIN teaching t ON t.id = sch.teaching_id
      JOIN subjects s ON s.id = t.subject_id
      JOIN classes c ON c.id = t.class_id
      JOIN users u ON u.id = t.teacher_id
      WHERE ${where}
      ORDER BY sch.day_of_week, sch.start_time, c.name`).all(...args);
    res.json({ rows: rows.map((r) => ({ ...r, day_name: DAY_NAMES[Number(r.day_of_week)] || '-' })) });
  } catch (e) { fail(res, e, 'Gagal memuat jadwal'); }
});
/* ======================= EKSTRAKURIKULER ======================= */

// Melihat daftar ekstrakurikuler
router.get('/ekskul', async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT e.*, u.name AS coach_name,
        (SELECT COUNT(*) FROM extracurricular_members m
         WHERE m.extracurricular_id = e.id
         AND m.status = 'aktif') AS total_members
      FROM extracurriculars e
      LEFT JOIN users u ON u.id = e.coach_id
      ORDER BY e.name
    `).all();

    res.json({ rows });
  } catch (e) {
    fail(res, e, 'Gagal memuat ekstrakurikuler');
  }
});

// Admin menambahkan ekstrakurikuler
router.post('/ekskul', role('admin'), async (req, res) => {
  try {
    const name = clip(req.body.name, 100);
    const description = clip(req.body.description, 500);
    const schedule = clip(req.body.schedule, 150);
    const coachId = Number(req.body.coach_id) || null;
    const quota = Math.max(0, Number(req.body.quota) || 0);

    if (name.length < 3) {
      return bad(res, 'Nama ekstrakurikuler minimal 3 karakter');
    }

    if (coachId) {
      const coach = await db.prepare(
        "SELECT id FROM users WHERE id = ? AND role = 'guru' AND (active IS NULL OR active = 1)"
      ).get(coachId);

      if (!coach) return bad(res, 'Pembina tidak ditemukan');
    }

    const result = await db.prepare(`
      INSERT INTO extracurriculars
      (name, description, coach_id, schedule, quota)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, description || null, coachId, schedule || null, quota);

    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    fail(res, e, 'Gagal menambahkan ekstrakurikuler');
  }
});

// Siswa mendaftar ekstrakurikuler
router.post('/ekskul/:id/daftar', role('siswa'), async (req, res) => {
  try {
    const kegiatan = await db.prepare(`
      SELECT id, quota FROM extracurriculars
      WHERE id = ? AND active = 1
    `).get(Number(req.params.id));

    if (!kegiatan) {
      return res.status(404).json({ error: 'Kegiatan tidak ditemukan' });
    }

    const siswa = await db.prepare(
      'SELECT id FROM students WHERE user_id = ?'
    ).get(req.user.id);

    if (!siswa) return bad(res, 'Data siswa tidak ditemukan');

    const existing = await db.prepare(`
      SELECT id FROM extracurricular_members
      WHERE extracurricular_id = ? AND student_id = ?
    `).get(kegiatan.id, siswa.id);

    if (existing) {
      return bad(res, 'Kamu sudah terdaftar pada kegiatan ini');
    }

    if (Number(kegiatan.quota) > 0) {
      const total = await db.prepare(`
        SELECT COUNT(*) AS total FROM extracurricular_members
        WHERE extracurricular_id = ? AND status = 'aktif'
      `).get(kegiatan.id);

      if (Number(total.total) >= Number(kegiatan.quota)) {
        return bad(res, 'Kuota ekstrakurikuler sudah penuh');
      }
    }

    await db.prepare(`
      INSERT INTO extracurricular_members
      (extracurricular_id, student_id)
      VALUES (?, ?)
    `).run(kegiatan.id, siswa.id);

    res.status(201).json({ ok: true });
  } catch (e) {
    fail(res, e, 'Gagal mendaftar ekstrakurikuler');
  }
});

// Daftar ekstrakurikuler yang diikuti siswa
router.get('/ekskul/saya', role('siswa'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT e.name, e.schedule, u.name AS coach_name,
             m.status, m.joined_at
      FROM extracurricular_members m
      JOIN extracurriculars e ON e.id = m.extracurricular_id
      LEFT JOIN users u ON u.id = e.coach_id
      JOIN students s ON s.id = m.student_id
      WHERE s.user_id = ?
      ORDER BY e.name
    `).all(req.user.id);

    res.json({ rows });
  } catch (e) {
    fail(res, e, 'Gagal memuat kegiatan siswa');
  }
});

/* ======================= BIMBINGAN KONSELING ======================= */

// Hanya admin dan kepala sekolah yang dapat melihat catatan BK
router.get('/bk', role('admin', 'kepsek'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT b.*, u.name AS student_name, s.nis,
             c.name AS class_name, p.name AS counselor_name
      FROM counseling_records b
      JOIN students s ON s.id = b.student_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN users p ON p.id = b.counselor_id
      ORDER BY b.session_date DESC, b.id DESC
    `).all();

    res.json({ rows });
  } catch (e) {
    fail(res, e, 'Gagal memuat catatan BK');
  }
});

// Menambahkan catatan BK
router.post('/bk', role('admin', 'kepsek'), async (req, res) => {
  try {
    const studentId = Number(req.body.student_id);
    const category = clip(req.body.category, 50);
    const notes = clip(req.body.notes, 2000);
    const followUp = clip(req.body.follow_up, 1000);
    const sessionDate = clip(req.body.session_date, 10);

    if (!studentId || !category || notes.length < 5) {
      return bad(res, 'Lengkapi data bimbingan terlebih dahulu');
    }

    if (!isValidDate(sessionDate)) {
      return bad(res, 'Tanggal bimbingan tidak valid');
    }

    const student = await db.prepare(
      'SELECT id FROM students WHERE id = ?'
    ).get(studentId);

    if (!student) return bad(res, 'Siswa tidak ditemukan');

    const result = await db.prepare(`
      INSERT INTO counseling_records
      (student_id, counselor_id, category, notes, follow_up, session_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      studentId,
      req.user.id,
      category,
      notes,
      followUp || null,
      sessionDate
    );

    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    fail(res, e, 'Gagal menyimpan catatan BK');
  }
});
/* ======================= KEUANGAN / SPP ======================= */

// Admin dan kepala sekolah melihat seluruh tagihan
router.get('/keuangan', role('admin', 'kepsek'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT
        i.*,
        u.name AS student_name,
        s.nis,
        c.name AS class_name,
        COALESCE((
          SELECT SUM(p.amount)
          FROM spp_payments p
          WHERE p.invoice_id = i.id
        ), 0) AS amount_paid
      FROM spp_invoices i
      JOIN students s ON s.id = i.student_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN classes c ON c.id = s.class_id
      ORDER BY i.id DESC
    `).all();

    const total = await db.prepare(`
      SELECT
        COUNT(*) AS total_tagihan,
        COALESCE(SUM(amount), 0) AS total_nominal
      FROM spp_invoices
    `).get();

    res.json({ rows, total });
  } catch (e) {
    fail(res, e, 'Gagal memuat data keuangan');
  }
});
// Admin mengambil daftar siswa untuk pilihan tagihan
router.get('/keuangan/siswa', role('admin'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT
        s.id,
        s.nis,
        u.name AS student_name,
        c.name AS class_name
      FROM students s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN classes c ON c.id = s.class_id
      ORDER BY u.name
    `).all();

    res.json({ rows });
  } catch (e) {
    fail(res, e, 'Gagal memuat daftar siswa');
  }
});
// Admin membuat tagihan SPP
router.post('/keuangan/tagihan', role('admin'), async (req, res) => {
  try {
    const studentId = Number(req.body.student_id);
    const title = clip(req.body.title, 100);
    const period = clip(req.body.period, 30);
    const amount = Math.floor(Number(req.body.amount));
    const dueDate = clip(req.body.due_date, 10);

    if (!studentId || !title || !period || !Number.isSafeInteger(amount) || amount <= 0) {
      return bad(res, 'Lengkapi data tagihan dengan benar');
    }

    if (dueDate && !isValidDate(dueDate)) {
      return bad(res, 'Tanggal jatuh tempo tidak valid');
    }

    const student = await db.prepare(
      'SELECT id FROM students WHERE id = ?'
    ).get(studentId);

    if (!student) return bad(res, 'Siswa tidak ditemukan');

    const result = await db.prepare(`
      INSERT INTO spp_invoices
      (student_id, title, period, amount, due_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      studentId,
      title,
      period,
      amount,
      dueDate || null,
      req.user.id
    );

    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    fail(res, e, 'Gagal membuat tagihan SPP');
  }
});

// Siswa melihat tagihan miliknya sendiri
router.get('/keuangan/saya', role('siswa'), async (req, res) => {
  try {
    const student = await db.prepare(
      'SELECT id FROM students WHERE user_id = ?'
    ).get(req.user.id);

    if (!student) return bad(res, 'Data siswa tidak ditemukan');

    const rows = await db.prepare(`
      SELECT
        i.*,
        COALESCE((
          SELECT SUM(p.amount)
          FROM spp_payments p
          WHERE p.invoice_id = i.id
        ), 0) AS amount_paid
      FROM spp_invoices i
      WHERE i.student_id = ?
      ORDER BY i.id DESC
    `).all(student.id);

    res.json({ rows });
  } catch (e) {
    fail(res, e, 'Gagal memuat tagihan siswa');
  }
});

// Admin mencatat pembayaran SPP
router.post('/keuangan/:id/bayar', role('admin'), async (req, res) => {
  try {
    const invoiceId = Number(req.params.id);
    const amount = Math.floor(Number(req.body.amount));
    const paymentDate = clip(req.body.payment_date, 10) || todayStr();
    const method = clip(req.body.method, 30) || 'Tunai';
    const note = clip(req.body.note, 300);

    if (!invoiceId || !Number.isSafeInteger(amount) || amount <= 0) {
      return bad(res, 'Nominal pembayaran tidak valid');
    }

    if (!isValidDate(paymentDate)) {
      return bad(res, 'Tanggal pembayaran tidak valid');
    }

    const invoice = await db.prepare(`
      SELECT * FROM spp_invoices WHERE id = ?
    `).get(invoiceId);

    if (!invoice) {
      return res.status(404).json({ error: 'Tagihan tidak ditemukan' });
    }

    const paid = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM spp_payments WHERE invoice_id = ?
    `).get(invoiceId);

    const remaining = Number(invoice.amount) - Number(paid.total);

    if (remaining <= 0) {
      return bad(res, 'Tagihan ini sudah lunas');
    }

    if (amount > remaining) {
      return bad(res, 'Pembayaran melebihi sisa tagihan');
    }

    // Atomik: sisa tagihan diperiksa ulang di dalam perintah INSERT itu sendiri,
    // jadi dua pembayaran bersamaan tidak bisa sama-sama lolos dan melebihi tagihan.
    const result = await db.batch([
      [
        `INSERT INTO spp_payments
         (invoice_id, amount, payment_date, method, note, recorded_by)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE (SELECT i.amount FROM spp_invoices i WHERE i.id = ?)
               - COALESCE((SELECT SUM(p.amount) FROM spp_payments p WHERE p.invoice_id = ?), 0) >= ?`,
        [invoiceId, amount, paymentDate, method, note || null, req.user.id, invoiceId, invoiceId, amount]
      ],
      [
        `UPDATE spp_invoices
         SET status = CASE
           WHEN COALESCE((SELECT SUM(amount) FROM spp_payments WHERE invoice_id = spp_invoices.id), 0) >= amount
           THEN 'lunas' ELSE 'belum_lunas' END
         WHERE id = ?`,
        [invoiceId]
      ]
    ]);

    if (!result[0].changes) {
      return bad(res, 'Pembayaran melebihi sisa tagihan atau tagihan sudah lunas');
    }

    const newPaid = Number(paid.total) + amount;
    const status = newPaid >= Number(invoice.amount)
      ? 'lunas'
      : 'belum_lunas';

    res.json({
      ok: true,
      amount_paid: newPaid,
      remaining: Number(invoice.amount) - newPaid,
      status
    });
  } catch (e) {
    fail(res, e, 'Gagal mencatat pembayaran');
  }
});
// Admin dan kepala sekolah melihat riwayat pembayaran SPP
router.get('/keuangan/riwayat', role('admin', 'kepsek'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT
        p.id,
        p.amount,
        p.payment_date,
        p.method,
        p.note,
        p.created_at,
        i.title,
        i.period,
        i.amount AS total_tagihan,
        u.name AS student_name,
        s.nis,
        c.name AS class_name,
        r.name AS recorded_by_name
      FROM spp_payments p
      JOIN spp_invoices i ON i.id = p.invoice_id
      JOIN students s ON s.id = i.student_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN users r ON r.id = p.recorded_by
      ORDER BY p.payment_date DESC, p.id DESC
      LIMIT 500
    `).all();

    const total = await db.prepare(`
      SELECT
        COUNT(*) AS total_transaksi,
        COALESCE(SUM(amount), 0) AS total_pembayaran
      FROM spp_payments
    `).get();

    res.json({ rows, total });
  } catch (e) {
    fail(res, e, 'Gagal memuat riwayat pembayaran');
  }
});
// ================================
// LAPORAN KEUANGAN SPP
// ================================

router.get('/keuangan/laporan', role('admin', 'kepsek'), async (req, res) => {
  try {
    const { mulai, sampai, siswa_id } = req.query;

    let sql = `
      SELECT
        p.id,
        p.amount,
        p.payment_date,
        p.method,
        p.note,
        i.title,
        i.period,
        u.name AS student_name,
        s.nis,
        c.name AS class_name,
        r.name AS recorded_by_name
      FROM spp_payments p
      JOIN spp_invoices i ON i.id = p.invoice_id
      JOIN students s ON s.id = i.student_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN users r ON r.id = p.recorded_by
      WHERE 1=1
    `;

    const params = [];

    if (mulai) {
      sql += ` AND p.payment_date >= ?`;
      params.push(mulai);
    }

    if (sampai) {
      sql += ` AND p.payment_date <= ?`;
      params.push(sampai);
    }

    if (siswa_id) {
      sql += ` AND s.id = ?`;
      params.push(Number(siswa_id));
    }

    sql += ` ORDER BY p.payment_date DESC, p.id DESC`;

    const rows = await db.prepare(sql).all(...params);

    const total = rows.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    res.json({
      rows,
      total: {
        total_transaksi: rows.length,
        total_pembayaran: total
      }
    });

  } catch (e) {
    fail(res, e, 'Gagal memuat laporan keuangan');
  }
});
/* ======================= PORTAL ORANG TUA ======================= */

// Orang tua hanya dapat melihat siswa yang terhubung dengan akunnya
router.get('/orang-tua/anak', role('orang_tua'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT
        s.id AS student_id,
        u.name,
        s.nis,
        c.name AS class_name,
        psl.relationship
      FROM parent_student_links psl
      JOIN students s ON s.id = psl.student_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN classes c ON c.id = s.class_id
      WHERE psl.parent_user_id = ?
      ORDER BY u.name
    `).all(req.user.id);

    res.json(rows);
  } catch (e) {
    fail(res, e, 'Gagal memuat data anak');
  }
});
/* ================================ AKUN ================================ */

router.get('/akun', async (req, res) => {
  try {
    const u = await db.prepare(
  'SELECT id, username, name, role, email, phone, avatar_data FROM users WHERE id = ?'
).get(req.user.id);
    let siswa = null;
    if (req.user.role === 'siswa') {
      siswa = (await db.prepare(`
        SELECT st.nis, c.name AS class_name, c.year
        FROM students st LEFT JOIN classes c ON c.id = st.class_id
        WHERE st.user_id = ?`).get(req.user.id)) || null;
    }
    res.json({ user: u, siswa });
  } catch (e) { fail(res, e, 'Gagal memuat akun'); }
});

router.put('/akun', async (req, res) => {
  try {
    const email = clip(req.body.email, 120);
    const phone = clip(req.body.phone, 20);
    if (email && !RE_EMAIL.test(email)) return bad(res, 'Format email tidak valid');
    if (phone && !RE_PHONE.test(phone)) return bad(res, 'Format nomor telepon tidak valid');
    await db.prepare('UPDATE users SET email = ?, phone = ? WHERE id = ?').run(email || null, phone || null, req.user.id);
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'Gagal menyimpan akun'); }
});
// Upload atau ganti foto profil pengguna
router.put('/akun/foto', async (req, res) => {
  try {
    const image = req.body.image;

    if (!validImageDataUrl(image)) {
      return bad(res, 'Foto tidak valid. Gunakan JPG, PNG, atau WEBP maksimal 3 MB.');
    }

    await db.prepare(
      'UPDATE users SET avatar_data = ? WHERE id = ?'
    ).run(image, req.user.id);

    res.json({ ok: true });
  } catch (e) {
    fail(res, e, 'Gagal menyimpan foto profil');
  }
});

// Hapus foto profil pengguna
router.delete('/akun/foto', async (req, res) => {
  try {
    await db.prepare(
      'UPDATE users SET avatar_data = NULL WHERE id = ?'
    ).run(req.user.id);

    res.json({ ok: true });
  } catch (e) {
    fail(res, e, 'Gagal menghapus foto profil');
  }
});

// ================= BUKTI PEMBAYARAN SPP =================

// Siswa mengunggah bukti pembayaran
router.post('/keuangan/saya/:id/bukti', role('siswa'), async (req, res) => {
  try {
    const invoiceId = Number(req.params.id);
    const amount = Math.floor(Number(req.body.amount));
    const proof = req.body.proof;
    const note = clip(req.body.note, 300);

    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      return bad(res, 'Tagihan tidak valid');
    }

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return bad(res, 'Nominal pembayaran tidak valid');
    }

    if (!validImageDataUrl(proof)) {
      return bad(res, 'Bukti harus berupa gambar JPG, PNG, atau WEBP maksimal 3 MB');
    }

    const student = await db.prepare(
      'SELECT id FROM students WHERE user_id = ?'
    ).get(req.user.id);

    if (!student) return bad(res, 'Data siswa tidak ditemukan');

    const invoice = await db.prepare(`
      SELECT i.*,
        COALESCE((
          SELECT SUM(p.amount)
          FROM spp_payments p
          WHERE p.invoice_id = i.id
        ), 0) AS amount_paid
      FROM spp_invoices i
      WHERE i.id = ? AND i.student_id = ?
    `).get(invoiceId, student.id);

    if (!invoice) return bad(res, 'Tagihan tidak ditemukan');

    const remaining = Number(invoice.amount) - Number(invoice.amount_paid);

    if (remaining <= 0) return bad(res, 'Tagihan sudah lunas');
    if (amount > remaining) {
      return bad(res, 'Nominal melebihi sisa tagihan');
    }

    const pending = await db.prepare(`
      SELECT id FROM spp_payment_proofs
      WHERE invoice_id = ? AND status = 'menunggu'
    `).get(invoiceId);

    if (pending) {
      return bad(res, 'Masih ada bukti pembayaran yang menunggu verifikasi');
    }

    await db.prepare(`
      INSERT INTO spp_payment_proofs
      (invoice_id, student_id, amount, proof_data, note)
      VALUES (?, ?, ?, ?, ?)
    `).run(invoiceId, student.id, amount, proof, note || null);

    res.json({ ok: true, message: 'Bukti pembayaran berhasil dikirim' });
  } catch (e) {
    fail(res, e, 'Gagal mengunggah bukti pembayaran');
  }
});


// Admin dan kepala sekolah melihat bukti pembayaran
router.get('/keuangan/bukti', role('admin', 'kepsek'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT
        p.id,
        p.invoice_id,
        p.student_id,
        p.amount,
        p.proof_data,
        p.note,
        p.status,
        p.created_at,
        u.name AS student_name,
        s.nis,
        i.title,
        i.period
      FROM spp_payment_proofs p
      JOIN students s ON s.id = p.student_id
      JOIN users u ON u.id = s.user_id
      JOIN spp_invoices i ON i.id = p.invoice_id
      ORDER BY
        CASE WHEN p.status = 'menunggu' THEN 0 ELSE 1 END,
        p.id DESC
      LIMIT 100
    `).all();

    res.json({ rows });
  } catch (e) {
    fail(res, e, 'Gagal memuat bukti pembayaran');
  }
});




// Admin memverifikasi atau menolak bukti pembayaran
router.put('/keuangan/bukti/:id/verifikasi', role('admin'), async (req, res) => {
  try {
    const proofId = Number(req.params.id);
    const status = clip(req.body.status, 20);
    const method = clip(req.body.method, 30) || 'Transfer';

    if (!Number.isInteger(proofId) || proofId <= 0) {
      return bad(res, 'Bukti pembayaran tidak valid');
    }

    if (!['diterima', 'ditolak'].includes(status)) {
      return bad(res, 'Status verifikasi tidak valid');
    }

    const proof = await db.prepare(`
      SELECT * FROM spp_payment_proofs WHERE id = ?
    `).get(proofId);

    if (!proof) return bad(res, 'Bukti pembayaran tidak ditemukan');

    if (proof.status !== 'menunggu') {
      return bad(res, 'Bukti pembayaran sudah diverifikasi');
    }

    if (status === 'ditolak') {
      const result = await db.batch([
        [
          `UPDATE spp_payment_proofs
           SET status = 'ditolak',
               reviewed_by = ?,
               reviewed_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'menunggu'`,
          [req.user.id, proofId]
        ]
      ]);

      if (!result[0].changes) {
        return bad(res, 'Bukti pembayaran sudah diproses');
      }

      return res.json({
        ok: true,
        message: 'Bukti pembayaran berhasil ditolak'
      });
    }

    // Verifikasi dan pencatatan pembayaran dalam satu batch atomik
    const result = await db.batch([
      [
        `UPDATE spp_payment_proofs
         SET status = 'diproses',
             reviewed_by = ?,
             reviewed_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND status = 'menunggu'
           AND EXISTS (
             SELECT 1
             FROM spp_invoices i
             WHERE i.id = spp_payment_proofs.invoice_id
               AND i.student_id = spp_payment_proofs.student_id
               AND spp_payment_proofs.amount <= (
                 i.amount - COALESCE((
                   SELECT SUM(p.amount)
                   FROM spp_payments p
                   WHERE p.invoice_id = i.id
                 ), 0)
               )
           )`,
        [req.user.id, proofId]
      ],
      [
        `INSERT INTO spp_payments
         (invoice_id, amount, payment_date, method, note, recorded_by, proof_id)
         SELECT invoice_id, amount, ?, ?,
                COALESCE(note, 'Pembayaran diverifikasi dari bukti transfer'),
                ?, id
         FROM spp_payment_proofs
         WHERE id = ?
           AND status = 'diproses'
           AND reviewed_by = ?
           AND NOT EXISTS (
             SELECT 1 FROM spp_payments
             WHERE proof_id = spp_payment_proofs.id
           )`,
        [todayStr(), method, req.user.id, proofId, req.user.id]
      ],
      [
        `UPDATE spp_payment_proofs
         SET status = 'diterima'
         WHERE id = ?
           AND status = 'diproses'
           AND reviewed_by = ?
           AND EXISTS (
             SELECT 1 FROM spp_payments
             WHERE proof_id = spp_payment_proofs.id
           )`,
        [proofId, req.user.id]
      ],
      [
        `UPDATE spp_invoices
         SET status = CASE
           WHEN (
             SELECT COALESCE(SUM(amount), 0)
             FROM spp_payments
             WHERE invoice_id = spp_invoices.id
           ) >= amount THEN 'lunas'
           ELSE 'belum_lunas'
         END
         WHERE id = ?
           AND EXISTS (
             SELECT 1 FROM spp_payment_proofs
             WHERE id = ?
               AND status = 'diterima'
           )`,
        [proof.invoice_id, proofId]
      ]
    ]);

    if (!result[0].changes) {
      return bad(res, 'Bukti sudah diproses atau nominal melebihi sisa tagihan');
    }

    if (!result[2].changes) {
      return bad(res, 'Pembayaran gagal dicatat. Silakan periksa status bukti.');
    }

    res.json({
      ok: true,
      message: 'Pembayaran berhasil diverifikasi'
    });

  } catch (e) {
    fail(res, e, 'Gagal memverifikasi pembayaran');
  }
});
module.exports = router;