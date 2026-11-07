const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

// Kalo di Vercel pake Turso, kalo di laptop pake file lokal
const isVercel = !!process.env.VERCEL;
let db;

if (isVercel) {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error('TURSO_DATABASE_URL / TURSO_AUTH_TOKEN belum ke-set di Vercel!');
  }
  // Pake Embedded Replica: nulis di /tmp tapi auto-sync ke Turso
  db = createClient({
    url: 'file:/tmp/sekolah.db',
    syncUrl: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
    syncInterval: 60,
  });
} else {
  const path = require('path');
  const fs = require('fs');
  const dbFile = process.env.DB_FILE || path.join(__dirname, 'data', 'sekolah.db');
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  db = createClient({ url: 'file:' + dbFile });
}

// Biar kode lama kamu yang pake db.prepare().get().run() tetep jalan
// kita bungkus biar sync
const originalExec = db.executeSync.bind(db);
db.exec = (sql) => { return originalExec(sql); };

function syncDb() {
  if (isVercel && db.sync) {
    db.sync().catch(e => console.log('Sync error:', e.message));
  }
}

// Buat tabel (sama kayak punya kamu)
db.executeSync(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','guru','siswa','kepsek')),
  must_change INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  year TEXT
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nis TEXT UNIQUE,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS teaching (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  semester TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  UNIQUE(subject_id, code)
);
CREATE TABLE IF NOT EXISTS assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teaching_id INTEGER NOT NULL REFERENCES teaching(id) ON DELETE CASCADE,
  outcome_id INTEGER REFERENCES outcomes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  max_score REAL NOT NULL DEFAULT 100
);
CREATE TABLE IF NOT EXISTS scores (
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score REAL NOT NULL,
  PRIMARY KEY (assessment_id, student_id)
);
CREATE TABLE IF NOT EXISTS reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teaching_id INTEGER NOT NULL REFERENCES teaching(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  follow_up TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// --- AUTO SEED, CUMA KALO BENER-BENER KOSONG ---
try {
  // Sync dulu dari Turso biar data lama ke-download
  if (isVercel && db.sync) {
    db.sync();
  }
  const count = db.executeSync('SELECT COUNT(*) AS n FROM users').rows[0].n;
  if (count === 0) {
    console.log('Database kosong, seeding...');
    const hash = (p) => bcrypt.hashSync(p, 10);
    const addUser = (u,p,n,r) => db.executeSync({ sql: 'INSERT INTO users(username, password_hash, name, role) VALUES(?,?,?,?)', args: [u, hash(p), n, r] });
    addUser('admin', 'admin123', 'Administrator Sekolah', 'admin');
    addUser('kepsek', 'kepsek123', 'Drs. Ahmad Fauzi, M.Pd.', 'kepsek');
    const g1 = Number(db.executeSync({ sql: 'INSERT INTO users(username, password_hash, name, role) VALUES(?,?,?,?)', args: ['guru1', hash('guru123'), 'Siti Rahma, S.Pd.', 'guru'] }).lastInsertRowid);
    const g2 = Number(db.executeSync({ sql: 'INSERT INTO users(username, password_hash, name, role) VALUES(?,?,?,?)', args: ['guru2', hash('guru123'), 'Budi Hartono, S.Kom.', 'guru'] }).lastInsertRowid);
    const kelasId = Number(db.executeSync({ sql: 'INSERT INTO classes(name,year) VALUES(?,?)', args: ['X RPL 1', '2026/2027'] }).lastInsertRowid);
    const s1 = Number(db.executeSync({ sql: 'INSERT INTO subjects(code,name) VALUES(?,?)', args: ['INF', 'Informatika'] }).lastInsertRowid);
    const s2 = Number(db.executeSync({ sql: 'INSERT INTO subjects(code,name) VALUES(?,?)', args: ['MTK', 'Matematika'] }).lastInsertRowid);
    db.executeSync({ sql: 'INSERT INTO teaching(subject_id,class_id,teacher_id,semester) VALUES(?,?,?,?)', args: [s1, kelasId, g1, 'Ganjil 2026/2027'] });
    db.executeSync({ sql: 'INSERT INTO teaching(subject_id,class_id,teacher_id,semester) VALUES(?,?,?,?)', args: [s2, kelasId, g2, 'Ganjil 2026/2027'] });
    db.executeSync({ sql: 'INSERT INTO announcements(title,body) VALUES(?,?)', args: ['Selamat Datang', 'Selamat datang di SIAKAD OBE Sekolah'] });
    db.executeSync({ sql: 'INSERT INTO outcomes(subject_id,code,description) VALUES(?,?,?)', args: [s1, 'CP-1', 'Memahami konsep dasar informatika'] });
    console.log('Seed selesai');
    syncDb();
  }
} catch (e) { console.log('Auto seed error:', e.message); }

// Wrapper biar file api/ lama kamu yang pake .prepare() tetep jalan
const oldPrepare = db.prepare ? db.prepare.bind(db) : null;
if (!db.prepare) {
  db.prepare = (sql) => {
    return {
      get: (...args) => db.executeSync({ sql, args }).rows[0],
      all: (...args) => db.executeSync({ sql, args }).rows,
      run: (...args) => {
        const res = db.executeSync({ sql, args });
        syncDb();
        return { lastInsertRowid: res.lastInsertRowid, changes: res.rowsAffected };
      }
    };
  };
}

module.exports = db;
module.exports.syncDb = syncDb;