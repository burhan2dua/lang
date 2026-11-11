# Rangkai — YouTube Transcript

Aplikasi lokal untuk mengambil caption YouTube dan menyelaraskan kata dengan audio.
Timestamp kata merupakan perkiraan hasil forced alignment; periksa kembali hasilnya,
terutama jika caption tidak cocok dengan audio.

## Menjalankan aplikasi

Persyaratan Windows:

- Node.js 22 atau lebih baru
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

Transkrip tersimpan di folder `transcripts/`. Folder ini, environment Python, dan
dependency Node sengaja tidak disertakan di GitHub; transkrip lokal tidak tersinkron
otomatis ke perangkat lain.
