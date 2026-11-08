# SIAKAD OBE Sekolah - Arahan Lengkap

Sistem informasi akademik **full stack** untuk sekolah dengan konsep **Outcome Based Education (OBE)**:
kurikulum -> Capaian Pembelajaran (CP) -> penilaian -> analisis ketuntasan -> refleksi pembelajaran.

Konsep ini terinspirasi dari sistem SIAKAD OBE di perguruan tinggi (monitoring kurikulum & capaian pembelajaran,
analisis penilaian, refleksi perkuliahan, manajemen dosen/mahasiswa/kelas), lalu disesuaikan untuk sekolah:

| Perguruan tinggi | Versi sekolah ini |
|---|---|
| Mahasiswa | Siswa |
| Dosen | Guru |
| Struktural Prodi / Fakultas | Kepala Sekolah / struktural (`kepsek`) |
| Capaian Pembelajaran Lulusan (CPL) | Capaian Pembelajaran (CP) per mata pelajaran |
| Kelas kuliah | Kelas ajar (mapel + kelas + guru + semester) |

Kode ini ditulis dari nol (bukan salinan sistem asli) dan memakai nama serta tampilan sendiri.

---

## 1. Teknologi

| Lapisan | Teknologi |
|---|---|
| Server / API | Node.js + Express |
| Database | SQLite (file tunggal, lewat `better-sqlite3`) |
| Keamanan | `bcryptjs` (hash password), JWT di cookie `httpOnly`, `helmet`, `express-rate-limit` |
| Frontend | HTML + CSS + JavaScript murni (single page app, tanpa framework) |

## 2. Struktur folder

```
sekolah-obe/
├── package.json
├── .env.example        -> salin menjadi .env
├── server.js           -> titik masuk server
├── db.js               -> skema database (tabel dibuat otomatis)
├── middleware.js       -> login (JWT) & pembatasan peran
├── analysis.js         -> rumus capaian CP & ketuntasan
├── seed.js             -> data contoh
├── routes/
│   ├── auth.js         -> login, logout, ganti password, pengumuman
│   ├── admin.js        -> kelola pengguna, kelas, mapel, kelas ajar, pengumuman
│   ├── guru.js         -> CP, asesmen, input nilai, analisis, refleksi
│   ├── siswa.js        -> laporan nilai & capaian siswa
│   └── monitor.js      -> monitoring untuk kepala sekolah/admin
└── public/
    ├── index.html
    ├── css/style.css
    └── js/app.js
```

## 3. Cara menjalankan

Syarat: **Node.js versi 18 atau lebih baru** (cek: `node -v`).

```bash
cd sekolah-obe
npm install
cp .env.example .env          # Windows: copy .env.example .env
```

Buka `.env`, lalu isi `JWT_SECRET` dengan teks acak. Cara membuatnya:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Lanjutkan:

```bash
npm run seed                  # isi data contoh (cukup sekali)
npm start
```

Buka **http://localhost:3000** di browser.

### Akun demo (dari `npm run seed`)

| Peran | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Kepala Sekolah | `kepsek` | `kepsek123` |
| Guru | `guru1` atau `guru2` | `guru123` |
| Siswa | `2026001` ... `2026006` (NIS) | `siswa123` |

> **Wajib:** ganti semua password demo sebelum dipakai sungguhan, atau hapus folder `data/` lalu buat akun sendiri.
> Akun yang dibuat admin otomatis diminta ganti password saat login pertama.

## 4. Alur penggunaan (urutan yang benar)

**A. Admin menyiapkan data dasar**
1. Menu **Kelas**: tambah kelas, misalnya `X RPL 1`.
2. Menu **Mata Pelajaran**: tambah mapel (kode + nama).
3. Menu **Pengguna**: tambah guru, siswa (isi NIS dan kelas), dan kepala sekolah.
4. Menu **Kelas Ajar**: pilih mapel + kelas + guru + semester. Ini yang memberi guru akses ke kelasnya.
5. Menu **Pengumuman**: terbitkan informasi untuk semua pengguna.

**B. Guru mengelola pembelajaran** (menu *Kelas Ajar Saya*, lalu pilih kelas)
1. Tab **CP**: tulis capaian pembelajaran (CP1, CP2, ...).
2. Tab **Penilaian**: buat asesmen (ulangan, tugas, UTS), pilih CP yang diukur, atur bobot dan nilai maksimal.
3. Tab **Input Nilai**: pilih asesmen, isi nilai tiap siswa, klik **Simpan Nilai**.
4. Tab **Analisis**: lihat capaian per CP dan per siswa, siapa yang belum tuntas.
5. Tab **Refleksi**: catat evaluasi dan rencana tindak lanjut (misalnya remedial).

**C. Siswa** membuka **Nilai & Capaian**: nilai akhir, ketuntasan, capaian tiap CP, dan rincian asesmen.

**D. Kepala Sekolah** membuka **Monitoring Capaian**: ringkasan seluruh kelas ajar, lalu **Detail** untuk analisis dan refleksi guru.

## 5. Rumus capaian

- Nilai asesmen dinormalkan ke skala 0-100: `nilai / nilai_maks x 100`.
- **Nilai CP siswa** = rata-rata berbobot dari asesmen yang dikaitkan ke CP tersebut.
- **Nilai akhir** = rata-rata berbobot seluruh asesmen.
- **Tuntas** bila nilai >= **KKM** (default 70, ubah lewat `KKM` di `.env`).
- **Ketuntasan CP kelas** = persentase siswa yang tuntas pada CP itu.

Rumus ada di `analysis.js`; ubah di sana bila sekolah memakai aturan lain.

## 6. Ringkasan API

Semua endpoint berawalan `/api` dan memakai JSON.

| Endpoint | Peran | Fungsi |
|---|---|---|
| `POST /login`, `POST /logout`, `GET /me` | semua | sesi login |
| `POST /change-password` | semua | ganti password |
| `GET /announcements` | semua | pengumuman |
| `/admin/users`, `/admin/classes`, `/admin/subjects`, `/admin/teaching`, `/admin/announcements` | admin | CRUD data master |
| `/guru/teaching/:id/outcomes`, `/assessments`, `/analysis`, `/reflections` | guru (pemilik kelas) | pembelajaran |
| `/guru/assessments/:aid/scores` (GET/PUT) | guru (pemilik kelas) | input nilai |
| `GET /siswa/report` | siswa | laporan pribadi |
| `GET /monitor/overview`, `/monitor/teaching/:id/analysis` | kepsek, admin | monitoring |

## 7. Keamanan yang sudah diterapkan

- Password disimpan sebagai hash bcrypt, bukan teks asli.
- Token login di cookie `httpOnly` + `SameSite=Strict` (tidak bisa dibaca JavaScript).
- Pembatasan percobaan login (20 kali / 15 menit per IP).
- Pembatasan akses per peran; guru hanya bisa mengubah kelas ajarnya sendiri.
- Query database memakai parameter (aman dari SQL injection); keluaran HTML di-escape (aman dari XSS).
- Header keamanan lewat `helmet`.

**Yang perlu Anda lakukan sebelum online:**
1. Isi `JWT_SECRET` yang kuat dan jangan di-commit ke Git (`.env` sudah di `.gitignore`).
2. Set `NODE_ENV=production` dan pakai **HTTPS** (cookie `secure` aktif otomatis). Di balik proxy (Nginx, Railway, Render), isi `TRUST_PROXY=1`.
3. Ganti semua password demo.
4. Backup rutin file `data/sekolah.db`.

## 8. Deploy

- **VPS / server sendiri:** jalankan dengan `pm2 start server.js --name siakad`, pasang Nginx + sertifikat HTTPS (Let's Encrypt).
- **Railway / Render / Fly.io:** hubungkan repository, perintah start `npm start`, set variabel `.env`. Karena SQLite berupa file, aktifkan *persistent volume* dan arahkan `DB_FILE` ke volume tersebut.

## 9. Pengembangan berikutnya

1. Login SSO / Google Workspace sekolah.
2. Absensi, jadwal pelajaran, dan e-rapor (cetak PDF).
3. Pemetaan CP ke profil lulusan atau kompetensi keahlian.
4. Import siswa dan nilai dari Excel/CSV.
5. Pindah ke MySQL/PostgreSQL bila pengguna sudah ribuan (struktur tabel di `db.js` mudah dipindah).
6. Grafik tren capaian antar semester.

## 10. Pemecahan masalah

| Masalah | Solusi |
|---|---|
| `npm install` gagal di `better-sqlite3` | Pakai Node LTS (18/20/22). Di Windows pasang *Build Tools for Visual Studio* bila diminta. |
| Muncul peringatan `JWT_SECRET belum diatur` | Isi `JWT_SECRET` di `.env`, lalu restart. |
| Tidak bisa login di server HTTPS | Set `TRUST_PROXY=1` bila memakai proxy. |
| Guru tidak melihat kelas | Admin belum membuat **Kelas Ajar** untuk guru tersebut. |
| Ingin mengulang dari awal | Hentikan server, hapus folder `data/`, jalankan `npm run seed`. |
