const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, role } = require('../authMiddleware');
router.use(auth, role('admin'));
const bad = (res, msg) => res.status(400).json({ error: msg });
const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const handleDb = (res, e) => {
  console.error(e);
  const m = String(e && e.message || e);
  if (m.includes('UNIQUE')) return bad(res, 'Data sudah ada (duplikat).');
  if (m.includes('FOREIGN KEY')) return bad(res, 'Data masih dipakai oleh data lain, tidak bisa dihapus.');
  return res.status(500).json({ error: 'Gagal simpan: ' + m });
};
router.get('/stats', (req, res) => {
  try {
    const n = (sql) => db.prepare(sql).get().n;
    res.json({ siswa: n("SELECT COUNT(*) n FROM users WHERE role='siswa'"), guru: n("SELECT COUNT(*) n FROM users WHERE role='guru'"), kelas: n('SELECT COUNT(*) n FROM classes'), mapel: n('SELECT COUNT(*) n FROM subjects'), kelasAjar: n('SELECT COUNT(*) n FROM teaching') });
  } catch (e) { return handleDb(res, e); }
});
router.get('/users', (req, res) => {
  try {
    let sql = `SELECT u.id, u.username, u.name, u.role, u.active, st.nis, c.name AS class_name FROM users u LEFT JOIN students st ON st.user_id = u.id LEFT JOIN classes c ON c.id = st.class_id`;
    const p = [];
    if (req.query.role) { sql += ' WHERE u.role = ?'; p.push(String(req.query.role)); }
    sql += ' ORDER BY u.role, u.name';
    res.json(db.prepare(sql).all(...p));
  } catch (e) { return handleDb(res, e); }
});
router.post('/users', (req, res) => {
  const username = str(req.body.username, 50);
  const name = str(req.body.name);
  const r = str(req.body.role, 10);
  const password = String(req.body.password || '');
  if (!/^[A-Za-z0-9_.@-]{3,50}$/.test(username)) return bad(res, 'Username 3-50 karakter.');
  if (!name) return bad(res, 'Nama wajib diisi.');
  if (!['admin', 'guru', 'siswa', 'kepsek'].includes(r)) return bad(res, 'Peran tidak valid.');
  if (password.length < 8) return bad(res, 'Password minimal 8 karakter.');
  try {
    const info = db.prepare('INSERT INTO users(username,password_hash,name,role,must_change) VALUES(?,?,?,?,1)').run(username, bcrypt.hashSync(password, 10), name, r);
    if (r === 'siswa') {
      const nis = str(req.body.nis, 30) || username;
      const classIdRaw = req.body.class_id;
      const classId = classIdRaw ? Number(classIdRaw) : null;
      db.prepare('INSERT INTO students(user_id,nis,class_id) VALUES(?,?,?)').run(info.lastInsertRowid, nis, isNaN(classId) ? null : classId);
    }
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) { return handleDb(res, e); }
});
router.put('/users/:id', (req, res) => {
  try {
    const u = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!u) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    if (req.body.name !== undefined) {
      const name = str(req.body.name);
      if (!name) return bad(res, 'Nama wajib diisi.');
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, u.id);
    }
    if (req.body.active !== undefined) {
      if (u.id === req.user.id) return bad(res, 'Tidak bisa menonaktifkan akun sendiri.');
      db.prepare('UPDATE users SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, u.id);
    }
    if (req.body.password) {
      const pw = String(req.body.password);
      if (pw.length < 8) return bad(res, 'Password minimal 8 karakter.');
      db.prepare('UPDATE users SET password_hash = ?, must_change = 1 WHERE id = ?').run(bcrypt.hashSync(pw, 10), u.id);
    }
    res.json({ ok: true });
  } catch (e) { return handleDb(res, e); }
});
router.delete('/users/:id', (req, res) => {
  if (Number(req.params.id) === req.user.id) return bad(res, 'Tidak bisa menghapus akun sendiri.');
  try { db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id); res.json({ ok: true }); } catch (e) { return handleDb(res, e); }
});
router.get('/classes', (req, res) => { try { res.json(db.prepare(`SELECT c.id, c.name, c.year, COUNT(st.id) AS students FROM classes c LEFT JOIN students st ON st.class_id = c.id GROUP BY c.id ORDER BY c.name`).all()); } catch (e) { return handleDb(res, e); } });
router.post('/classes', (req, res) => {
  const name = str(req.body.name, 50);
  if (!name) return bad(res, 'Nama kelas wajib diisi.');
  try { const info = db.prepare('INSERT INTO classes(name,year) VALUES(?,?)').run(name, str(req.body.year, 20) || null); res.status(201).json({ id: info.lastInsertRowid }); } catch (e) { return handleDb(res, e); }
});
router.delete('/classes/:id', (req, res) => { try { db.prepare('DELETE FROM classes WHERE id = ?').run(req.params.id); res.json({ ok: true }); } catch (e) { return handleDb(res, e); } });
router.get('/subjects', (req, res) => { try { res.json(db.prepare('SELECT id, code, name FROM subjects ORDER BY name').all()); } catch (e) { return handleDb(res, e); } });
router.post('/subjects', (req, res) => {
  const code = str(req.body.code, 20).toUpperCase();
  const name = str(req.body.name, 100);
  if (!code || !name) return bad(res, 'Kode dan nama mapel wajib diisi.');
  try { const info = db.prepare('INSERT INTO subjects(code,name) VALUES(?,?)').run(code, name); res.status(201).json({ id: info.lastInsertRowid }); } catch (e) { return handleDb(res, e); }
});
router.delete('/subjects/:id', (req, res) => { try { db.prepare('DELETE FROM subjects WHERE id = ?').run(req.params.id); res.json({ ok: true }); } catch (e) { return handleDb(res, e); } });
router.get('/teaching', (req, res) => { try { res.json(db.prepare(`SELECT t.id, t.semester, s.name AS subject_name, s.code AS subject_code, c.name AS class_name, u.name AS teacher_name FROM teaching t JOIN subjects s ON s.id = t.subject_id JOIN classes c ON c.id = t.class_id JOIN users u ON u.id = t.teacher_id ORDER BY t.semester DESC, c.name, s.name`).all()); } catch (e) { return handleDb(res, e); } });
router.post('/teaching', (req, res) => {
  const subject = Number(req.body.subject_id), cls = Number(req.body.class_id), teacher = Number(req.body.teacher_id);
  const semester = str(req.body.semester, 40);
  if (!subject || !cls || !teacher || !semester) return bad(res, 'Mapel, kelas, guru, dan semester wajib diisi.');
  try { const t = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'guru'").get(teacher); if (!t) return bad(res, 'Pengajar harus berperan Guru.'); const info = db.prepare('INSERT INTO teaching(subject_id,class_id,teacher_id,semester) VALUES(?,?,?,?)').run(subject, cls, teacher, semester); res.status(201).json({ id: info.lastInsertRowid }); } catch (e) { return handleDb(res, e); }
});
router.delete('/teaching/:id', (req, res) => { try { db.prepare('DELETE FROM teaching WHERE id = ?').run(req.params.id); res.json({ ok: true }); } catch (e) { return handleDb(res, e); } });
router.post('/announcements', (req, res) => {
  const title = str(req.body.title, 150), body = str(req.body.body, 2000);
  if (!title || !body) return bad(res, 'Judul dan isi wajib diisi.');
  try { const info = db.prepare('INSERT INTO announcements(title,body) VALUES(?,?)').run(title, body); res.status(201).json({ id: info.lastInsertRowid }); } catch (e) { return handleDb(res, e); }
});
router.delete('/announcements/:id', (req, res) => { try { db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id); res.json({ ok: true }); } catch (e) { return handleDb(res, e); } });
module.exports = router;