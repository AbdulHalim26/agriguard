# PHASE 2.0A — Roadmap teknis, bukti verifikasi, dan keputusan gates

Tanggal: **16 November 2026**. Status roadmap: **PROPOSED / REQUIRES_APPROVAL**.
Status fase dokumentasi: **selesai**, pemeriksaan consistency/links/whitespace lulus.
Milestone coding di bawah belum dilaksanakan.

## 1. Prioritas menurut nilai produk dan dependency

| Prioritas / milestone proposed | Nilai dan deliverable terkecil | Dependencies / gate |
|---|---|---|
| P0 / S0 — integration security 0A.1 | Bukti effective RLS/ACL, phone OTP/SMS, legacy UUID linking/cutover dan scoped reviewer di DB terisolasi. | **BLOCKED** oleh lingkungan/approval operator. Source+stub tests tidak cukup untuk produksi; bukan menjalankan production migration. |
| P0 / **2.0B — EWS Truthful States** | Missing/mock/invalid/stale tidak pernah memberi operational AMAN; actual source/forecast interval/WIB terlihat. | **CONDITIONAL GO** untuk local coding setelah scope disetujui; existing OWM, frozen-clock fixtures, tanpa dependency provider baru. Detail §3. |
| P0 / 2.0C — advisory AI dan rekap yang jujur | REVIEW_REQUIRED pada hasil uncalibrated, tidak tampilkan heuristic % sebagai loss; label luas terdaftar vs unknown affected area, tidak sum ha berulang sebagai kerugian. | Pertahankan `/predict`/receipt raw data; review wording agronomi. Historical metrics/source-gate drift tercatat, tidak mengganti model. |
| P1 / 2.0D — parcel geometry integrity slice | Server validate shape/range/topology, area geodesic, immutable geometry versions dan dry-run legacy inventory. | Pilih pendekatan geometri; PostGIS POC/staging **REQUIRES_APPROVAL** (v1 melarang PostGIS); RLS/rollback/S0 untuk schema changes. Jangan auto-verify existing owner. |
| P1 / 2.0E — field-aware EWS | Pilihan multi-field, authorized server geometry lookup, admin/station mapping, OWM reuse; hero/notifikasi per parcel. | 2.0B + formal geometry validation dari 2.0D. Tidak memerlukan legal ownership VERIFIED untuk informasi cuaca, tetapi wajib akses sah dan geometry quality. |
| P1 / 2.0E.1 — BMKG adapter trial | Recorded fixtures lalu live isolated forecast adm4/CAP; attribution/limits/freshness/provider fallback. | Verified region mapping, terms applicable dan reliability checks; pilih berdasar hasil, jangan ganti OWM otomatis. |
| P1 / 2.0F — parcel relationship + incident integrity | Effective-dated verified grants/mandates, season/canonical incident case, conflicts/appeals, uniqueness dan transaction+audit/outbox. | 2.0D, S0, approved business authority/schema/RLS dan real isolated concurrent tests. Evidence intake tetap tersedia untuk sengketa. |
| P1 / 2.0G — report lifecycle dan AUTP supporting dossier | Evidence requests, reviewer history, verified snapshots, area methodology, policy checklist/versioned exports. | 2.0F dan policy/otoritas applicable dikonfirmasi; verified report bukan insurer approval. |
| P1 / AI evidence track | Reviewed taxonomy/provenance/group split, retrieve audit artifacts v2, B0–MobileNet benchmark, localization evaluation. | **BLOCKED** oleh real reviews/data/checkpoints/approved ML environment. Bukan critical dependency EWS atau manual report intake. |
| P2 / segmentation dan field severity research | Mask experiment bila scientific need/annotation tersedia; representative multi-photo field assessment protocol. | Reviewed masks/denominator, ahli agronomi, runtime budget dan independent field ground truth; tidak mengubah deteksi sekarang. |

Browser offline restart/account-switch, accessibility/mobile smoke dan release-engine
validation menjadi bagian DoD setiap slice yang menyentuh UI/sync; status terdahulu
tidak dianggap bukti browser saat ini. Retention/export recovery perlu policy
sebelum queued evidence dihapus otomatis.

## 2. Dependency dan trade-off

```text
2.0B truthful data → 2.0E field EWS → BMKG trial
                         ↑
2.0D geometry/versions ───┘
       ↓
S0 + approved relationships/incident schema → 2.0F → 2.0G AUTP preparation

2.0C truthful AI/area presentation → seluruh review/dossier UI
Real data reviews + artifacts + approved ML env → classifier/detector experiments
```

Safety/authorization gates tidak digantikan AI accuracy. Data penyakit yang pending
tidak boleh dipakai untuk mempercepat training flood model. Pekerjaan EWS/geometri
dan manual evidence mempunyai nilai meskipun model baru belum tersedia.

## 3. Exact next coding milestone: PHASE 2.0B — EWS Truthful States

**Proposal scope implementasi berikutnya**, bukan kode yang dibuat di PHASE 2.0A.

### Tujuan

Hilangkan semantik AMAN palsu pada source existing yang missing/mock/invalid/stale,
dan tampilkan apakah data adalah forecast atau observasi. Slice ini memperbaiki
kebenaran informasi sebelum kompleksitas multi-field/provider baru ditambahkan.

### Batas dan file yang dituju

- `lib/thresholds.ts`: typed quality/risk result yang mendukung UNKNOWN/STALE,
  validasi finite/range dan completeness; numeric thresholds existing dipertahankan
  sebagai aturan prototype ber-version/limitation, bukan divalidasi ilmiah otomatis.
- `app/api/weather/route.ts`: normalized genuine source outcome, selected forecast
  valid interval, fetched time dan explicit failure. Mock hanya demo nonproduction
  eksplisit dan tidak menjadi operational risk input. Tidak mengubah API keys/env.
- `app/(app)/dashboard/flood-actions.ts`: propagate provenance/freshness/partial
  reasons. Air legacy `updated_at` dibedakan dari measured `observed_at` yang belum
  diketahui; jangan mengarang waktu pengukuran atau menganggap fetch baru = fresh.
- `DashboardHero.tsx` dan `lib/notifications.ts`: UNKNOWN/STALE netral, copy prakiraan
  +periode+sumber+WIB, retry dan timestamp source; notifikasi tidak menciptakan waktu
  kejadian dari waktu render.
- Semua consumer `FloodStatusData/FloodStatusResult` diperiksa dengan type-check;
  tests baru fokus frozen clock/provider fixtures dan no-false-safe semantics.
  Tidak merombak laporan/offline receipt, database atau model.

### Definition of Done (acceptance yang harus diuji)

1. Semua null, NaN/Infinity/negative precipitation/invalid level, malformed forecast,
   API failure atau mock operational menghasilkan UNKNOWN; tidak green check AMAN.
2. Genuine valid dry slot 0 tetap valid. Empty timeline dan slot di luar validity
   tidak diubah menjadi 0 atau fallback slot pertama arbitrer.
3. Expired source menjadi STALE/UNKNOWN; fresh fetch tidak memperbarui waktu
   observasi lama. Water observed-time yang tidak diketahui ditandai terbatas.
4. Fresh above-threshold signal mempertahankan indikator dengan reason dan partial
   flag ketika input lain hilang; incomplete below-threshold bukan proof AMAN.
   Minimum input set/TTL configuration disepakati dan versioned sebelum code selesai.
5. Forecast interval/source/update time tampil jelas dalam Bahasa Indonesia/WIB;
   unavailable/stale/retry/partial states diuji di hero dan notification consumer.
6. No silent production mock, no provider replacement, existing valid-input threshold
   regression coverage; UI/TypeScript tidak memakai asumsi hanya tiga status.
7. `npm run test:security`, focused EWS tests dan type-check lulus; local mocked
   network/browser smoke dicatat. Build dengan network stubs atau isolated config
   setelah memastikan tidak ada query production build; release Node 24 diverifikasi
   terpisah. Tidak melakukan deploy/activation sebagai efek tes.

### Kriteria berhenti/eskalasi

Jika implementation membutuhkan schema baru, field ownership approval, secret atau
provider replacement, pisahkan dependency ke milestone terkait dan pertahankan
UNKNOWN. Jangan membuat nilai aman palsu demi melengkapi UI. Acceptance minimum
input/TTL membutuhkan keputusan product/operasional; source data yang tidak
memungkinkan freshness jujur tetap unavailable/partial.

## 4. Gates GO / CONDITIONAL GO / NO-GO

| Kegiatan | Keputusan saat audit | Syarat/evidence |
|---|---|---|
| Menyimpan dokumentasi audit/spec lokal | **GO** | Sembilan deliverable, sejarah tidak ditimpa, scope docs-only. |
| Local coding 2.0B | **CONDITIONAL GO** | Scope/AC/TTL/minimum-input agreement dan regresi; bukan izin deploy. |
| Local AI/area advisory UI slice 2.0C | **CONDITIONAL GO** | Wording reviewed, contract/receipt tetap, no fabricated calibration. |
| PostGIS/parcel/claim migrations | **NO-GO sekarang** | Approval locked-PRD deviation, isolated migration/RLS/concurrency/rollback proofs diperlukan. |
| Real dataset conversion/training | **NO-GO** | Reviews, taxonomy/license/lineage/groups, converter approved, checkpoints, ML env dan readiness belum lengkap. |
| Memilih MobileNet sebagai replacement | **NO-GO** | Belum comparable artifacts/benchmarks. EfficientNet existing dipertahankan. |
| Mengaktifkan YOLO produksi / serving trained rice detector | **NO-GO** | Data/checkpoint/field metrics/receipt/security/rollout approval belum ada; flag default OFF. |
| Mengestimasi flood crop loss/ha dari confidence/bbox satu foto | **NO-GO** | Tidak ada validated causal/representative field assessment. |
| Klaim otomatis atau official Jasindo integration assertion | **NO-GO** | Tidak ada otoritas/integrasi/policy evidence; AI advisory saja. |
| Production release/Supabase/Auth cutover | **NO-GO pada fase ini** | Operator approval + S0, release engine, full integration/browser evidence. |

## 5. Handoff bukti/prasyarat yang belum ada

- Arsip asli proposal ICONFEST dan persetujuan proposal PRD v2.
- V2 classifier full training/evaluation bundle: exact manifest/images/label review,
  grouping, metrics/raw predictions, run/checkpoint, source permissions dan parity
  inputs. Hash di metadata bukan pengganti artifacts.
- Genuine rice-v1 reviews, license/mapping/negative/scope/group ledger approvals,
  compatible real YOLO checkpoint, approved ML environment; jangan isi otomatis.
- Isolated Supabase test environment/phone provider/authorized legacy account plan.
- Admin-boundary codes/version, field/station mapping dan freshness/threshold policy.
- Legal/operational parcel authorization procedure serta AUTP policy/version/
  required-documents/decision-authority confirmation. Unknown tidak ditebak.

## 6. Actual verification ledger — PHASE 2.0A

Semua hasil berikut dijalankan lokal pada source existing, **bukan implementasi
fitur v2**. Tidak membuat tes baru yang sekadar mengulang isi dokumentasi.

| Command/operation yang benar-benar dieksekusi | Hasil dan batas |
|---|---|
| `git status --short`, `git log --oneline -5`, `git ls-files '*.md' '*.pdf' '*.docx' '*.pptx' '*.json'` | Branch main/head `d7ffebb` dan banyak modified/untracked dari fase sebelumnya dicatat; PRD/README/docs tersedia, proposal asli tidak ditemukan. Tidak stage/reset/commit. |
| `node --version`, `ai-service/.venv/bin/python --version` | Node **26.8.1**, Python **3.12.15**. Bukan release-engine Node 24/Docker Python 3.11. |
| `TMPDIR="/var/folders/rq/5bcwgxx16_df8lrrvt_vb5hw0000gn/T/opencode" PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python -m unittest discover -s ai-service/tests -p 'test_*.py' -v` | **73/73 PASS**, synthetic detector/QA/temp fixtures serta real existing classifier contract. Tidak training atau accuracy evaluation. |
| `npm run test:security` | **56/56 PASS**; Supabase/network/storage boundaries stubbed. Tidak real SMS/RLS/browser proof. |
| `./node_modules/.bin/tsc --noEmit --incremental false` | **PASS**. Tidak membuat Next build atau deployment. |
| `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python -m training.yolo.readiness --environment-only` | Exit 0 untuk inspection. ORT 1.31.0 tersedia; torch/torchvision/Ultralytics/ONNX authoring absent, CUDA/MPS null. Ini bukan full training readiness GO. |
| `shasum -a 256 ai-service/model/model.onnx ai-service/model/model_v2.onnx` dan `stat -f '%N %z bytes' ...` | SHA/bytes dicatat di ADR; v2 cocok metadata, bukan bukti metrik. |
| Python read-only ORT introspection, command di bawah | CPU model loaded; FP32 `[batch,3,224,224]` → `[batch,3]`; confidence runtime .35 versus metadata .50; calibration false. Tidak inference benchmark. |
| `command -v psql docker` | Tidak ditemukan di PATH saat audit; SQL suite/container tidak dieksekusi. |
| Public `webfetch` docs BMKG forecast/CAP, Torchvision B0/Small/Large, Supabase PostGIS, PostGIS validity/area, OWM forecast | Dokumentasi resmi dibaca; tidak memanggil production app/provider credentials/weather endpoints. Bukan bukti integrations live. |
| `PYTHONDONTWRITEBYTECODE=1 ai-service/.venv/bin/python /var/folders/rq/5bcwgxx16_df8lrrvt_vb5hw0000gn/T/opencode/verify_phase20a_docs.py` | **PASS**: 9 deliverable, 31 relative links valid, 35 unique PRD requirement IDs, 42 unique design AC IDs, code fences seimbang, tanpa trailing whitespace. Helper temporary hanya memeriksa struktur, bukan memenuhi AC fitur proposed. |
| `git diff --check`, non-doc tracked diff SHA comparison, dan `git diff --exit-code -- PRD.md README.md ai-service/predict.py ai-service/model/model.onnx ai-service/model/model_v2.onnx ai-service/model/model_v2.metadata.json` | **PASS**: fingerprint non-doc tracked diff identik dengan baseline; PRD/README/model/runtime tersebut tidak berubah. Existing modified/untracked work tetap ada. |

Command introspection yang dipakai:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=ai-service ai-service/.venv/bin/python -c 'import json, predict; s=predict.load_model(); print(json.dumps({"model_path_name": "model_v2.onnx", "model_loaded": predict.is_model_loaded(), "providers": s.get_providers(), "inputs": [{"name": x.name, "shape": x.shape, "type": x.type} for x in s.get_inputs()], "outputs": [{"name": x.name, "shape": x.shape, "type": x.type} for x in s.get_outputs()], "runtime_confidence_min": predict.CONFIDENCE_MIN, "metadata_confidence_min": predict._METADATA.get("domain_gate", {}).get("confidence_min"), "damage_pct_calibrated": predict._METADATA.get("damage_pct_estimation", {}).get("calibrated_against_measured_damage")}, indent=2))'
```

Pemeriksaan final dokumentasi mencakup relative links/file count/unique requirement
IDs, whitespace dan `git diff --check`. Non-doc tracked diff fingerprint sebelum
penulisan docs: `119ab62c45b192c09817545d10820a9dce3e3a1b7d4f05feb45f335d459cb5af`;
comparison akhir **sama**. Ini fingerprint diff tracked, bukan hash seluruh
working tree/untracked. Sembilan file baru `docs/PHASE-2.0A-*` adalah perubahan fase
ini; source, data dan credentials tidak ditulis oleh fase ini.

Tidak dijalankan: `npm run build`, SQL tests/migrations, browser/device E2E,
real provider/SMS/insurance tests, latency/RSS benchmark, training, model export atau
deployment. Hasil historis tidak dipromosikan menjadi pengujian baru.

## 7. Acceptance handoff

- **ROAD-AC1**: prioritas mempunyai nilai produk, dependency, status dan completion
  evidence; aktivitas BLOCKED tidak dilaporkan selesai.
- **ROAD-AC2**: exact next milestone kecil dapat dikerjakan tanpa model/data baru
  atau production changes; scope/DoD dan escalation jelas.
- **ROAD-AC3**: data/security/ownership/insurance gates independen; approval dokumen
  bukan training, migration atau deployment approval.
- **ROAD-AC4**: command results aktual dan limitations transparan, user work serta
  historical source/PRD/proposal tidak di-reset/ditimpa.
