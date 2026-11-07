require('dotenv').config();
const fs = require('fs');
const path = require('path');

let db;
let isTurso = false;
let tursoClient = null;

// Cek apakah pakai Turso
if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  isTurso = true;
  const { createClient } = require('@libsql/client');
  tursoClient = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  // Buat semua tabel kalau belum ada di Turso
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT, role TEXT)`,
    `CREATE TABLE IF NOT EXISTS classes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, year TEXT)`,
    `CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, nis TEXT UNIQUE, class_id INTEGER, FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(class_id) REFERENCES classes(id))`,
    `CREATE TABLE IF NOT EXISTS subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT)`,
    `CREATE TABLE IF NOT EXISTS outcomes (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER, code TEXT, description TEXT, FOREIGN KEY(subject_id) REFERENCES subjects(id))`,
    `CREATE TABLE IF NOT EXISTS teaching (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER, class_id INTEGER, teacher_id INTEGER, semester TEXT, FOREIGN KEY(subject_id) REFERENCES subjects(id), FOREIGN KEY(class_id) REFERENCES classes(id), FOREIGN KEY(teacher_id) REFERENCES users(id))`,
    `CREATE TABLE IF NOT EXISTS assessments (id INTEGER PRIMARY KEY AUTOINCREMENT, teaching_id INTEGER, outcome_id INTEGER, name TEXT, weight INTEGER, max_score INTEGER, FOREIGN KEY(teaching_id) REFERENCES teaching(id), FOREIGN KEY(outcome_id) REFERENCES outcomes(id))`,
    `CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, assessment_id INTEGER, student_id INTEGER, score INTEGER, FOREIGN KEY(assessment_id) REFERENCES assessments(id), FOREIGN KEY(student_id) REFERENCES students(id))`,
    `CREATE TABLE IF NOT EXISTS reflections (id INTEGER PRIMARY KEY AUTOINCREMENT, teaching_id INTEGER, content TEXT, follow_up TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(teaching_id) REFERENCES teaching(id))`,
    `CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, body TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  ];

  tables.forEach(sql => {
    try { tursoClient.executeSync(sql); } catch (e) { console.log('skip table', e.message); }
  });

  // Wrapper biar kode lama kamu tetap jalan di Turso
  db = {
    prepare: (sql) => {
      return {
        run: (...params) => {
          try {
            const result = tursoClient.executeSync({ sql, args: params });
            return {
              lastInsertRowid: result.lastInsertRowId ? Number(result.lastInsertRowId) : 0,
              changes: result.rowsAffected || 0
            };
          } catch (e) {
            console.error('Turso RUN error:', e.message, sql);
            throw e;
          }
        },
        get: (...params) => {
          try {
            const result = tursoClient.executeSync({ sql, args: params });
            return result.rows[0] || undefined;
          } catch (e) {
            console.error('Turso GET error:', e.message, sql);
            throw e;
          }
        },
        all: (...params) => {
          try {
            const result = tursoClient.executeSync({ sql, args: params });
            return result.rows;
          } catch (e) {
            console.error('Turso ALL error:', e.message, sql);
            throw e;
          }
        }
      };
    },
    exec: (sql) => {
      const statements = sql.split(';');
      statements.forEach(s => {
        const trimmed = s.trim();
        if (trimmed) {
          try { tursoClient.executeSync(trimmed); } catch (e) {}
        }
      });
    },
    pragma: () => {},
    transaction: (fn) => {
      return () => { return fn(); };
    },
    syncDb: () => {
      console.log('Turso: no need sync, already cloud');
    },
    _isTurso: true,
    _client: tursoClient
  };

  console.log('DB Mode: TURSO CLOUD CONNECTED');
  console.log('URL:', process.env.TURSO_DATABASE_URL);

} else {
  // ===== MODE LOKAL - better-sqlite3 =====
  const Database = require('better-sqlite3');
  const dbDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.join(dbDir, 'siakad.db');
  const sqlite = new Database(dbPath);
  
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const initSql = `
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT, role TEXT);
    CREATE TABLE IF NOT EXISTS classes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, year TEXT);
    CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, nis TEXT UNIQUE, class_id INTEGER, FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(class_id) REFERENCES classes(id));
    CREATE TABLE IF NOT EXISTS subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT);
    CREATE TABLE IF NOT EXISTS outcomes (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER, code TEXT, description TEXT, FOREIGN KEY(subject_id) REFERENCES subjects(id));
    CREATE TABLE IF NOT EXISTS teaching (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER, class_id INTEGER, teacher_id INTEGER, semester TEXT, FOREIGN KEY(subject_id) REFERENCES subjects(id), FOREIGN KEY(class_id) REFERENCES classes(id), FOREIGN KEY(teacher_id) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS assessments (id INTEGER PRIMARY KEY AUTOINCREMENT, teaching_id INTEGER, outcome_id INTEGER, name TEXT, weight INTEGER, max_score INTEGER, FOREIGN KEY(teaching_id) REFERENCES teaching(id), FOREIGN KEY(outcome_id) REFERENCES outcomes(id));
    CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, assessment_id INTEGER, student_id INTEGER, score INTEGER, FOREIGN KEY(assessment_id) REFERENCES assessments(id), FOREIGN KEY(student_id) REFERENCES students(id));
    CREATE TABLE IF NOT EXISTS reflections (id INTEGER PRIMARY KEY AUTOINCREMENT, teaching_id INTEGER, content TEXT, follow_up TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(teaching_id) REFERENCES teaching(id));
    CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, body TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  `;
  sqlite.exec(initSql);

  db = sqlite;
  db._isTurso = false;
  db.syncDb = () => {};
  
  console.log('DB Mode: LOKAL better-sqlite3');
  console.log('Path:', dbPath);
}

module.exports = db;