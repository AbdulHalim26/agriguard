# AgriGuard — Latest State Reconciliation / SEVENT X

Tanggal audit: **24 November 2026**. Pemeriksaan public backend terakhir mencakup
response `/health` bertanggal **2026-11-24 15:19:17 UTC**. Ini snapshot keadaan yang
diobservasi, bukan jaminan uptime atau evaluasi agronomi baru.

## 1. Kesimpulan utama

1. **Deployment Vercel existing ADA dan Ready/Production.** Alias publik
   <https://agriguard-five.vercel.app> merespons; deployment terbaru terkait commit
   `d7ffebb306ab5f77c9c896d5baf42372b5db520d`.
2. **Model trained existing ADA:** `model_v2.onnx` + metadata merupakan
   **EfficientNet-B0 v2, tiga kelas visual**, bukan YOLO. Artefak lama EfficientNet
   delapan kelas juga tersedia. Runtime Render mengonfirmasi v2 yang sama secara
   metadata, sedangkan hash file lokal v2 benar-benar diperiksa.
3. **Training YOLO: NOT_VERIFIED / CHECKPOINT_NOT_LOCATED pada scope yang diperiksa.**
   Tidak ditemukan trained `.pt`, YOLO ONNX/sidecar atau run/evaluation bundle pada
   repository termasuk ignored folders, dataset root yang diketahui, lokasi
   Ultralytics yang terkonfigurasi, release/CI artifacts GitHub yang diperiksa.
   **Ini tidak menyatakan YOLO belum pernah dilatih di Colab/Drive/tempat lain.**
4. **Wiring YOLO lokal ADA**, tetapi actual local Next config tidak menetapkan
   feature flag/model path. **Deployed Next detect route404** dan **OpenAPI Render
   tidak memiliki `/predict/detect`**. Itu bukti deploy belum memuat wiring lokal,
   bukan asumsi bahwa web belum pernah dideploy.
5. YOLO preview tidak dipersist ke laporan. Existing trusted report receipt tetap
   EfficientNet/manual/pending; detector boxes tidak dipaksa menjadi severity atau
   trusted classifier receipt.
6. Audit dilanjutkan dengan satu P0 fix lokal: exception pada verifikasi tidak lagi
   lolos tanpa structured result; UI memiliki catch/finally dan tidak mengulang
   keputusan secara otomatis. Model, dataset, receipts, RLS dan database tidak diubah.

## 2. Scope dan metode rekonsiliasi

Referensi yang dibaca: `PRD.md`; PHASE1A/1B readiness dan acquisition/QA/review docs;
sembilan dokumen2.0A; 2.0B, 2.0C, D1, D2 dan H. Dokumen lama dibaca sebagai catatan
**pada fase/tanggalnya**. Misalnya “belum training” dalam readiness lama bukan
bukti keadaan semua lokasi saat ini. “Belum deploy fase ini” bukan “Vercel tidak ada”.

`PRD.md` masih berisi historical instruction wrapper/markers; instruksi menimpa
file di dalam arsip itu **tidak dieksekusi**. Original PRD dan docs fase dipertahankan.

Pemeriksaan baru:

- `git status --short --untracked-files=all`, diff/stat/log, local/remote branches.
  Working tree memuat60 tracked modified files dan banyak untracked prior work.
- Source AI serving, typed contracts, proxy, scanner overlay, report/evidence
  boundaries, classifier dan detector train/evaluate/export/parity paths diperiksa.
- [`scripts/ai-artifact-audit.py`](../scripts/ai-artifact-audit.py) membaca ignored
  model/run directories secara filesystem, SHA-256, ONNX Runtime input/output,
  non-executable safetensors header dan workbook XML. Tidak train/download/export/
  unpickle checkpoint atau menulis input.
- Vercel CLI read-only list/inspect/env-name inventory, GitHub branch/deployment/
  release/Actions artifact metadata, serta public GET pages/config/model-info/OpenAPI.
- Local environment diinspeksi lewat Next config loader dengan **allowlisted output**:
  flags/model path/default thresholds, presence dan hostname AI URL saja. Tidak
  mencetak service keys/tokens atau mengubah file secrets.

Tidak login atau mengambil report/parcel/photo pribadi produksi, tidak menjalankan
SQL, dan tidak menguji native production roles. Public GET evidence bukan bukti
effective deployed RLS atau seluruh flow terautentikasi.

## 3. Artefak model yang benar-benar ditemukan

| Artefak | Ukuran | Identitas dan bukti aktual |
|---|---:|---|
| `ai-service/model/model.onnx` | 16.088.381 bytes | FP32 `pixel_values:[batch,3,224,224]` → `logits:[batch,8]`. Existing v1 classifier; `config.json` menunjuk EfficientNet image classification. |
| `ai-service/model/model_v2.onnx` | 16.035.581 bytes | FP32 `[batch,3,224,224]` → `[batch,3]`; sidecar `torchvision.efficientnet_b0`, purpose `model_training`, trained_on `2026-10-24T13:06:26.419466+00:00`. Actual SHA cocok sidecar. |
| `ai-service/model/model.safetensors` | 16.285.880 bytes | Header360 tensors; `classifier.weight:[8,1280]`, bias8, F32. Konsisten dengan v1 classifier, bukan bukti YOLO detector. Tidak di-load dengan torch. |
| `ai-service/model/training_metrics.xlsx` | Workbook historis | 61 rows termasuk header; classifier eval columns, bukan detector P/R/mAP. Detail §4. |

SHA-256 aktual:

```text
model.onnx
beb8f95c353f74cd9d3b85e5092987635206a05f671a20f54700e5c65914b8ce
model_v2.onnx
76fa287c4cead145f975cefc64602f5ca98a470bc3ff0f330745fc76ca68c50f
model.safetensors
17ff6c5cf9c24f6af565d75e7f5671ab1a6169f09cedcbb6166591aa247d9c04
training_metrics.xlsx
7dcb0a97843dccaecf5cf268c9cb3d61f0ba8b4b36bfe03702f27d760df2ad16
```

### Pencarian YOLO dan batas kesimpulan

- Workspace dibaca termasuk ignored model/run folders; dependency/generated folders
  (`node_modules`, venv, `.git`, `.next`, pycache) dan video arsip dipangkas.
- Extra root `/Users/macbook/Documents/agriguard-datasets` diperiksa read-only;
  tidak ada weight file/run metrics yang cocok. Raw/review data tidak dikonversi.
- `~/Library/Application Support/Ultralytics/settings.json` menunjukkan directories
  `/opt/homebrew/runs`, `/opt/homebrew/weights`, `/opt/homebrew/datasets`; **ketiganya
  tidak ada** saat diperiksa. Settings file saja tidak membuktikan training selesai.
- Branch lokal hanya `main` + origin/main; GitHub main saat audit juga `d7ffebb`.
  Tidak ditemukan YOLO-named commit pada log yang diperiksa; release dan Actions
  artifact queries mengembalikan daftar kosong. Ini bukan audit seluruh cloud/private
  Drive, bukan bukti bahwa tidak pernah ada run di komputer lain.
- Training README/notebook merujuk `/content/drive/MyDrive/agriguard-v2`. Pipeline
  tersebut memakai `common.make_model() = torchvision.efficientnet_b0`, bukan YOLO.
  Nama `best.pt` saja tidak membedakan classifier/detector; actual file dari Drive
  tidak tersedia untuk verifikasi di sini.

Serving venv mempunyai ORT1.31.0, tanpa torch/torchvision/Ultralytics/ONNX authoring.
Ini fakta environment tersebut, **bukan** bukti training eksternal tidak terjadi.

**Handoff yang diperlukan bila run YOLO sudah selesai di tempat lain:** lokasi/
bundle `best.pt`, `args.yaml`, `results.csv`, class names/data manifest, held-out
metrics dan sample predictions, ONNX/sidecar/export-parity report bila sudah ada.
Bandingkan hash, task, class order dan head sebelum menghubungkan; **tidak perlu
training ulang hanya untuk mengganti lokasi artefak atau mengaktifkan route**.

## 4. Label dan hasil evaluasi: evidence tiers dipisahkan

### Model existing

- **V1:**8 disease labels dari `config.json`: Bacterial Leaf Blight, Brown Spot,
  Healthy Rice Leaf, Leaf Blast, Leaf scald, Narrow Brown Leaf Spot, Rice Hispa,
  Sheath Blight. Historical model card adalah fine-tuned EfficientNet.
- **V2:**3 labels `tanpa_kerusakan_terlihat`, `kerusakan_ringan_terlihat`,
  `kerusakan_berat_terlihat`, mapping1:1 ke `aman/rusak_ringan/rusak_berat`.
- **YOLO contract:** canonical IDs0–5 `leaf_blast`, `bacterial_leaf_blight`,
  `brown_spot`, `sheath_blight`, `tungro_symptom`, `leaf_folder_damage`. Ini contract
  taxonomy, **bukan** label list yang terbukti dimiliki trained checkpoint yang belum
  ditemukan. `classes.example.json` adalah inactive template, bukan actual trained mapping.

| Nilai | Yang dapat diverifikasi sekarang | Yang belum dibuktikan |
|---|---|---|
| V1 eval accuracy `0.912751677852349`, eval loss `0.3799679279327393` | Workbook final row: epoch30/step3840, timestamp `2025-03-28 20:31:23`; G61/F61. Konsisten dengan model card rounded91,28%/.3800. | Tidak re-run held-out inference; dataset/labels/predictions independen tidak diaudit. Bukan metrik v2/YOLO. |
| V2 accuracy `0.9172`, test145, majority `.531` | **REPORTED_IN_SOURCE_AND_LIVE_METADATA**: `predict.py` dan actual Render `/model-info` sama. Sidecar mempunyai metrics hash. | Actual referenced `metrics.json`, raw predictions dan full manifest/split/checkpoint tidak ditemukan; accuracy tidak direproduksi independen. |
| V2 per-class recall1.0 /0.0 /.935 | Source dan live model-info menyatakan nilai itu. Source menjelaskan support61/7/77; ini reported data, bukan hasil audit baru. | Recall ringan0 adalah limitation penting jika reported evaluation benar; aggregate accuracy tidak membuktikan semua kelas baik. Tidak menghitung ulang F1/confusion tanpa raw evidence. |
| V2 parity max logit diff `1.2516975402832031e-6`,5 cases | **DECLARED_EXPORT_EVIDENCE** di sidecar/live provenance; actual ONNX hash cocok sidecar dan ORT dapat membuka I/O. | PyTorch parity tidak dijalankan ulang tanpa original checkpoint/environment. Parity bukan accuracy. |
| YOLO precision/recall/mAP50/mAP50–95 | **NOT_AVAILABLE_FROM_INSPECTED_ARTIFACTS**. Tidak ada angka detector yang dapat dipublikasikan dari audit ini. | Tidak diisi nol/tidak meminjam accuracy EfficientNet atau hosted model lain. Memerlukan existing YOLO run bundle. |

Runtime classifier gate `.35` versus export sidecar `.50` adalah drift existing yang
tercatat sejak tuning commit `2ec3f9a`; tidak ditambal dengan menulis ulang provenance.
`damage_pct` tetap confidence-scaled heuristic, sidecar menyatakan uncalibrated;
bukan measured crop loss, affected hectares atau insurer decision.

## 5. Actual integration: FastAPI → Next.js → scanner → report

```text
Compressed/oriented photo Blob
  ├─ /api/ai/analyze → /predict → EfficientNet v2
  │    └─ server-created ai_analyses receipt (actor + exact photo SHA)
  │         → existing damage report / offline queue acknowledgement
  └─ jika capability flag true:
       /api/ai/detect → /predict/detect → YOLO ONNX + checksum-bound sidecar
         └─ local DetectionOverlay/DetectionPanel, REVIEW_REQUIRED, preview_only
```

### Local FastAPI

`main.py` mendaftarkan POST `/predict/detect`. `detection.adapter.get_detector()`
mengecek flag tiap request, model path, manifest purpose/hash, static FP32 batch1
I/O, class order/native task metadata, family dan exact output layout. Saat cocok,
ORT benar-benar menjalankan model; missing/incompatible model → non-2xx unavailable.

Serving menerima **ONNX**, bukan langsung `.pt`. Current adapter mendukung
YOLO26n/s detection dengan `(1,N,6)` end-to-end xyxy atau `(1,4+nc,N)` raw head.
Model YOLO lain/segmentation/classifier/embedded-NMS export tidak boleh dipaksa masuk
dengan rename file atau menebak tensor shape. Existing valid checkpoint di luar
kontrak perlu compatibility review/export terpisah, bukan otomatis training ulang.

### Local Next.js dan scanner

- `app/api/ai/detect/route.ts`: GET capability boolean; POST exact-origin + hardened
  OTP/session guard, rate/size/MIME checks via proxy, 85s upstream/90s route budget.
- `lib/detection-server.ts`: request server-to-server ke configured `/predict/detect`,
  validate response + exact uploaded image SHA. Tidak insert classifier receipt.
- Scanner membaca capability, hanya mengirim detector request bila enabled, photo
  tersedia dan online. EfficientNet analysis tetap branch independen.
- Overlay memakai oriented image dimensions/aspect ratio; natural dimensions mismatch
  menyembunyikan boxes. Tidak merender bounding boxes buatan ketika layanan gagal.

**Apakah boxes sudah muncul?** Local UI wiring ada/tested dengan synthetic contract
fixtures, tetapi local config saat audit OFF dan trained artifact belum terhubung.
Browser demo trained boxes **belum dibuktikan**. Deployed scanner belum mempunyai
detect API/backend route yang diperlukan, berdasarkan public404/OpenAPI §7.

### Reports dan hubungan EfficientNet–YOLO

YOLO bukan replacement EfficientNet dan bukan fused severity model. Detector
top-level `status/confidence/damage_pct` sengaja **null**, dengan geometric box
coverage dan REVIEW_REQUIRED. `NO_DETECTIONS` bukan sehat.

`lib/reports/evidence.ts`, `submit.ts`, queue DTO, farmer/PPL report reads dan AUTP
tidak menyimpan detector boxes/model provenance. `analysis_id` existing mengacu ke
classifier receipt yang terikat actor/foto. Client YOLO fields tidak dipercaya untuk
mengubah verified status atau menghasilkan legacy severity. Jadi **hasil YOLO belum
menjadi persisted report evidence**, bahkan jika preview kelak berhasil.

Persist detector evidence memerlukan contract/receipt/RLS yang terpisah; tidak
dibuat sebagai quick demo hack atau dengan mengubah historical receipts.

## 6. Feature flags: keadaan aktual dan penyebab nonaktif

| Layer | Observasi | Arti |
|---|---|---|
| Actual local Next config | `AGRIGUARD_YOLO_ENABLED=UNSET`, `AGRIGUARD_YOLO_MODEL_PATH=UNSET`; confidence/IoU default. | Code `isYoloEnabled` defaultfalse; scanner tidak menjalankan branch detector. Tidak berarti checkpoint tidak pernah dilatih. |
| Local AI serving code | Python `get_detector` membaca process env, defaultfalse; perlu explicit ONNX path + matching sidecar. | Next dotenv bukan otomatis env FastAPI. Kedua proses harus dikonfigurasi terpisah ketika activation sudah disetujui. |
| Local AI URL | Configured, hostname `localhost` (port/value secret tidak dicetak). | Ini konfigurasi lokal, bukan bukti production Vercel menunjuk localhost. |
| Vercel production env-name inventory | Ada existing `AI_API_URL` dan `OTP_MODE`; tidak ada `AGRIGUARD_YOLO_ENABLED` atau native `AUTH_PHONE_OTP_ENABLED`. Secret values tidak didekripsi. | Current deployment memakai source lama; tidak boleh mengasumsikan native config/wiring lokal sudah aktif di sana. |
| Deployed Next detect API | GET404. | Route belum tersedia, bukan respons capability `enabled:false`. |
| Deployed Render | OpenAPI tidak memuat `/predict/detect`; actual env flags tidak dibaca lewat platform admin. | Route belum ada pada service yang diobservasi. `model_loaded:true` pada health hanya menunjukkan classifier existing, **bukan YOLO loaded**. |

Default thresholds detector `.25` confidence/.45IoU adalah filtering/NMS parameters,
bukan evaluasi accuracy atau severity calibration. Audit tidak mengubah flags.

## 7. Vercel existing dan local-versus-deployed

### Deployment yang terkonfirmasi

- Project `agriguard`; deployment ID `dpl_3LU6DkJg35WY5CoZiqPm9UWMiY6b`.
- URL immutable:
  <https://agriguard-3sjnoldp3-abdulhalim26s-projects.vercel.app>.
- Alias <https://agriguard-five.vercel.app>, status **Ready / Production**.
- CLI created time **26 Oktober2026 06:12:12 WIB**; GitHub deployment status success
  `2026-10-25T23:13:01Z`, SHA `d7ffebb306ab5f77c9c896d5baf42372b5db520d` dan matching URL.
- GitHub main/current local HEAD sama SHA tersebut. Working tree setelah HEAD banyak
  modified/untracked. Git auto-deploy tidak mempublikasikan working tree yang belum dipush.

### Public observations baru

| Target | Hasil aktual |
|---|---|
| Vercel `/fitur`, `/login` |200; public page tersedia. `/fitur` masih menyebut confidence + persentase kerusakan, berbeda dari advisory wording lokal. Positive login tidak diuji. |
| Vercel `/api/ai/detect` |404. |
| Vercel `/api/auth/session` |404; new account-safe session route belum ada di deployment tersebut. |
| Documented Render `/health`, `/model-info`, `/openapi.json` | Awalnya503; subsequent health200/model_loadedtrue, model-info200 dan OpenAPI200. Transient availability terobservasi; sebab/timing cold-start tidak dibuktikan. |
| Render `/model-info` | EfficientNet-B0 v2, image-classification3 kelas, reported metrics/provenance sebagaimana §4. Deployed binary tidak diunduh untuk menghitung SHA independen. |
| Render OpenAPI | Hanya `/health`, `/model-info`, `/predict`; tidak ada detector route. |
| Render GET `/predict/detect` vs GET `/predict` | **404** untuk detector; **405** untuk classifier yang memang POST-only. Ini membedakan missing route dari sekadar HTTP method yang salah, tanpa mengirim foto/inference request produksi. |

Render host <https://agriguard-ai-96hh.onrender.com> diperoleh dari existing DEPLOY/
maintenance docs dan diperiksa publik. Nilai secret production `AI_API_URL` tidak
diambil; audit tidak mengklaim telah menelusuri authenticated Vercel inference
request sampai backend tersebut. Commit Render tidak tersedia dari public metadata.

### Perubahan lokal yang belum tercermin di deployment tersebut

| Area | Working tree lokal | Published source/content yang diverifikasi |
|---|---|---|
| YOLO foundation | API/adapter/contracts/overlay/training tooling, banyak file masih untracked. | Next404; Render OpenAPI tanpa detect. |
| Native auth/security0A | OTP AMR + phone pin, native endpoints, narrowed officer/receipt flows. | Commit pre-working-tree; native session route404. Actual old auth/provider/RLS tidak diuji/dipromosikan aman dari public login page. |
| EWS2.0B | Explicit source-quality, freshness, UNKNOWN/STALE, shared context. | Local changes belum masuk published SHA; live weather/private water tidak di-query pada audit ini. |
| Advisory/area2.0C | REVIEW_REQUIRED, no measured-loss assertion, unique registered area/internal AUTP. | Public `/fitur` masih wording lama; protected data/UI tidak diambil. |
| LandD1/originH/P0 baru | Shared geometry validation, loopback-origin fix, verification exception recovery. | Local diff setelah published HEAD; tidak diklaim sudah ada di current Vercel build. |
| GeometryD2 | Local PoC NOT_WIRED. | Bukan prasyarat demo atau schema yang diterapkan. |

`.vercelignore` juga mengecualikan `ai-service/`; deployment web sendiri tidak
memasang weights/routes FastAPI. Render perlu own approved release ketika dibutuhkan.
Tidak dilakukan deploy/push dalam audit ini.

## 8. Rekonsiliasi PRD FR-00–FR-05

**Selesai di bawah berarti scope lokal yang diuji, bukan full deployed/device DoD.**
PRD v1 menyebut YOLOv8n-cls/HF; actual existing adalah EfficientNet/Render + optional
YOLO26 detector. Deviasi historical itu dicatat, tidak disamakan dengan missing FR02.

| FR | Selesai/tersedia dengan evidence | Parsial/gap aktual | Status keseluruhan |
|---|---|---|---|
| **FR-00 Auth/role/onboarding** | Local native OTP/pinned actor/officer checks dan fail-closed contracts; existing deployed login page200. | Local flag native unset; positive SMS/linking/role onboarding dan deployed RLS/Supabase integration belum diuji pada target terisolasi. Source production masih older auth path, bukan native implementation terbaru. | **PARSIAL / integration BLOCKED**. |
| **FR-01 EWS** | Local2.0B quality/freshness/cache/context cases dan missing/invalid HTTP states tested. | Provider/current water evidence/live UI belum dibuktikan; source lokal belum published. Per-field/BMKG bukan completed capability; jangan menyebut prototype thresholds hydrologic validation. | **PARSIAL**. |
| **FR-02 AI scanner** | Existing trained EfficientNet v2 ONNX loaded lokal dan live Render; local advisory/manual/receipt contracts tested. |15s PRD AC berbeda dari85/90s current scan budget; real-device SLA/crop accuracy unverified. YOLO lokal gated; trained bundle belum terlokasi dan deployed routes belum ada. | **PARSIAL**, classifier operasional; bukan “AI belum dilatih”. |
| **FR-03 Offline report** | Account-safe queue/sync, same-key/hash/receipt/ack tests, loss/retry coverage. | Browser IndexedDB restart/account switch/kill flow belum diuji; service-worker cold-start cache belum ada. Full pipeline membutuhkan compatible auth/schema, bukan source saja. | **PARSIAL**. |
| **FR-04 Map/verifikasi** | Local map/detail/guard/RPC/note contracts; farmer/anonymous deny cases tested; P0 exception handling diperbaiki. | Native cross-role/Storage/GPS/verification transaction/audit E2E belum dibuktikan; decisions ada di separate verification view, bukan complete inline map workflow. | **PARSIAL**. |
| **FR-05 AUTP PDF/rekap** | Local print-friendly internal supporting document, date/region filters, IDs/notes/receipt/unique registered area static HTML tested. | Actual print/PDF pages/mobile belum diuji; affected hectares unknown, bukan sum seluruh registered area. Bukan official insurer integration. | **PARSIAL**; print view ada, bukan “belum ada sama sekali”. |

Komponen yang **selesai/tested lokal**: EfficientNet HTTP contract; origin denial;
geometry/area validation; receipt/photo binding/idempotency; advisory/registered-area
presentation; tested verification error result. **Belum ada**: persisted YOLO receipt/
report boxes, deployed detector endpoints, cold-start offline shell, verified legal
ownership/overlap/incident engine lengkap. Trained YOLO artifact di luar scope tetap
**belum terverifikasi**, bukan dinyatakan tidak ada secara global.

## 9. P0 yang dilanjutkan setelah audit

### P0-R01 — Verification transport exception memutus recovery

Before: `setVerification` dapat throw saat createClient/RPC/revalidation gagal;
UI melakukan `setActing(true); await ...; setActing(false)` tanpa catch/finally.
Regression actual server action dengan injected client connectivity failure benar-
benar gagal: **12PASS/1FAIL, raw `Synthetic connection failure`**.

Fix sempit:

- `app/(app)/verifikasi/verification-actions.ts`: catch unexpected exceptions;
  return `data:null` + status-belum-pasti/reload message, tidak mengarang sukses atau
  menganggap lost reply berarti DB rollback. Existing officer guard/schema/notes/
  narrow RPC dan identities tetap.
- `components/features/ReportVerification.tsx`: client catch/finally; busy state
  selalu dilepas, error tidak menutup modal atau menghapus note. Tidak auto-retry
  approve/reject setelah uncertain response.
- `tests/mvp-workflow.test.ts`: regression memeriksa failure saat client creation
  **dan** RPC single response; no retry/revalidation/evidence mutation pada fixture.

After: **13/13 focused PASS**, full246/246PASS. Ini actual action/transport contract
proof dengan fixtures; browser visual recovery dan actual SQL rollback/commit tetap
unverified. Receipt/RLS/schema/database tidak diubah.

### Prioritas P0 demo SEVENT X berikutnya

1. **Reconcile existing trained artifact, bukan retrain default:** bila YOLO run ada
   di Drive/Colab, serahkan lokasi/bundle §3. Cocokkan task/classes/hash/export/parity
   dan satu approved test image sebelum activation. Jika artefak belum tersedia,
   demo classifier existing dengan batas klaim yang jelas; jangan buat fake boxes.
2. **Native auth/schema parity pada isolated target:** existing web tersedia, tetapi
   new local security code tidak boleh dipublish tanpa compatible0A/0A.1 schema/
   permissions, phone identities/provider/flag dan cross-role readback proof. Tidak
   mengaktifkan login bypass untuk mengejar demo.
3. **Approved release reconciliation:** review/commit/release oleh pemilik sesuai
   izin terpisah, untuk web dan AI secara terpisah. Tidak cukup hanya toggle flag
   pada old build yang belum mempunyai route. Audit ini tidak publish apa pun.
4. **Rehearsal3menit pada Android:** farmer photo/parcel → advisory atau manual →
   offline queue → same-key sync → PPL verify/reject → audit/farmer status → AUTP
   supporting print. Simpan evidence actual; synthetic contracts bukan rehearsal.
5. **Transient AI availability:** verifikasi health/model identity sebelum demo;
   tetap tawarkan manual ketika backend tidak merespons.503 awal lalu200 tidak
   membuktikan SLA15s atau mengharuskan model training baru.

Tidak melanjutkan D3, menerapkan D2 SQL, mengubah dataset/weights atau merancang
detector receipt/schema baru sebagai efek samping reconciliation.

## 10. Verification ledger dan changed files

| Check baru | Hasil |
|---|---|
| Read-only artifact audit (ignored folders + known roots) |3 weights,0 actual run/evaluation JSON/CSV files; workbook values parsed; v2 SHA/sidecar match; no YOLO checkpoint within inspected scope. |
| Vercel list/inspect + GitHub branch/deployment metadata | Existing Ready/Production + published SHA/URL verified. |
| Public GET Vercel/Render | Page200, missing detect/session404, transient Render503 → health/model-info/OpenAPI200. Tidak menguji authenticated production data. |
| Focused MVP regression |13/13PASS setelah reproduced failure diperbaiki. |
| `npm run test:security` |**246/246PASS**. |
| Python AI regression |**73/73PASS**; real EfficientNet contract + synthetic detector tests, bukan baru learned detections/accuracy evaluation. |
| `npm run build`, isolated placeholder env |**PASS**, Next15.5.28; cookie-dependent dashboard/lahan dynamic diagnostics expected. |
| TypeScript no-emit setelah build |**PASS**. |
| Local Next+Uvicorn HTTP smoke |**30/30PASS**; credentials/provider flags isolated, no production DB query. |
| Diff/preservation |Historical PRD/README/classifier/base schema/seed unchanged;9 D2 hashes identik dengan baseline. |

Toolchain: Node26.8.1, Python3.12.15, ORT1.31.0. Browser/native-Supabase/RLS/Android/PDF
E2E dan release-runtime parity belum dibuktikan oleh local tests ini.

Changed files khusus reconciliation:

- Baru [`scripts/ai-artifact-audit.py`](../scripts/ai-artifact-audit.py) — read-only audit,
  no download/train/export/unpickle; no input/secret writes.
- Updated server verification action, UI verification component dan existing H test
  seperti §9. Existing many-file working tree tidak di-reset atau diatribusi ulang.
- Dokumen ini. Historical H finding P1 network exception kini mempunyai targeted P0
  fix; catatan lama tetap dipertahankan sebagai history.

Reproduce artifact check dari root:

```sh
PYTHONDONTWRITEBYTECODE=1 ai-service/.venv/bin/python scripts/ai-artifact-audit.py \
  --include-root /Users/macbook/Documents/agriguard-datasets \
  --include-root /opt/homebrew/runs --include-root /opt/homebrew/weights
```

Output membedakan unavailable roots, opaque weight hashes, actual ONNX I/O dan
metadata declarations. Tidak menyimpulkan architecture/training dari nama file.
P0 fix diverifikasi dengan existing regression/build commands di dokumen H;
standalone TypeScript dan smoke dijalankan **setelah** build selesai.

**Kesimpulan demo:** existing live web dan trained classifier terkonfirmasi;
newer local code belum setara deployment, YOLO training artifact masih memerlukan
handoff, dan full cross-role rehearsal tetap gate P0. Tidak ada training ulang,
dataset/weight/database mutation, flag activation, secrets change, commit/push,
atau deployment otomatis pada reconciliation ini.
