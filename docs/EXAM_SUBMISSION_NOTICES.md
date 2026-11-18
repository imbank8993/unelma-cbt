# Peringatan sinkronisasi jawaban ujian

`ExamSubmissionSync` berjalan di root layout agar pengiriman jawaban tertunda tetap dapat dilanjutkan setelah siswa meninggalkan halaman ujian. Karena itu penolakan pengiriman lama dapat muncul saat membuka Dashboard, Hasil, atau Token Saya; pesan tersebut tidak berasal dari pembayaran.

Pesan **Sesi atau perangkat pengiriman tidak cocok** berasal dari preflight server ketika attempt tidak ditemukan, pemilik tidak sesuai, atau ID perangkat berbeda. Pemeriksaan keamanan ini tetap berlaku. Salinan lokal tidak boleh dikirim atau dianggap terkonfirmasi hanya untuk menghilangkan peringatan; proktor perlu memeriksa sesi/perangkat jika pengumpulan belum terkonfirmasi.

Sebelumnya penanda kegagalan hanya berada di memori worker dan hilang saat reload. Kini peringatan yang sama diingat di browser selama masa simpan riwayat (7 hari, maksimal 100 penanda), dengan cakupan akun, perangkat, ujian, attempt, waktu mulai, waktu akhir, dan pesan. Web Lock menghindari notifikasi ganda antartab. Jika penyimpanan browser tidak tersedia, penekanan duplikat tetap bekerja selama halaman terbuka.

Judul notifikasi menjadi **Sinkronisasi jawaban ujian tertunda** agar konteksnya jelas. Status masih diperiksa dengan backoff seperti sebelumnya, pengiriman tetap memerlukan kecocokan sesi/perangkat, dan jawaban baru dibersihkan setelah konfirmasi terverifikasi. Penanda peringatan dibersihkan setelah konfirmasi. Generasi ujian baru mempunyai backoff dan peringatan sendiri. Worker yang sudah dihentikan tidak menampilkan respons terlambat.

Tidak ada migrasi atau perubahan data ujian di server. Pengujian memakai data tiruan:

`node --test --test-isolation=none apps/api/test/exam-submission-notices.test.cjs apps/api/test/app-submission-stage79.test.cjs apps/api/test/offline-evidence-stage94.test.cjs`

`node tools/test-submission-notices-browser.cjs`
