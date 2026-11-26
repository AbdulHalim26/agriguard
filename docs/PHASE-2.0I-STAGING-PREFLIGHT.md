# PHASE 2.0I — Supabase Staging Preflight

Tanggal: **24 November 2026**. Status: **LOCAL_PREPARATION_TESTED /
STAGING_NOT_PROVISIONED**. Project, Auth users, uploads, migrations dan seed staging
**belum dibuat/dijalankan** di cloud. Paket lokal siap untuk langkah pemilik di bawah.

## 1. Hasil audit existing

### Project yang terhubung

| Bukti read/configuration | Hasil aktual |
|---|---|
| Vercel project | `agriguard`, ID `prj_mEWCELsO7CzufJMuOfqioGkg6xwX`; production web existing tetap ada. |
| Selected public `NEXT_PUBLIC_SUPABASE_URL` dari Vercel Production | **`https://gvrwzfwybvyqlvbqxebe.supabase.co`**. Hanya variable URL publik yang diambil; credential values tidak dicetak. |
| Local Next config | Host/ref yang sama. **Jangan menjalankan default local app sebagai staging dengan `.env.local` existing.** |
| `supabase/.temp/project-ref` | `gvrwzfwybvyqlvbqxebe` — current root CLI link adalah **production**, bukan staging. |
| Read-only project list |5 projects terlihat pada akun; satu teridentifikasi bernama `agriguard`, ref tersebut, region `ap-northeast-2`, status `ACTIVE_HEALTHY`. Identitas project lain tidak disalin ke dokumen. |
| Staging AgriGuard | Tidak ada target staging terpisah yang teridentifikasi/terkonfigurasi dalam workspace. Ini bukan klaim bahwa akun hanya memiliki satu project total. |

Project ref/URL publik di atas bukan credential. Nilai anon/service keys, password,
access token CLI, OTP codes dan URL pooler bercredential tidak ditampilkan.

### Temuan schema, RLS, Auth dan Storage aktual

Audit memakai query katalog di [`supabase/staging/read-only-audit.sql`](../supabase/staging/read-only-audit.sql),
**`BEGIN TRANSACTION READ ONLY` → SELECT metadata → ROLLBACK**. Response mengonfirmasi
`transaction_read_only:on`, PostgreSQL **17.11**. Tidak membaca baris pengguna,
laporan, lahan, foto atau Auth identities production.

| Area | Observasi aktual | Implikasi |
|---|---|---|
| RLS | Enabled pada6 business tables existing dan `storage.objects`; force-RLSfalse. | Enabled flag saja tidak membuktikan effective permissions aman. |
| Security schema0A | `ai_analyses` tidak ditemukan; report columns `evidence_source`, `manual_status`, `ai_analysis_id`, `submission_hash` belum ada. | Working-tree report/receipt code belum kompatibel dengan schema production yang diaudit. |
| Security RPCs | `has_phone_otp_session`, `complete_onboarding`, `can_review_lahan`, `verify_damage_report` belum ada. | Jangan menganggap source0010/0011 sudah diterapkan di production. Riwayat lengkap migration ledger tidak diambil; yang dibuktikan adalah current contract absence. |
| Effective grants | `anon`/`authenticated` masih mempunyai table INSERT/UPDATE/DELETE/**TRUNCATE** pada profiles/reports; authenticated profile UPDATE mencakup id/phone/name/role/Poktan/time. | Ini temuan privilege metadata, **bukan exploit test**. RLS tidak mengatur TRUNCATE. Perlu review rilis keamanan terpisah oleh pemilik; tidak diperbaiki otomatis di production. |
| Policies | Legacy policy names masih ada, tanpa restrictive phone-OTP policies baru. | Staging harus memuat security profile lengkap sebelum native workflow dianggap siap. |
| Auth public settings | Phone disabled, email enabled, signup tidak disabled, mailer autoconfirmtrue. | Native Phone OTP terbaru belum siap pada project existing. SMS provider secret/OTP settings/rate policy tidak diambil. |
| Storage `photos` | **Private**, limit **5.242.880 bytes**, MIME JPEG/PNG. | Baseline bucket sesuai aplikasi; real scoped access tetap harus diuji. Tidak mengambil object names/contents production. |
| Migration ledger | Table ledger ada. | Bukan bukti0010/0011 applied; ledger rows/dump production tidak digunakan sebagai seed. |

**Production tidak boleh menjadi target uji atau bootstrap staging.** Source terbaru
dan production berbeda; menerapkan0010 saat web/provider masih legacy dapat
memutus akses. Cutover production berada di luar fase ini.

### Catatan penting: batas read-only SQL versus efek samping CLI

Query katalog di atas dijalankan menggunakan existing cached Supabase CLI **2.120.0**
(`db query --linked --project-ref …`). SQL-nya terbukti READ ONLY/rollback, tetapi
CLI mencetak **`Initialising login role...`**. Pemeriksaan source versi tersebut
menemukan preflight resolver yang **dapat mint temporary database login role sebelum
query Management API**, di luar transaksi SQL read-only.

Karena itu **tidak boleh mengklaim zero side effects pada seluruh metadata cloud**:
temporary login-role provisioning mungkin terjadi pada bootstrap alat, walaupun
query tidak mengubah data/schema aplikasi. Jalur tersebut dihentikan setelah
diketahui; tidak ada cleanup role, credential rotation atau perubahan remote lanjutan.
Pemilik perlu meninjau temporary-access event ini jika diperlukan. Jangan mencoba
“mengembalikan” keadaan dengan remote reset/delete/DDL tanpa persetujuan.

Source yang diperiksa:
[CLI2.120 query handler](https://github.com/supabase/cli/blob/v2.120.0/apps/cli/src/commands/db/query/query.handler.ts).
Audit production berikutnya gunakan SQL Editor/read-only route yang dipahami
efek sampingnya, bukan mengulang CLI `--linked` secara buta. Seluruh persiapan setelah
temuan ini adalah **offline/local**. Dokumen ini tidak meminta query/write CLI
lanjutan pada production.

## 2. Artefak persiapan lokal

| File | Fungsi |
|---|---|
| [`.env.staging.example`](../.env.staging.example) | Template terpisah, tanpa credential; default native OTPfalse/YOLOfalse, AIloopback, EWS no silent demo. |
| [`scripts/prepare-staging.ts`](../scripts/prepare-staging.ts) | CLI **offline only**: `plan`, `seed`, `check-env`; tidak punya mode apply/cloud/database connection. |
| [`lib/staging/preflight.ts`](../lib/staging/preflight.ts) | Production-ref denylist, key/ref/origin sanity checks, exact migration allowlist, synthetic geometry/PNG/hash generation, exclusive private outputs. |
| [`supabase/staging/fresh-project-check.sql`](../supabase/staging/fresh-project-check.sql) | Read-only check empty Auth/Storage dan belum ada schema AgriGuard, untuk NEW staging sebelum instalasi. |
| [`supabase/staging/read-only-audit.sql`](../supabase/staging/read-only-audit.sql) | Katalog/grants/bucket metadata audit setelah schema tersedia; bukan pen-test atau migration. |
| [`supabase/staging/identities.example.json`](../supabase/staging/identities.example.json) | Mapping UUID native Auth yang **baru dibuat pada staging**, tidak memakai IDs production. |
| [`supabase/staging/seed-template.sql`](../supabase/staging/seed-template.sql) | Transaksi fixture manual/pending, fresh-data/Auth-marker/upload/grant guards. Belum diuji di actual staging DB. |
| [`tests/staging-preflight.test.ts`](../tests/staging-preflight.test.ts) |13 local safety/generation cases, bukan fake SQL/GoTrue/RLS implementation. |
| `.gitignore` | Ditambah `.staging/`; existing `.env*.local` sudah mengabaikan `.env.staging.local`. |

Generator membuat hanya output **NEW** di `.staging/` atau approved temp root,
mode directory0700/files0600. Existing bundle tidak ditimpa; escaping symlink
ditolak. Production ref ditolak sebelum bundle dibuat. UUID map strict4 unique IDs;
model/dataset/production configuration tidak dimutasi.

## 3. Approval/tindakan pemilik akun

| ID | Tindakan yang membutuhkan pemilik | Status fase ini |
|---|---|---|
| O-00 | Review kemungkinan temporary CLI login-role bootstrap §1; keputusan inspection/cleanup production terpisah. | Dicatat; tidak ada auto-cleanup. |
| O-01 | Setujui organisasi, biaya/quota, region, akses tim; buat **NEW Supabase project `agriguard-staging`**. | **WAITING_OWNER**. |
| O-02 | Setujui9-file schema/security profile pada project baru, jalankan audit + rollback suite. | **NOT_RUN_ON_STAGING**. |
| O-03 | Konfigurasi native Phone Auth, test-number allowlist/provider, OTP/rate/redirect settings; buat4 native synthetic identities. | **WAITING_OWNER**. |
| O-04 | Upload3 generated synthetic PNG ke bucket private, lalu apply guarded fixture SQL; simpan UUID map/manifest privat. | **NOT_RUN**. |
| O-05 | Isi staging-only env keys; enable OTP hanya setelah provider/identities siap; jalankan aplikasi lokal terisolasi. | **NOT_CONFIGURED**. |
| O-06 | Bila perlu hosted staging, buat separate Vercel staging project/domain/env dan approve release secara manual. | **NO_DEPLOY_PERFORMED**. |
| O-07 | Jalankan actual native login/scan/submit/verify/audit/readback dan negative role tests. | **BLOCKED_BY_STAGING_SETUP**. |

Tidak ada cloud project dibuat/diubah otomatis oleh generator; tidak memakai branch
database yang menyalin production, backup restore, production dump atau remote reset.
Jangan pause/delete project lain untuk mengakali quota tanpa keputusan pemilik.

## 4. Langkah1 — buat project staging baru

**Pemilik, setelah O-01 disetujui:**

1. Supabase Dashboard → pilih organisasi → **New project**, nama `agriguard-staging`.
   Pilih budget/plan secara sadar. Pilih PostgreSQL major17 untuk parity bila tersedia;
   region `ap-northeast-2` menyamakan existing project, atau catat pilihan lain.
2. Buat password DB baru dan simpan di secret manager. Jangan mengambil password/
   API keys production. Fase ini tidak membutuhkan DB password di repository.
3. Catat **NEW project ref** dari Settings/API/URL Dashboard; harus berbeda dari
   `gvrwzfwybvyqlvbqxebe`. Tunggu project healthy.
4. Jangan connect aplikasi/client atau mengaktifkan signup publik sebelum schema/
   grants lengkap. Jangan restore/copy Auth/users/Storage/data production.
5. Catat approval, new ref, region, PG version dan administrator. Root CLI link tetap
   production; **jangan gunakan `--linked` dari root untuk staging**.

## 5. Langkah2 — generate dan apply schema profile

Generator tidak membutuhkan cloud credentials dan **tidak menghubungi Supabase**:

```sh
export STAGING_REF='__NEW_STAGING_PROJECT_REF__'
node --import ./tests/register.mjs scripts/prepare-staging.ts plan \
  --project-ref "$STAGING_REF" --output .staging/phase2i-plan
```

Placeholder harus diganti ref20-karakter yang sebenarnya. Production/invalid ref
gagal, output existing gagal; pilih output NEW jika membuat revisi. Plan berisi:

- `manifest.json`: target/denylist, source SHA-256, status **NOT_APPLIED**.
- `migrations/`: hanya9 source files berikut, byte-identical dengan working tree.
- `fresh-project-check.sql`, `read-only-audit.sql`, rollback suite Dashboard-compatible.
- `native-auth-create.json`, identity-map example dan env example.

### Urutan tepat di SQL Editor NEW staging (role postgres)

Setiap kali, cocokkan **Dashboard project name/ref** dengan `$STAGING_REF`, bukan
sekadar label file. Jalankan `fresh-project-check.sql` terlebih dahulu. Setelah
lulus, jalankan source copies ini **satu per satu** dalam urutan:

| # | Migration | Keperluan |
|---|---|---|
| 1 | `0001_init.sql` | Base enums/tables/indexes/Auth trigger, bucket private, base policies. |
| 2 | `0003_fix_rls_recursion.sql` | Security-definer helpers untuk policy recursion. |
| 3 | `0004_unique_water_level_district.sql` | Unique water district index. |
| 4 | `0005_water_levels_unique.sql` | Convert/ensure proper unique district constraint. |
| 5 | `0007_fix_signup_and_poktan_rls.sql` | Farmer-only signup trigger dan intermediate Poktan policy. |
| 6 | `0008_fix_handle_new_user.sql` | Historical Auth trigger compatibility, kemudian dioverride. |
| 7 | `0009_fix_onboarding_full_name.sql` | Historical fullname behavior, kemudian dioverride. |
| 8 | **`0010_phase0a_security.sql`** | Final native-phone trigger, restrictive OTP RLS, receipts/evidence columns, onboarding/scoped verification RPC dan Storage scope. |
| 9 | **`0011_phase0a_effective_grants.sql`** | Effective table/column/PUBLIC grants hardening dan trusted-server rights. |

**JANGAN jalankan** `0002_seed.sql`, `0006_seed_auth.sql`, `supabase/seed.sql`, atau
`supabase/poc/**`. Legacy seed memakai accounts/password flow dan claimed AI/
verification data yang tidak menjadi fixture staging terbaru. `0006` tidak menjadi
dependency schema/native Auth pada fresh project; UUID dan identities dibuat native.
Jangan memakai PoC Auth/Storage stubs sebagai pengganti managed Supabase schemas.

Setiap source file boleh mempunyai transaction boundary sendiri; ini **bukan** satu
atomic9-file migration. Jika gagal, stop, simpan status/hash file yang sukses dan
review hanya target staging. Jangan auto-retry seluruh bundle atau reset remote DB.

### Sesudah9 files

1. Jalankan generated `read-only-audit.sql` pada staging, cocokkan:
   -7 business tables termasuk `ai_analyses` + RLS Storage;
   -4 security RPCs present;
   -4 report evidence columns present;
   -restrictive OTP policies;
   -authenticated update profile hanya `full_name`; tidak ada direct report
     INSERT/UPDATE/DELETE/TRUNCATE atau client receipt mutation rights;
   -`photos` private,5MiB, JPEG/PNG.
2. Jalankan `.staging/phase2i-plan/phase0a_security.dashboard.sql` **hanya staging**.
   Ini source rollback suite existing dengan satu psql `\set` dihapus dan explicit
   session opt-in ditambahkan. Test fixtures berakhir `ROLLBACK`; actual JWT/SMS
   signature/delivery belum dibuktikan oleh SQL claims fixtures.
3. Jika suite gagal, jangan melonggarkan policy atau menyatakan RLS passed. Catat
   PG/platform/ACL failure, hentikan bootstrap sampai diperiksa.

Manual SQL Editor **tidak otomatis mengisi Supabase CLI migration-history ledger**.
Manifest/hash/checklist ini adalah release record profile staging; jangan lanjutkan
dengan blind `supabase db push` dari migrations root (yang masih memuat legacy seeds).
Adopsi CLI history/workdir terpisah adalah pekerjaan operator yang direview kemudian.
Tidak ada `migration repair`, db push/reset/pull atau production history write pada I.

## 6. Langkah3 — native Auth dan4 synthetic accounts

### Configure Auth — O-03

Pada **NEW staging project saja**:

- Enable native **Phone Auth**. Pilih native test-phone-number facility bila tersedia
  pada versi Dashboard; set exact4 numbers berikut dan OTP yang dipilih pemilik.
  Jangan commit/cetak OTP codes atau memakai application mock/password fallback.
- Bila memakai SMS sungguhan, pemilik menyediakan provider/consent/nomor uji yang
  dikendalikan, bukan nomor pengguna production. Fixed fictitious numbers di bawah
  hanya boleh dipakai melalui native test-number facility, **jangan kirim SMS ke sana**.
- Set Site URL `http://localhost:3201` dan explicit staging redirect origins sesuai
  actual environment. Jangan pakai production Vercel origin. Tinjau OTP expiry,
  resend/rate limits/CAPTCHA/provider readiness; tidak mengubah Auth production.
- Seeded login memakai `mode:login`, tidak perlu public signup. Registration/
  onboarding test kelak memerlukan additional approved test number dan signup policy.

| Alias | Synthetic name | Native test phone | Role setelah SQL seed | Poktan |
|---|---|---|---|---|
| `farmer_a` | `[STAGING SYNTHETIC] Petani A` | `+6280000000101` | petani | A |
| `farmer_b` | `[STAGING SYNTHETIC] Petani B` | `+6280000000102` | petani | B |
| `ppl` | `[STAGING SYNTHETIC] PPL` | `+6280000000103` | ppl | A |
| `dinas` | `[STAGING SYNTHETIC] Dinas` | `+6280000000104` | dinas | A; Dinas has scoped-by-role cross-group review |

### Buat identitas melalui native Admin API — pemilik saja

Payload exact tersedia di generated `native-auth-create.json`. Buat users melalui
Supabase native Admin API/SDK, **bukan INSERT langsung ke `auth.users`**, bukan
email alias/phone-derived password. Payload mempunyai `phone_confirm:true` untuk
controlled synthetic accounts dan seed/ref marker; **tidak mengandung role grant**.
Final trigger0010 akan membuat semua profiles sebagai petani, groupnull.

Setelah mengisi `.env.staging.local` sesuai §8, contoh owner command berikut membuat
**satu alias per invocation**. Ini tindakan cloud yang membutuhkan O-03; **tidak
dijalankan agent pada fase I**. Ganti alias terakhir dengan `farmer_a`, `farmer_b`,
`ppl`, `dinas` secara sengaja, satu per satu:

```sh
node --env-file=.env.staging.local --import ./tests/register.mjs --input-type=module -e '
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { validateStagingEnvironment } from "./lib/staging/preflight.ts";
const checked = validateStagingEnvironment(process.env);
const entry = JSON.parse(readFileSync(".staging/phase2i-plan/native-auth-create.json", "utf8"))
  .find(row => row.alias === process.argv[1]);
if (!entry || entry.payload.user_metadata.staging_project_ref !== checked.project_ref) throw Error("TARGET_OR_ALIAS_MISMATCH");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await admin.auth.admin.createUser(entry.payload);
if (error || !data.user) { console.error("STAGING_AUTH_CREATE_FAILED", error?.status); process.exit(1); }
console.log(JSON.stringify({ alias: entry.alias, id: data.user.id, project_ref: checked.project_ref }));
' farmer_a
```

Record actual returned UUIDs in private `.staging/identities.local.json`, memakai
shape `identities.example.json`. Jangan pakai UUID contoh dari production/SQL tests.
Untuk membuat file mapping baru tanpa menimpa pekerjaan sebelumnya:

```sh
cp -n .staging/phase2i-plan/identities.example.json .staging/identities.local.json
chmod 600 .staging/identities.local.json
```

Isi keempat UUID lewat editor lokal; jangan kirim credential/token ke file mapping.
Profiles.phone harus sama persis dengan native Auth/JWT normalized phone. Jika
gagal/partial, lihat newly-created staging identities/markers sebelum mengulang;
tidak melakukan upsert terhadap unrelated account atau automatic credential repair.

User metadata role tidak dipercaya. PPL/Dinas promotion dilakukan oleh privileged
fixture SQL berikut, pada4 new identities tersebut saja. `phone_confirm:true` atau
test-number OTP bukan bukti real SMS delivery; GoTrue token validation dan OTP AMR
tetap diperlukan untuk login aplikasi.

## 7. Langkah4 — generate, upload dan apply synthetic seed

```sh
node --import ./tests/register.mjs scripts/prepare-staging.ts seed \
  --project-ref "$STAGING_REF" --identities .staging/identities.local.json \
  --output .staging/phase2i-seed
```

Ini juga **offline only**. Output:

- `seed.sql` — transaksi fresh staging, sudah berisi exact native UUIDs dan marker.
- `seed-manifest.json` — IDs, actors, fixtures, object paths, actual hashes/bytes.
- `photos/<auth_uuid>/reports/<key>/0_<sha256>.png` —3 valid generated96×64 PNG.

### Data yang disiapkan

-2 Poktan bernama SYNTHETIC, A `Telukjambe Timur`, B `Telukjambe Barat` agar cocok
  dengan UI enum existing. Nama kecamatan publik bukan salinan record production.
-2 non-overlapping synthetic polygons sekitar107,31/−6,33, declared0,2/0,3ha;
  D1 validation dan report-point containment benar-benar dijalankan lokal. Ini bukan
  surveyed/legal boundary atau verified ownership.
-3 **manual pending reports**:2 farmerA untuk verify/reject,1 farmerB untuk cross-Poktan
  denial/Dinas access. Confidence/damage_pct/AI receipt/verifier/time keputusan null.
-3 checkerboard PNG berlabel metadata **SYNTHETIC STAGING QA ONLY**, bukan foto
  kerusakan tanaman. File bytes/hash dan v1 submission-hash shape cocok.
-Tidak ada `ai_analyses` seed, fake learned result, verification decision, current
  water reading atau operational EWS trust marker. Audit `staging_fixture_seed`
  secara eksplisit menandai administrative fixtures, bukan human review.

### Upload dahulu, lalu SQL — O-04

1. Confirm **NEW staging ref** pada Dashboard Storage.
2. Bucket `photos` harus private/5MiB/JPEG+PNG. Pakai `uploads` di manifest untuk
   setiap exact object key. Buat folders `<auth_uuid>/reports/<key>`, lalu upload
   basename `0_<hash>.png` dari generated folder.
3. **Jangan tambahkan `photos/` ke object key**: `photos` adalah nama bucket. Jangan
   upload/menyalin foto production atau memakai old seed object paths.
4. Setelah exact3 objects tersedia, confirm SQL Editor targetref dan jalankan
   generated `.staging/phase2i-seed/seed.sql` sebagai owner/postgres.
5. Seed memeriksa missing security contracts/grants, empty business tables, exact4
   native test users/profiles/markers/phones, private bucket dan3 exact upload
   metadata entries sebelum menulis. Existing populated/partial state ditolak.
6. Simpan result dan manifest privat. Ini bukan idempotent overwrite seed: setelah
   sukses atau partial Auth/upload work, jangan reset remote atau menghapus evidence
   otomatis. Jika seed SQL gagal, transaksinya rollback; Auth/API uploads sebelumnya
   adalah operasi terpisah dan tetap perlu inspeksi pemilik.

Ref literal dalam SQL **bukan attestation identitas DB**; output generator tidak
menggantikan Dashboard-target confirmation. Fresh-data/markers/grant checks memberi
guard tambahan, tetapi bukan izin menjalankan SQL pada production.

Baseline expected reads dengan actual phone-OTP sessions: farmerA2 reports,
farmerB1, assigned PPL2, Dinas3. Semua pending. Belum ada verification audit sampai
petugas sungguh menjalankan narrow RPC.

## 8. Langkah5 — environment staging terpisah

Copy template **ke file baru**, tidak menimpa `.env`/`.env.local` existing:

```sh
cp -n .env.staging.example .env.staging.local
chmod 600 .env.staging.local
```

Isi dengan NEW staging ref/URL/anon-or-publishable/server-only-key dan approved app
origin. Jangan memakai production keys, jangan menaruh service key pada `NEXT_PUBLIC_*`.
`.env.staging.local` dan `.staging/` ignored; file template tidak berisi secrets.

```sh
node --env-file=.env.staging.local --import ./tests/register.mjs \
  scripts/prepare-staging.ts check-env
```

Checker menolak production ref/host, mixed-ref legacy JWT keys, wrong-role public
key, production web origins, placeholder credentials dan implicit flags. Decode
JWT claims **bukan signature validation**. Opaque keys tidak dapat dibuktikan ref-nya
offline dan dilabeli perlu server Auth test. Check success bukan bukti provider/DB
siap; `network_or_provider_verified:false` tetap eksplisit.

### Menjalankan lokal setelah O-02–O-05

1. AI existing di localhost (tidak train/export/ubah weights), jika belum ada owned
   service pada port itu:

```sh
env AGRIGUARD_YOLO_ENABLED=false PYTHONDONTWRITEBYTECODE=1 \
  ai-service/.venv/bin/uvicorn main:app --app-dir ai-service --host 127.0.0.1 --port 8000
```

2. Awalnya `AUTH_PHONE_OTP_ENABLED=false` sengaja memberi503 pada login. Setelah
   native provider/test numbers/UUID pin/seed siap, **pemilik** ubah hanya staging
   file ke `AUTH_PHONE_OTP_ENABLED=true`, lalu re-run checker.
3. Start Next dengan env file **secara eksplisit**, di terminal terpisah:

```sh
node --env-file=.env.staging.local --import ./tests/register.mjs scripts/prepare-staging.ts check-env && \
node --env-file=.env.staging.local node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3201
```

`npm run dev` biasa tidak memuat `.env.staging.local`; current `.env.local` menunjuk
production. Node `--env-file` juga tidak mengalahkan inherited process env; checker
akan menolak target/ref/key mismatch. Pastikan semua runtime-critical names di
template tetap eksplisit agar Next dotenv fallback tidak mengisi production values.

Gunakan port/origin baru dan browser profile baru. Jangan clear/copy IndexedDB atau
queued photos production untuk mengatasi masalah staging. Storage/session isolation
berbasis origin/project-ref; marker env adalah sanity check tooling, bukan fitur auth.
Jangan set `NODE_ENV=staging` — Next memakai development/production normal.

Untuk `next build`/`next start`, lakukan **fresh build dengan staging env**. Public
Supabase URL/key di-inline ke client bundle; mengganti env ketika `start` saja tidak
mengganti compiled production values. Rebuild dahulu, lalu test network hostname.

### Hosted staging — O-06, belum dilakukan

Pemilik dapat membuat **Vercel project terpisah `agriguard-staging`**, domain staging
sendiri dan env baru. Jangan mengubah env Production project `agriguard` atau
mengarahkan production domain ke staging DB. Pastikan included source revision
memuat local work yang direview; existing production commit belum memuatnya.

Pada hosted Vercel, `AI_API_URL=http://127.0.0.1:8000` menunjuk container Vercel,
bukan laptop. Gunakan approved reachable staging AI endpoint, atau explicitly
approved existing stateless classifier untuk synthetic traffic. Tidak membuat
AI deployment/train ulang otomatis. Phone Auth redirect/Site URL harus cocok dengan
actual HTTPS staging origin. Tidak ada deploy/push pada fase I.

## 9. Checklist pengujian nyata — setelah staging tersedia

Catat PASS/FAIL/BLOCKED beserta timestamp, target ref, source hashes, synthetic actor
alias/report ID; jangan simpan bearer token, OTP atau signed-URL query ke repo/chat.

| # | Pengujian | Evidence/expected result |
|---|---|---|
| 1 | Identity/env check | Browser/API requests hanya ke NEW staging Supabase; server/public keys tidak mixed; tidak ada service key di bundle/browser. |
| 2 | Native farmer login | Mode login → actual GoTrue OTP verify → validated user/token, AMR `otp`, confirmed phone sama dengan profiles.phone; session endpoint200. Native test-number flow bukan bukti SMS delivery sebenarnya. |
| 3 | PPL/Dinas login | UUID yang sama dengan seed, role dari protected profile, assigned scope benar; tidak self-select role melalui metadata. |
| 4 | Onboarding/register | Additional approved staging phone bila ingin menguji new registration; blank name/group → onboarding → valid invite. Tidak memakai nomor/UUID production. |
| 5 | Land scope/validation | FarmerA tidak dapat edit/delete parcelB; same-group PPL tidak dapat edit parcelA. Invalid polygon ditolak server. Declared/geodesic area terpisah, ownership tetap unverified. |
| 6 | Scan AI | Actual staged image → proxy → existing classifier → server receipt dengan exact compressed photo SHA + actor. Synthetic PNG menguji mekanik, bukan accuracy. Untuk accepted real-crop case gunakan owned/authorized test photo, bukan copy production. |
| 7 | Submit/readback | Report ID, parcel, GPS, photo paths/hash, receipt, source, server timestamp benar. New report pending; forged client confidence/verified metadata tidak dipercaya. |
| 8 | Manual fallback | AI unavailable/timeout/422 → explicit manual option → valid report tanpa fake AI confidence/damage/receipt. Jangan ubah accepted same-key payload untuk memaksa recovery. |
| 9 | Offline/sync | Existing-open online session/cache → offline save → browser/device persistence → reconnect → matching actor/key/UUID ack; same-key retry satu durable row, blobs tidak dibuang sebelum ack. Cold-start app-shell belum diimplementasi. |
| 10 | Verify fixtureA1 | PPL A verifies dengan note → immutable final state, reviewer identity/time server dan **actual verification audit**. |
| 11 | Reject fixtureA2 | PPL rejects dengan note → false+verified_at; farmerA melihat ditolak dan note, bukan pending. |
| 12 | Cross-scope deny | PPL A tidak boleh read/verify/photo-access B1. Dinas dapat review sesuai role. Farmer/anonymous/password-only tidak dapat verify/direct-mutate report/receipt/profile role. |
| 13 | Finality/retry | Verify/reject ulang finalized row gagal; no overwritten evidence/second decision. Lost reply → reload authoritative state, bukan auto-repeat decision. |
| 14 | Photo access | Private/public URL tanpa auth gagal; bounded signed URL untuk own/assigned officer berhasil, cross-group denied. Cocokkan downloaded bytes SHA untuk synthetic objects. |
| 15 | Audit/readback | Submit/verification report IDs dan actor/notes cocok. Submit audit best-effort; verification RPC decision+audit atomicity diuji nyata, bukan diasumsikan dari source. |
| 16 | AUTP print | Hanya verified rows, IDs/notes/reviewer/receipt/hash terjaga; unique registered area, affected areaunknown; actual browser print/PDF tidak menyatakan claim approved. |
| 17 | EWS truthful state | Baseline tidak seed water/forecast: missing tidak AMAN. Jika operator menguji manual readings, labeli sebagai staging-only test input; jangan mempromosikan contoh menjadi operational observation. |
| 18 | Resilience/UI | Network loss saat verify tidak mengunci busy state; notes tidak hilang pada error; fresh list menentukan apakah decision sudah commit. Actual mobile/Leaflet/GPS tests dicatat. |

SQL rollback suite, offline tests, actual native GoTrue login, real RLS/Storage
permissions, decision concurrency dan browser/mobile E2E adalah bukti berbeda.
Jangan menyebut staging lulus hanya karena generator/check-env atau Node tests lulus.

## 10. Verification ledger fase I

| Operasi yang benar-benar dijalankan | Hasil/batas |
|---|---|
| Existing Vercel public URL/config + local config/cache | Production project/ref match; keys tidak dicetak. |
| Existing Supabase project-list metadata |5 visible;1 identified AgriGuard active/Seoul. Tidak membuat project. |
| Public Auth settings GET |Phonefalse/emailtrue/signup-enabled/mailer-autoconfirmtrue; tidak melakukan login/user mutation. |
| Catalog SQL audit |READ ONLYon/rollback; actual readiness findings §1. **CLI temporary-login bootstrap caveat tetap berlaku**, tidak dianggap zero cloud-metadata side effects. |
| Staging offline safety/generation tests |**13/13 PASS dalam full suite**. Guard production/mixed keys/unsafe origins, native identity shape, geometry/GPS, PNG/hash binding, exact migration copies, no-overwrite/private output, malformed-input redaction, no cloud apply mode. |
| `npm run test:security` |**259/259 PASS**,246 existing +13 staging cases. |
| Independent Pillow decode/verify |**3/3 synthetic PNG PASS**,96×64/PNG/explicit synthetic metadata; no inference/upload. |
| `npm run build` dengan localhost placeholder keys/flags |**PASS**, Next15.5.28. Cookie-dependent dashboard/lahan dynamic diagnostics expected. |
| TypeScript no-emit setelah build, diff checks |**PASS**. |
| Existing original schema/seed/classifier preservation |Targeted diff PASS;0010/0011 dan D2 source tidak diedit. Existing prior work tetap. |
| Actual staging schema/seed execution, SMS/native roles/RLS/Storage/E2E |**NOT_RUN / WAITING_OWNER**. SQL templates/generation bukan engine-validation proof. |

No CLI/package installation dilakukan: `npx --no-install` latest tidak tersedia,
kemudian existing cached2.120 digunakan untuk metadata audit. Source CLI side effect
diinspeksi dan dicatat; tidak diulang untuk production. Tidak ada AI training/model
replacement, reset, data migration/dump, user-data clone, cloud project creation,
seed upload/application, deployment, commit atau push. Jangan menafsirkan kalimat ini
sebagai penyangkalan caveat temporary-login metadata di §1.

## 11. Next action dan keputusan

**GO:** owner review paket lokal dan manifest; sumber schema/security serta fixtures
baru siap dipakai setelah target terpisah tersedia. **WAITING_OWNER:** pembuatan new
project/billing, Auth/provider/test-number setup, schema/seed application dan actual
E2E. **NO-GO:** memakai production sebagai staging, menjalankan root-linked reset/
push/legacy seed, menyalin pengguna/foto production atau mengklaim staging sudah live.

Exact next action: **pemilik menyetujui O-01 dan membuat NEW `agriguard-staging`,
lalu memberikan hanya project ref/non-secret readiness confirmation**. Credentials
diisi melalui secret manager/local ignored file, bukan chat. Setelah itu jalankan
langkah5–9 pada target tersebut dan simpan evidence sebelum mempertimbangkan rilis.
