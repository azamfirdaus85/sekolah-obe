require('dotenv').config();
const fs = require('fs');
const path = require('path');

let db;

if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  // ===== TURSO CLOUD - VERCEL =====
  const { createClient } = require('@libsql/client');
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  // Buat tabel (async tapi tidak blocking)
  (async () => {
    const tables = [
      `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT, role TEXT)`,
      `CREATE TABLE IF NOT EXISTS classes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, year TEXT)`,
      `CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, nis TEXT UNIQUE, class_id INTEGER)`,
      `CREATE TABLE IF NOT EXISTS subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT)`,
      `CREATE TABLE IF NOT EXISTS outcomes (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER, code TEXT, description TEXT)`,
      `CREATE TABLE IF NOT EXISTS teaching (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER, class_id INTEGER, teacher_id INTEGER, semester TEXT)`,
      `CREATE TABLE IF NOT EXISTS assessments (id INTEGER PRIMARY KEY AUTOINCREMENT, teaching_id INTEGER, outcome_id INTEGER, name TEXT, weight INTEGER, max_score INTEGER)`,
      `CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, assessment_id INTEGER, student_id INTEGER, score INTEGER)`,
      `CREATE TABLE IF NOT EXISTS reflections (id INTEGER PRIMARY KEY AUTOINCREMENT, teaching_id INTEGER, content TEXT, follow_up TEXT)`,
      `CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, body TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    ];
    for (const sql of tables) { try { await client.execute(sql); } catch(e){} }
  })();

  // Fungsi sync pakai deasync biar kode lama kamu tetap jalan
  let deasync;
  try { deasync = require('deasync'); } catch(e) { deasync = null; }

  function syncExec(sql, args) {
    if (!deasync) {
      // kalau deasync belum keinstall, fallback (akan error login, harus install)
      throw new Error('deasync belum terinstall. Jalankan: npm install deasync');
    }
    let done = false;
    let result, error;
    client.execute({ sql, args }).then(r => { result = r; done = true; }).catch(err => { error = err; done = true; });
    // Tunggu sampai selesai (blocking)
    deasync.loopWhile(() => !done);
    if (error) throw error;
    return result;
  }

  db = {
    _client: client,
    _isTurso: true,
    prepare: (sql) => ({
      run: (...params) => {
        const res = syncExec(sql, params);
        return { lastInsertRowid: res.lastInsertRowId ? Number(res.lastInsertRowId) : 0, changes: res.rowsAffected || 0 };
      },
      get: (...params) => {
        const res = syncExec(sql, params);
        // Turso balikin object, bukan array, jadi convert
        const row = res.rows[0];
        if (!row) return undefined;
        // biar compatible: kalau row object dari libsql, return apa adanya
        return row;
      },
      all: (...params) => {
        const res = syncExec(sql, params);
        return res.rows;
      }
    }),
    exec: (sql) => { try { syncExec(sql, []); } catch(e){} },
    transaction: (fn) => () => fn(),
    syncDb: () => {},
  };
  console.log('DB Mode: TURSO CLOUD (SYNC WRAPPER)');

} else {
  const Database = require('better-sqlite3');
  const dbDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const sqlite = new Database(path.join(dbDir, 'siakad.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT, role TEXT);
    CREATE TABLE IF NOT EXISTS classes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, year TEXT);
    CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, nis TEXT UNIQUE, class_id INTEGER);
    CREATE TABLE IF NOT EXISTS subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT);
    CREATE TABLE IF NOT EXISTS outcomes (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER, code TEXT, description TEXT);
    CREATE TABLE IF NOT EXISTS teaching (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER, class_id INTEGER, teacher_id INTEGER, semester TEXT);
    CREATE TABLE IF NOT EXISTS assessments (id INTEGER PRIMARY KEY AUTOINCREMENT, teaching_id INTEGER, outcome_id INTEGER, name TEXT, weight INTEGER, max_score INTEGER);
    CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, assessment_id INTEGER, student_id INTEGER, score INTEGER);
    CREATE TABLE IF NOT EXISTS reflections (id INTEGER PRIMARY KEY AUTOINCREMENT, teaching_id INTEGER, content TEXT, follow_up TEXT);
    CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, body TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  `);
  db = sqlite;
  db._isTurso = false;
  console.log('DB Mode: LOKAL');
}

module.exports = db;