# Silverhawk Submission

Aplikasi pengumpulan tugas screenshot modern untuk santri / siswa / siswi.  
Bagagian dari ekosistem **Silverhawk Network** (silverhawk.web.id).

**Fitur utama:**
- Siswa paste screenshot langsung (tanpa upload file)
- Pilih kelas + nama → lihat daftar tugas + status sudah/belum
- Guru login → kelola kelas, siswa, tugas
- Lihat pengumpulan + thumbnail (hover/klik = popup besar)
- Beri nilai + catatan
- Lihat siapa saja yang belum mengumpulkan
- Admin: kelola akun guru, hapus screenshot

**Teknologi:** HTML + CSS + Vanilla JS + Supabase (gratis)

---

## Struktur Folder

```
silverhawk-submission/
├── index.html              # Halaman utama
├── css/
│   └── style.css           # Semua styling (brand Silverhawk)
├── js/
│   ├── config.js           # Konfigurasi Supabase (WAJIB diubah)
│   └── app.js              # Logika aplikasi
├── supabase/
│   ├── schema.sql          # Schema database + RLS
│   └── setup-admin.sql     # Script set admin pertama
└── README.md
```

---

## Setup Cepat

### 1. Buat Project Supabase
1. Buka [https://supabase.com](https://supabase.com) → New Project
2. Tunggu project siap
3. Ambil **Project URL** dan **anon public key**  
   (Project Settings → API)

### 2. Jalankan Schema
1. Masuk ke **SQL Editor**
2. Copy-paste seluruh isi `supabase/schema.sql`
3. Run

### 3. Buat Akun Admin
1. Authentication → Users → **Add user**
2. Isi email + password (contoh: `admin@silverhawk.web.id`)
3. Jalankan `supabase/setup-admin.sql` (ganti email-nya dulu)

### 4. Matikan Email Confirmation (opsional tapi disarankan)
Authentication → Providers → Email → **Confirm email** = OFF

### 5. Isi Config
Buka `js/config.js` dan ganti:

```js
SUPABASE_URL: 'https://xxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
```

### 6. Deploy ke GitHub Pages
1. Buat repository baru di GitHub
2. Upload semua file di folder ini
3. Settings → Pages → Source: **Deploy from a branch** → `main` / `/ (root)`
4. Tunggu 1-2 menit, aplikasi sudah live

(Opsional) Arahkan subdomain: `submission.silverhawk.web.id`

---

## Cara Pakai

### Siswa
1. Buka website
2. Pilih Kelas → Pilih Nama
3. Lihat daftar tugas (hijau = sudah, kuning = belum)
4. Klik **Kumpulkan** → Paste screenshot (Ctrl+V)
5. Klik **Kirim Tugas**

### Guru
1. Login dengan akun yang dibuat admin
2. Tambah Kelas → Tambah Siswa → Buat Tugas
3. Di tab **Pengumpulan** bisa lihat screenshot + beri nilai

### Admin
- Semua fitur guru +
- Tab **Kelola Guru** → buat / hapus akun guru
- Bisa hapus screenshot di tab Pengumpulan

---

## Catatan Teknis

- Screenshot otomatis di-compress (max width 900px, quality 72%) agar hemat storage
- Gambar disimpan sebagai base64 di database (cukup untuk screenshot biasa)
- Desain mengikuti brand Silverhawk: deep navy + cyan accent + glassmorphism
- Fully responsive (mobile-friendly)

---

## Lisensi & Kredit

Dibuat untuk **Silverhawk Network**  
Teddy Mulyana • silverhawk.web.id
