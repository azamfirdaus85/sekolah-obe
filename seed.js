require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

(async () => {
  const client = db._client || db;
  const isTurso = db._isTurso;

  // Fungsi helper biar jalan di Turso & Lokal
  const exec = async (sql, params = []) => {
    if (isTurso) {
      const res = await db._client.execute({ sql, args: params });
      return res;
    } else {
      return db.prepare(sql).get(...params) || db.prepare(sql).run(...params);
    }
  };

  const getCount = async () => {
    if (isTurso) {
      const res = await db._client.execute('SELECT COUNT(*) AS n FROM users');
      return res.rows[0]?.n || 0;
    } else {
      const row = db.prepare('SELECT COUNT(*) AS n FROM users').get();
      return row ? row.n : 0;
    }
  };

  const count = await getCount();
  if (count > 0) {
    console.log('Database sudah berisi data. Seed dibatalkan.');
    process.exit(0);
  }

  const hash = (p) => bcrypt.hashSync(p, 10);

  const insertUser = async (username, pass, name, role) => {
    if (isTurso) {
      const res = await db._client.execute({
        sql: 'INSERT INTO users(username,password_hash,name,role) VALUES(?,?,?,?)',
        args: [username, hash(pass), name, role]
      });
      return Number(res.lastInsertRowId);
    } else {
      return db.prepare('INSERT INTO users(username,password_hash,name,role) VALUES(?,?,?,?)').run(username, hash(pass), name, role).lastInsertRowid;
    }
  };

  const adminId = await insertUser('admin', 'admin123', 'Administrator Sekolah', 'admin');
  const kepsekId = await insertUser('kepsek', 'kepsek123', 'Drs. Ahmad Fauzi, M.Pd.', 'kepsek');
  const g1 = await insertUser('guru1', 'guru123', 'Siti Rahma, S.Pd.', 'guru');
  const g2 = await insertUser('guru2', 'guru123', 'Budi Hartono, S.Kom.', 'guru');

  let kelasId;
  if (isTurso) {
    const r = await db._client.execute({ sql: 'INSERT INTO classes(name,year) VALUES(?,?)', args: ['X RPL 1', '2026/2027'] });
    kelasId = Number(r.lastInsertRowId);
  } else {
    kelasId = db.prepare('INSERT INTO classes(name,year) VALUES(?,?)').run('X RPL 1', '2026/2027').lastInsertRowid;
  }

  const names = ['Andi Pratama', 'Bunga Lestari', 'Citra Dewi', 'Dimas Saputra', 'Eka Wulandari', 'Fajar Nugroho'];
  const studentIds = [];
  for (let i = 0; i < names.length; i++) {
    const nis = '202600' + (i + 1);
    const uid = await insertUser(nis, 'siswa123', names[i], 'siswa');
    if (isTurso) {
      const r = await db._client.execute({ sql: 'INSERT INTO students(user_id,nis,class_id) VALUES(?,?,?)', args: [uid, nis, kelasId] });
      studentIds.push(Number(r.lastInsertRowId));
    } else {
      const sid = db.prepare('INSERT INTO students(user_id,nis,class_id) VALUES(?,?,?)').run(uid, nis, kelasId).lastInsertRowid;
      studentIds.push(sid);
    }
  }

  let mtk, pweb;
  if (isTurso) {
    mtk = Number((await db._client.execute({ sql: 'INSERT INTO subjects(code,name) VALUES(?,?)', args: ['MTK', 'Matematika'] })).lastInsertRowId);
    pweb = Number((await db._client.execute({ sql: 'INSERT INTO subjects(code,name) VALUES(?,?)', args: ['PWEB', 'Pemrograman Web'] })).lastInsertRowId);
  } else {
    mtk = db.prepare('INSERT INTO subjects(code,name) VALUES(?,?)').run('MTK', 'Matematika').lastInsertRowid;
    pweb = db.prepare('INSERT INTO subjects(code,name) VALUES(?,?)').run('PWEB', 'Pemrograman Web').lastInsertRowid;
  }

  const addOutcome = async (subject_id, code, desc) => {
    if (isTurso) return Number((await db._client.execute({ sql: 'INSERT INTO outcomes(subject_id,code,description) VALUES(?,?,?)', args: [subject_id, code, desc] })).lastInsertRowId);
    return db.prepare('INSERT INTO outcomes(subject_id,code,description) VALUES(?,?,?)').run(subject_id, code, desc).lastInsertRowid;
  };

  const mtkCP = [await addOutcome(mtk, 'CP1', 'Memahami konsep aljabar'), await addOutcome(mtk, 'CP2', 'Menyelesaikan masalah geometri')];
  const pwebCP = [await addOutcome(pweb, 'CP1', 'Membuat struktur HTML/CSS'), await addOutcome(pweb, 'CP2', 'Interaksi JavaScript'), await addOutcome(pweb, 'CP3', 'Mengelola data database')];

  const addTeach = async (sid, cid, tid, sem) => {
    if (isTurso) return Number((await db._client.execute({ sql: 'INSERT INTO teaching(subject_id,class_id,teacher_id,semester) VALUES(?,?,?,?)', args: [sid, cid, tid, sem] })).lastInsertRowId);
    return db.prepare('INSERT INTO teaching(subject_id,class_id,teacher_id,semester) VALUES(?,?,?,?)').run(sid, cid, tid, sem).lastInsertRowid;
  };

  const sem = 'Ganjil 2026/2027';
  const t1 = await addTeach(mtk, kelasId, g1, sem);
  const t2 = await addTeach(pweb, kelasId, g2, sem);

  let seed = 7;
  for (const [t, cp, name, w] of [[t1, mtkCP[0], 'Ulangan Harian 1', 1], [t1, mtkCP[0], 'Tugas Aljabar', 1], [t1, mtkCP[1], 'Ulangan Harian 2', 1], [t1, mtkCP[1], 'UTS', 2], [t2, pwebCP[0], 'Praktik HTML/CSS', 1], [t2, pwebCP[1], 'Proyek JavaScript', 2], [t2, pwebCP[2], 'Praktik Database', 1]]) {
    let aid;
    if (isTurso) aid = Number((await db._client.execute({ sql: 'INSERT INTO assessments(teaching_id,outcome_id,name,weight,max_score) VALUES(?,?,?,?,?)', args: [t, cp, name, w, 100] })).lastInsertRowId);
    else aid = db.prepare('INSERT INTO assessments(teaching_id,outcome_id,name,weight,max_score) VALUES(?,?,?,?,?)').run(t, cp, name, w, 100).lastInsertRowid;

    for (const sid of studentIds) {
      seed = (seed * 31 + 17) % 97;
      const score = 52 + (seed % 45);
      if (isTurso) await db._client.execute({ sql: 'INSERT INTO scores(assessment_id,student_id,score) VALUES(?,?,?)', args: [aid, sid, score] });
      else db.prepare('INSERT INTO scores(assessment_id,student_id,score) VALUES(?,?,?)').run(aid, sid, score);
    }
  }

  if (isTurso) {
    await db._client.execute({ sql: 'INSERT INTO reflections(teaching_id,content,follow_up) VALUES(?,?,?)', args: [t1, 'Sebagian siswa masih kesulitan trigonometri.', 'Remedial minggu depan.'] });
    await db._client.execute({ sql: 'INSERT INTO announcements(title,body) VALUES(?,?)', args: ['Selamat datang di SIAKAD OBE', 'Sistem memantau capaian siswa.'] });
  } else {
    db.prepare('INSERT INTO reflections(teaching_id,content,follow_up) VALUES(?,?,?)').run(t1, 'Sebagian siswa masih kesulitan trigonometri.', 'Remedial minggu depan.');
    db.prepare('INSERT INTO announcements(title,body) VALUES(?,?)').run('Selamat datang di SIAKAD OBE', 'Sistem memantau capaian siswa.');
  }

  console.log('Seed selesai. Akun demo: admin/admin123, kepsek/kepsek123, guru1/guru123, 2026001/siswa123');
})();