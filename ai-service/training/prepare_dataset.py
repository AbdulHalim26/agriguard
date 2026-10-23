"""Download/inventory reviewed sources, normalize, deduplicate and group-split."""

import argparse
import base64
import csv
import hashlib
import io
import os
import random
import re
import shutil
import stat
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image, ImageOps

from common import (
    LABELS, LABEL_SCHEMA, LABEL_TO_STATUS, SPLITS, file_sha256, inside,
    json_sha256, manifest_digest, read_json, utc_now, write_json,
)

# Colab-safe defaults; paths passed on the CLI are relative to the current dir.
SEED = 42
SPLIT_RATIOS = {"train": 0.70, "val": 0.15, "test": 0.15}
MAX_IMAGE_SIDE = 1280
JPEG_QUALITY = 95
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
MAX_DOWNLOAD_BYTES = 10 * 1024 ** 3
MAX_EXTRACTED_BYTES = 20 * 1024 ** 3
KINDS = {"flood_paddy", "disease_support", "test_fixture"}


class DownloadRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        target = urllib.parse.urlsplit(new_url)
        if target.scheme != "https":
            raise ValueError("Redirect download harus tetap HTTPS")
        redirected = super().redirect_request(request, fp, code, message, headers, new_url)
        origin = urllib.parse.urlsplit(request.full_url)
        if redirected is not None and (origin.hostname, origin.port) != (target.hostname, target.port):
            redirected.remove_header("Authorization")
        return redirected


def public_url(value):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.username or parsed.password:
        raise ValueError("URL atribusi harus HTTPS publik, tanpa query/token/kredensial")
    return value


def extract_zip(archive, destination):
    """Do not allow archive paths/symlinks to escape the extraction directory."""
    destination = Path(destination)
    with zipfile.ZipFile(archive) as bundle:
        if sum(entry.file_size for entry in bundle.infolist()) > MAX_EXTRACTED_BYTES:
            raise ValueError("Arsip terlalu besar setelah diekstrak")
        for entry in bundle.infolist():
            mode = entry.external_attr >> 16
            if stat.S_ISLNK(mode) or "\\" in entry.filename:
                raise ValueError("Symlink/path arsip tidak didukung")
            inside(destination, entry.filename)
        bundle.extractall(destination)


def source_root(source, config_dir, cache, download):
    if source.get("local_dir"):
        root = (config_dir / source["local_dir"]).resolve()
        if root.is_dir():
            return root
    if not download:
        raise ValueError(f'{source["id"]}: folder lokal tidak ada; gunakan --download atau impor manual')
    headers = {"User-Agent": "AgriGuard-training/1"}
    if source.get("kaggle_dataset"):
        handle = source["kaggle_dataset"]
        if not re.fullmatch(r"[\w-]+/[\w-]+", handle) or not isinstance(source.get("version"), int):
            raise ValueError("Kaggle memerlukan owner/slug dan version integer eksplisit")
        url = f'https://www.kaggle.com/api/v1/datasets/download/{handle}?datasetVersionNumber={source["version"]}'
        user, key = os.environ.get("KAGGLE_USERNAME"), os.environ.get("KAGGLE_KEY")
        if user and key:
            headers["Authorization"] = "Basic " + base64.b64encode(f"{user}:{key}".encode()).decode()
    else:
        variable = source.get("download_url_env", "")
        url = os.environ.get(variable, "")
        if not url:
            raise ValueError(f'{source["id"]}: isi env {variable or "download_url_env"} dengan URL export ZIP')
    if urllib.parse.urlsplit(url).scheme != "https":
        raise ValueError("Download hanya mendukung HTTPS")
    folder = cache / source["id"]
    receipt = {"source_url": source["url"], "version": source.get("version")}
    if (folder / "receipt.json").exists():
        saved = read_json(folder / "receipt.json")
        if any(saved.get(key) != value for key, value in receipt.items()):
            raise ValueError("Versi cache berbeda; pilih folder cache baru")
        if file_sha256(folder / "archive.zip") != saved["archive_sha256"]:
            raise ValueError("Checksum arsip cache berubah")
        # Re-extract the verified archive, not a potentially edited extracted cache.
        extracted = folder / "extracted"
        if extracted.exists():
            shutil.rmtree(extracted)
        extract_zip(folder / "archive.zip", extracted)
        return extracted
    folder.mkdir(parents=True, exist_ok=True)
    archive = folder / "archive.zip"
    try:
        opener = urllib.request.build_opener(DownloadRedirect())
        with opener.open(urllib.request.Request(url, headers=headers), timeout=120) as response:
            with archive.open("wb") as output:
                size = 0
                for chunk in iter(lambda: response.read(1024 * 1024), b""):
                    size += len(chunk)
                    if size > MAX_DOWNLOAD_BYTES:
                        raise ValueError("Download melewati batas ukuran")
                    output.write(chunk)
        extract_zip(archive, folder / "extracted")
    except (urllib.error.URLError, zipfile.BadZipFile) as exc:
        # Signed export URLs / credentials must never appear in logs.
        code = getattr(exc, "code", "network/format")
        raise ValueError(f'{source["id"]}: download gagal ({code}); ekspor ZIP manual lalu isi local_dir') from None
    write_json(folder / "receipt.json", {**receipt, "archive_sha256": file_sha256(archive)})
    return folder / "extracted"


def suggested_group(source_id, path):
    stem = re.sub(r"\.rf\.[0-9a-f]+$", "", path.stem, flags=re.I)
    # Frames of the same exported video must stay together.
    stem = re.split(r"[._-]mp4[._-]", stem, flags=re.I)[0]
    return f"{source_id}:{stem}"


def inventory(source, root, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["path", "original_label", "label", "group_id"])
        writer.writeheader()
        for path in sorted(root.rglob("*")):
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
                writer.writerow({
                    "path": path.relative_to(root).as_posix(), "original_label": path.parent.name,
                    "label": "", "group_id": suggested_group(source["id"], path),
                })


def normalize_image(path):
    with Image.open(path) as opened:
        opened.load()
        image = ImageOps.exif_transpose(opened).convert("RGB")
    image.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.Resampling.BICUBIC)
    pixel_hash = hashlib.sha256(str(image.size).encode() + image.tobytes()).hexdigest()
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=JPEG_QUALITY, optimize=True)
    return buffer.getvalue(), pixel_hash


def assign_splits(samples, seed, ratios):
    """Greedy class-stratified group allocation; never split a scene/video."""
    groups = defaultdict(list)
    for row in samples:
        groups[row["group_id"]].append(row)
    eligible = Counter(row["label"] for row in samples if row["kind"] != "disease_support")
    counts = {split: Counter() for split in SPLITS}
    forced = {group for group, rows in groups.items() if any(row["kind"] == "disease_support" for row in rows)}
    for group in sorted(forced):
        for row in groups[group]:
            row["split"] = "train"
            if row["kind"] != "disease_support":
                counts["train"][row["label"]] += 1
    ordered = sorted(set(groups) - forced)
    random.Random(seed).shuffle(ordered)
    ordered.sort(key=lambda group: -len(groups[group]))
    remaining = Counter(label for group in ordered for label in {row["label"] for row in groups[group]})
    for group in ordered:
        rows = groups[group]
        group_counts = Counter(row["label"] for row in rows)
        options = set(SPLITS)
        # Reserve the last independent groups for missing class/split coverage.
        # A two-frame scene is still one group, not two opportunities to split.
        for label in group_counts:
            empty = {split for split in SPLITS if counts[split][label] == 0}
            if empty and remaining[label] <= len(empty):
                options.intersection_update(empty)
        if not options:
            raise ValueError("Kelompok multi-label tidak bisa mengisi split tanpa bocor; tambah kelompok atau pilih seed lain")

        def cost(split):
            score = 0
            for label in LABELS:
                target = max(eligible[label] * ratios[split], 1)
                score += ((counts[split][label] + group_counts[label] - target) ** 2
                          - (counts[split][label] - target) ** 2) / target
            return score

        selected = min((split for split in SPLITS if split in options), key=cost)
        counts[selected].update(group_counts)
        for label in group_counts:
            remaining[label] -= 1
        for row in rows:
            row["split"] = selected
    for split in SPLITS:
        for label in LABELS:
            if counts[split][label] == 0:
                raise ValueError(
                    f"{split}/{label} kosong pada data utama. Tambah kelompok independen "
                    "per kelas atau pilih seed lain; jangan pecah satu kejadian/video."
                )


def prepare(config_path, output, cache, seed=SEED, download=False, inventory_only=False, smoke_test=False):
    config_path, output, cache = Path(config_path).resolve(), Path(output).resolve(), Path(cache).resolve()
    config = read_json(config_path)
    sources = [source for source in config["sources"] if source.get("enabled", True)]
    if not sources:
        raise ValueError("Tidak ada sumber aktif; siapkan sources.json berdasarkan sources.example.json")
    if output.exists() and any(output.iterdir()):
        raise ValueError("Folder output tidak kosong; pilih folder baru agar split lama tetap utuh")
    ids = [source["id"] for source in sources]
    if len(set(ids)) != len(ids) or any(not re.fullmatch(r"[a-z0-9_-]+", value) for value in ids):
        raise ValueError("ID sumber harus unik: a-z, angka, underscore, atau tanda hubung")
    parent = {}

    def find(group):
        parent.setdefault(group, group)
        if parent[group] != group:
            parent[group] = find(parent[group])
        return parent[group]

    def union(first, second):
        first, second = sorted([find(first), find(second)])
        parent[second] = first

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".prepare-", dir=output.parent) as temporary:
        staging = Path(temporary)
        records, duplicates, rejected, provenance = [], [], [], []
        pixels, encoded = {}, {}
        # Prefer an authentic flood source when an exact image also appears in support data.
        for source in sorted(sources, key=lambda item: (item["kind"] == "disease_support", item["id"])):
            public_url(source["url"])
            if source["kind"] not in KINDS or (source["kind"] == "test_fixture" and not smoke_test):
                raise ValueError("Sumber harus flood_paddy/disease_support; test_fixture hanya untuk --smoke-test")
            if source.get("license", "").lower() in {"", "unknown", "tbd"}:
                raise ValueError(f'{source["id"]}: lisensi harus dicatat dari sumber')
            root = source_root(source, config_path.parent, cache, download)
            if inventory_only:
                inventory(source, root, staging / f'{source["id"]}.csv')
                continue
            if source.get("labels_reviewed") is not True or not source.get("reviewed_by", "").strip():
                raise ValueError(f'{source["id"]}: review label dan reviewed_by wajib diisi')
            annotation_path = config_path.parent / source["annotations"]
            with annotation_path.open(newline="", encoding="utf-8-sig") as handle:
                reader = csv.DictReader(handle)
                if not {"path", "label", "group_id"}.issubset(reader.fieldnames or []):
                    raise ValueError("CSV memerlukan path,label,group_id; label penyakit tidak dipetakan otomatis")
                annotations = sorted(reader, key=lambda row: row["path"])
            if not annotations:
                raise ValueError(f'{source["id"]}: CSV anotasi kosong')
            scanned, seen_paths = 0, set()
            for row in annotations:
                if row["label"] not in LABELS or not row["group_id"].strip():
                    raise ValueError(f'{source["id"]}: label v2 atau group_id belum valid')
                path = inside(root, row["path"])
                if not path.is_file() or path.suffix.lower() not in IMAGE_EXTENSIONS:
                    raise ValueError(f'{source["id"]}: path gambar anotasi tidak ditemukan / format tidak didukung')
                if path in seen_paths:
                    raise ValueError(f'{source["id"]}: satu path memiliki lebih dari satu anotasi')
                seen_paths.add(path)
                try:
                    data, pixel_hash = normalize_image(path)
                except (OSError, ValueError, Image.DecompressionBombError):
                    rejected.append({"source_id": source["id"], "path": row["path"], "reason": "invalid_image"})
                    continue
                scanned += 1
                group = row["group_id"].strip()
                find(group)
                image_hash = hashlib.sha256(data).hexdigest()
                original = pixels.get(pixel_hash) or encoded.get(image_hash)
                if original is not None:
                    if original["label"] != row["label"]:
                        raise ValueError("Gambar duplikat memiliki label berbeda; selesaikan konflik review")
                    union(group, original["group_id"])
                    duplicates.append({"source_id": source["id"], "path": row["path"], "canonical_id": original["id"]})
                    continue
                record = {
                    "id": image_hash, "sha256": image_hash, "source_id": source["id"],
                    "source_path": path.relative_to(root).as_posix(), "kind": source["kind"],
                    "label": row["label"], "original_label": row.get("original_label", ""),
                    "group_id": group,
                }
                (staging / f"{image_hash}.jpg").write_bytes(data)
                pixels[pixel_hash] = record
                encoded[image_hash] = record
                records.append(record)
            provenance.append({
                "id": source["id"], "name": source["name"], "url": source["url"],
                "license": source["license"], "kind": source["kind"], "version": source.get("version"),
                "reviewed_by": source["reviewed_by"], "review_protocol": source.get("review_protocol", ""),
                "annotation_sha256": file_sha256(annotation_path), "valid_input_images": scanned,
                "image_count": sum(row["source_id"] == source["id"] for row in records),
                "excluded_duplicates": sum(row["source_id"] == source["id"] for row in duplicates),
                "excluded_invalid": sum(row["source_id"] == source["id"] for row in rejected),
            })
        if inventory_only:
            output.mkdir(parents=True, exist_ok=True)
            for path in staging.iterdir():
                shutil.move(str(path), output / path.name)
            print(f"Inventory siap di {output}; review CSV sebelum prepare dataset.")
            return None
        for row in records:
            row["group_id"] = find(row["group_id"])
        records.sort(key=lambda row: row["id"])
        assign_splits(records, seed, SPLIT_RATIOS)
        for split in SPLITS:
            for label in LABELS:
                (staging / split / label).mkdir(parents=True, exist_ok=True)
        for row in records:
            row["path"] = f'{row["split"]}/{row["label"]}/{row["id"]}.jpg'
            (staging / f'{row["id"]}.jpg').replace(staging / row["path"])
        composition = {
            source["id"]: {label: sum(row["source_id"] == source["id"] and row["label"] == label for row in records)
                           for label in LABELS}
            for source in provenance
        }
        distribution = {
            split: {label: sum(row["split"] == split and row["label"] == label for row in records) for label in LABELS}
            for split in SPLITS
        }
        identity = [{key: row[key] for key in ("id", "source_id", "group_id", "label", "split")} for row in records]
        manifest = {
            "schema_version": 1, "created_at": utc_now(), "label_schema": LABEL_SCHEMA,
            "labels": LABELS, "label_to_status": LABEL_TO_STATUS,
            "purpose": "pipeline_smoke_test" if smoke_test else "model_training",
            "dataset_sources": provenance, "composition": composition, "dataset_size": len(records),
            "distribution": distribution,
            "normalization": {"max_side": MAX_IMAGE_SIDE, "jpeg_quality": JPEG_QUALITY, "exif_transpose": True},
            "split": {
                "id": json_sha256({"seed": seed, "ratios": SPLIT_RATIOS, "samples": identity}),
                "seed": seed, "ratios": SPLIT_RATIOS, "strategy": "stratified_group_greedy_v1",
                "group_definition": "reviewed event/plot/video id; duplicate-connected groups merged",
                "support_policy": "disease_support is train-only; val/test use primary flood_paddy data",
                "sizes": {split: sum(distribution[split].values()) for split in SPLITS},
                "group_counts": {split: len({row["group_id"] for row in records if row["split"] == split}) for split in SPLITS},
            },
            "samples": records, "excluded_duplicates": duplicates, "excluded_invalid": rejected,
        }
        manifest["manifest_sha256"] = manifest_digest(manifest)
        write_json(staging / "manifest.json", manifest)
        write_json(staging / "distribution.json", {"composition": composition, "distribution": distribution})
        output.mkdir(parents=True, exist_ok=True)
        for path in staging.iterdir():
            shutil.move(str(path), output / path.name)
    write_json(output / "retraining_status.json", {
        "stage": "dataset_prepared", "updated_at": utc_now(), "purpose": manifest["purpose"],
        "image_count": len(records), "source_count": sum(item["image_count"] > 0 for item in provenance),
        "split_id": manifest["split"]["id"], "manifest_sha256": manifest["manifest_sha256"],
    })
    print(f'Dataset: {len(records)} gambar unik; split={manifest["split"]["id"]}')
    for split in SPLITS:
        print(f"  {split}: {distribution[split]}")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--cache", type=Path, default=Path("training-data/raw-cache"))
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--inventory-only", action="store_true")
    parser.add_argument("--smoke-test", action="store_true", help="Mark synthetic/limited verification data; not publishable")
    args = parser.parse_args()
    try:
        prepare(args.sources, args.output, args.cache, args.seed, args.download, args.inventory_only, args.smoke_test)
    except (ValueError, OSError) as exc:
        parser.exit(1, f"prepare_dataset: {exc}\n")


if __name__ == "__main__":
    main()
