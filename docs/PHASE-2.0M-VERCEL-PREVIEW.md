# PHASE 2.0M — Existing Vercel Preview Release (Staging-Backed)

Tanggal & waktu eksekusi: **26 November 2026, 02:08–02:21 WIB** (`+07:00`).  
Preview URL (HTTPS): **`https://agriguard-479q96eu9-abdulhalim26s-projects.vercel.app`**  
Inspect URL: `https://vercel.com/abdulhalim26s-projects/agriguard/HLLQKdKMjGrMHd1NDf16JD7aLT4Q`  
Production existing (TIDAK DIUBAH): **`https://agriguard-five.vercel.app`** (`dpl_3LU6DkJg35WY5CoZiqPm9UWMiY6b`)  
Staging Supabase: **`zlluhylmykoymynnjxjs`** (`agriguard-staging`, PG `17.12`).  
Production Supabase (STRICTLY FORBIDDEN): **`gvrwzfwybvyqlvbqxebe`** — **100% UNTOUCHED** (root CLI link `changed: false`).

Tidak ada `--prod`, tidak ada promotion ke production, tidak ada project Vercel baru, tidak ada perubahan env/domain production, tidak ada migrasi database, tidak ada rotasi kredensial, tidak ada training AI, dan tidak ada commit atau push.

---

## 1. Audit Read-Only Project Vercel Existing (STEP 1)

| Atribut | Nilai Aktual |
|---|---|
| Project ID / Name | `prj_mEWCELsO7CzufJMuOfqioGkg6xwX` / `agriguard` |
| Owner / Org | `abdulhalim26s-projects` (`team_veFdJ1awY2rNX0Sj78LbR8ps`) |
| Runtime / Framework | Next.js, Node.js **`24.x`**, Region `iad1` |
| Production Deployment | `https://agriguard-five.vercel.app` (`Ready / Production`, 31 hari lalu, commit `d7ffebb`) |
| Env Scope Sebelum 2.0M | Seluruh 7 variabel existing (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_API_URL`, `OPENWEATHER_API_KEY`, `OTP_MODE`) berscope **`Production` ONLY** — **nol** variabel berscope `Preview`. |
| Proteksi Upload | [`.vercelignore`](../.vercelignore) diperketat untuk mengecualikan `.staging/`, `.env`, `.env*.local`, `supabase/.temp/`, `supabase/poc/`, `video_arsip/`, `*.pdf`, `ai-service/`, `.render/`, `*.md` (hanya 214 file aplikasi terunggah). |

---

## 2. Pemisahan Environment Preview vs Production (STEP 3)

Seluruh variabel baru ditambahkan dengan scope **`Preview` ONLY** (nol variabel `Production` yang diubah/tersentuh; diverifikasi via `vercel env ls`):

| Variabel | Scope | Tipe | Target |
|---|---|---|---|
| `AGRIGUARD_ENVIRONMENT` | **Preview ONLY** | Secret | `staging` |
| `AGRIGUARD_STAGING_PROJECT_REF` | **Preview ONLY** | Secret | `zlluhylmykoymynnjxjs` |
| `NEXT_PUBLIC_SUPABASE_URL` | **Preview ONLY** | Config | `https://zlluhylmykoymynnjxjs.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Preview ONLY** | Config | Staging anon key (`zlluhylmykoymynnjxjs`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Preview ONLY** | **Secret (server-only)** | Staging service-role key (bukan `NEXT_PUBLIC_*`) |
| `AI_API_URL` | **Preview ONLY** | Config | `https://agriguard-ai-96hh.onrender.com` (Render EfficientNet v2) |
| `AUTH_PHONE_OTP_ENABLED` | **Preview ONLY** | Config | `true` |
| `AGRIGUARD_YOLO_ENABLED` | **Preview ONLY** | Config | `false` |
| `EWS_DEMO_ENABLED` | **Preview ONLY** | Config | `false` (hard guard `NODE_ENV=production` di Vercel) |

- **Supabase Auth Redirect (STEP 5):** Login native Phone OTP (`/api/auth/otp`) berjalan server-side (`signInWithOtp` + `verifyOtp`), bukan OAuth redirect, sehingga bekerja langsung pada Preview tanpa perlu menambahkan wildcard redirect URL. Auth production tidak disentuh.

---

## 3. Hasil Verifikasi Live HTTPS Vercel Preview (STEP 6)

Dieksekusi melalui **`vercel curl`** resmi terhadap **`https://agriguard-479q96eu9-abdulhalim26s-projects.vercel.app`** (karena **Vercel Deployment Protection** aktif pada Preview):

| Pengujian Live HTTPS Preview | Hasil Aktual | Klasifikasi |
|---|---|---|
| `GET /login` & isolasi target | `HTTP 200`; `references_production_ref_in_html: false` | **`PASS_HTTP_ONLY`** |
| `GET /api/ai/detect` | `HTTP 200`, `{"enabled":false}` (YOLO OFF) | **`PASS_HTTP_ONLY`** |
| `GET /api/auth/session` (anonymous) | `HTTP 401` (ditolak) | **`PASS_HTTP_ONLY`** |
| `GET /api/weather` | `HTTP 200`, `quality: "MISSING"` (truthful EWS, bukan `AMAN` palsu) | **`PASS_HTTP_ONLY`** |
| Farmer A OTP login (`POST /api/auth/otp` req + verify) → `/api/auth/session` → `/dashboard` | `200` / `200` / `200` (`userId === staging farmer_a`), `/dashboard` `200` | **`PASS_HTTP_ONLY`** |
| Farmer A akses `/verifikasi` | **`HTTP 307`** redirect ke `/dashboard` (ditolak middleware) | **`PASS_HTTP_ONLY`** |
| Farmer A `GET /api/lahan` | `HTTP 200`, menampilkan `[STAGING SYNTHETIC] Lahan A` saja (`Lahan B` tersembunyi) | **`PASS_HTTP_ONLY`** |
| Farmer A `POST /api/ai/analyze` → Render EfficientNet v2 | `HTTP 422` (domain gate Render aktif menolak PNG checkerboard sintetis → memicu jalur `Lapor Manual`, bukan hasil AI palsu) | **`PASS_HTTP_ONLY`** |
| PPL OTP login (`POST /api/auth/otp`) → `GET /verifikasi` | `200` / `200` / **`200`** | **`PASS_HTTP_ONLY`** |
| Production `https://agriguard-five.vercel.app` unchanged | `/api/ai/detect` tetap **`404`**, `/api/auth/session` tetap **`404`**, root Supabase CLI link tetap `gvrwzfwybvyqlvbqxebe` (`changed: false`) | **VERIFIED** |
| Interactive Chrome browser E2E pada URL Preview publik | **Terbatas oleh Vercel Deployment Protection** (pengujian browser penuh Chrome 158 + 12 screenshot + PDF AUTP + video 2m46s telah lulus pada PHASE 2.0K/2.0L dengan backend staging yang sama) | **BLOCKED_BY_VERCEL_PROTECTION** |

---

## 4. Catatan Penting untuk Akses Juri (Vercel Deployment Protection)

Vercel melaporkan:
> `! Deployment Protection is on for this project (Vercel Authentication).`

Agar juri dapat membuka **`https://agriguard-479q96eu9-abdulhalim26s-projects.vercel.app`** tanpa login akun Vercel, pemilik cukup melakukan **1 langkah di Vercel Dashboard**:
- **Opsi Teraman (Direkomendasikan):** Buka **Vercel Dashboard → `agriguard` → Deployments → `agriguard-479q96eu9` → klik `Share`** untuk membuat **Shareable Link** khusus bagi juri (tanpa membuka seluruh Preview lainnya).
- **Alternatif:** Vercel Dashboard → `agriguard` → **Settings → Deployment Protection** → ubah proteksi Preview jika diperlukan selama masa penjurian, lalu aktifkan kembali setelah 30 November 2026.

---

## 5. Rollback Plan

1. Hapus Preview deployment (opsional) atau cabut Shareable Link di Vercel Dashboard.
2. Untuk menonaktifkan login OTP Preview kapan saja: `vercel env add AUTH_PHONE_OTP_ENABLED preview --value false --force --yes` (atau `vercel env rm` seluruh 9 variabel `Preview` tanpa menyentuh `Production`).
3. Setelah kompetisi (30 Nov 2026): jalankan rollback Auth staging (`.staging/phase2j2-auth-config/backup-original.toml` + `supabase/staging/staging-send-sms-hook-rollback.sql`).

---

## 6. Keputusan GO / NO-GO

- **`GO (Vercel Preview Staging-Backed Live & Terverifikasi)`**: URL **`https://agriguard-479q96eu9-abdulhalim26s-projects.vercel.app`** aktif di Node `24.x`, terisolasi penuh ke Supabase staging `zlluhylmykoymynnjxjs` + Render EfficientNet v2, `AGRIGUARD_YOLO_ENABLED=false`, seluruh alur OTP/RLS/API terverifikasi lewat HTTPS, dan Production (`agriguard-five.vercel.app` & `gvrwzfwybvyqlvbqxebe`) **100% tidak berubah**.
- **Tindakan 1-klik Pemilik Sebelum Membagikan ke Juri:** Buat **Shareable Link** untuk deployment `agriguard-479q96eu9` di Vercel Dashboard (agar juri tidak terhenti di halaman login Vercel Deployment Protection).
