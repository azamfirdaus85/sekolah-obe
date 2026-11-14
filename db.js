require('dotenv').config();
const fs = require('fs');
const path = require('path');

let db, client, isTurso = false;

/* =====================================================
   TABEL LAMA
   ===================================================== */
const CREATE_USERS = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT,
  active INTEGER DEFAULT 1,
  must_change INTEGER DEFAULT 0
)`;

const OTHER_TABLES = [
  `CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    year TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    nis TEXT UNIQUE,
    class_id INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    name TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS outcomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER,
    code TEXT,
    description TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS teaching (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER,
    class_id INTEGER,
    teacher_id INTEGER,
    semester TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teaching_id INTEGER,
    outcome_id INTEGER,
    name TEXT,
    weight INTEGER,
    max_score INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER,
    student_id INTEGER,
    score INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS reflections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teaching_id INTEGER,
    content TEXT,
    follow_up TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    body TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
];

/* =====================================================
   TABEL BARU
   ===================================================== */
const NEW_TABLES = [
  // Jadwal pelajaran
  `CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teaching_id INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    room TEXT
  )`,

  // Absensi siswa
  `CREATE TABLE IF NOT EXISTS student_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    teaching_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'hadir',
    note TEXT,
    recorded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (student_id, teaching_id, date)
  )`,

  // Absensi guru
  `CREATE TABLE IF NOT EXISTS teacher_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    check_in TEXT,
    check_out TEXT,
    status TEXT NOT NULL DEFAULT 'hadir',
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, date)
  )`,

  // Absensi kepala sekolah
  `CREATE TABLE IF NOT EXISTS principal_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    check_in TEXT,
    check_out TEXT,
    status TEXT NOT NULL DEFAULT 'hadir',
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, date)
  )`,

  // Layanan pengaduan
  `CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'baru',
    response TEXT,
    responded_by INTEGER,
    responded_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // Menu terakhir dikunjungi
  `CREATE TABLE IF NOT EXISTS visit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    page TEXT NOT NULL,
    label TEXT,
    visited_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // Dokumen administrasi
  `CREATE TABLE IF NOT EXISTS admin_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    title TEXT NOT NULL,
    description TEXT,
    doc_date TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // Kalender akademik
  `CREATE TABLE IF NOT EXISTS academic_calendar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // Tahun ajaran & semester
  `CREATE TABLE IF NOT EXISTS academic_years (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    semester TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name, semester)
  )`,

    // SESI ABSENSI SISWA
  `CREATE TABLE IF NOT EXISTS attendance_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teaching_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    opened_by INTEGER NOT NULL,
    opened_at TEXT DEFAULT CURRENT_TIMESTAMP,
    closes_at TEXT,
    status TEXT NOT NULL DEFAULT 'open'
  )`,

  // Data kegiatan ekstrakurikuler
  `CREATE TABLE IF NOT EXISTS extracurriculars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    coach_id INTEGER,
    schedule TEXT,
    quota INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // Pendaftaran siswa ekstrakurikuler
  `CREATE TABLE IF NOT EXISTS extracurricular_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    extracurricular_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    status TEXT DEFAULT 'aktif',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (extracurricular_id, student_id)
  )`,

  // Catatan bimbingan konseling
  `CREATE TABLE IF NOT EXISTS counseling_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    counselor_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    notes TEXT NOT NULL,
    follow_up TEXT,
    session_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
    // Tagihan SPP siswa
  `CREATE TABLE IF NOT EXISTS spp_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    period TEXT NOT NULL,
    amount INTEGER NOT NULL,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'belum_lunas',
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

    // Riwayat pembayaran SPP
  `CREATE TABLE IF NOT EXISTS spp_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    payment_date TEXT NOT NULL,
    method TEXT DEFAULT 'Tunai',
    note TEXT,
    recorded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // Bukti pembayaran SPP yang diunggah siswa
  `CREATE TABLE IF NOT EXISTS spp_payment_proofs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    proof_data TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'menunggu',
    reviewed_by INTEGER,
    reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
    // Hubungan akun orang tua dengan siswa
  `CREATE TABLE IF NOT EXISTS parent_student_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_user_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    relationship TEXT DEFAULT 'Orang Tua/Wali',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (parent_user_id, student_id)
  )`
];
/* =====================================================
   INDEX DATABASE
   ===================================================== */
const NEW_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_schedules_day
   ON schedules (day_of_week)`,

  `CREATE INDEX IF NOT EXISTS idx_sa_date
   ON student_attendance (date)`,

  `CREATE INDEX IF NOT EXISTS idx_ta_date
   ON teacher_attendance (date)`,

  `CREATE INDEX IF NOT EXISTS idx_pa_date
   ON principal_attendance (date)`,

  `CREATE INDEX IF NOT EXISTS idx_complaints_user
   ON complaints (user_id)`,

  `CREATE INDEX IF NOT EXISTS idx_visit_user
   ON visit_log (user_id, visited_at)`,

  `CREATE INDEX IF NOT EXISTS idx_attendance_sessions_teaching
   ON attendance_sessions (teaching_id, date, status)`,

  `CREATE INDEX IF NOT EXISTS idx_students_class
   ON students (class_id)`,
     `CREATE INDEX IF NOT EXISTS idx_spp_invoice_student
   ON spp_invoices (student_id)`,

  `CREATE INDEX IF NOT EXISTS idx_spp_payment_invoice
   ON spp_payments (invoice_id)`,
     `CREATE INDEX IF NOT EXISTS idx_parent_student_parent
   ON parent_student_links (parent_user_id)`,

  `CREATE INDEX IF NOT EXISTS idx_parent_student_student
   ON parent_student_links (student_id)`
];

/* =====================================================
   MIGRASI DATABASE
   Aman dijalankan berulang kali (idempotent):
   - kolom hanya ditambah kalau BELUM ada (tidak ada lagi error "duplicate column")
   - tabel users TIDAK lagi dibangun ulang setiap server start
   ===================================================== */
// Naikkan nilai ini setiap kali menambah tabel, kolom, atau index baru.
// Selama versinya sama, server TIDAK mengulang migrasi saat start (hemat belasan
// perjalanan ke database di setiap cold start Vercel).
const SCHEMA_VERSION = '2026-11-14-1';

const COLUMN_ADDS = [
  ['users', 'active', 'INTEGER DEFAULT 1'],
  ['users', 'must_change', 'INTEGER DEFAULT 0'],
  ['users', 'created_at', 'TEXT'],
  ['users', 'email', 'TEXT'],
  ['users', 'phone', 'TEXT'],
  ['users', 'avatar_data', 'TEXT'],
  ['teaching', 'year_id', 'INTEGER'],
  ['reflections', 'created_at', 'TEXT'],

  // Wali kelas: menyimpan users.id milik guru yang menjadi wali
  ['classes', 'homeroom_teacher_id', 'INTEGER'],

  // Kelulusan: status siswa (aktif / lulus), tanggal lulus, dan kelas terakhir
  ['students', 'status', "TEXT DEFAULT 'aktif'"],
  ['students', 'graduated_at', 'TEXT'],
  ['students', 'graduated_from', 'TEXT'],

  // Menghubungkan pembayaran dengan bukti yang diverifikasi
  ['spp_payments', 'proof_id', 'INTEGER']
];

const POST_STATEMENTS = [
  `UPDATE users SET active = 1 WHERE active IS NULL`,
  `UPDATE users SET must_change = 0 WHERE must_change IS NULL`,
  `UPDATE reflections SET created_at = datetime('now') WHERE created_at IS NULL`,

  `CREATE TRIGGER IF NOT EXISTS trg_reflections_created
   AFTER INSERT ON reflections
   WHEN NEW.created_at IS NULL
   BEGIN
     UPDATE reflections
     SET created_at = datetime('now')
     WHERE id = NEW.id;
   END`,

  // Mencegah satu bukti tercatat sebagai pembayaran lebih dari sekali
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_spp_payment_proof
   ON spp_payments (proof_id)`
];

// Semua CREATE TABLE / INDEX bersifat IF NOT EXISTS, jadi aman dijalankan ulang
const CREATE_STATEMENTS = [
  CREATE_USERS,
  ...OTHER_TABLES,
  ...NEW_TABLES,
  ...NEW_INDEXES
];

/* Perubahan tabel users agar role 'orang_tua' diizinkan.
   Hanya dijalankan SEKALI: ketika tabel users punya CHECK tetapi belum memuat orang_tua. */
const USERS_NEW_SQL = `CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (
    role IN ('admin','guru','siswa','kepsek','orang_tua')
  ),
  must_change INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  email TEXT,
  phone TEXT,
  avatar_data TEXT
)`;

const USERS_COPY_SQL = `INSERT INTO users_new (
  id, username, password_hash, name, role,
  must_change, active, created_at, email,
  phone, avatar_data
)
SELECT
  id, username, password_hash, name, role,
  COALESCE(must_change, 0), COALESCE(active, 1), created_at, email,
  phone, avatar_data
FROM users`;

const needsUsersRebuild = (sql) =>
  /CHECK/i.test(String(sql || '')) && !String(sql || '').includes('orang_tua');

/* =====================================================
   KONEKSI TURSO
   ===================================================== */
if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  const { createClient } = require('@libsql/client');

  client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });

  isTurso = true;

  const ready = (async () => {
    let clean = true;
    const fail = (...args) => {
      clean = false;
      console.error(...args);
    };

    try {
      // Cek cepat: bila skema sudah versi terbaru, lewati seluruh migrasi (hanya 1 query)
      try {
        const v = await client.execute(`SELECT value FROM schema_meta WHERE key = 'version'`);
        if (v.rows[0] && String(v.rows[0].value) === SCHEMA_VERSION) return;
      } catch (e) {
        // tabel schema_meta belum ada: jalankan migrasi lengkap
      }

      // 1. Buat semua tabel dan index dalam satu perjalanan ke database
      try {
        await client.batch(
          CREATE_STATEMENTS.map((sql) => ({ sql, args: [] })),
          'write'
        );
      } catch (e) {
        fail('Database batch gagal, mencoba satu per satu:', e.message);
        for (const sql of CREATE_STATEMENTS) {
          try {
            await client.execute(sql);
          } catch (e2) {
            fail('Database migration:', e2.message);
          }
        }
      }

      // 2. Tambah kolom yang belum ada
      const colCache = new Map();
      for (const [table, column, def] of COLUMN_ADDS) {
        try {
          if (!colCache.has(table)) {
            const info = await client.execute(`PRAGMA table_info(${table})`);
            colCache.set(table, new Set(info.rows.map((r) => String(r.name))));
          }
          if (!colCache.get(table).has(column)) {
            await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
            colCache.get(table).add(column);
            console.log(`Database: kolom ${table}.${column} ditambahkan`);
          }
        } catch (e) {
          if (!/duplicate column name/i.test(String(e.message))) {
            fail('Database migration:', e.message);
          }
        }
      }

      // 3. Izinkan role orang_tua (hanya jika belum)
      try {
        const schema = await client.execute(
          `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`
        );
        const usersSql = String(schema.rows[0]?.sql || '');

        if (needsUsersRebuild(usersSql)) {
          const objects = await client.execute(`
            SELECT sql FROM sqlite_master
            WHERE tbl_name = 'users'
              AND type IN ('index', 'trigger')
              AND sql IS NOT NULL
          `);

          const statements = [
            'PRAGMA defer_foreign_keys = ON',
            'DROP TABLE IF EXISTS users_new',
            USERS_NEW_SQL,
            USERS_COPY_SQL,
            'DROP TABLE users',
            'ALTER TABLE users_new RENAME TO users',
            ...objects.rows.map((row) => row.sql)
          ];

          // Satu batch = satu transaksi: kalau ada yang gagal, tidak ada yang berubah
          await client.batch(statements.map((sql) => ({ sql, args: [] })), 'write');
          console.log('Database: role orang_tua berhasil ditambahkan');
        }
      } catch (e) {
        fail('Database: gagal memperbarui tabel users:', e.message);
      }

      // 4. Perbaikan data dan trigger
      for (const sql of POST_STATEMENTS) {
        try {
          await client.execute(sql);
        } catch (e) {
          fail('Database migration:', e.message);
        }
      }

      // 5. Tandai skema sudah mutakhir (hanya bila semua langkah di atas berhasil)
      if (clean) {
        await client.execute(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`);
        await client.execute({
          sql: `INSERT INTO schema_meta (key, value) VALUES ('version', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          args: [SCHEMA_VERSION]
        });
      }
    } catch (e) {
      // Jangan biarkan promise ini menolak tanpa penangan (bisa mematikan proses Node)
      console.error('Inisialisasi database gagal:', e.message);
    }
  })();

  db = {
    client,
    _client: client,
    isTurso: true,
    _isTurso: true,
    ready,

    query: (sql, args = []) => client.execute({ sql, args }),

    prepare: (sql) => ({
      get: async (...args) => {
        const r = await client.execute({ sql, args });
        return r.rows[0];
      },

      all: async (...args) => {
        const r = await client.execute({ sql, args });
        return r.rows;
      },

      run: async (...args) => {
        const r = await client.execute({ sql, args });

        const rid =
          r.lastInsertRowid !== undefined && r.lastInsertRowid !== null
            ? r.lastInsertRowid
            : r.lastInsertRowId;

        return {
          lastInsertRowid: rid ? Number(rid) : 0,
          lastInsertRowId: rid,
          changes: r.rowsAffected || 0,
          rowsAffected: r.rowsAffected
        };
      }
    }),

    exec: async (sql) => {
      try {
        await client.execute(sql);
      } catch (e) {
        console.error(e.message);
      }
    },

    // Beberapa perintah sekaligus, atomik (semua berhasil atau semua batal).
    // items: [[sql, [args]], [sql, [args]], ...]
    batch: async (items) => {
      const rs = await client.batch(
        items.map(([sql, args = []]) => ({ sql, args })),
        'write'
      );
      return rs.map((r) => ({ changes: r.rowsAffected || 0 }));
    },

    transaction: (fn) => fn,
    syncDb: () => {}
  };

  console.log('DB Mode: TURSO CLOUD COMPAT');

/* =====================================================
   KONEKSI SQLITE LOKAL
   ===================================================== */
} else {
  const Database = require('better-sqlite3');

  const dbDir = path.join(__dirname, 'data');

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const sqlite = new Database(path.join(dbDir, 'siakad.db'));

  sqlite.pragma('journal_mode = WAL');

  // 1. Tabel dan index
  for (const sql of CREATE_STATEMENTS) {
    try {
      sqlite.exec(sql);
    } catch (e) {
      console.error('Database migration:', e.message);
    }
  }

  // 2. Tambah kolom yang belum ada
  for (const [table, column, def] of COLUMN_ADDS) {
    try {
      const have = new Set(
        sqlite.prepare(`PRAGMA table_info(${table})`).all().map((r) => String(r.name))
      );
      if (!have.has(column)) {
        sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
        console.log(`Database: kolom ${table}.${column} ditambahkan`);
      }
    } catch (e) {
      if (!/duplicate column name/i.test(String(e.message))) {
        console.error('Database migration:', e.message);
      }
    }
  }

  // 3. Izinkan role orang_tua (hanya jika belum), dalam satu transaksi
  try {
    const row = sqlite
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
      .get();

    if (needsUsersRebuild(row && row.sql)) {
      const objects = sqlite
        .prepare(`SELECT sql FROM sqlite_master
                  WHERE tbl_name = 'users' AND type IN ('index', 'trigger') AND sql IS NOT NULL`)
        .all();

      sqlite.pragma('foreign_keys = OFF');
      try {
        sqlite.transaction(() => {
          sqlite.exec('DROP TABLE IF EXISTS users_new');
          sqlite.exec(USERS_NEW_SQL);
          sqlite.exec(USERS_COPY_SQL);
          sqlite.exec('DROP TABLE users');
          sqlite.exec('ALTER TABLE users_new RENAME TO users');
          for (const o of objects) sqlite.exec(o.sql);
        })();
        console.log('Database: role orang_tua berhasil ditambahkan');
      } finally {
        sqlite.pragma('foreign_keys = ON');
      }
    }
  } catch (e) {
    console.error('Database: gagal memperbarui tabel users:', e.message);
  }

  // 4. Perbaikan data dan trigger
  for (const sql of POST_STATEMENTS) {
    try {
      sqlite.exec(sql);
    } catch (e) {
      console.error('Database migration:', e.message);
    }
  }

  db = sqlite;
  db.client = null;
  db._client = null;
  db.isTurso = false;
  db._isTurso = false;
  db.ready = Promise.resolve();

  // Padanan db.batch() untuk mode lokal
  db.batch = async (items) =>
    sqlite.transaction(() =>
      items.map(([sql, args = []]) => ({
        changes: sqlite.prepare(sql).run(...args).changes
      }))
    )();

  console.log('DB Mode: LOKAL');
}

module.exports = db;