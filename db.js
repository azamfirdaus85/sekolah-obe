
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

  // SESI ABSENSI SISWA
  `CREATE TABLE IF NOT EXISTS attendance_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teaching_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    opened_by INTEGER NOT NULL,
    opened_at TEXT DEFAULT CURRENT_TIMESTAMP,
    closes_at TEXT,
    status TEXT NOT NULL DEFAULT 'open'
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
   ON attendance_sessions (teaching_id, date, status)`
];

/* =====================================================
   MIGRASI DATABASE
   ===================================================== */
const MIGRATIONS = [
  `ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1`,
  `ALTER TABLE users ADD COLUMN must_change INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN email TEXT`,
  `ALTER TABLE users ADD COLUMN phone TEXT`,
  `ALTER TABLE reflections ADD COLUMN created_at TEXT`,

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
   END`
];

const ALL_STATEMENTS = [
  CREATE_USERS,
  ...OTHER_TABLES,
  ...NEW_TABLES,
  ...NEW_INDEXES,
  ...MIGRATIONS
];

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
    for (const sql of ALL_STATEMENTS) {
      try {
        await client.execute(sql);
      } catch (e) {
        console.error('Database migration:', e.message);
      }
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

  for (const sql of ALL_STATEMENTS) {
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

  console.log('DB Mode: LOKAL');
}

module.exports = db;
s