let Database;
try {
  const { DatabaseSync } = require('node:sqlite');
  Database = DatabaseSync;
} catch (e) {
  throw e;
}
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
`);

// --- AUTO SEED UNTUK VERCEL (karena /tmp kehapus terus) ---
try {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count === 0) {
    console.log('Database kosong, seeding admin default...');
    const hash = (p) => bcrypt.hashSync(p, 10);
    const addUser = db.prepare('INSERT INTO users(username, password_hash, name, role) VALUES(?,?,?,?)');
    
    addUser.run('admin', hash('admin123'), 'Administrator Sekolah', 'admin');
    addUser.run('kepsek', hash('kepsek123'), 'Drs. Ahmad Fauzi, M.Pd.', 'kepsek');
    addUser.run('guru1', hash('guru123'), 'Siti Rahma, S.Pd.', 'guru');
    addUser.run('guru2', hash('guru123'), 'Budi Hartono, S.Kom.', 'guru');
    
    try {
      const kelas = db.prepare('INSERT INTO classes(name,year) VALUES(?,?)').run('X RPL 1', '2026/2027');
      console.log('Seed kelas id', kelas.lastInsertRowid);
    } catch(e) {}
    
    console.log('Seed selesai: admin/admin123 bisa dipakai');
  }
} catch (e) {
  console.log('Auto seed error:', e.message);
}

module.exports = db;