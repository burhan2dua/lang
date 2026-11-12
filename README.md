# Rangkai — YouTube Transcript

Aplikasi lokal untuk mengambil caption YouTube dan menyelaraskan kata dengan audio.
Timestamp kata merupakan perkiraan hasil forced alignment; periksa kembali hasilnya,
terutama jika caption tidak cocok dengan audio.

## Menjalankan aplikasi

Persyaratan Windows:

- Node.js 22 atau lebih baru
- MongoDB Server dengan layanan Windows bernama `MongoDB`
- Python 3.12
- FFmpeg tersedia di `PATH`

```powershell
git clone https://github.com/burhan2dua/lang.git
cd lang
npm install
npm run setup:alignment
npm start
```

Buka `http://127.0.0.1:3000`. Penyelarasan audio hanya boleh dilakukan pada video
yang Anda miliki atau yang Anda berizin untuk proses.

Saat pertama kali menyelaraskan kata, WhisperX mengunduh model bahasa yang
diperlukan. Proses dapat lambat pada CPU dan memerlukan ruang disk serta memori
tambahan.

## Data lokal

`npm start` memastikan layanan Windows MongoDB berjalan, lalu membuat/menggunakan
database lokal `lang` dan collection `transcripts`. Daftar video, perubahan teks
dan waktu, serta penghapusan semuanya tersimpan di MongoDB. Unduhan JSON tetap
tersedia sebagai ekspor.

Saat pertama kali dijalankan setelah upgrade, file transkrip lama di `transcripts/`
akan dimigrasikan satu kali ke database. File lama dibiarkan sebagai cadangan dan
tidak digunakan lagi untuk membaca atau menyimpan perubahan.

Database lokal ini tidak otomatis tersinkron ke perangkat lain. Folder `.venv`,
`node_modules`, file transkrip cadangan, dan environment lokal tidak disertakan di
GitHub.
