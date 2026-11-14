const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, role, forgetUser } = require('../authMiddleware');
const { buildReport } = require('../rapor');

router.use(auth, role('admin'));

const XLSX = require('xlsx');

// ===== LOG AKTIVITAS ADMIN =====
// Mencatat setiap perubahan data yang berhasil dilakukan lewat route admin
// (tambah, ubah, hapus, impor, kenaikan kelas, export, backup).
// Password dan isi file TIDAK pernah dicatat. Log lebih dari 180 hari dihapus otomatis.
let logReady = null;

function ensureLog() {
  if (!logReady) {
    logReady = (async () => {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          user_name TEXT,
          action TEXT NOT NULL,
          detail TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      await db.prepare(
        "DELETE FROM activity_log WHERE created_at < datetime('now', '-180 days')"
      ).run();
    })().catch((e) => {
      console.error('Siapkan log gagal:', e);
      logReady = null;
      throw e;
    });
  }
  return logReady;
}

const LOG_RULES = [
  ['POST', /^\/users$/, 'Menambah pengguna'],
  ['POST', /^\/users\/import$/, 'Impor pengguna dari Excel'],
  ['PUT', /^\/users\/\d+$/, 'Mengubah pengguna'],
  ['DELETE', /^\/users\/\d+$/, 'Menghapus pengguna'],
  ['POST', /^\/classes$/, 'Menambah kelas'],
  ['DELETE', /^\/classes\/\d+$/, 'Menghapus kelas'],
  ['PUT', /^\/classes\/\d+\/homeroom$/, 'Mengatur wali kelas'],
  ['POST', /^\/subjects$/, 'Menambah mata pelajaran'],
  ['DELETE', /^\/subjects\/\d+$/, 'Menghapus mata pelajaran'],
  ['POST', /^\/teaching$/, 'Menambah kelas ajar'],
  ['DELETE', /^\/teaching\/\d+$/, 'Menghapus kelas ajar'],
  ['POST', /^\/announcements$/, 'Menerbitkan pengumuman'],
  ['DELETE', /^\/announcements\/\d+$/, 'Menghapus pengumuman'],
  ['POST', /^\/promotion$/, 'Kenaikan kelas / kelulusan'],
  ['PUT', /^\/students\/\d+\/restore$/, 'Mengembalikan alumni ke kelas'],
  ['POST', /^\/periods$/, 'Menambah periode'],
  ['PUT', /^\/periods\/\d+\/activate$/, 'Mengaktifkan periode'],
  ['DELETE', /^\/periods\/\d+$/, 'Menghapus periode'],
  ['GET', /^\/users\/export$/, 'Export data pengguna'],
  ['GET', /^\/export\/nilai$/, 'Export nilai'],
  ['GET', /^\/export\/absensi$/, 'Export absensi'],
  ['GET', /^\/backup$/, 'Backup database']
];

// Hanya kolom aman yang dicatat sebagai keterangan
const LOG_FIELDS = ['username', 'name', 'role', 'active', 'code', 'title', 'year', 'semester',
  'teacher_id', 'class_id', 'subject_id', 'from_class_id', 'to_class_id', 'graduate'];

function logDetail(method, path, query, body) {
  const parts = [];
  const idm = /\/(\d+)(?:\/|$)/.exec(path);
  if (idm) parts.push('id ' + idm[1]);

  if (body && typeof body === 'object') {
    for (const k of LOG_FIELDS) {
      if (body[k] !== undefined && body[k] !== null && body[k] !== '') {
        parts.push(k + '=' + String(body[k]).slice(0, 60));
      }
    }
    if (body.password && method === 'PUT') parts.push('password direset');
    if (Array.isArray(body.student_ids)) parts.push(body.student_ids.length + ' siswa');
  }

  if (query && query.class_id) parts.push('class_id=' + String(query.class_id).slice(0, 10));
  if (query && query.semester) parts.push('semester=' + String(query.semester).slice(0, 40));

  return parts.join(', ').slice(0, 300);
}

router.use((req, res, next) => {
  const method = req.method;
  const path = req.path; // relatif terhadap router, ambil sekarang sebelum berubah
  const rule = LOG_RULES.find(([m, re]) => m === method && re.test(path));

  if (!rule) return next();

  const detail = logDetail(method, path, req.query, req.body);

  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    (async () => {
      try {
        await ensureLog();
        const u = req.user || {};
        await db.prepare(
          'INSERT INTO activity_log(user_id, user_name, action, detail) VALUES(?,?,?,?)'
        ).run(u.id || null, String(u.name || u.username || '').slice(0, 120), rule[2], detail || null);
      } catch (e) {
        console.error('Catat log gagal:', e);
      }
    })();
  });

  next();
});

router.get('/logs', async (req, res) => {
  try {
    await ensureLog();
    const per = 50;
    const page = Math.max(1, Number(req.query.page) || 1);
    const total = Number((await db.prepare('SELECT COUNT(*) n FROM activity_log').get()).n);
    const rows = await db.prepare(
      'SELECT id, user_name, action, detail, created_at FROM activity_log ORDER BY id DESC LIMIT ? OFFSET ?'
    ).all(per, (page - 1) * per);

    res.json({ rows, total, page, per });
  } catch (e) {
    return handleDb(res, e);
  }
});

// ===== BACKUP DATABASE =====
// Mengunduh semua tabel sebagai satu file JSON. File ini berisi data lengkap
// (termasuk hash password), jadi simpan di tempat aman.
router.get('/backup', async (req, res) => {
  try {
    const tables = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();

    const data = {};
    const counts = {};

    // Foto profil dan bukti transfer berukuran besar (base64). Secara bawaan tidak
    // disertakan supaya file backup tidak melewati batas respons server (Vercel ~4,5 MB).
    // Tambahkan ?lengkap=1 pada alamat backup bila ingin menyertakannya.
    const HEAVY = { users: ['avatar_data'], spp_payment_proofs: ['proof_data'] };
    const full = String(req.query.lengkap || '') === '1';

    for (const t of tables) {
      const name = String(t.name);
      const quoted = `"${name.replace(/"/g, '""')}"`;
      let cols = '*';

      if (!full && HEAVY[name]) {
        const info = await db.prepare(`PRAGMA table_info(${quoted})`).all();
        cols = info
          .map((c) => (HEAVY[name].includes(String(c.name))
            ? `NULL AS "${String(c.name).replace(/"/g, '""')}"`
            : `"${String(c.name).replace(/"/g, '""')}"`))
          .join(', ');
      }

      const rows = await db.prepare(`SELECT ${cols} FROM ${quoted}`).all();
      data[name] = rows;
      counts[name] = rows.length;
    }

    const json = JSON.stringify(
      {
        app: 'SIAKAD Sekolah OBE 85',
        created_at: new Date().toISOString(),
        counts,
        note: full
          ? 'Backup lengkap.'
          : 'Foto profil dan bukti pembayaran tidak disertakan. Tambahkan ?lengkap=1 untuk menyertakannya.',
        tables: data
      },
      (k, v) => (typeof v === 'bigint' ? Number(v) : v)
    );

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="backup-siakad-${stamp}.json"`);
    res.send(json);
  } catch (e) {
    console.error('Backup gagal:', e);
    res.status(500).json({ error: 'Gagal membuat backup' });
  }
});

// EXPORT DATA PENGGUNA KE EXCEL
router.get('/users/export', async (req, res) => {
  try {
    const users = await db.prepare(`
      SELECT
        u.username,
        u.name,
        u.role,
        st.nis,
        c.name AS class_name,
        u.active
      FROM users u
      LEFT JOIN students st ON st.user_id = u.id
      LEFT JOIN classes c ON c.id = st.class_id
      ORDER BY u.name ASC
    `).all();

    const data = users.map((u) => ({
      Username: xcell(u.username),
      'Nama Lengkap': xcell(u.name),
      Peran: u.role,
      NIS: xcell(u.nis || ''),
      Kelas: xcell(u.class_name || ''),
      Status: Number(u.active) === 0 ? 'Nonaktif' : 'Aktif'
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Pengguna');

    const buffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'buffer'
    });

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="data-pengguna.xlsx"'
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    res.send(buffer);
  } catch (error) {
    console.error('Export Excel gagal:', error);
    res.status(500).json({ error: 'Gagal mengexport data pengguna' });
  }
});

const bad = (res, msg) => res.status(400).json({ error: msg });
const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const handleDb = (res, e) => {
  console.error(e);
  const m = String(e && e.message || e);

  if (m.includes('UNIQUE')) {
    if (/username/i.test(m)) return bad(res, 'Username sudah dipakai.');
    if (/nis/i.test(m)) return bad(res, 'NIS sudah dipakai.');
    return bad(res, 'Data sudah ada (duplikat).');
  }

  if (m.includes('FOREIGN KEY')) {
    return bad(res, 'Data masih dipakai oleh data lain, tidak bisa dihapus.');
  }

  return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
};

// Daftar tabel yang ada (beberapa tabel dibuat otomatis saat fitur pertama dipakai)
async function existingTables() {
  const rows = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  return new Set(rows.map((r) => String(r.name)));
}

// HELPER INSERT UNTUK TURSO DAN DATABASE LOKAL
async function insertReturnId(sql, args = []) {
  if (db.isTurso) {
    const r = await db.client.execute({
      sql: sql + ' RETURNING id',
      args
    });

    const row = r.rows[0];
    const id = row ? Number(row.id) : 0;

    return {
      lastInsertRowid: id,
      lastInsertRowId: id,
      id
    };
  }

  const info = await db.prepare(sql).run(...args);
  const id = info.lastInsertRowid ?? info.lastInsertRowId ?? 0;

  return {
    lastInsertRowid: Number(id),
    lastInsertRowId: Number(id),
    id: Number(id)
  };
}

router.get('/stats', async (req, res) => {
  try {
    // Satu query untuk semua angka (dulu lima query berurutan ke database)
    const r = await db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'siswa') AS siswa,
        (SELECT COUNT(*) FROM users WHERE role = 'guru') AS guru,
        (SELECT COUNT(*) FROM classes) AS kelas,
        (SELECT COUNT(*) FROM subjects) AS mapel,
        (SELECT COUNT(*) FROM teaching) AS kelasAjar
    `).get();

    res.json({
      siswa: Number(r.siswa),
      guru: Number(r.guru),
      kelas: Number(r.kelas),
      mapel: Number(r.mapel),
      kelasAjar: Number(r.kelasAjar)
    });
  } catch (e) {
    return handleDb(res, e);
  }
});

router.get('/users', async (req, res) => {
  try {
    let sql = `
      SELECT
        u.id,
        u.username,
        u.name,
        u.role,
        u.active,
        st.id AS student_id,
        st.nis,
        c.name AS class_name
      FROM users u
      LEFT JOIN students st ON st.user_id = u.id
      LEFT JOIN classes c ON c.id = st.class_id
    `;

    const p = [];

    if (req.query.role) {
      sql += ' WHERE u.role = ?';
      p.push(String(req.query.role));
    }

    sql += ' ORDER BY u.role, u.name';

    res.json(await db.prepare(sql).all(...p));
  } catch (e) {
    return handleDb(res, e);
  }
});

router.post('/users', async (req, res) => {
  let createdId = null;

  try {
    const body = req.body || {};
    const username = str(body.username, 50);
    const name = str(body.name);
    const r = str(body.role, 10);
    const password = String(body.password || '');

    if (!/^[A-Za-z0-9_.@-]{3,50}$/.test(username)) {
      return bad(res, 'Username 3-50 karakter.');
    }

    if (!name) {
      return bad(res, 'Nama wajib diisi.');
    }

    if (!['admin', 'guru', 'siswa', 'kepsek', 'orang_tua'].includes(r)) {
      return bad(res, 'Peran tidak valid.');
    }

    if (password.length < 8) {
      return bad(res, 'Password minimal 8 karakter.');
    }

    if (password.length > 72) {
      return bad(res, 'Password maksimal 72 karakter.');
    }

    // Semua pemeriksaan dilakukan SEBELUM akun dibuat, supaya tidak ada akun setengah jadi
    let parentStudentId = null;
    if (r === 'orang_tua') {
      parentStudentId = Number(body.student_id);

      if (!Number.isInteger(parentStudentId) || parentStudentId <= 0) {
        return bad(res, 'Pilih siswa yang menjadi anak/wali.');
      }

      const student = await db.prepare('SELECT id FROM students WHERE id = ?').get(parentStudentId);
      if (!student) {
        return bad(res, 'Data siswa tidak ditemukan.');
      }
    }

    let nis = null;
    let classId = null;
    if (r === 'siswa') {
      nis = str(body.nis, 30) || username;
      const classIdRaw = body.class_id;

      if (classIdRaw !== undefined && classIdRaw !== null && classIdRaw !== '' && classIdRaw !== 'null') {
        const num = Number(classIdRaw);
        if (!isNaN(num) && num > 0) classId = num;
      }

      if (classId) {
        const cek = await db.prepare('SELECT id FROM classes WHERE id = ?').get(classId);
        if (!cek) {
          return bad(res, 'Kelas tidak ditemukan, refresh halaman dulu.');
        }
      }
    }

    const info = await insertReturnId(
      'INSERT INTO users(username,password_hash,name,role,must_change) VALUES(?,?,?,?,1)',
      [username, await bcrypt.hash(password, 10), name, r]
    );
    createdId = info.lastInsertRowid;

    if (r === 'siswa') {
      await db.prepare('INSERT INTO students(user_id,nis,class_id) VALUES(?,?,?)')
        .run(createdId, nis, classId);
    }

    if (r === 'orang_tua') {
      await db.prepare(`
        INSERT INTO parent_student_links
        (parent_user_id, student_id, relationship)
        VALUES (?, ?, ?)
      `).run(
        createdId,
        parentStudentId,
        str(body.relationship, 50) || 'Orang Tua/Wali'
      );
    }

    res.status(201).json({ id: createdId });
  } catch (e) {
    // Gagal di tengah jalan (mis. NIS kembar): hapus akun yang sudah terlanjur dibuat
    if (createdId) {
      try {
        await db.batch([
          ['DELETE FROM students WHERE user_id = ?', [createdId]],
          ['DELETE FROM parent_student_links WHERE parent_user_id = ?', [createdId]],
          ['DELETE FROM users WHERE id = ?', [createdId]]
        ]);
      } catch (e2) {
        console.error('Pembersihan akun gagal:', e2);
      }
    }
    return handleDb(res, e);
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const u = await db.prepare(
      'SELECT id FROM users WHERE id = ?'
    ).get(req.params.id);

    if (!u) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    }

    if (req.body.name !== undefined) {
      const name = str(req.body.name);

      if (!name) {
        return bad(res, 'Nama wajib diisi.');
      }

      await db.prepare(
        'UPDATE users SET name = ? WHERE id = ?'
      ).run(name, u.id);
    }

    if (req.body.active !== undefined) {
      if (Number(u.id) === Number(req.user.id)) {
        return bad(res, 'Tidak bisa menonaktifkan akun sendiri.');
      }

      const a = req.body.active;
      const isActive = a === true || a === 1 || a === '1' || a === 'true';

      await db.prepare(
        'UPDATE users SET active = ? WHERE id = ?'
      ).run(isActive ? 1 : 0, u.id);
    }

    if (req.body.password) {
      const pw = String(req.body.password);

      if (pw.length < 8) {
        return bad(res, 'Password minimal 8 karakter.');
      }

      if (pw.length > 72) {
        return bad(res, 'Password maksimal 72 karakter.');
      }

      await db.prepare(
        'UPDATE users SET password_hash = ?, must_change = 1 WHERE id = ?'
      ).run(await bcrypt.hash(pw, 10), u.id);
    }

    forgetUser(u.id);
    res.json({ ok: true });
  } catch (e) {
    return handleDb(res, e);
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return bad(res, 'ID pengguna tidak valid.');
    }

    if (id === Number(req.user.id)) {
      return bad(res, 'Tidak bisa menghapus akun sendiri.');
    }

    const u = await db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
    if (!u) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    }

    const tables = await existingTables();
    const items = [];

    if (u.role === 'guru') {
      const n = await db.prepare('SELECT COUNT(*) n FROM teaching WHERE teacher_id = ?').get(id);
      if (Number(n.n) > 0) {
        return bad(res, 'Guru ini masih mengampu kelas ajar. Hapus atau pindahkan kelas ajarnya dulu, atau cukup nonaktifkan akunnya.');
      }
      items.push(['UPDATE classes SET homeroom_teacher_id = NULL WHERE homeroom_teacher_id = ?', [id]]);
      items.push(['UPDATE extracurriculars SET coach_id = NULL WHERE coach_id = ?', [id]]);
    }

    const st = await db.prepare('SELECT id FROM students WHERE user_id = ?').get(id);
    if (st) {
      const used = await db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM scores WHERE student_id = ?) +
          (SELECT COUNT(*) FROM student_attendance WHERE student_id = ?) +
          (SELECT COUNT(*) FROM spp_invoices WHERE student_id = ?) AS n
      `).get(st.id, st.id, st.id);

      if (Number(used.n) > 0) {
        return bad(res, 'Siswa ini sudah punya data nilai, absensi, atau tagihan. Nonaktifkan akunnya, atau luluskan lewat menu Kenaikan Kelas.');
      }

      items.push(['DELETE FROM parent_student_links WHERE student_id = ?', [st.id]]);
      items.push(['DELETE FROM extracurricular_members WHERE student_id = ?', [st.id]]);
      items.push(['DELETE FROM counseling_records WHERE student_id = ?', [st.id]]);
      if (tables.has('leave_requests')) {
        items.push(['DELETE FROM leave_requests WHERE student_id = ?', [st.id]]);
      }
      if (tables.has('lms_submissions')) {
        items.push(['DELETE FROM lms_submissions WHERE student_id = ?', [st.id]]);
      }
      items.push(['DELETE FROM students WHERE id = ?', [st.id]]);
    }

    items.push(['DELETE FROM parent_student_links WHERE parent_user_id = ?', [id]]);
    items.push(['DELETE FROM complaints WHERE user_id = ?', [id]]);
    items.push(['DELETE FROM visit_log WHERE user_id = ?', [id]]);
    items.push(['DELETE FROM teacher_attendance WHERE user_id = ?', [id]]);
    items.push(['DELETE FROM principal_attendance WHERE user_id = ?', [id]]);
    if (tables.has('notif_state')) {
      items.push(['DELETE FROM notif_state WHERE user_id = ?', [id]]);
    }
    if (tables.has('password_reset_requests')) {
      items.push(['UPDATE password_reset_requests SET handled_by = NULL WHERE handled_by = ?', [id]]);
      items.push(['DELETE FROM password_reset_requests WHERE user_id = ?', [id]]);
    }
    items.push(['DELETE FROM users WHERE id = ?', [id]]);

    await db.batch(items); // atomik: semua terhapus atau tidak sama sekali
    forgetUser(id);
    res.json({ ok: true });
  } catch (e) {
    return handleDb(res, e);
  }
});

router.get('/classes', async (req, res) => {
  try {
    res.json(await db.prepare(`
      SELECT
        c.id,
        c.name,
        c.year,
        c.homeroom_teacher_id,
        hu.name AS homeroom_name,
        COUNT(st.id) AS students
      FROM classes c
      LEFT JOIN students st ON st.class_id = c.id
      LEFT JOIN users hu ON hu.id = c.homeroom_teacher_id
      GROUP BY c.id
      ORDER BY c.name
    `).all());
  } catch (e) {
    return handleDb(res, e);
  }
});

router.post('/classes', async (req, res) => {
  const name = str(req.body.name, 50);

  if (!name) {
    return bad(res, 'Nama kelas wajib diisi.');
  }

  try {
    const info = await insertReturnId(
      'INSERT INTO classes(name,year) VALUES(?,?)',
      [name, str(req.body.year, 20) || null]
    );

    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    return handleDb(res, e);
  }
});

router.delete('/classes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    const used = await db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM students WHERE class_id = ?) AS siswa,
        (SELECT COUNT(*) FROM teaching WHERE class_id = ?) AS ajar
    `).get(id, id);

    if (Number(used.siswa) > 0) {
      return bad(res, `Kelas ini masih berisi ${Number(used.siswa)} siswa. Pindahkan atau luluskan siswanya dulu.`);
    }

    if (Number(used.ajar) > 0) {
      return bad(res, 'Kelas ini masih memiliki kelas ajar. Hapus kelas ajarnya dulu.');
    }

    await db.prepare('DELETE FROM classes WHERE id = ?').run(id);

    res.json({ ok: true });
  } catch (e) {
    return handleDb(res, e);
  }
});

// Tetapkan / cabut wali kelas
router.put('/classes/:id/homeroom', async (req, res) => {
  try {
    const kelas = await db.prepare(
      'SELECT id FROM classes WHERE id = ?'
    ).get(req.params.id);

    if (!kelas) {
      return res.status(404).json({ error: 'Kelas tidak ditemukan' });
    }

    const tid = Number(req.body.teacher_id) || null;

    if (tid) {
      const guru = await db.prepare(
        "SELECT id FROM users WHERE id = ? AND role = 'guru' AND (active IS NULL OR active = 1)"
      ).get(tid);

      if (!guru) {
        return bad(res, 'Wali kelas harus berperan Guru yang aktif.');
      }
    }

    await db.prepare(
      'UPDATE classes SET homeroom_teacher_id = ? WHERE id = ?'
    ).run(tid, kelas.id);

    res.json({ ok: true });
  } catch (e) {
    return handleDb(res, e);
  }
});

router.get('/subjects', async (req, res) => {
  try {
    res.json(await db.prepare(
      'SELECT id, code, name FROM subjects ORDER BY name'
    ).all());
  } catch (e) {
    return handleDb(res, e);
  }
});

router.post('/subjects', async (req, res) => {
  const code = str(req.body.code, 20).toUpperCase();
  const name = str(req.body.name, 100);

  if (!code || !name) {
    return bad(res, 'Kode dan nama mapel wajib diisi.');
  }

  try {
    const info = await insertReturnId(
      'INSERT INTO subjects(code,name) VALUES(?,?)',
      [code, name]
    );

    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    return handleDb(res, e);
  }
});

router.delete('/subjects/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    const used = await db.prepare('SELECT COUNT(*) n FROM teaching WHERE subject_id = ?').get(id);
    if (Number(used.n) > 0) {
      return bad(res, 'Mata pelajaran ini dipakai oleh kelas ajar. Hapus kelas ajarnya dulu.');
    }

    await db.batch([
      ['DELETE FROM outcomes WHERE subject_id = ?', [id]],
      ['DELETE FROM subjects WHERE id = ?', [id]]
    ]);

    res.json({ ok: true });
  } catch (e) {
    return handleDb(res, e);
  }
});

router.get('/teaching', async (req, res) => {
  try {
    res.json(await db.prepare(`
      SELECT
        t.id,
        t.semester,
        s.name AS subject_name,
        s.code AS subject_code,
        c.name AS class_name,
        u.name AS teacher_name
      FROM teaching t
      JOIN subjects s ON s.id = t.subject_id
      JOIN classes c ON c.id = t.class_id
      JOIN users u ON u.id = t.teacher_id
      ORDER BY t.semester DESC, c.name, s.name
    `).all());
  } catch (e) {
    return handleDb(res, e);
  }
});

router.post('/teaching', async (req, res) => {
  const subject = Number(req.body.subject_id);
  const cls = Number(req.body.class_id);
  const teacher = Number(req.body.teacher_id);
  let semester = str(req.body.semester, 40);
  let yearId = null;

  if (!subject || !cls || !teacher) {
    return bad(res, 'Mapel, kelas, dan guru wajib diisi.');
  }

  try {
    if (!semester) {
      const p = await db.prepare(
        'SELECT id, name, semester FROM academic_years WHERE is_active = 1'
      ).get();

      if (!p) {
        return bad(res, 'Belum ada periode aktif. Atur dulu di menu Tahun Ajaran.');
      }

      semester = `${p.semester} ${p.name}`;
      yearId = p.id;
    } else {
      const p = await db.prepare(
        "SELECT id FROM academic_years WHERE (semester || ' ' || name) = ?"
      ).get(semester);
      yearId = p ? p.id : null;
    }

    const t = await db.prepare(
      "SELECT id FROM users WHERE id = ? AND role = 'guru'"
    ).get(teacher);

    if (!t) {
      return bad(res, 'Pengajar harus berperan Guru.');
    }

    const subjOk = await db.prepare('SELECT id FROM subjects WHERE id = ?').get(subject);
    if (!subjOk) return bad(res, 'Mata pelajaran tidak ditemukan.');

    const classOk = await db.prepare('SELECT id FROM classes WHERE id = ?').get(cls);
    if (!classOk) return bad(res, 'Kelas tidak ditemukan.');

    const dupe = await db.prepare(
      'SELECT id FROM teaching WHERE subject_id = ? AND class_id = ? AND teacher_id = ? AND semester = ?'
    ).get(subject, cls, teacher, semester);
    if (dupe) return bad(res, 'Kelas ajar yang sama sudah ada pada semester ini.');

    const info = await insertReturnId(
      'INSERT INTO teaching(subject_id,class_id,teacher_id,semester,year_id) VALUES(?,?,?,?,?)',
      [subject, cls, teacher, semester, yearId]
    );

    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    return handleDb(res, e);
  }
});

router.delete('/teaching/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    const t = await db.prepare('SELECT id FROM teaching WHERE id = ?').get(id);
    if (!t) {
      return res.status(404).json({ error: 'Kelas ajar tidak ditemukan' });
    }

    // Riwayat nilai dan absensi dilindungi supaya tidak hilang tanpa sengaja
    const data = await db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM scores sc
           JOIN assessments a ON a.id = sc.assessment_id
          WHERE a.teaching_id = ?) +
        (SELECT COUNT(*) FROM student_attendance WHERE teaching_id = ?) AS n
    `).get(id, id);

    if (Number(data.n) > 0) {
      return bad(res, 'Kelas ajar ini sudah memiliki nilai atau absensi, jadi tidak bisa dihapus agar riwayatnya tidak hilang.');
    }

    const tables = await existingTables();
    const items = [
      ['DELETE FROM assessments WHERE teaching_id = ?', [id]],
      ['DELETE FROM schedules WHERE teaching_id = ?', [id]],
      ['DELETE FROM reflections WHERE teaching_id = ?', [id]],
      ['DELETE FROM attendance_sessions WHERE teaching_id = ?', [id]]
    ];

    if (tables.has('lms_tasks')) {
      if (tables.has('lms_submissions')) {
        items.push(['DELETE FROM lms_submissions WHERE task_id IN (SELECT id FROM lms_tasks WHERE teaching_id = ?)', [id]]);
      }
      items.push(['DELETE FROM lms_tasks WHERE teaching_id = ?', [id]]);
    }
    if (tables.has('lms_materials')) {
      items.push(['DELETE FROM lms_materials WHERE teaching_id = ?', [id]]);
    }

    items.push(['DELETE FROM teaching WHERE id = ?', [id]]);

    await db.batch(items);
    res.json({ ok: true });
  } catch (e) {
    return handleDb(res, e);
  }
});

router.post('/announcements', async (req, res) => {
  const title = str(req.body.title, 150);
  const body = str(req.body.body, 2000);

  if (!title || !body) {
    return bad(res, 'Judul dan isi wajib diisi.');
  }

  try {
    const info = await insertReturnId(
      'INSERT INTO announcements(title,body) VALUES(?,?)',
      [title, body]
    );

    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    return handleDb(res, e);
  }
});

router.delete('/announcements/:id', async (req, res) => {
  try {
    await db.prepare(
      'DELETE FROM announcements WHERE id = ?'
    ).run(req.params.id);

    res.json({ ok: true });
  } catch (e) {
    return handleDb(res, e);
  }
});

// ===== KENAIKAN KELAS & KELULUSAN =====
router.get('/classes/:id/students', async (req, res) => {
  try {
    res.json(await db.prepare(`
      SELECT st.id, st.user_id, st.nis, u.name
      FROM students st
      JOIN users u ON u.id = st.user_id
      WHERE st.class_id = ?
      ORDER BY u.name
    `).all(req.params.id));
  } catch (e) {
    return handleDb(res, e);
  }
});

router.get('/alumni', async (req, res) => {
  try {
    res.json(await db.prepare(`
      SELECT st.id, st.nis, u.name, st.graduated_at, st.graduated_from
      FROM students st
      JOIN users u ON u.id = st.user_id
      WHERE st.status = 'lulus'
      ORDER BY st.graduated_at DESC, u.name
    `).all());
  } catch (e) {
    return handleDb(res, e);
  }
});

// Pindahkan siswa satu kelas ke kelas baru, atau luluskan.
// body: { from_class_id, to_class_id, graduate, student_ids: [], deactivate }
router.post('/promotion', async (req, res) => {
  try {
    const from = Number(req.body.from_class_id);
    const graduate = req.body.graduate === true;
    const to = Number(req.body.to_class_id) || null;
    const ids = Array.isArray(req.body.student_ids)
      ? [...new Set(req.body.student_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
      : [];

    if (!from) return bad(res, 'Kelas asal wajib dipilih.');
    if (!ids.length) return bad(res, 'Pilih minimal satu siswa.');
    if (ids.length > 500) return bad(res, 'Maksimal 500 siswa sekali proses.');

    const src = await db.prepare('SELECT id, name FROM classes WHERE id = ?').get(from);
    if (!src) return res.status(404).json({ error: 'Kelas asal tidak ditemukan' });

    if (!graduate) {
      if (!to) return bad(res, 'Kelas tujuan wajib dipilih.');
      if (to === from) return bad(res, 'Kelas tujuan harus berbeda dari kelas asal.');
      const dst = await db.prepare('SELECT id FROM classes WHERE id = ?').get(to);
      if (!dst) return bad(res, 'Kelas tujuan tidak ditemukan.');
    }

    const members = await db.prepare('SELECT id, user_id FROM students WHERE class_id = ?').all(from);
    const userOf = new Map(members.map((m) => [Number(m.id), Number(m.user_id)]));

    if (ids.some((i) => !userOf.has(i))) {
      return bad(res, 'Ada siswa yang bukan anggota kelas asal. Muat ulang halaman lalu coba lagi.');
    }

    const items = [];
    for (const id of ids) {
      if (graduate) {
        items.push([
          "UPDATE students SET class_id = NULL, status = 'lulus', graduated_at = date('now'), graduated_from = ? WHERE id = ?",
          [src.name, id]
        ]);
        if (req.body.deactivate === true) {
          items.push(['UPDATE users SET active = 0 WHERE id = ?', [userOf.get(id)]]);
        }
      } else {
        items.push(['UPDATE students SET class_id = ? WHERE id = ?', [to, id]]);
      }
    }

    await db.batch(items); // atomik: semua berhasil atau semua batal
    res.json({ ok: true, count: ids.length });
  } catch (e) {
    return handleDb(res, e);
  }
});

// Kembalikan alumni ke sebuah kelas (jika salah meluluskan)
router.put('/students/:id/restore', async (req, res) => {
  try {
    const cid = Number(req.body.class_id);
    if (!cid) return bad(res, 'Kelas tujuan wajib dipilih.');

    const kelas = await db.prepare('SELECT id FROM classes WHERE id = ?').get(cid);
    if (!kelas) return bad(res, 'Kelas tidak ditemukan.');

    const st = await db.prepare(
      "SELECT id, user_id FROM students WHERE id = ? AND status = 'lulus'"
    ).get(req.params.id);
    if (!st) return res.status(404).json({ error: 'Data alumni tidak ditemukan' });

    await db.batch([
      ["UPDATE students SET class_id = ?, status = 'aktif', graduated_at = NULL, graduated_from = NULL WHERE id = ?", [cid, Number(st.id)]],
      ['UPDATE users SET active = 1 WHERE id = ?', [Number(st.user_id)]]
    ]);
    res.json({ ok: true });
  } catch (e) {
    return handleDb(res, e);
  }
});

// ===== TAHUN AJARAN & SEMESTER =====
router.get('/periods', async (req, res) => {
  try {
    res.json(await db.prepare(`
      SELECT p.id, p.name, p.semester, p.is_active,
        (SELECT COUNT(*) FROM teaching t WHERE t.year_id = p.id) AS used
      FROM academic_years p
      ORDER BY p.name DESC, p.semester DESC
    `).all());
  } catch (e) {
    return handleDb(res, e);
  }
});

router.get('/periods/active', async (req, res) => {
  try {
    const p = await db.prepare(
      'SELECT id, name, semester FROM academic_years WHERE is_active = 1'
    ).get();
    res.json(p || null);
  } catch (e) {
    return handleDb(res, e);
  }
});

router.post('/periods', async (req, res) => {
  const name = str(req.body.name, 9);
  const semester = str(req.body.semester, 10);

  if (!/^\d{4}\/\d{4}$/.test(name)) {
    return bad(res, 'Format tahun ajaran harus seperti 2026/2027.');
  }

  if (!['Ganjil', 'Genap'].includes(semester)) {
    return bad(res, 'Semester harus Ganjil atau Genap.');
  }

  try {
    const aktif = await db.prepare(
      'SELECT id FROM academic_years WHERE is_active = 1'
    ).get();

    const info = await insertReturnId(
      'INSERT INTO academic_years(name,semester,is_active) VALUES(?,?,?)',
      [name, semester, aktif ? 0 : 1]
    );

    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    return handleDb(res, e);
  }
});

router.put('/periods/:id/activate', async (req, res) => {
  try {
    const p = await db.prepare(
      'SELECT id FROM academic_years WHERE id = ?'
    ).get(req.params.id);

    if (!p) {
      return res.status(404).json({ error: 'Periode tidak ditemukan' });
    }

    // Atomik: tidak pernah ada kondisi "tanpa periode aktif" di tengah proses
    await db.batch([
      ['UPDATE academic_years SET is_active = 0', []],
      ['UPDATE academic_years SET is_active = 1 WHERE id = ?', [Number(p.id)]]
    ]);

    res.json({ ok: true });
  } catch (e) {
    return handleDb(res, e);
  }
});

router.delete('/periods/:id', async (req, res) => {
  try {
    const p = await db.prepare(
      'SELECT id, is_active FROM academic_years WHERE id = ?'
    ).get(req.params.id);

    if (!p) {
      return res.status(404).json({ error: 'Periode tidak ditemukan' });
    }

    if (p.is_active) {
      return bad(res, 'Periode aktif tidak bisa dihapus. Aktifkan periode lain dulu.');
    }

    const dipakai = await db.prepare(
      'SELECT COUNT(*) n FROM teaching WHERE year_id = ?'
    ).get(p.id);

    if (dipakai.n > 0) {
      return bad(res, 'Periode sudah dipakai oleh Kelas Ajar, tidak bisa dihapus.');
    }

    await db.prepare('DELETE FROM academic_years WHERE id = ?').run(p.id);
    res.json({ ok: true });
  } catch (e) {
    return handleDb(res, e);
  }
});

// ===== IMPOR PENGGUNA DARI EXCEL =====
const IMPORT_MAX_ROWS = 100;
const IMPORT_MAX_BYTES = 500 * 1024;
const IMPORT_ROLES = {
  siswa: 'siswa',
  guru: 'guru',
  kepsek: 'kepsek',
  'kepala sekolah': 'kepsek',
  admin: 'admin'
};

// Template Excel yang bisa diunduh
router.get('/users/template', (req, res) => {
  try {
    const wb = XLSX.utils.book_new();

    const sheet = XLSX.utils.aoa_to_sheet([
      ['Username', 'Nama Lengkap', 'Peran', 'Password', 'NIS', 'Kelas'],
      ['siswa001', 'Contoh Siswa', 'siswa', 'rahasia123', '2026001', 'X RPL 1'],
      ['guru001', 'Contoh Guru', 'guru', 'rahasia123', '', '']
    ]);
    sheet['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, sheet, 'Template');

    const help = XLSX.utils.aoa_to_sheet([
      ['Petunjuk pengisian'],
      ['1. Hapus dua baris contoh, lalu isi data Anda mulai dari baris 2.'],
      ['2. Peran: siswa, guru, kepsek, atau admin.'],
      ['3. Password minimal 8 karakter. Pengguna wajib menggantinya saat pertama login.'],
      ['4. NIS dan Kelas hanya untuk siswa. NIS kosong = memakai Username.'],
      ['5. Nama Kelas harus sama persis dengan yang ada di menu Kelas.'],
      [`6. Maksimal ${IMPORT_MAX_ROWS} baris per file.`]
    ]);
    help['!cols'] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, help, 'Petunjuk');

    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Disposition', 'attachment; filename="template-impor-pengguna.xlsx"');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.send(buffer);
  } catch (e) {
    console.error('Template gagal:', e);
    res.status(500).json({ error: 'Gagal membuat template' });
  }
});

// Ambil nilai kolom dengan nama header yang fleksibel
function pickCol(row, names) {
  for (const k of Object.keys(row)) {
    const nk = String(k).trim().toLowerCase().replace(/[^a-z]/g, '');
    if (names.includes(nk)) return String(row[k] == null ? '' : row[k]).trim();
  }
  return '';
}

// Impor pengguna: body JSON { file: <isi file .xlsx dalam base64> }
router.post('/users/import', async (req, res) => {
  const b64 = typeof req.body.file === 'string' ? req.body.file : '';

  if (!b64) {
    return bad(res, 'File Excel belum dipilih.');
  }

  let rows;

  try {
    const buf = Buffer.from(b64, 'base64');

    if (!buf.length || buf.length > IMPORT_MAX_BYTES) {
      return bad(res, 'Ukuran file tidak valid (maksimal 500 KB).');
    }

    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  } catch (e) {
    console.error('Baca Excel gagal:', e);
    return bad(res, 'File tidak bisa dibaca. Pastikan formatnya .xlsx dari template.');
  }

  rows = rows.filter((r) => Object.values(r).some((v) => String(v).trim() !== ''));

  if (!rows.length) {
    return bad(res, 'Tidak ada data pada file.');
  }

  if (rows.length > IMPORT_MAX_ROWS) {
    return bad(res, `Maksimal ${IMPORT_MAX_ROWS} baris per file. File ini berisi ${rows.length} baris.`);
  }

  try {
    const classRows = await db.prepare('SELECT id, name FROM classes').all();
    const classMap = new Map(classRows.map((c) => [String(c.name).trim().toLowerCase(), c.id]));

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const line = i + 2;

      const username = pickCol(row, ['username', 'user']).slice(0, 50);
      const name = pickCol(row, ['namalengkap', 'nama', 'name']).slice(0, 120);
      const roleKey = pickCol(row, ['peran', 'role']).toLowerCase();
      const password = pickCol(row, ['password', 'katasandi']);
      const nisRaw = pickCol(row, ['nis']).slice(0, 30);
      const className = pickCol(row, ['kelas', 'class']);

      const fail = (msg) => {
        failed++;
        errors.push({ row: line, username, message: msg });
      };

      if (!/^[A-Za-z0-9_.@-]{3,50}$/.test(username)) {
        fail('Username harus 3-50 karakter (huruf, angka, . _ @ -).');
        continue;
      }

      if (!name) {
        fail('Nama wajib diisi.');
        continue;
      }

      const r = IMPORT_ROLES[roleKey];

      if (!r) {
        fail('Peran harus siswa, guru, kepsek, atau admin.');
        continue;
      }

      if (password.length < 8 || password.length > 72) {
        fail('Password harus 8-72 karakter.');
        continue;
      }

      let classId = null;

      if (r === 'siswa' && className) {
        classId = classMap.get(className.toLowerCase()) || null;

        if (!classId) {
          fail(`Kelas "${className}" tidak ditemukan.`);
          continue;
        }
      }

      const ada = await db.prepare('SELECT id FROM users WHERE username = ?').get(username);

      if (ada) {
        skipped++;
        errors.push({ row: line, username, message: 'Dilewati: username sudah terdaftar.' });
        continue;
      }

      let info = null;

      try {
        info = await insertReturnId(
          'INSERT INTO users(username,password_hash,name,role,must_change) VALUES(?,?,?,?,1)',
          [username, await bcrypt.hash(password, 10), name, r]
        );

        if (r === 'siswa') {
          await insertReturnId(
            'INSERT INTO students(user_id,nis,class_id) VALUES(?,?,?)',
            [info.lastInsertRowid, nisRaw || username, classId]
          );
        }
        created++;
      } catch (e) {
        if (info && info.lastInsertRowid) {
          try {
            await db.batch([
              ['DELETE FROM students WHERE user_id = ?', [info.lastInsertRowid]],
              ['DELETE FROM users WHERE id = ?', [info.lastInsertRowid]]
            ]);
          } catch (e2) {
            console.error(e2);
          }
        }

        console.error(e);
        fail(String(e && e.message).includes('UNIQUE')
          ? 'Username atau NIS sudah dipakai.'
          : 'Gagal menyimpan data.');
      }
    }

    res.json({ created, skipped, failed, errors });
  } catch (e) {
    return handleDb(res, e);
  }
});

// ===== EXPORT NILAI & ABSENSI KE EXCEL =====
// Memakai buildReport (sama dengan E-Rapor) supaya angkanya selalu cocok dengan rapor.
// Query: ?class_id=<id kelas, kosong = semua kelas>&semester=<mis. "Ganjil 2026/2027", kosong = bawaan rapor>
const EXPORT_MAX_STUDENTS = 1500;

// Cegah "formula injection" bila ada teks yang diawali = + - @
const xcell = (v) => {
  if (v == null) return '';
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
};
const round1 = (n) => (n == null || isNaN(n) ? '' : Math.round(Number(n) * 10) / 10);

async function collectReports(req) {
  const classId = Number(req.query.class_id) || null;
  const semester = req.query.semester ? String(req.query.semester).slice(0, 40) : null;

  let sql = `
    SELECT st.user_id, st.nis, u.name, c.name AS class_name
    FROM students st
    JOIN users u ON u.id = st.user_id
    JOIN classes c ON c.id = st.class_id
    WHERE st.class_id IS NOT NULL
  `;
  const p = [];

  if (classId) {
    sql += ' AND st.class_id = ?';
    p.push(classId);
  }

  sql += ' ORDER BY c.name, u.name';

  const students = await db.prepare(sql).all(...p);

  if (!students.length) return { error: 'Tidak ada siswa pada kelas yang dipilih.' };
  if (students.length > EXPORT_MAX_STUDENTS) {
    return { error: `Terlalu banyak siswa (${students.length}). Pilih satu kelas saja.` };
  }

  const items = [];

  for (let i = 0; i < students.length; i += 10) {
    const chunk = students.slice(i, i + 10);
    const reps = await Promise.all(
      chunk.map((s) => buildReport(Number(s.user_id), semester).catch(() => null))
    );
    chunk.forEach((s, j) => items.push({ s, d: reps[j] }));
  }

  const first = items.find((x) => x.d && x.d.semester);
  return {
    items,
    semester: first ? first.d.semester : (semester || '-'),
    kkm: first ? first.d.kkm : '-'
  };
}

function sendXlsx(res, wb, base) {
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  const stamp = new Date().toISOString().slice(0, 10);

  res.setHeader('Content-Disposition', `attachment; filename="${base}-${stamp}.xlsx"`);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.send(buffer);
}

function addSheet(wb, name, rows, widths) {
  const ws = XLSX.utils.json_to_sheet(rows);
  if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, name);
}

router.get('/export/nilai', async (req, res) => {
  try {
    const r = await collectReports(req);
    if (r.error) return bad(res, r.error);

    const perMapel = [];
    const ringkas = [];

    for (const { s, d } of r.items) {
      const subjects = d && Array.isArray(d.subjects) ? d.subjects : [];
      const finals = subjects.map((x) => x.final).filter((v) => v != null);
      const rata = finals.length ? finals.reduce((a, b) => a + Number(b), 0) / finals.length : null;
      const bawah = subjects.filter((x) => x.passed === false).map((x) => x.subject);

      subjects.forEach((x) => {
        perMapel.push({
          NIS: xcell(s.nis || ''),
          Nama: xcell(s.name),
          Kelas: xcell(s.class_name),
          'Mata Pelajaran': xcell(x.subject),
          Guru: xcell(x.teacher || ''),
          'Nilai Akhir': round1(x.final),
          Predikat: x.predikat || '',
          Status: x.passed == null ? 'Belum ada nilai' : x.passed ? 'Tuntas' : 'Belum tuntas'
        });
      });

      ringkas.push({
        NIS: xcell(s.nis || ''),
        Nama: xcell(s.name),
        Kelas: xcell(s.class_name),
        'Jumlah Mapel': subjects.length,
        'Rata-rata': round1(rata),
        'Jumlah di Bawah KKM': bawah.length,
        'Mapel di Bawah KKM': xcell(bawah.join(', '))
      });
    }

    const wb = XLSX.utils.book_new();
    addSheet(wb, 'Ringkasan Siswa', ringkas, [14, 30, 14, 13, 11, 19, 40]);
    addSheet(
      wb,
      'Nilai per Mapel',
      perMapel.length ? perMapel : [{ Info: 'Belum ada data nilai.' }],
      [14, 30, 14, 28, 26, 12, 10, 16]
    );
    addSheet(wb, 'Info', [
      { Keterangan: 'Semester', Isi: r.semester },
      { Keterangan: 'KKM', Isi: r.kkm },
      { Keterangan: 'Jumlah siswa', Isi: r.items.length }
    ], [18, 30]);

    sendXlsx(res, wb, 'nilai');
  } catch (e) {
    console.error('Export nilai gagal:', e);
    res.status(500).json({ error: 'Gagal mengexport nilai' });
  }
});

router.get('/export/absensi', async (req, res) => {
  try {
    const r = await collectReports(req);
    if (r.error) return bad(res, r.error);

    const rows = r.items.map(({ s, d }) => {
      const a = (d && d.attendance) || { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
      const hadir = Number(a.hadir) || 0;
      const izin = Number(a.izin) || 0;
      const sakit = Number(a.sakit) || 0;
      const alpa = Number(a.alpa) || 0;
      const total = hadir + izin + sakit + alpa;

      return {
        NIS: xcell(s.nis || ''),
        Nama: xcell(s.name),
        Kelas: xcell(s.class_name),
        Hadir: hadir,
        Izin: izin,
        Sakit: sakit,
        Alpa: alpa,
        'Total Pertemuan': total,
        '% Kehadiran': total ? Math.round((hadir / total) * 100) : ''
      };
    });

    const wb = XLSX.utils.book_new();
    addSheet(wb, 'Rekap Absensi', rows, [14, 30, 14, 8, 8, 8, 8, 16, 13]);
    addSheet(wb, 'Info', [
      { Keterangan: 'Semester', Isi: r.semester },
      { Keterangan: 'Jumlah siswa', Isi: r.items.length },
      { Keterangan: 'Catatan', Isi: 'Angka sama dengan yang tercetak di E-Rapor (jumlah catatan absensi per mata pelajaran).' }
    ], [18, 70]);

    sendXlsx(res, wb, 'absensi');
  } catch (e) {
    console.error('Export absensi gagal:', e);
    res.status(500).json({ error: 'Gagal mengexport absensi' });
  }
});

// ===== E-RAPOR (admin melihat rapor siswa mana pun) =====
router.get('/rapor/:userId', async (req, res) => {
  try {
    const semester = req.query.semester ? String(req.query.semester).slice(0, 40) : null;
    const d = await buildReport(Number(req.params.userId), semester);

    if (!d) {
      return res.status(404).json({ error: 'Data siswa tidak ditemukan' });
    }

    res.json(d);
  } catch (e) {
    return handleDb(res, e);
  }
});

module.exports = router;