let Database;
try {
  const { DatabaseSync } = require('node:sqlite');
  Database = DatabaseSync;
} catch (e) { throw e; }
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbFile = process.env.DB_FILE || path.join(__dirname, 'data', 'sekolah.db');
const finalDbPath = process.env.VERCEL ? '/tmp/sekolah.db' : dbFile;
if (!process.env.VERCEL) {
  fs.mkdirSync(path.dirname(finalDbPath), { recursive: true });
}
const db = new Database(finalDbPath);
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA foreign_keys = ON;`);

db.exec(`
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
`);

// --- AUTO SEED ---
try {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count === 0) {
    console.log('Database kosong, seeding...');
    const hash = (p) => bcrypt.hashSync(p, 10);
    const addUser = db.prepare('INSERT INTO users(username, password_hash, name, role) VALUES(?,?,?,?)');
    addUser.run('admin', hash('admin123'), 'Administrator Sekolah', 'admin');
    addUser.run('kepsek', hash('kepsek123'), 'Drs. Ahmad Fauzi, M.Pd.', 'kepsek');
    const g1 = addUser.run('guru1', hash('guru123'), 'Siti Rahma, S.Pd.', 'guru').lastInsertRowid;
    const g2 = addUser.run('guru2', hash('guru123'), 'Budi Hartono, S.Kom.', 'guru').lastInsertRowid;

    const kelasId = db.prepare('INSERT INTO classes(name,year) VALUES(?,?)').run('X RPL 1', '2026/2027').lastInsertRowid;
    const s1 = db.prepare('INSERT INTO subjects(code,name) VALUES(?,?)').run('INF', 'Informatika').lastInsertRowid;
    const s2 = db.prepare('INSERT INTO subjects(code,name) VALUES(?,?)').run('MTK', 'Matematika').lastInsertRowid;
    db.prepare('INSERT INTO teaching(subject_id,class_id,teacher_id,semester) VALUES(?,?,?,?)').run(s1, kelasId, g1, 'Ganjil 2026/2027');
    db.prepare('INSERT INTO teaching(subject_id,class_id,teacher_id,semester) VALUES(?,?,?,?)').run(s2, kelasId, g2, 'Ganjil 2026/2027');
    db.prepare('INSERT INTO announcements(title,body) VALUES(?,?)').run('Selamat Datang', 'Selamat datang di SIAKAD OBE Sekolah');
    console.log('Seed selesai');
  }
} catch (e) { console.log('Auto seed error:', e.message); }

module.exports = db;