require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false
}));

// Batas ukuran JSON.
// Hanya endpoint yang memang menerima file (foto profil, bukti SPP, impor Excel)
// yang boleh besar. Selain itu dibatasi kecil supaya tidak mudah dibanjiri.
// Catatan: Vercel membatasi isi permintaan sekitar 4,5 MB, jadi foto/bukti
// sebaiknya maksimal 3 MB (base64 menambah ukuran sekitar sepertiga).
const bigJson = express.json({ limit: '8mb' });
app.use('/api/portal/akun/foto', bigJson);
app.use('/api/portal/keuangan/saya', bigJson);
app.use('/api/admin/users/import', bigJson);
app.use(express.json({ limit: '200kb' }));

app.use(cookieParser());

app.use('/api', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/guru', require('./routes/guru'));
app.use('/api/siswa', require('./routes/siswa'));
app.use('/api/monitor', require('./routes/monitor'));
app.use('/api/absensi', require('./routes/absensi'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/portal', require('./routes/portal'));
app.use('/api/notif', require('./routes/notif'));
app.use('/api/lms', require('./routes/lms'));
app.use('/api/izin', require('./routes/izin'));

// FITUR LUPA PASSWORD
app.use('/api/password-reset', require('./routes/passwordReset'));

app.use('/api', (req, res) =>
  res.status(404).json({ error: 'Endpoint tidak ditemukan' })
);

// File halaman selalu divalidasi ulang, supaya perubahan kode (dan service worker)
// langsung terbaca dan tidak tersangkut di cache lama.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (/\.(html|js|css|json|webmanifest)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Format JSON tidak valid'
    });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Data yang dikirim terlalu besar'
    });
  }

  console.error(err);
  res.status(500).json({
    error: 'Terjadi kesalahan pada server'
  });
});

// Promise yang gagal tanpa penangan jangan sampai mematikan seluruh server
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`SIAKAD OBE Sekolah berjalan di localhost:${PORT}`);
  });
}

module.exports = app;