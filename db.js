const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbFile = process.env.DB_FILE || path.join(__dirname, 'data', 'sekolah.db');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','guru','siswa','kepsek')),
  must_change   INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS classes (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  year TEXT
);

CREATE TABLE IF NOT EXISTS students (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nis      TEXT UNIQUE NOT NULL,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

-- Capaian Pembelajaran (CP) per mata pelajaran
CREATE TABLE IF NOT EXISTS outcomes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  description TEXT NOT NULL,
  UNIQUE (subject_id, code)
);

-- Kelas ajar = mapel + kelas + guru + semester
CREATE TABLE IF NOT EXISTS teaching (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  semester   TEXT NOT NULL,
  UNIQUE (subject_id, class_id, semester)
);

CREATE TABLE IF NOT EXISTS assessments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  teaching_id INTEGER NOT NULL REFERENCES teaching(id) ON DELETE CASCADE,
  outcome_id  INTEGER REFERENCES outcomes(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  weight      REAL NOT NULL DEFAULT 1 CHECK (weight > 0),
  max_score   REAL NOT NULL DEFAULT 100 CHECK (max_score > 0)
);

CREATE TABLE IF NOT EXISTS scores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score         REAL NOT NULL,
  UNIQUE (assessment_id, student_id)
);

CREATE TABLE IF NOT EXISTS reflections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  teaching_id INTEGER NOT NULL REFERENCES teaching(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  follow_up   TEXT,
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

module.exports = db;
