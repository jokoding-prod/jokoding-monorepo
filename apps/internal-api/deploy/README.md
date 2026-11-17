# Deploy internal.jokoding.id

- **Frontend** `apps/internal.jokoding.id` → Vercel, domain `internal.jokoding.id`.
- **API** `apps/internal-api` → VPS (2 GB RAM, 2 core, satu VPS dengan Hermes dan app invoice lama), domain `api.internal.jokoding.id`.

Di VPS, API jalan sebagai service systemd `jokoding-internal` di `127.0.0.1:3300` (tidak dibuka ke internet). nginx meneruskan `https://api.internal.jokoding.id` ke port itu. Database PostgreSQL hanya listen di localhost.

## 1. DNS

Di pengelola DNS `jokoding.id`, tambahkan record:

| Tipe | Nama | Nilai |
|------|------|-------|
| A | `api.internal` | IP VPS |

Cek dulu sebelum lanjut (hasilnya harus IP VPS):

```bash
dig +short api.internal.jokoding.id
```

## 2. Vercel (frontend)

1. Buat project baru di Vercel dari repo ini.
2. **Root Directory**: `apps/internal.jokoding.id`.
3. **Environment Variables**: `VITE_API_URL=https://api.internal.jokoding.id`. Variabel ini dibaca saat build, jadi kalau diubah, lakukan redeploy.
4. **Domains**: tambahkan `internal.jokoding.id`, lalu ikuti instruksi DNS dari Vercel.

## 3. Install API di VPS

```bash
ssh user@IP-VPS
git clone <url-repo> jokoding-web
cd jokoding-web
sudo bash apps/internal-api/deploy/install.sh api.internal.jokoding.id
```

Yang dilakukan script (aman dijalankan berulang kali):

- Cek port 3300 kosong, lalu bikin swap 1 GB di `/swapfile` kalau belum ada swap.
- Install PostgreSQL (16 kalau tersedia), nginx, certbot, dan ufw. Kalau Node.js di bawah versi 20, script akan bertanya dulu sebelum install dari NodeSource.
- Setting PostgreSQL hemat memori di `conf.d/internal.conf`, lalu bikin role dan database `internal`. Password dibuat acak sekali saja dan tidak pernah ditampilkan.
- Tulis `/etc/jokoding-internal/env` (mode 640, `root:jokoding-internal`). Isinya `DATABASE_URL`, `PORT=3300`, `HOST=127.0.0.1`, `CORS_ORIGIN`, `COOKIE_DOMAIN=.internal.jokoding.id` `TZ=Asia/Jakarta`, dan `NODE_ENV=production` (cookie jadi Secure; override dengan `SECURE_COOKIES=true` atau `false`). Nilai yang sudah ada tidak ditimpa.
- Copy app ke `/opt/jokoding-internal`, `pnpm install --prod`, lalu jalankan service `jokoding-internal` sebagai user sistem `jokoding-internal`.
- Pasang site nginx, HTTPS Let's Encrypt (`--redirect`), dan perintah admin `/usr/local/bin/jokoding-internal`.
- ufw: buka SSH, 80, dan 443. Port 3300 dan 5432 tetap tertutup. Sebelum ufw diaktifkan, script minta konfirmasi bahwa port SSH sudah ada di daftar.

> **Peringatan:** script ini mengubah setting PostgreSQL untuk seluruh cluster (`max_connections=30`, `shared_buffers=256MB`, `work_mem=4MB`, `listen_addresses=localhost`), bukan hanya database `internal`. Sebelum menjalankannya, cek dulu apakah aplikasi lain (misalnya Hermes) memakai PostgreSQL di VPS yang sama, supaya batas koneksi baru tidak mengganggunya.
>
> Migrasi sesi `002_hash_sessions.sql` menghapus semua sesi login yang ada, jadi semua pengguna akan logout satu kali setelah update pertama.

Cek dari laptop:

```bash
curl https://api.internal.jokoding.id/api/health
# {"ok":true}
```

## 4. Akun dan rekening

Password ditanya tanpa ditampilkan.

```bash
sudo jokoding-internal create-admin irfan "Irfan Qobus"
sudo jokoding-internal set-bank 1 BCA 1234567890 "Nama Pemilik" --default
sudo jokoding-internal set-bank 2 Mandiri 0987654321 "Nama Pemilik"
sudo jokoding-internal add-user budi "Budi Santoso"     # member
sudo jokoding-internal deactivate budi                  # nonaktifkan akun
```

`set-bank` dengan slot yang sama akan menimpa rekening di slot itu. `--default` menjadikannya rekening default di invoice.

## 5. Update

```bash
cd ~/jokoding-web
git pull
sudo bash apps/internal-api/deploy/install.sh api.internal.jokoding.id
```

Database, password, dan file env tetap dipakai. Migrasi baru jalan otomatis saat service start. Frontend cukup di-push ke Git, Vercel akan build sendiri.

## 6. Log dan memori

```bash
journalctl -u jokoding-internal -f        # log API
systemctl status jokoding-internal
free -h                                   # RAM + swap, Hermes juga jalan di sini
systemctl status postgresql
```

RAM VPS cuma 2 GB dan dipakai bareng Hermes. Kalau kolom `available` di `free -h` di bawah sekitar 200 MB dan swap terus terpakai, cek siapa yang paling boros dengan `ps aux --sort=-rss | head`. Service API dibatasi `MemoryMax=300M`.

## 7. Pindah dari app invoice lama

Setelah internal.jokoding.id sudah jalan dan sudah dicoba:

```bash
sudo systemctl disable --now jokoding-invoice    # API lama (port 3100)
pkill ngrok                                      # atau stop service/tmux ngrok yang dipakai
```

**Jangan hapus** `/var/lib/jokoding-invoice/invoices.json`. Fase 2 akan meng-import riwayat invoice dari file itu. Sebaiknya backup dulu:

```bash
sudo cp /var/lib/private/jokoding-invoice/invoices.json ~/invoices-$(date +%F).json 2>/dev/null \
  || sudo cp /var/lib/jokoding-invoice/invoices.json ~/invoices-$(date +%F).json
```

Site nginx lama (`127.0.0.1:8080`) boleh dibiarkan atau dimatikan dengan `sudo rm /etc/nginx/sites-enabled/invoice && sudo systemctl reload nginx`.

## Tes lokal

Butuh PostgreSQL lokal. Setiap test membuat schema acak (`test_xxxx`) lalu menghapusnya, jadi database tes tetap bersih.

```bash
createdb internal_test
pnpm install
TEST_DATABASE_URL=postgres://$USER@localhost:5432/internal_test pnpm --filter @jokoding/internal-api test
```

Tanpa `TEST_DATABASE_URL`, test yang butuh database di-skip.

Menjalankan API lokal:

```bash
DATABASE_URL=postgres://$USER@localhost:5432/internal_dev pnpm --filter @jokoding/internal-api start
# default: 127.0.0.1:3300, CORS http://localhost:5173, cookie tanpa Secure
```
