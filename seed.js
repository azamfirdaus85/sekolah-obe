require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (count > 0) {
  console.log('Database sudah berisi data. Hapus folder data/ bila ingin mengulang seed.');
  process.exit(0);
}

const hash = (p) => bcrypt.hashSync(p, 10);

const run = db.transaction(() => {
  const addUser = db.prepare('INSERT INTO users(username,password_hash,name,role) VALUES(?,?,?,?)');

  addUser.run('admin', hash('admin123'), 'Administrator Sekolah', 'admin');
  addUser.run('kepsek', hash('kepsek123'), 'Drs. Ahmad Fauzi, M.Pd.', 'kepsek');
  const g1 = addUser.run('guru1', hash('guru123'), 'Siti Rahma, S.Pd.', 'guru').lastInsertRowid;
  const g2 = addUser.run('guru2', hash('guru123'), 'Budi Hartono, S.Kom.', 'guru').lastInsertRowid;

  const kelas = db.prepare('INSERT INTO classes(name,year) VALUES(?,?)').run('X RPL 1', '2026/2027').lastInsertRowid;

  const names = ['Andi Pratama', 'Bunga Lestari', 'Citra Dewi', 'Dimas Saputra', 'Eka Wulandari', 'Fajar Nugroho'];
  const studentIds = names.map((n, i) => {
    const nis = '202600' + (i + 1);
    const uid = addUser.run(nis, hash('siswa123'), n, 'siswa').lastInsertRowid;
    return db.prepare('INSERT INTO students(user_id,nis,class_id) VALUES(?,?,?)').run(uid, nis, kelas).lastInsertRowid;
  });

  const addSubject = db.prepare('INSERT INTO subjects(code,name) VALUES(?,?)');
  const mtk = addSubject.run('MTK', 'Matematika').lastInsertRowid;
  const pweb = addSubject.run('PWEB', 'Pemrograman Web').lastInsertRowid;

  const addCP = db.prepare('INSERT INTO outcomes(subject_id,code,description) VALUES(?,?,?)');
  const mtkCP = [
    addCP.run(mtk, 'CP1', 'Memahami konsep aljabar dan fungsi').lastInsertRowid,
    addCP.run(mtk, 'CP2', 'Menyelesaikan masalah geometri dan trigonometri').lastInsertRowid
  ];
  const pwebCP = [
    addCP.run(pweb, 'CP1', 'Membuat struktur halaman dengan HTML dan CSS').lastInsertRowid,
    addCP.run(pweb, 'CP2', 'Membuat interaksi dengan JavaScript').lastInsertRowid,
    addCP.run(pweb, 'CP3', 'Mengelola data dengan database').lastInsertRowid
  ];

  const sem = 'Ganjil 2026/2027';
  const addTeach = db.prepare('INSERT INTO teaching(subject_id,class_id,teacher_id,semester) VALUES(?,?,?,?)');
  const t1 = addTeach.run(mtk, kelas, g1, sem).lastInsertRowid;
  const t2 = addTeach.run(pweb, kelas, g2, sem).lastInsertRowid;

  const addAssess = db.prepare('INSERT INTO assessments(teaching_id,outcome_id,name,weight,max_score) VALUES(?,?,?,?,?)');
  const addScore = db.prepare('INSERT INTO scores(assessment_id,student_id,score) VALUES(?,?,?)');
  let seed = 7;
  const fill = (aid) => studentIds.forEach((sid) => {
    seed = (seed * 31 + 17) % 97;
    addScore.run(aid, sid, 52 + (seed % 45));
  });

  [
    [t1, mtkCP[0], 'Ulangan Harian 1', 1], [t1, mtkCP[0], 'Tugas Aljabar', 1],
    [t1, mtkCP[1], 'Ulangan Harian 2', 1], [t1, mtkCP[1], 'UTS', 2],
    [t2, pwebCP[0], 'Praktik HTML/CSS', 1], [t2, pwebCP[1], 'Proyek JavaScript', 2],
    [t2, pwebCP[2], 'Praktik Database', 1]
  ].forEach(([t, cp, name, w]) => fill(addAssess.run(t, cp, name, w, 100).lastInsertRowid));

  db.prepare('INSERT INTO reflections(teaching_id,content,follow_up) VALUES(?,?,?)').run(
    t1,
    'Sebagian siswa masih kesulitan pada materi trigonometri.',
    'Remedial terjadwal dan latihan soal tambahan minggu depan.'
  );
  db.prepare('INSERT INTO announcements(title,body) VALUES(?,?)').run(
    'Selamat datang di SIAKAD OBE Sekolah',
    'Sistem ini membantu memantau capaian pembelajaran siswa. Segera ganti password akun Anda.'
  );
});

run();
console.log('Seed selesai. Akun demo:');
console.log('  admin  / admin123');
console.log('  kepsek / kepsek123');
console.log('  guru1  / guru123   (juga guru2)');
console.log('  2026001 / siswa123 (NIS 2026001 - 2026006)');
