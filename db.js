require('dotenv').config();
const fs = require('fs');
const path = require('path');

let db, client, isTurso = false;

const CREATE_USERS = `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT, role TEXT, active INTEGER DEFAULT 1, must_change INTEGER DEFAULT 0)`;

const OTHER_TABLES = [
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

if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  const { createClient } = require('@libsql/client');
  client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  isTurso = true;

  (async () => {
    try {
      await client.execute(CREATE_USERS);
      for (const sql of OTHER_TABLES) { try { await client.execute(sql); } catch (e) {} }
      try { await client.execute(`ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1`); } catch (e) {}
      try { await client.execute(`ALTER TABLE users ADD COLUMN must_change INTEGER DEFAULT 0`); } catch (e) {}
      try { await client.execute(`UPDATE users SET active = 1 WHERE active IS NULL`); } catch (e) {}
      try { await client.execute(`UPDATE users SET must_change = 0 WHERE must_change IS NULL`); } catch (e) {}
    } catch (e) { console.error(e.message); }
  })();

  db = {
    client,
    _client: client,
    isTurso: true,
    _isTurso: true,
    query: (sql, args = []) => client.execute({ sql, args }),
    
    // INI KUNCINYA: prepare yang compatible dengan Turso + kode lama
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
        return { lastInsertRowid: r.lastInsertRowId ? Number(r.lastInsertRowId) : 0, lastInsertRowId: r.lastInsertRowId, changes: r.rowsAffected || 0, rowsAffected: r.rowsAffected };
      }
    }),

    exec: async (sql) => { try { await client.execute(sql); } catch (e) {} },
    transaction: (fn) => fn,
    syncDb: () => {},
  };
  console.log('DB Mode: TURSO CLOUD COMPAT');

} else {
  const Database = require('better-sqlite3');
  const dbDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const sqlite = new Database(path.join(dbDir, 'siakad.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(CREATE_USERS);
  sqlite.exec(OTHER_TABLES.join(';\n'));
  try { sqlite.exec(`ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1`); } catch (e) {}
  try { sqlite.exec(`ALTER TABLE users ADD COLUMN must_change INTEGER DEFAULT 0`); } catch (e) {}
  db = sqlite;
  db.client = null;
  db._client = null;
  db.isTurso = false;
  db._isTurso = false;
  console.log('DB Mode: LOKAL');
}

module.exports = db;