// Notifikasi (lonceng di pojok atas).
// Dihitung saat dibaca, jadi tidak perlu mengubah route lain:
//  - semua peran : pengumuman baru
//  - siswa       : nilai baru keluar
//  - siswa/guru  : pengaduan yang sudah ditanggapi
//  - admin/kepsek: jumlah pengaduan berstatus "baru"
// Bagian yang tabel/kolomnya tidak ditemukan dilewati begitu saja (tidak menyebabkan error).
const router = require('express').Router();
const db = require('../db');
const { auth } = require('../authMiddleware');

router.use(auth);

const norm = (s) => String(s || '').replace('T', ' ').slice(0, 19);
const iso = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
const DAY = 86400000;

let ready = null;
function ensure() {
  if (!ready) {
    ready = (async () => {
      await db.prepare(
        'CREATE TABLE IF NOT EXISTS notif_state (user_id INTEGER PRIMARY KEY, last_read TEXT)'
      ).run();
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

// Nama kolom sebuah tabel (nama tabel hanya dari konstanta di file ini)
async function colsOf(table) {
  try {
    const rows = await db.prepare(`PRAGMA table_info(${table})`).all();
    return new Set(rows.map((r) => String(r.name)));
  } catch (e) {
    return new Set();
  }
}

async function findTable(candidates) {
  try {
    const rows = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).all();
    const have = new Set(rows.map((r) => String(r.name)));
    return candidates.find((c) => have.has(c)) || null;
  } catch (e) {
    return null;
  }
}

const pick = (cols, names) => names.find((n) => cols.has(n)) || null;

router.get('/', async (req, res) => {
  try {
    await ensure();
    const uid = Number(req.user.id);
    const role = req.user.role;
    const now = new Date();
    const cutoff = iso(new Date(now.getTime() - 14 * DAY));

    let st = await db.prepare('SELECT last_read FROM notif_state WHERE user_id = ?').get(uid);
    let lastRead;

    if (st && st.last_read) {
      lastRead = norm(st.last_read);
    } else {
      // Pengguna baru: pengumuman 7 hari terakhir dianggap belum dibaca
      lastRead = iso(new Date(now.getTime() - 7 * DAY));
      await db.prepare(
        'INSERT INTO notif_state(user_id, last_read) VALUES(?, ?) ON CONFLICT(user_id) DO NOTHING'
      ).run(uid, lastRead);
    }

    const items = [];

    // 1. Pengumuman baru (semua peran)
    try {
      const rows = await db.prepare(
        'SELECT id, title, created_at FROM announcements ORDER BY id DESC LIMIT 20'
      ).all();
      for (const r of rows) {
        const at = norm(r.created_at);
        if (at < cutoff) continue;
        items.push({
          type: 'pengumuman',
          icon: '📢',
          title: 'Pengumuman baru',
          text: String(r.title || ''),
          link: '#/dash',
          at,
          unread: at > lastRead,
          count: 1
        });
      }
    } catch (e) {
      console.error('Notif pengumuman:', e.message);
    }

    // 2. Nilai baru (siswa)
    if (role === 'siswa') {
      try {
        const sc = await colsOf('scores');
        const ts = pick(sc, ['updated_at', 'created_at', 'graded_at']);
        if (ts && sc.has('assessment_id') && sc.has('student_id') && sc.has('score')) {
          const rows = await db.prepare(`
            SELECT a.name AS assessment, sj.name AS subject, sc.${ts} AS at
            FROM scores sc
            JOIN students st ON st.id = sc.student_id
            JOIN assessments a ON a.id = sc.assessment_id
            JOIN teaching t ON t.id = a.teaching_id
            JOIN subjects sj ON sj.id = t.subject_id
            WHERE st.user_id = ? AND sc.score IS NOT NULL
            ORDER BY sc.${ts} DESC
            LIMIT 30
          `).all(uid);
          for (const r of rows) {
            const at = norm(r.at);
            if (!at || at < cutoff) continue;
            items.push({
              type: 'nilai',
              icon: '📈',
              title: 'Nilai baru keluar',
              text: `${r.subject} - ${r.assessment}`,
              link: '#/report',
              at,
              unread: at > lastRead,
              count: 1
            });
          }
        }
      } catch (e) {
        console.error('Notif nilai:', e.message);
      }
    }

    // 2b. Materi dan tugas baru dari guru (siswa). Dilewati bila tabel LMS belum dibuat.
    if (role === 'siswa') {
      try {
        const lt = await findTable(['lms_tasks']);
        if (lt) {
          const base = `
            FROM %T% x
            JOIN teaching t ON t.id = x.teaching_id
            JOIN subjects sj ON sj.id = t.subject_id
            JOIN students st ON st.class_id = t.class_id
            WHERE st.user_id = ?
            ORDER BY x.id DESC LIMIT 20`;
          const kinds = [
            ['lms_materials', 'Materi baru', '📚'],
            ['lms_tasks', 'Tugas baru', '📝']
          ];
          for (const [table, title, icon] of kinds) {
            const rows = await db.prepare(
              'SELECT x.title, x.created_at AS at, sj.name AS subject ' + base.replace('%T%', table)
            ).all(uid);
            for (const r of rows) {
              const at = norm(r.at);
              if (!at || at < cutoff) continue;
              items.push({
                type: table,
                icon,
                title,
                text: `${r.subject} - ${r.title}`,
                link: '#/lms',
                at,
                unread: at > lastRead,
                count: 1
              });
            }
          }
        }
      } catch (e) {
        console.error('Notif LMS:', e.message);
      }
    }

    // 3. Pengaduan
    try {
      const tbl = await findTable(['complaints', 'pengaduan', 'complaint']);
      if (tbl) {
        const c = await colsOf(tbl);

        if ((role === 'siswa' || role === 'guru') && c.has('user_id') && c.has('response')) {
          const ts = pick(c, ['responded_at', 'updated_at']);
          if (ts) {
            const rows = await db.prepare(`
              SELECT subject, status, ${ts} AS at
              FROM ${tbl}
              WHERE user_id = ? AND response IS NOT NULL AND TRIM(response) <> ''
              ORDER BY ${ts} DESC
              LIMIT 20
            `).all(uid);
            for (const r of rows) {
              const at = norm(r.at);
              if (!at || at < cutoff) continue;
              items.push({
                type: 'pengaduan',
                icon: '📬',
                title: 'Pengaduan ditanggapi',
                text: String(r.subject || ''),
                link: '#/pengaduan',
                at,
                unread: at > lastRead,
                count: 1
              });
            }
          }
        }

        if ((role === 'admin' || role === 'kepsek') && c.has('status')) {
          const row = await db.prepare(
            `SELECT COUNT(*) n FROM ${tbl} WHERE status = 'baru'`
          ).get();
          const n = Number(row && row.n) || 0;
          if (n > 0) {
            items.push({
              type: 'pengaduan',
              icon: '📬',
              title: 'Pengaduan menunggu tanggapan',
              text: `${n} pengaduan berstatus baru`,
              link: '#/pengaduan/baru',
              at: iso(now),
              unread: true,
              count: n
            });
          }
        }
      }
    } catch (e) {
      console.error('Notif pengaduan:', e.message);
    }

    items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    const list = items.slice(0, 30);
    const unread = list.filter((i) => i.unread).reduce((a, i) => a + i.count, 0);

    res.json({ items: list, unread });
  } catch (e) {
    console.error('Notif gagal:', e);
    res.status(500).json({ error: 'Gagal memuat notifikasi' });
  }
});

// Tandai semua sudah dibaca
router.post('/read', async (req, res) => {
  try {
    await ensure();
    await db.prepare(
      `INSERT INTO notif_state(user_id, last_read) VALUES(?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET last_read = excluded.last_read`
    ).run(Number(req.user.id));
    res.json({ ok: true });
  } catch (e) {
    console.error('Tandai baca gagal:', e);
    res.status(500).json({ error: 'Gagal menyimpan' });
  }
});

module.exports = router;