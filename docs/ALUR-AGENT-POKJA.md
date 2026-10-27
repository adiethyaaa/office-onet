# Analisis alur `app/agent.py` di VPS Tencent

Diperiksa 2026-10-28 sekitar pukul 01:00 WIT, baca-saja lewat
SSH, tanpa mengubah berkas apa pun di VPS. Berkas yang
dibaca: `/home/ubuntu/hermes-system/app/agent.py`, 413 baris,
terakhir diubah 27 Oktober 2026 22:50 WIT. Salinan lokal di
`~/workspace/kasuari/agent.py` lebih lama (dari 25 Oktober)
dan BELUM memuat handler audit dan sesi; jangan pakai salinan
lokal itu sebagai rujukan untuk alur log.

## Alur dari paling atas

```
Browser / aplikasi Pokja
  -> tabel activity_logs di db_tim_pokja (VPS Kanreg)
  -> agent_summary.php di pokja.tu-kanreg14.id
  -> agent.py di VPS Tencent (container pokja_monitoring_agent)
  -> perintah Telegram /laporan, /rekap, /sesi, /online, /audit
  -> (untuk kehadiran) penarik di server/pokja-log.mjs
```

`agent.py` tidak pernah mengakses database secara langsung
dan tidak pernah menyebut nama tabel `activity_logs`. Tabel
itu hanya hidup di balik endpoint PHP di Kanreg. Onet juga
tidak mengakses database itu secara langsung.

## Tiga panggilan ke alamat yang sama

Semua panggilan memakai alamat dasar yang sama (env
`POKJA_API_URL`), header yang sama (`X-Agent-Token`), dan
batas waktu 20 detik. Yang membedakan hanyalah parameter
query-nya. Token hanya disebut namanya di sini
(`POKJA_API_TOKEN`); nilainya tidak pernah ditulis.

| Panggilan di `agent.py` | Parameter | Jawaban |
|---|---|---|
| `fetch_pokja_summary` (baris 108) | `?start_date=...&end_date=...` | `judul_laporan`, `periode_teks`, `waktu_update`, `is_range`, `start_date`, `end_date`, `rekap_per_layanan` |
| `fetch_pokja_endpoint("sessions", ...)` (baris 280) | `?action=sessions&limit=15` | `total`, `waktu_cek`, `sessions` |
| `fetch_pokja_endpoint("audit_logs", ...)` (baris 280) | `?action=audit_logs&limit=15` | `total`, `waktu_cek`, `logs` |

Perintah Telegram: `/laporan` dan `/rekap` memakai ringkasan;
`/sesi` dan `/online` memakai sessions; `/audit` memakai
audit_logs dan bisa difilter `nip` atau `inisial`. Scheduler
latar belakang (tiap `REPORTER_INTERVAL`, bawaan 10500 detik)
hanya mengirim laporan ringkasan; sessions dan audit_logs
hanya dipanggil saat ada perintah. Penarik kehadiran di
`pokja-log.mjs` memanggil dua endpoint terakhir itu dengan
limit yang lebih besar (bawaan 500), karena kehadiran butuh
semua user, bukan 15 baris terakhir.

## Bentuk `sessions` yang terlihat

Satu baris memakai field: `id`, `session_id`, `user_uid`,
`id_inisial`, `inisial`, `user_nama`, `nama`, `role`,
`ip_address`, `login_at`, `login_time`, `last_active_at`,
`last_active`, `logout_at`, `logout_time`, `status`. Nilai
status yang terlihat: `active` dan `logged_out`. Waktu
berbentuk `2026-10-28 00:34:11`, tanpa zona, dianggap WIT.
Satu user bisa punya beberapa sesi; sesi yang masih aktif
yang menentukan ia masih di dalam. Field `ip_address`,
`session_id`, dan `user_uid` tidak dipakai untuk kehadiran.

## Bentuk `audit_logs` yang terlihat

Satu baris memakai field: `id`, `session_id`, `user_uid`,
`id_inisial`, `inisial`, `user_nama`, `nama`, `module_name`,
`module`, `action_type`, `action`, `target_key`, `target_nama`,
`changes_summary`, `details`, `ip_address`, `created_at`.
Nilai yang terlihat pada pemeriksaan malam itu (hanya
inisial FA yang aktif): module `AUTH`, `KP`, `NAV`, `PGA`;
action `LOGIN`, `LOGOUT`, `AUTH_LOGOUT`, `NAV_MENU`,
`BUTTON_CLICK`, `EXPORT_EXCEL`. Field `target_key`,
`target_nama`, `changes_summary`, `details`, dan `ip_address`
tidak dipakai untuk kehadiran. Baris ganda dengan `id` yang
sama dibuang satu.

## Apa yang dibuktikan dan apa yang tidak

- Sessions membuktikan siapa yang login, kapan login,
  kapan terakhir aktif, dan kapan logout, per sesi.
- Audit log membuktikan aksi dan modul terakhir, tetapi
  `BUTTON_CLICK` tidak membuktikan sedang mengedit; ia
  hanya membuktikan ada klik tombol.
- Keduanya tidak membuktikan user sedang menatap layar;
  idle di sini tetap berarti "tidak ada aktivitas tercatat".
- Modul dan aksi untuk layanan lain (PI, CASN, SDP) dan
  untuk jam kerja ramai belum terlihat pada pemeriksaan
  malam itu; peta di `pokja-log.mjs` hanya memuat nilai
  yang sudah terlihat, dan nilai lain diabaikan, bukan
  ditebak.

## Akibatnya untuk kode kehadiran

- Tidak perlu endpoint terpisah untuk log. Log memakai
  alamat Pokja yang sama dengan parameter `action`.
- `main.mjs` tidak perlu env log terpisah; cukup
  `POKJA_API_URL` dan `POKJA_API_TOKEN` yang sudah ada.
- Sesi menjadi sumber utama masuk dan keluar; audit log
  hanya memperkaya ringkasan. Kalau daftar sesi terpotong,
  penarik gagal tertutup; kalau daftar log terpotong,
  ringkasan kembali ke wording sesi saja.
