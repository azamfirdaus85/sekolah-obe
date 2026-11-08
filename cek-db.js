// Jalankan: node cek-db.js
// Menampilkan mode database dan daftar tabel yang benar-benar ada.
const db = require('./db');
(async () => {
  await db.ready;
  const rows = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const names = rows.map((r) => r.name);
  console.log('Mode:', db.isTurso ? 'TURSO' : 'LOKAL (data/siakad.db)');
  console.log('Tabel (' + names.length + '):', names.join(', '));
  const wajib = ['schedules','student_attendance','teacher_attendance','principal_attendance','complaints','visit_log','admin_documents','academic_calendar'];
  const hilang = wajib.filter((t) => !names.includes(t));
  console.log(hilang.length ? 'BELUM ADA: ' + hilang.join(', ') : 'Semua tabel baru sudah ada.');
  process.exit(0);
})();