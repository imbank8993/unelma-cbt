# Pembayaran token: Core API dan Snap

Pilihan QRIS/VA pada modal awal memakai Core API agar instruksi pembayaran dapat ditampilkan di Unelma. Metode yang aktif di dashboard Midtrans tidak selalu aktif untuk produk Core API. Midtrans mendokumentasikan bahwa Core API Production memerlukan pengajuan aktivasi terpisah; kode `402` menyatakan layanan/metode belum diaktifkan untuk merchant.

Jika Core API membalas `402` dengan penolakan aktivasi/akses yang jelas dan tanpa status/ID transaksi, aplikasi melanjutkan melalui Snap memakai **order ID, nominal, pembeli, dan metode yang sama**. Bila Core API sudah aktif, QR/VA tetap ditampilkan langsung seperti sebelumnya. Timeout, kehilangan respons, kode `406`, error autentikasi, dan hasil yang sudah memiliki identitas transaksi tidak mencoba jalur lain.

Modal mendeteksi respons Snap dan menampilkan **Buka pembayaran Midtrans**. Halaman resmi dibuka di tab baru agar modal tetap dapat memeriksa status. Membuka tautan kembali melanjutkan order yang sama. Pembayaran tetap harus dikonfirmasi Midtrans; token hanya dikreditkan setelah webhook/status resmi terverifikasi, dengan pemeriksaan nominal dan klaim kredit atomik yang sudah ada.

Tautan Snap hanya diterima dari host HTTPS resmi sesuai mode Production/Sandbox dan path `/snap/`. API key tetap di **Admin → Paket Token → Pembayaran Midtrans**. Perubahan ini tidak menambahkan variabel environment atau migrasi.

Jika Snap juga ditolak `402`, aktivasi metode/produk pada akun merchant harus diperiksa di Midtrans. Jika menerima `401`, periksa Server Key dan mode Sandbox/Production pada pengaturan aplikasi. Munculnya metode di dashboard bukan bukti seluruh produk API sudah diaktifkan.

Referensi resmi:

- [Aktivasi Core API Production](https://docs.midtrans.com/docs/coreapi-e-money-integration)
- [Arti kode 402](https://docs.midtrans.com/docs/apa-arti-dari-error-402-dengan-pesan-merchant-doesnt-have-access-for-this-payment-type)
- [Parameter metode Snap](https://docs.midtrans.com/reference/request-body-json-parameter)

Verifikasi tanpa tagihan nyata:

`node --test --test-isolation=none apps/api/test/midtrans-checkout.test.cjs apps/api/test/tokens-security-stage115.test.cjs apps/api/test/tokens-tracker-stage116.test.cjs`

`node tools/test-payment-checkout-browser.cjs`
