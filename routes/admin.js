router.post('/users', (req, res) => {
  const username = str(req.body.username, 50);
  const name = str(req.body.name);
  const r = str(req.body.role, 10);
  const password = String(req.body.password || '');
  if (!/^[A-Za-z0-9_.@-]{3,50}$/.test(username)) return bad(res, 'Username 3-50 karakter (huruf, angka, _ . @ -).');
  if (!name) return bad(res, 'Nama wajib diisi.');
  if (!['admin', 'guru', 'siswa', 'kepsek'].includes(r)) return bad(res, 'Peran tidak valid.');
  if (password.length < 8) return bad(res, 'Password minimal 8 karakter.');

  try {
    const info = db
      .prepare('INSERT INTO users(username,password_hash,name,role,must_change) VALUES(?,?,?,?,1)')
      .run(username, bcrypt.hashSync(password, 10), name, r);
    
    if (r === 'siswa') {
      const nis = str(req.body.nis, 30) || username;
      const classIdRaw = req.body.class_id;
      const classId = classIdRaw ? Number(classIdRaw) : null;
      db.prepare('INSERT INTO students(user_id,nis,class_id) VALUES(?,?,?)')
        .run(info.lastInsertRowid, nis, isNaN(classId) ? null : classId);
    }
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) { 
    return handleDb(res, e); 
  }
});