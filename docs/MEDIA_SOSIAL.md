# Media Sosial Admin

Halaman: `/dashboard/admin/social-media`. Menu, header, dan banner menggunakan nama **Media Sosial**.

## Aktivasi

1. Jalankan migrasi `database/migrations/20261117_02_social_media.sql` melalui proses deployment database yang biasa dipakai. Migrasi hanya menambahkan tiga tabel dan indeks, tidak mengubah data ujian.
2. Restart/build backend dan frontend setelah perubahan diterapkan.
3. Buka **Media Sosial → Pengaturan**. Masukkan **API key Buffer** lalu simpan. Tidak ada API key media sosial yang perlu ditulis ke `.env`.
4. Hubungkan Instagram profesional, Facebook Page, dan TikTok pada akun Buffer Anda. Gunakan akun yang mendukung publikasi otomatis.
5. Klik **Sinkronkan akun** di Unelma. Jika Buffer memiliki satu organisasi, ID-nya dipilih otomatis. Jika lebih dari satu, pilih organisasi, simpan, lalu sinkronkan kembali.
6. Pada **Statistik akun**, pilih setiap akun dan masukkan token statistik dari platform asli. Kolom password yang dikosongkan mempertahankan nilai lama. Tombol hapus menghapus kredensial tersimpan.

API resmi untuk membuat API key Buffer dan menghubungkan akun: [Buffer Quick Start](https://developers.buffer.com/guides/getting-started.html). Kredensial pengguna belum disertakan dalam kode dan tidak diisi otomatis.

## Token statistik

- **Instagram**: Facebook User access token untuk Instagram API with Facebook Login; izin `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`. Isi ID numerik akun Instagram profesional yang sama dengan akun Buffer. Hak melalui Business Manager dapat memerlukan izin tambahan sesuai dokumentasi Meta.
- **Facebook**: Page access token untuk Page tujuan, dengan `read_insights` dan `pages_read_engagement`. ID Page diisi otomatis dari Buffer dan dapat dikoreksi di Pengaturan.
- **TikTok**: access token pemilik video dengan izin `video.list`. Refresh token, client key, dan client secret opsional untuk pembaruan token otomatis. Tanpa ketiganya, access token harus diganti ketika kedaluwarsa. Client key/secret juga diinput di halaman ini.
- Versi Graph API bawaan: `v26.0`, dapat diganti pada Pengaturan sesuai versi aplikasi Meta Anda.
- Persetujuan aplikasi/izin akun dari masing-masing platform tetap diperlukan. Menyimpan token belum berarti izin tersebut telah disetujui; gunakan pembaruan statistik pada posting terbit untuk memverifikasinya.

Referensi: [Meta Insights](https://developers.facebook.com/docs/insights/overview/), [Instagram Insights](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/insights/), [TikTok Display API](https://developers.tiktok.com/docs/en/display-api-get-started).

## Publikasi dan status

- Buat draf untuk satu akun tujuan. Facebook mendukung teks/tautan dalam caption, gambar, atau video. Instagram/TikTok memerlukan gambar atau video.
- Caption dapat disimpan dahulu sebagai draf sebelum media atau akun tujuan dilengkapi; publikasi memerlukan semua isian yang diperlukan.
- Media berupa tautan HTTPS langsung yang dapat diakses tanpa login. Tautan halaman Google Drive, halaman preview, atau gateway berkas yang memerlukan sesi login tidak sesuai. Format, dimensi, durasi, dan ukuran tetap mengikuti persyaratan platform/Buffer. Versi ini memakai URL media; belum menyediakan unggah berkas lokal di halaman ini.
- Pratinjau menunjukkan media dan caption sebelum pengguna menekan **Publikasikan sekarang**. Konten tidak dikirim dengan menyimpan pengaturan atau draf.
- Publikasi menggunakan Buffer GraphQL `createPost` dengan `mode: shareNow`, `schedulingType: automatic`, dan `needsApproval: false`.
- Respons Buffer yang baru menerima pekerjaan ditampilkan **Diproses Buffer**, bukan langsung Terbit. **Perbarui** memeriksa hasil publikasi.
- Satu posting diklaim secara atomik sebelum API eksternal dipanggil. Klik ganda/retry tidak mengirim ulang posting yang sama.
- Timeout atau hasil yang meragukan ditampilkan **Perlu diperiksa** dan dikunci dari pengiriman ulang. Jika proses server berhenti setelah klaim, status dapat tetap **Sedang dikirim**. Periksa Buffer lalu gunakan **Atur ID** untuk menghubungkan ID posting Buffer yang benar. Akun dan caption harus sesuai. Jika memang tidak ada posting di Buffer setelah diperiksa, buat draf baru secara sadar.
- Jika Buffer sudah memiliki ID posting tetapi platform menolak publikasinya, perbaikannya dilakukan melalui Buffer; Unelma tidak membuat publikasi kedua otomatis.
- Penghapusan hanya tersedia untuk draf/gagal yang belum mendapat ID Buffer. Posting terbit tidak dihapus dari platform melalui menu ini.

## Statistik

- Hanya riwayat posting yang dibuat dari Unelma yang ditampilkan; halaman menampilkan 100 posting terbaru, sedangkan kartu ringkasan menghitung seluruh posting tersimpan.
- Statistik diambil saat tombol Perbarui digunakan. Tombol massal memproses hingga 20 posting terbit terbaru pada pilihan platform yang aktif.
- Instagram: `views`, `reach`, `total_interactions`.
- Facebook: `post_media_view`, `post_total_media_view_unique`; interaksi adalah jumlah reaksi, komentar, dan bagikan. Pemirsa media unik digunakan sebagai pengganti metrik reach lama yang dihentikan pada Graph API baru.
- TikTok: `view_count`, dan jumlah `like_count + comment_count + share_count`. Unique reach tidak disediakan oleh endpoint Display API ini. Statistik foto TikTok dapat tidak tersedia melalui endpoint video.
- Data kosong/tidak didukung ditampilkan **—**, bukan nol. Ketika sinkronisasi gagal, snapshot sebelumnya dipertahankan beserta waktu pengambilannya dan keterangan kegagalan.
- Jangkauan pada kartu adalah jumlah jangkauan masing-masing posting, bukan jumlah orang unik di seluruh posting/platform.
- ID video TikTok dan beberapa ID posting Facebook diselesaikan dari permalink. Untuk Instagram dan permalink Facebook lain, API akun memeriksa maksimal 300 posting untuk mencocokkan permalink. Bila belum ditemukan, isi **ID posting asli di platform** melalui **Atur ID** pada riwayat.
- API statistik Buffer yang masih eksperimental tidak dipakai sebagai sumber laporan.

## Penyimpanan dan keamanan

- Seluruh endpoint berada di bawah guard JWT dan Admin/Superadmin, dengan pemeriksaan Admin pada service. Kunci internal tidak melewati pemeriksaan ini. Mutasi Next.js tetap melewati pemeriksaan asal permintaan.
- API key dan token disimpan dengan AES-256-GCM, nonce acak, serta konteks terikat pada konfigurasi/ID akun. Respons hanya mengandung tanda sudah/belum tersimpan. Token tidak disimpan di localStorage atau dikirim kembali ke browser.
- Kunci enkripsi diturunkan menggunakan HKDF dari `JWT_SECRET` server yang **sudah ada**, minimal 32 karakter, dengan konteks khusus Media Sosial. Tidak ada environment variable baru untuk API pihak ketiga. Rotasi `JWT_SECRET` memerlukan input ulang kredensial Media Sosial; jangan mengubahnya hanya untuk fitur ini jika sudah valid.
- Tabel kredensial terpisah dari endpoint pengaturan umum. Cadangan tiga tabel Media Sosial perlu ditambahkan ke prosedur cadangan database operasional bila digunakan; daftar backup ujian lama tidak menyertakannya.
- URL media pemasaran sengaja dipertahankan publik pada controller Admin Media Sosial. Perubahan ini tidak melewati gateway autentikasi untuk berkas ujian/informasi lain.

## Verifikasi

`node --test --test-isolation=none apps/api/test/social-media.test.cjs`

`node tools/test-social-media-browser.cjs`

`node tools/test-social-media-db.cjs` memvalidasi migrasi dan query pada PostgreSQL dalam transaksi yang selalu di-rollback. Alat menolak database yang sudah mempunyai tabel Media Sosial dan tidak menyimpan data percobaan.

Pengujian memakai provider tiruan dan tidak mengirim posting sungguhan. Uji langsung tetap membutuhkan API key/token pemilik akun melalui Pengaturan.
