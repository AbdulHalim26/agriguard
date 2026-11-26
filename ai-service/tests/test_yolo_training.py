"""Synthetic annotation/ML-plumbing tests. No training or accuracy claims."""
import argparse
import csv
import json
import io
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from training.yolo.data import digest, load_config, load_dataset, normalized_image, parse_annotations, prepare
from training.yolo.parity import compare_predictions
from training.yolo.workflow import head_nms, load_yolo
from training.yolo.train import train, training_config
from training.yolo.export_onnx import publish_artifacts
from training.yolo.readiness import dataset_report, near_duplicate_candidates, readiness


class YoloDataTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.raw = self.root / "raw"
        self.raw.mkdir()
        self.config = {
            "schema_version": 1, "purpose": "synthetic_test",
            "coordinate_space": "exif_oriented_normalized_xywh", "reviewed_by": "synthetic-fixture",
            "review_protocol": "Synthetic boxes for pipeline tests, NOT real disease labels or evaluation",
            "minimum_instances_per_class_per_split": 1, "minimum_groups_per_class_per_split": 1,
            "sources": [{"id": "synthetic", "url": "https://example.invalid/synthetic-unit-test", "license": "unit-fixture", "license_verified": True}],
            "classes": [
                {"class_id": 0, "class_name": "leaf_blast", "annotation_level": "lesion", "enabled": True},
                {"class_id": 5, "class_name": "leaf_folder_damage", "annotation_level": "leaf", "enabled": True},
            ],
        }
        self.config_path = self.root / "config.json"
        self.inventory = self.root / "inventory.csv"
        self.rows = []
        for group in range(9):
            for frame in range(2):
                name = f"g{group}-frame{frame}"
                image = Image.new("RGB", (80, 40), (group * 20, 120, frame * 120))
                ImageDraw.Draw(image).line((0, group + frame, 79, 39 - group), fill="white")
                image.save(self.raw / f"{name}.png")
                (self.raw / f"{name}.txt").write_text("0 0.3 0.3 0.2 0.2\n5 0.7 0.7 0.2 0.2\n")
                self.rows.append({"image": f"{name}.png", "labels": f"{name}.txt", "group_id": f"scene-{group}",
                                  "source_id": "synthetic", "reviewed": "true", "negative_reviewed": "false"})
        self.save_inputs()

    def tearDown(self):
        self.temporary.cleanup()

    def save_inputs(self):
        self.config_path.write_text(json.dumps(self.config))
        with self.inventory.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=["image", "labels", "group_id", "source_id", "reviewed", "negative_reviewed"])
            writer.writeheader()
            writer.writerows(self.rows)

    def prepare(self, name="prepared"):
        return prepare(self.raw, self.inventory, self.config_path, self.root / name)

    def test_reproducible_group_isolation_and_compact_canonical_mapping(self):
        first, second = self.prepare(), self.prepare("prepared-again")
        self.assertEqual(first["manifest_sha256"], second["manifest_sha256"])
        groups = {}
        for row in first["samples"]:
            self.assertEqual(groups.setdefault(row["group_id"], row["split"]), row["split"])
            labels = (self.root / "prepared" / row["labels"]).read_text()
            self.assertIn("1 0.7 0.7", labels)  # compact 1 -> canonical class_id 5
        self.assertEqual({r["split"] for r in first["samples"]}, {"train", "val", "test"})
        self.assertEqual(load_dataset(self.root / "prepared")["purpose"], "synthetic_test")

    def test_disabled_classes_or_absent_review_are_rejected(self):
        self.config["classes"][1]["enabled"] = False
        self.save_inputs()
        with self.assertRaisesRegex(ValueError, "disabled"):
            self.prepare()
        self.config["classes"][1]["enabled"] = True
        self.config["reviewed_by"] = ""
        self.save_inputs()
        with self.assertRaisesRegex(ValueError, "review"):
            self.prepare()

    def test_template_is_inactive_and_requires_reviewed_adequacy_floors(self):
        template = Path(__file__).resolve().parents[1] / "training" / "yolo" / "classes.example.json"
        with self.assertRaises(ValueError):
            load_config(template)
        self.config["minimum_instances_per_class_per_split"] = 999
        self.save_inputs()
        with self.assertRaisesRegex(ValueError, "adequacy"):
            self.prepare()

    def test_labels_reject_classification_invalid_boxes_and_unreviewed_negatives(self):
        classes = load_config(self.config_path)[1]
        file = self.raw / "bad.txt"
        for text in ("leaf_blast", "0", "0 .5 .5 0 .2", "0 .9 .5 .5 .2", "0 nan .5 .2 .2", "0 .5 .5 .2 .2\n0 .5 .5 .2 .2"):
            file.write_text(text)
            with self.assertRaises(ValueError):
                parse_annotations(file, classes)
        file.write_text("")
        with self.assertRaisesRegex(ValueError, "negative_reviewed"):
            parse_annotations(file, classes)
        self.assertEqual(parse_annotations(file, classes, negative_reviewed=True), [])

    def test_identical_pixels_merge_related_groups_without_leaking(self):
        self.rows.append({**self.rows[0], "group_id": "scene-1"})
        self.save_inputs()
        manifest = self.prepare()
        self.assertEqual(len(manifest["samples"]), 18)
        self.assertEqual(len({r["group_id"] for r in manifest["samples"]}), 8)
        load_dataset(self.root / "prepared")

    def test_conflicting_duplicate_annotations_are_not_silently_accepted(self):
        (self.raw / "conflict.txt").write_text("0 .5 .5 .2 .2\n")
        self.rows.append({**self.rows[0], "labels": "conflict.txt"})
        self.save_inputs()
        with self.assertRaisesRegex(ValueError, "conflicting"):
            self.prepare()

    def test_path_escape_and_single_scene_split_are_rejected(self):
        self.rows[0]["image"] = "../outside.png"
        self.save_inputs()
        with self.assertRaisesRegex(ValueError, "outside"):
            self.prepare()
        self.rows[0]["image"] = "g0-frame0.png"
        for row in self.rows:
            row["group_id"] = "one-video"
        self.save_inputs()
        with self.assertRaisesRegex(ValueError, "independent groups"):
            self.prepare()

    def test_prepared_data_cannot_be_overwritten_or_tampered(self):
        manifest = self.prepare()
        with self.assertRaisesRegex(ValueError, "already exists"):
            self.prepare()
        sample = manifest["samples"][0]
        (self.root / "prepared" / sample["labels"]).write_text("0 .5 .5 .2 .2\n")
        with self.assertRaisesRegex(ValueError, "changed"):
            load_dataset(self.root / "prepared")

    def test_no_download_directive_or_unknown_data_yaml_can_reach_training(self):
        self.prepare()
        yaml_path = self.root / "prepared" / "data.yaml"
        yaml_path.write_text(yaml_path.read_text() + "download: https://example.invalid/forbidden.zip\n")
        with self.assertRaisesRegex(ValueError, "YAML mismatch"):
            load_dataset(self.root / "prepared")
        with self.assertRaisesRegex(ValueError, "local .pt"):
            load_yolo(self.root / "missing-yolo26n.pt", "yolo26n")

    def test_training_preflight_with_missing_weights_creates_no_run_or_download(self):
        self.prepare()
        args = argparse.Namespace(dataset=self.root / "prepared", weights=self.root / "missing.pt", family="yolo26n",
                                  output=self.root / "run", epochs=1, batch=1, imgsz=64, seed=42, device="cpu", output_format="end2end_xyxy")
        with self.assertRaisesRegex(ValueError, "local .pt"):
            train(args)
        self.assertFalse(args.output.exists())

    def test_normalized_images_apply_orientation_and_strip_source_metadata(self):
        path = self.raw / "oriented.png"
        source = Image.new("RGB", (80, 40), "green")
        exif = source.getexif()
        exif[274] = 6
        exif[315] = "synthetic-metadata-fixture"
        source.save(path, exif=exif)
        _, data, size = normalized_image(path)
        self.assertEqual(size, (40, 80))
        with Image.open(io.BytesIO(data)) as result:
            self.assertEqual(len(result.getexif()), 0)
            self.assertNotIn("exif", result.info)

    def test_export_publication_never_overwrites_an_existing_artifact(self):
        staging = self.root / "export-staging"
        staging.mkdir()
        artifact = staging / "rice.onnx"
        artifact.write_bytes(b"synthetic-export-plumbing-fixture")
        artifact.with_suffix(".metadata.json").write_text('{"purpose":"synthetic_test"}')
        report = staging / "report.json"
        report.write_text('{"scope":"unit publication test, not training/parity"}')
        output = self.root / "published.onnx"
        publish_artifacts(artifact, report, output)
        previous = output.read_bytes()
        artifact.write_bytes(b"different-fixture")
        with self.assertRaises(FileExistsError):
            publish_artifacts(artifact, report, output)
        self.assertEqual(output.read_bytes(), previous)
        self.assertEqual(output.with_suffix(".metadata.json").read_text(), '{"purpose":"synthetic_test"}')

    def test_tensor_parity_accepts_small_error_and_rejects_shape_nan_or_wrong_predictions(self):
        reference = np.ones((1, 2, 6), dtype=np.float32)
        self.assertLess(compare_predictions(reference, reference + 1e-5), 1e-3)
        for actual in (np.zeros((1, 2, 5)), np.full((1, 2, 6), np.nan), reference + .5):
            with self.assertRaises((ValueError, AssertionError)):
                compare_predictions(reference, actual)
        self.assertIsNone(head_nms("raw_cxcywh_bcn"))
        self.assertFalse(head_nms("end2end_xyxy"))

    def test_unmanifested_images_or_labels_cannot_enter_training(self):
        for branch, extension in (("images", ".png"), ("labels", ".txt")):
            name = f"prepared-{branch}"
            self.prepare(name)
            extra = self.root / name / branch / "train" / f"unreviewed{extension}"
            if extension == ".png":
                Image.new("RGB", (40, 20), "yellow").save(extra)
            else:
                extra.write_text("0 .5 .5 .2 .2\n")
            with self.assertRaisesRegex(ValueError, "Unmanifested"):
                load_dataset(self.root / name)

    def test_prepared_paths_and_class_mapping_must_match_the_reviewed_config(self):
        for mutation in ("path", "class"):
            name = f"prepared-{mutation}"
            manifest = self.prepare(name)
            if mutation == "path":
                manifest["samples"][0]["image"] = manifest["samples"][1]["image"]
            else:
                manifest["classes"][0]["annotation_level"] = "leaf"
            manifest["manifest_sha256"] = digest({k: v for k, v in manifest.items() if k != "manifest_sha256"})
            (self.root / name / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "path|taxonomy"):
                load_dataset(self.root / name)

    def test_negative_review_evidence_and_distribution_are_preserved(self):
        (self.raw / self.rows[0]["labels"]).write_text("")
        self.rows[0]["negative_reviewed"] = "true"
        self.save_inputs()
        manifest = self.prepare()
        report = dataset_report(self.root / "prepared")
        self.assertEqual(sum(s["negative_images"] for s in report["splits"].values()), 1)
        self.assertEqual(report["classes"][0]["canonical_class_id"], 0)
        self.assertEqual(report["classes"][5]["canonical_class_id"], 5)
        self.assertEqual(report["classes"][5]["compact_model_index"], 1)
        self.assertFalse(report["classes"][1]["enabled"])
        negative = next(row for row in manifest["samples"] if not row["boxes"])
        negative["negative_reviewed"] = False
        manifest["manifest_sha256"] = digest({k: v for k, v in manifest.items() if k != "manifest_sha256"})
        (self.root / "prepared" / "manifest.json").write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "negative_reviewed"):
            load_dataset(self.root / "prepared")

    def test_duplicate_removal_counts_and_declared_usage_are_not_misreported(self):
        self.rows.append(self.rows[0].copy())
        self.save_inputs()
        self.prepare()
        report = dataset_report(self.root / "prepared")
        self.assertEqual(report["input_records"], 19)
        self.assertEqual(report["exact_duplicate_records_removed"], 1)
        self.assertEqual(report["unique_images"], 18)
        self.assertEqual(report["source_provenance"][0]["usage_verification"], "DECLARED_REVIEW_NOT_INDEPENDENTLY_VERIFIED")

    def test_near_duplicate_candidates_are_bounded_review_hints_not_automatic_merges(self):
        # Two visually identical fixtures in different groups/splits trigger a
        # review hint; this scanner never edits group assignments or annotations.
        self.prepare()
        rows = [{"id": "sample-a", "group_id": "group-a", "split": "train", "image": self.rows[0]["image"]},
                {"id": "sample-b", "group_id": "group-b", "split": "test", "image": self.rows[0]["image"]},
                {"id": "sample-c", "group_id": "group-c", "split": "val", "image": self.rows[0]["image"]}]
        before = json.dumps(rows)
        result = near_duplicate_candidates(self.raw, rows, max_comparisons=1)
        self.assertEqual(result["pairs"][0]["hamming_distance"], 0)
        self.assertTrue(result["pairs"][0]["cross_split"])
        self.assertTrue(result["truncated"])
        self.assertEqual(json.dumps(rows), before)

    def test_planned_baseline_matches_effective_explicit_training_arguments(self):
        args = argparse.Namespace(family="yolo26n", epochs=50, batch=8, imgsz=640, seed=42, device="cpu", output_format="end2end_xyxy")
        expected = json.loads((Path(__file__).resolve().parents[1] / "training" / "yolo" / "baseline.yolo26n.json").read_text())
        actual = training_config(args)
        self.assertEqual(expected["status"], "PLANNED_NOT_RUN")
        for key, value in actual.items():
            self.assertEqual(value, expected[key])
        args.lr0 = float("nan")
        with self.assertRaisesRegex(ValueError, "optimizer"):
            training_config(args)

    def test_readiness_rejects_synthetic_data_and_missing_checkpoint_without_training(self):
        self.prepare()
        result = readiness(self.root / "prepared")
        self.assertEqual(result["decision"], "NO_GO")
        self.assertTrue(any("Synthetic" in blocker for blocker in result["blockers"]))
        self.assertTrue(any("checkpoint" in blocker for blocker in result["blockers"]))
        self.assertFalse(result["checkpoint"]["architecture_verified"])
        self.assertFalse((self.root / "run").exists())

    def test_symlinked_input_cannot_bypass_prepared_inventory(self):
        manifest = self.prepare()
        directory = self.root / "prepared"
        source = directory / manifest["samples"][0]["image"]
        (directory / "images" / "train" / "undeclared-link.png").symlink_to(source)
        with self.assertRaisesRegex(ValueError, "symlinks"):
            load_dataset(directory)

    def test_source_usage_without_reviewer_declaration_is_blocked(self):
        self.config["sources"][0]["license_verified"] = False
        self.save_inputs()
        with self.assertRaisesRegex(ValueError, "license"):
            self.prepare()
        self.assertFalse((self.root / "prepared").exists())


if __name__ == "__main__":
    unittest.main()
