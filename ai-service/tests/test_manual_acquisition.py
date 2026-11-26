"""Synthetic export/reviewer/checkpoint-record fixtures ONLY, never real approval."""
import csv
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image
import yaml

from detection.adapter import file_sha256
from training.yolo.checkpoint_record import record_checkpoint
from training.yolo.data import prepare, load_dataset
from training.yolo.import_yolo import (REVIEW_FIELDS, combine_imports, import_export, inspect_export,
                                      reviewed_policy, scan_export)


class ManualAcquisitionTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.raw = self.root / "immutable-export"
        for branch in ("images", "labels"):
            (self.raw / "train" / branch).mkdir(parents=True)
        self.names = ["Rice-Blast", "Healthy", "Narrow-Brown-Spot"]
        (self.raw / "data.yaml").write_text(yaml.safe_dump({"nc": 3, "names": self.names,
                                                           "train": "../train/images", "val": "../valid/images"}))
        for index in range(5):
            Image.new("RGB", (48, 32), (30 + index * 35, 100, 80)).save(self.raw / "train" / "images" / f"sample{index}.png")
            label = "0 .5 .5 .2 .2\n" if index < 3 else "1 .5 .5 .8 .8\n" if index == 3 else "0 .3 .3 .2 .2\n2 .7 .7 .2 .2\n"
            (self.raw / "train" / "labels" / f"sample{index}.txt").write_text(label)
        evidence = self.root / "evidence.txt"
        evidence.write_text("SYNTHETIC UNIT EVIDENCE. This is not an external dataset license approval.")
        self.evidence = {"path": "evidence.txt", "sha256": file_sha256(evidence)}
        self.inspection = self.root / "inspection"
        self.report = inspect_export(self.raw, self.inspection)
        self.review = self.inspection / "review.csv"
        self.config_path = self.root / "reviewed-policy.json"
        self.policy = {
            "status": "APPROVED", "coordinate_space": "exif_oriented_normalized_xywh",
            "export_fingerprint": self.report["export_fingerprint"], "reviewed_by": "SYNTHETIC-UNIT-REVIEW",
            "review_protocol": "Synthetic test decisions only; no real diagnosis or training", "grouping_reviewed": True,
            "source": {"id": "synthetic_source_a", "url": "https://example.invalid/synthetic-unit-export", "version": "unit-fixture",
                       "license": "unit-fixture", "license_url": "https://example.invalid/unit-license", "license_verified": True,
                       "attribution": "synthetic fixture", "permitted_uses_reviewed": ["training", "evaluation"], "evidence": [self.evidence]},
            "mappings": {
                "Rice-Blast": {"action": "map", "canonical_class_id": 0, "canonical_class_name": "leaf_blast", "annotation_level": "lesion", "approved": True, "reason": "synthetic fixture mapping"},
                "Healthy": {"action": "healthy_background", "approved": True, "reason": "synthetic negative fixture"},
                "Narrow-Brown-Spot": {"action": "exclude_image", "approved": True, "reason": "Distinct unsupported diagnosis, synthetic fixture"},
            },
        }
        self.save_policy()

    def tearDown(self):
        self.temporary.cleanup()

    def save_policy(self):
        self.config_path.write_text(json.dumps(self.policy))

    def approve_fixture_rows(self):
        with self.review.open(newline="") as handle:
            rows = list(csv.DictReader(handle))
        for index, row in enumerate(rows):
            row.update({"decision": "exclude" if index == 4 else "include", "group_id": f"global-fixture-session-{index}",
                        "reviewer_id": "SYNTHETIC-UNIT-REVIEW", "negative_reviewed": "true" if index == 3 else "false",
                        "review_note": "synthetic unit review, not real dataset approval"})
        self.write_review(rows)
        return rows

    def write_review(self, rows):
        with self.review.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=REVIEW_FIELDS)
            writer.writeheader()
            writer.writerows(rows)

    def bundle(self, name="a"):
        return self.root / "reviewed" / name

    def test_inspection_generates_only_pending_decisions_and_validates_real_source_labels(self):
        self.assertEqual(self.report["images"], 5)
        self.assertEqual(self.report["review_status"], "NOT_REVIEWED")
        with self.review.open() as handle:
            rows = list(csv.DictReader(handle))
        self.assertTrue(all(row["decision"] == "pending" and row["group_id"] == "" and row["reviewer_id"] == "" for row in rows))
        self.assertEqual(self.report["source_class_distribution"][2]["instances"], 1)
        with self.assertRaisesRegex(ValueError, "NEW output"):
            inspect_export(self.raw, self.raw / "inspection")

    def test_proposals_and_pending_image_reviews_cannot_create_approved_data(self):
        with self.assertRaisesRegex(ValueError, "pending image approvals"):
            import_export(self.raw, self.review, self.config_path, self.bundle())
        self.approve_fixture_rows()
        self.policy["status"] = "PROPOSAL_NOT_APPROVED"
        self.save_policy()
        with self.assertRaisesRegex(ValueError, "reviewer approval"):
            import_export(self.raw, self.review, self.config_path, self.bundle())
        self.assertFalse(self.bundle().exists())

    def test_import_keeps_source_immutable_and_never_turns_healthy_into_disease_box(self):
        before = {p.relative_to(self.raw).as_posix(): file_sha256(p) for p in self.raw.rglob("*") if p.is_file()}
        self.approve_fixture_rows()
        result = import_export(self.raw, self.review, self.config_path, self.bundle())
        self.assertEqual(result["accepted_images"], 4)
        self.assertEqual(result["excluded_images"], 1)
        self.assertEqual(before, {p.relative_to(self.raw).as_posix(): file_sha256(p) for p in self.raw.rglob("*") if p.is_file()})
        manifest = json.loads((self.bundle() / "import.manifest.json").read_text())
        negative = next(row for row in manifest["samples"] if row["negative_reviewed"])
        self.assertEqual((self.bundle() / negative["labels"]).read_text(), "")
        self.assertEqual(negative["healthy_boxes_removed"], 1)
        self.assertEqual(manifest["class_distribution"][0]["instances"], 3)
        self.assertTrue(all(not c["training_enabled"] for c in manifest["class_distribution"]))

    def test_unsupported_diagnosis_requires_whole_image_exclusion(self):
        rows = self.approve_fixture_rows()
        rows[4]["decision"] = "include"
        self.write_review(rows)
        with self.assertRaisesRegex(ValueError, "WHOLE image"):
            import_export(self.raw, self.review, self.config_path, self.bundle())
        self.assertFalse(self.bundle().exists())

    def test_healthy_is_not_automatically_a_reviewed_negative(self):
        rows = self.approve_fixture_rows()
        rows[3]["negative_reviewed"] = "false"
        self.write_review(rows)
        with self.assertRaisesRegex(ValueError, "negative review"):
            import_export(self.raw, self.review, self.config_path, self.bundle())

    def test_even_a_claimed_approved_mapping_cannot_turn_healthy_into_disease(self):
        self.approve_fixture_rows()
        self.policy["mappings"]["Healthy"] = {**self.policy["mappings"]["Rice-Blast"], "reason": "invalid synthetic mapping"}
        self.save_policy()
        with self.assertRaisesRegex(ValueError, "Healthy source labels cannot"):
            import_export(self.raw, self.review, self.config_path, self.bundle())

    def test_export_changes_unknown_labels_and_license_tamper_are_rejected(self):
        self.approve_fixture_rows()
        (self.raw / "train" / "labels" / "sample0.txt").write_text("0 .4 .4 .2 .2\n")
        with self.assertRaisesRegex(ValueError, "fingerprint"):
            import_export(self.raw, self.review, self.config_path, self.bundle())
        scanned = scan_export(self.raw)
        self.policy["export_fingerprint"] = scanned["export_fingerprint"]
        self.save_policy()
        scanned["source_names"].append("Ambiguous-New-Class")
        with self.assertRaisesRegex(ValueError, "actual source labels"):
            reviewed_policy(self.config_path, scanned)
        (self.root / "evidence.txt").write_text("changed evidence")
        self.save_policy()
        with self.assertRaisesRegex(ValueError, "evidence hash"):
            import_export(self.raw, self.review, self.config_path, self.bundle())

    def test_classification_or_missing_annotation_files_are_not_invented_as_boxes(self):
        label = self.raw / "train" / "labels" / "sample0.txt"
        label.write_text("Rice-Blast\n")
        with self.assertRaisesRegex(ValueError, "expected class_id"):
            scan_export(self.raw)
        # Missing labels can arise in exports; never silently infer a negative.
        label.unlink()
        with self.assertRaisesRegex(ValueError, "missing"):
            scan_export(self.raw)

    def test_combined_inventory_resplits_by_global_group_and_keeps_attribution(self):
        self.approve_fixture_rows()
        import_export(self.raw, self.review, self.config_path, self.bundle())
        joined = self.root / "combined"
        report = combine_imports(self.root / "reviewed", [self.bundle()], joined)
        self.assertFalse(report["source_splits_inherited"])
        config = {"schema_version": 1, "purpose": "synthetic_test", "coordinate_space": "exif_oriented_normalized_xywh",
                  "reviewed_by": "SYNTHETIC-UNIT-REVIEW", "review_protocol": "Synthetic test only", "minimum_instances_per_class_per_split": 1,
                  "minimum_groups_per_class_per_split": 1, "sources": [self.policy["source"]],
                  "classes": [{"class_id": 0, "class_name": "leaf_blast", "annotation_level": "lesion", "enabled": True}]}
        classes = self.root / "classes.json"
        classes.write_text(json.dumps(config))
        manifest = prepare(self.root / "reviewed", joined / "inventory.csv", classes, self.root / "prepared")
        self.assertEqual({row["split"] for row in manifest["samples"]}, {"train", "val", "test"})
        self.assertEqual(load_dataset(self.root / "prepared")["config"]["sources"][0]["attribution"], "synthetic fixture")

    def test_combine_rejects_changed_data_duplicate_sources_and_mixed_annotation_scope(self):
        self.approve_fixture_rows()
        import_export(self.raw, self.review, self.config_path, self.bundle())
        with self.assertRaisesRegex(ValueError, "Duplicate source IDs"):
            combine_imports(self.root / "reviewed", [self.bundle(), self.bundle()], self.root / "bad-combination")
        self.policy["source"]["id"] = "synthetic_source_b"
        self.policy["mappings"]["Rice-Blast"]["annotation_level"] = "leaf"
        self.save_policy()
        import_export(self.raw, self.review, self.config_path, self.bundle("b"))
        with self.assertRaisesRegex(ValueError, "annotation level"):
            combine_imports(self.root / "reviewed", [self.bundle(), self.bundle("b")], self.root / "bad-scope")
        (self.bundle() / "inventory.csv").write_text("changed")
        with self.assertRaisesRegex(ValueError, "inventory changed"):
            combine_imports(self.root / "reviewed", [self.bundle()], self.root / "bad-hash")

    def test_checkpoint_record_is_not_a_disease_model_or_authenticity_claim(self):
        weights = self.root / "synthetic-file.pt"
        weights.write_bytes(b"unit plumbing bytes only, NOT a model")
        config = {"approved": True, "reviewed_by": "SYNTHETIC-UNIT-REVIEW", "license_verified": True,
                  "license": "unit fixture", "license_url": "https://www.ultralytics.com/license", "evidence": [self.evidence],
                  "model_family": "yolo26n", "release_tag": "v8.4.0", "upstream_sha256": None,
                  "source_url": "https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26n.pt"}
        path = self.root / "checkpoint-config.json"
        path.write_text(json.dumps(config))
        output = self.root / "record.json"
        result = record_checkpoint(weights, path, output)
        self.assertEqual(result["checkpoint_sha256"], file_sha256(weights))
        self.assertEqual(result["checksum_verification"], "LOCAL_DIGEST_ONLY")
        self.assertFalse(result["architecture_verified"])
        self.assertEqual(json.loads(output.read_text())["purpose"], "general_pretrained_detection")
        with self.assertRaisesRegex(ValueError, "already exists"):
            record_checkpoint(weights, path, output)
        config["upstream_sha256"] = "f" * 64
        path.write_text(json.dumps(config))
        with self.assertRaisesRegex(ValueError, "publisher checksum"):
            record_checkpoint(weights, path, self.root / "mismatch.json")

    def test_import_is_reproducible_into_new_slots_without_overwriting(self):
        self.approve_fixture_rows()
        a = import_export(self.raw, self.review, self.config_path, self.bundle())
        b = import_export(self.raw, self.review, self.config_path, self.bundle("repeat"))
        self.assertEqual(a["manifest_sha256"], b["manifest_sha256"])
        with self.assertRaisesRegex(ValueError, "NEW output"):
            import_export(self.raw, self.review, self.config_path, self.bundle())

    def test_actual_source_indices_are_not_assumed_to_be_canonical_ids(self):
        # A Healthy-first YAML is common. Source index 2 must map to canonical
        # blast ID 0, while source Healthy index 0 must NEVER become blast ID 0.
        (self.raw / "data.yaml").write_text(yaml.safe_dump({"nc": 3, "names": ["Healthy", "Narrow-Brown-Spot", "Rice-Blast"]}))
        translated = {0: 2, 1: 0, 2: 1}
        for path in (self.raw / "train" / "labels").glob("*.txt"):
            rows = [line.split() for line in path.read_text().splitlines()]
            path.write_text("".join(f'{translated[int(row[0])]} ' + " ".join(row[1:]) + "\n" for row in rows))
        self.inspection = self.root / "second-inspection"
        self.report = inspect_export(self.raw, self.inspection)
        self.review = self.inspection / "review.csv"
        self.policy["export_fingerprint"] = self.report["export_fingerprint"]
        self.save_policy()
        self.approve_fixture_rows()
        import_export(self.raw, self.review, self.config_path, self.bundle())
        manifest = json.loads((self.bundle() / "import.manifest.json").read_text())
        self.assertEqual({box[0] for row in manifest["samples"] for box in row["canonical_boxes"]}, {0})
        self.assertEqual(sum(not row["canonical_boxes"] for row in manifest["samples"]), 1)
        self.assertEqual(manifest["class_distribution"][5]["coverage"], "MISSING")

    def test_no_import_without_explicit_permitted_use_and_evidence_review(self):
        self.approve_fixture_rows()
        self.policy["source"]["permitted_uses_reviewed"] = []
        self.save_policy()
        with self.assertRaisesRegex(ValueError, "Permitted usage"):
            import_export(self.raw, self.review, self.config_path, self.bundle())
        self.assertFalse(self.bundle().exists())


if __name__ == "__main__":
    unittest.main()
