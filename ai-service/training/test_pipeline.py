"""Contract/leakage regression tests; generated images are never training evidence."""

import argparse
import contextlib
import csv
import io
import os
import shutil
import tempfile
import unittest
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw

from common import (
    LABELS, LABEL_TO_STATUS, classification_metrics, estimate_damage_pct,
    load_manifest, model_metadata, read_json, runtime_constants, write_json,
)
from prepare_dataset import DownloadRedirect, extract_zip, prepare, suggested_group

# Real EfficientNet-B0 execution is opt-in; no fake inference server/library.
RUN_ML_SMOKE = os.environ.get("AGRIGUARD_TRAINING_SMOKE") == "1"


class PipelineTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.raw = self.root / "raw"
        self.raw.mkdir()
        self.rows = []
        # Nine independent scenes per label, two related frames per scene.
        for index, label in enumerate(LABELS):
            for group in range(9):
                for frame in range(2):
                    name = f"class{index}-scene{group}-frame{frame}.png"
                    image = Image.new("RGB", (72, 60), (30 + index * 70, 80 + group * 12, 40 + frame * 50))
                    ImageDraw.Draw(image).line((0, group * 5, 71, 59 - frame * 20), fill="white", width=3)
                    image.save(self.raw / name)
                    self.rows.append({"path": name, "label": label, "group_id": f"scene-{index}-{group}"})
        self.source = {
            "id": "fixture", "name": "Generated test fixture, not field evidence",
            "url": "https://example.org/agriguard-test-fixture", "license": "test-only",
            "kind": "test_fixture", "local_dir": "raw", "annotations": "labels.csv",
            "labels_reviewed": True, "reviewed_by": "automated pipeline test",
        }
        self.save_config()

    def save_config(self, extra_sources=None):
        with (self.root / "labels.csv").open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=["path", "label", "group_id"])
            writer.writeheader()
            writer.writerows(self.rows)
        write_json(self.root / "sources.json", {"sources": [self.source] + (extra_sources or [])})

    def prepare(self, folder="dataset", **kwargs):
        with contextlib.redirect_stdout(io.StringIO()):
            return prepare(self.root / "sources.json", self.root / folder, self.root / "cache",
                           smoke_test=True, **kwargs)

    def test_reproducible_split_and_group_isolation(self):
        first, second = self.prepare(), self.prepare("second")
        self.assertEqual(first["manifest_sha256"], second["manifest_sha256"])
        self.assertEqual(first["split"]["id"], second["split"]["id"])
        groups = {}
        for row in first["samples"]:
            self.assertEqual(groups.setdefault(row["group_id"], row["split"]), row["split"])
        self.assertEqual(load_manifest(self.root / "dataset")["dataset_size"], 54)
        self.assertEqual(sum(first["composition"]["fixture"].values()), 54)

    def test_duplicate_connects_groups_and_is_counted_once(self):
        alias = self.raw / "duplicate.png"
        shutil.copy2(self.raw / self.rows[0]["path"], alias)
        self.rows.append({"path": alias.name, "label": LABELS[0], "group_id": "scene-0-1"})
        self.save_config()
        manifest = self.prepare()
        self.assertEqual(manifest["dataset_size"], 54)
        self.assertEqual(manifest["dataset_sources"][0]["excluded_duplicates"], 1)
        scenes = [row for row in manifest["samples"] if row["source_path"] in {
            self.rows[0]["path"], self.rows[1]["path"], self.rows[2]["path"], self.rows[3]["path"],
        }]
        self.assertEqual(len({row["split"] for row in scenes}), 1)

    def test_conflicting_duplicate_label_is_rejected(self):
        shutil.copy2(self.raw / self.rows[0]["path"], self.raw / "conflict.png")
        self.rows.append({"path": "conflict.png", "label": LABELS[1], "group_id": "different"})
        self.save_config()
        with self.assertRaisesRegex(ValueError, "label berbeda"):
            self.prepare()
        self.assertFalse((self.root / "dataset" / "manifest.json").exists())

    def test_support_data_is_train_only_with_per_source_composition(self):
        support = self.root / "support"
        support.mkdir()
        Image.new("RGB", (72, 60), "purple").save(support / "leaf.png")
        (self.root / "support.csv").write_text(
            f"path,label,group_id\nleaf.png,{LABELS[1]},support-leaf\n", encoding="utf-8",
        )
        other = {**self.source, "id": "support", "kind": "disease_support",
                 "local_dir": "support", "annotations": "support.csv"}
        self.save_config([other])
        manifest = self.prepare()
        rows = [row for row in manifest["samples"] if row["source_id"] == "support"]
        self.assertEqual([row["split"] for row in rows], ["train"])
        self.assertEqual(manifest["composition"]["support"][LABELS[1]], 1)

    def test_modified_image_fails_manifest_check(self):
        manifest = self.prepare()
        (self.root / "dataset" / manifest["samples"][0]["path"]).write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "Gambar berubah"):
            load_manifest(self.root / "dataset")

    def test_invalid_image_is_excluded_and_reported(self):
        (self.raw / "broken.jpg").write_bytes(b"not an image")
        self.rows.append({"path": "broken.jpg", "label": LABELS[0], "group_id": "broken"})
        self.save_config()
        manifest = self.prepare()
        self.assertEqual(manifest["dataset_size"], 54)
        self.assertEqual(manifest["dataset_sources"][0]["excluded_invalid"], 1)

    def test_missing_review_and_path_escape_fail(self):
        self.source["labels_reviewed"] = False
        self.save_config()
        with self.assertRaisesRegex(ValueError, "review"):
            self.prepare()
        self.source["labels_reviewed"] = True
        self.rows[0]["path"] = "../outside.png"
        self.save_config()
        with self.assertRaisesRegex(ValueError, "Path gambar"):
            self.prepare()

    def test_zip_cannot_escape_extraction_directory(self):
        archive = self.root / "invalid.zip"
        with zipfile.ZipFile(archive, "w") as bundle:
            bundle.writestr("../outside.txt", "outside")
        with self.assertRaises(ValueError):
            extract_zip(archive, self.root / "extracted")
        self.assertFalse((self.root / "outside.txt").exists())

    def test_video_and_roboflow_derivatives_share_suggested_group(self):
        first = Path("video_20251115_093907_mp4-0022_jpg.rf.abcdef.jpg")
        second = Path("video_20251115_093907_mp4-0032_jpg.rf.123456.jpg")
        self.assertEqual(suggested_group("wet", first), suggested_group("wet", second))

    def test_download_redirect_does_not_forward_credentials_to_another_host(self):
        handler = DownloadRedirect()
        request = urllib.request.Request("https://www.kaggle.com/download", headers={"Authorization": "Basic test-only"})
        redirected = handler.redirect_request(request, None, 302, "Found", {}, "https://storage.googleapis.com/archive.zip")
        self.assertIsNone(redirected.get_header("Authorization"))
        same_host = handler.redirect_request(request, None, 302, "Found", {}, "https://www.kaggle.com/new")
        self.assertEqual(same_host.get_header("Authorization"), "Basic test-only")
        with self.assertRaises(ValueError):
            handler.redirect_request(request, None, 302, "Found", {}, "http://www.kaggle.com/archive.zip")

    def test_three_independent_groups_per_label_can_cover_all_splits(self):
        self.rows = [row for row in self.rows if int(row["group_id"].rsplit("-", 1)[1]) < 3]
        self.save_config()
        manifest = self.prepare()
        self.assertTrue(all(count > 0 for split in manifest["distribution"].values() for count in split.values()))

    def test_single_scene_per_label_cannot_leak_to_fill_splits(self):
        self.rows = [row for row in self.rows if row["group_id"].endswith("-0")]
        self.save_config()
        with self.assertRaisesRegex(ValueError, "kosong pada data utama"):
            self.prepare()

    def test_metrics_have_correct_counts_and_status_mapping(self):
        metrics = classification_metrics(LABELS, [LABELS[0], LABELS[2], LABELS[2]], LABELS, LABEL_TO_STATUS)
        self.assertAlmostEqual(metrics["class_accuracy"], 2 / 3)
        self.assertEqual(metrics["status_accuracy"], metrics["class_accuracy"])
        self.assertEqual(metrics["confusion_matrix"]["values"], [[1, 0, 0], [0, 0, 1], [0, 0, 1]])
        # Preserve the v1 many-label -> status distinction, rather than equating all accuracies.
        legacy = runtime_constants()
        labels = list(legacy["ID2LABEL"].values())
        result = classification_metrics(["Brown Spot"], ["Leaf scald"], labels, legacy["LABEL_TO_STATUS"])
        self.assertEqual(result["class_accuracy"], 0)
        self.assertEqual(result["status_accuracy"], 1)

    def test_damage_estimate_contract_and_gate_metadata(self):
        self.assertEqual(estimate_damage_pct("aman", 1), 0)
        self.assertEqual(estimate_damage_pct("rusak_ringan", 0.5), 45)
        self.assertEqual(estimate_damage_pct("rusak_berat", 1), 95)
        for status in LABEL_TO_STATUS.values():
            for confidence in (0, 0.5, 1):
                self.assertTrue(0 <= estimate_damage_pct(status, confidence) <= 95)
        self.assertEqual(model_metadata()["domain_gate"], {"vegetation_min_ratio": 0.15, "confidence_min": 0.5})

    @unittest.skipUnless(RUN_ML_SMOKE, "Set AGRIGUARD_TRAINING_SMOKE=1 for actual training/export smoke")
    def test_actual_efficientnet_checkpoint_resume_evaluate_export(self):
        from evaluate import evaluate
        from export_onnx import export
        from train import train

        self.prepare()
        args = argparse.Namespace(
            dataset=self.root / "dataset", output=self.root / "artifacts", epochs=3,
            batch_size=3, workers=0, seed=42, device="cpu",
            pretrained="imagenet" if os.environ.get("AGRIGUARD_SMOKE_PRETRAINED") == "1" else "none",
            resume=None, max_batches=1, smoke_test=True,
        )
        train(args)
        with self.assertRaisesRegex(ValueError, "Output tidak kosong"):
            train(args)
        stale_output = argparse.Namespace(**{**vars(args), "resume": args.output / "epoch_002.pt"})
        with self.assertRaisesRegex(ValueError, "epoch lebih baru"):
            train(stale_output)
        args.output = self.root / "resumed"
        args.resume = self.root / "artifacts" / "epoch_002.pt"
        train(args)
        import torch
        first = torch.load(self.root / "artifacts" / "epoch_003.pt", weights_only=True)
        resumed = torch.load(self.root / "resumed" / "epoch_003.pt", weights_only=True)
        for key, value in first["model_state"].items():
            torch.testing.assert_close(value, resumed["model_state"][key], rtol=0, atol=0)
        bad_resume = argparse.Namespace(**{**vars(args), "resume": args.output / "best.pt"})
        with self.assertRaisesRegex(ValueError, "epoch_NNN.pt"):
            train(bad_resume)
        metrics_path = args.output / "metrics.json"
        metrics = evaluate(argparse.Namespace(
            dataset=args.dataset, checkpoint=args.output / "best.pt", output=metrics_path,
            device="cpu", batch_size=3,
        ))
        self.assertEqual(metrics["purpose"], "pipeline_smoke_test")
        self.assertEqual(metrics["label_schema"], "v2_3label")
        self.assertEqual(metrics["composition"], first["dataset"]["composition"])
        self.assertEqual(metrics["evaluation"]["sample_count"], first["dataset"]["split"]["sizes"]["test"])
        export_args = argparse.Namespace(
            dataset=args.dataset, checkpoint=args.output / "best.pt", metrics=metrics_path,
            output=args.output / "model_v2.onnx", atol=1e-5, rtol=1e-4,
        )
        tampered = {**metrics, "composition": {}}
        write_json(metrics_path, tampered)
        with self.assertRaisesRegex(ValueError, "identitas split tidak cocok"):
            export(export_args)
        self.assertFalse(export_args.output.exists())
        write_json(metrics_path, metrics)
        metadata = export(export_args)
        self.assertTrue(metadata["export_verification"]["verified"])
        self.assertFalse(metadata["ready_for_integration"])
        self.assertEqual(read_json(args.dataset / "retraining_status.json")["stage"], "export_verified")


if __name__ == "__main__":
    unittest.main()
