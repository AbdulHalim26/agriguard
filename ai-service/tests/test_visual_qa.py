"""Synthetic visual QA/review fixtures; no real reviewer decisions or training."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw
from pydantic import ValidationError
import yaml

from training.yolo.data import digest
from training.yolo.qa_gallery import BLUE, GREEN, ORANGE, build_gallery, svg
from training.yolo.qa_mixed import envelope, leakage_queue, parse_annotation, scan_mixed, select_samples, snapshot
from training.yolo.qa_review import ReviewRecord, pending_records, validate_reviews

NAMES=["Bacterial-Leaf-Blight","Brown-Spot","False-Smut","Healthy","Narrow-Brown-Spot","Rice-Blast","Sheath-Blight","Stem-Rot","Tungro-Virus"]


class VisualQATest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.source=self.root/"source"
        for split in ("train","valid","test"):
            for branch in ("images","labels"): (self.source/split/branch).mkdir(parents=True)
        (self.source/"data.yaml").write_text(yaml.safe_dump({"nc":9,"names":NAMES}))
        for i in range(11):
            split=("train","valid","test")[i%3]
            name=f"aug_fixture_{i}" if i==0 else f"fixture_{i}"
            image=Image.new("RGB",(48,32) if i%2==0 else (32,48),(40+i*12,90,50))
            ImageDraw.Draw(image).line((0,0,image.width-1,image.height-1),fill="white")
            image.save(self.source/split/"images"/f"{name}.png")
            cid=i%9
            bbox=f"{cid} .5 .5 .6 .6\n"
            polygon=f"{cid} .2 .2 .8 .2 .8 .8 .2 .8 .2 .2\n"
            rows=bbox if i%3==0 else polygon if i%3==1 else bbox+polygon
            if i==9: rows=""
            if i==10: rows="1 .1 .1 .9 .9 .89 .9 .1 .1\n"
            (self.source/split/"labels"/f"{name}.txt").write_text(rows)

    def tearDown(self): self.temp.cleanup()

    def package(self,name="qa"):
        output=self.root/name
        summary=build_gallery(self.source,output,limit=12)
        catalog=json.loads((output/"qa_catalog.json").read_text())
        reviews=[json.loads(line) for line in (output/"reviews.pending.jsonl").read_text().splitlines()]
        return output,summary,catalog,reviews

    def test_mixed_parser_preserves_original_coordinates_and_reference_identity(self):
        line="5 .2 .2 .8 .2 .8 .8 .2 .8 .2 .2"
        parsed=parse_annotation(line,NAMES,"a"*64,"b"*24,7)
        before=copy.deepcopy(parsed)
        self.assertEqual(parsed["kind"],"polygon")
        self.assertEqual(parsed["line_number"],7)
        self.assertEqual(parsed["class_name"],"Rice-Blast")
        self.assertEqual(envelope(parsed),(.2,.2,.8,.8))
        self.assertEqual(parsed,before)
        self.assertNotIn("bbox_xyxy",parsed)
        self.assertFalse(parsed["training_approved"])
        self.assertEqual(parse_annotation("0 nan .5 .1 .1",NAMES,"a"*64,"b"*24,1)["coordinates"],[])
        self.assertFalse(parse_annotation("0 .5 .5 -1 .2",NAMES,"a"*64,"b"*24,1)["geometry_valid"])

    def test_cross_split_queue_is_similarity_not_automatic_grouping(self):
        catalog=scan_mixed(self.source)
        original=copy.deepcopy(catalog["samples"])
        pairs,summary=leakage_queue(catalog["samples"])
        self.assertTrue(pairs)
        self.assertFalse(summary["truncated"])
        self.assertEqual(catalog["samples"],original)
        self.assertTrue(all(pair["relationship"]=="unresolved" and pair["proposed_group_id"] is None and not pair["groups_merged"] for pair in pairs))
        self.assertTrue(all("NOT_TRAINING_GROUP" in pair["bucket_semantics"] for pair in pairs))

    def test_selection_covers_actual_classes_splits_resolutions_and_annotation_types(self):
        catalog=scan_mixed(self.source)
        pairs,_=leakage_queue(catalog["samples"])
        chosen,coverage=select_samples(catalog["samples"],pairs,12)
        self.assertEqual(len(chosen),11)
        self.assertEqual(coverage["uncovered_features"],[])
        self.assertTrue(any(row["possible_duplicate_objects"] for row in catalog["samples"]))
        self.assertTrue(any(a.get("envelope_inflation",0)>5 for a in catalog["annotations"]))

    def test_gallery_immutable_sources_contact_images_and_no_converted_label_dataset(self):
        before=snapshot(self.source)
        output,summary,catalog,reviews=self.package()
        self.assertEqual(snapshot(self.source),before)
        self.assertTrue(catalog["source_unchanged_during_generation"])
        self.assertFalse(list(output.rglob("*.txt")))
        self.assertFalse((output/"labels").exists())
        self.assertEqual(len(reviews),len(catalog["samples"])+len(catalog["annotations"])+len(catalog["leakage_pairs"]))
        self.assertTrue(all(r["decision"]=="pending" and r["reviewer_id"] is None and not r["training_approved"] for r in reviews))
        with Image.open(output/catalog["contact_sheets"][0]) as sheet:
            self.assertEqual(sheet.size,(1360,1290)); sheet.verify()
        self.assertEqual(summary["uncovered_features"],[])
        self.assertTrue(any(row["class_name"]=="leaf_folder_damage" for row in catalog["missing_canonical_classes"]))
        with self.assertRaisesRegex(ValueError,"NEW output"):
            build_gallery(self.source,output)
        with self.assertRaisesRegex(ValueError,"outside immutable"):
            build_gallery(self.source,self.source/"review")

    def test_visual_styles_and_escaped_class_names(self):
        catalog=scan_mixed(self.source)
        sample=next(row for row in catalog["samples"] if row["format"]=="mixed")
        annotations=[a for a in catalog["annotations"] if a["image_id"]==sample["image_id"]]
        annotations[0]["class_name"]="<script>alert('untrusted')</script>"
        existing=svg(sample,annotations)
        proposal=svg(sample,annotations,True)
        self.assertIn(BLUE,existing); self.assertIn(GREEN,existing)
        self.assertNotIn("<script>",existing); self.assertIn("&lt;script&gt;",existing)
        self.assertIn(ORANGE,proposal); self.assertIn('stroke-dasharray="5 3"',proposal)

    def test_pending_cannot_become_accept_or_training_approval_without_human_fields(self):
        _,_,catalog,reviews=self.package()
        altered=copy.deepcopy(reviews)
        altered[0]["decision"]="accept"
        with self.assertRaises(ValidationError): validate_reviews(catalog,altered)
        altered=copy.deepcopy(reviews); altered[0]["training_approved"]=True
        with self.assertRaises(ValidationError): validate_reviews(catalog,altered)
        with self.assertRaisesRegex(ValueError,"Every image"):
            validate_reviews(catalog,reviews[:-1])
        with self.assertRaisesRegex(ValueError,"duplicated"):
            validate_reviews(catalog,reviews+[reviews[0]])

    def test_explicit_human_qa_record_still_does_not_authorize_conversion(self):
        output,_,catalog,reviews=self.package()
        annotation=next(row for row in reviews if row["record_type"]=="annotation")
        annotation.update(reviewer_id="SYNTHETIC-UNIT-REVIEW",decision="accept",proposed_action="accept",annotation_scope="leaf",
                          reason="Synthetic schema test only, not an actual human approval",evidence=[f'samples/{annotation["image_ids"][0]}.html'],
                          reviewed_at="2026-11-14T00:00:00Z")
        result=validate_reviews(catalog,reviews,self.source,output)
        self.assertEqual(result["decisions"]["accept"],1)
        self.assertEqual(result["approval_status"],"PENDING")
        self.assertFalse(result["conversion_authorized"])
        self.assertFalse(result["groups_applied"])

    def test_similarity_review_requires_ancestry_decision_and_never_applies_groups(self):
        _,_,catalog,reviews=self.package()
        pair=next(row for row in reviews if row["record_type"]=="leakage_pair")
        pair.update(reviewer_id="SYNTHETIC-UNIT-REVIEW",decision="accept",proposed_action="accept",annotation_scope="not_applicable",
                    reason="Synthetic relationship schema fixture",evidence=["synthetic external review ledger"],reviewed_at="2026-11-14T00:00:00+00:00")
        with self.assertRaisesRegex(ValidationError,"explicit relationship"):
            validate_reviews(catalog,reviews)
        pair["relationship"]="visually_similar_only"
        self.assertFalse(validate_reviews(catalog,reviews)["groups_applied"])
        pair["proposed_group_id"]="not-allowed"
        with self.assertRaisesRegex(ValidationError,"shared-ancestry"):
            validate_reviews(catalog,reviews)

    def test_source_or_visual_tampering_invalidates_old_reviews(self):
        output,_,catalog,reviews=self.package()
        (output/catalog["contact_sheets"][0]).write_bytes(b"tampered unit visual fixture")
        with self.assertRaisesRegex(ValueError,"artifact changed"):
            validate_reviews(catalog,reviews,artifact_root=output)
        (self.source/"data.yaml").write_text("changed unit source")
        with self.assertRaisesRegex(ValueError,"Source changed"):
            validate_reviews(catalog,reviews,source_root=self.source)

    def test_archive_metadata_is_not_license_or_conversion_approval(self):
        count=len(scan_mixed(self.source)["samples"])
        evidence={"zip_sha256":"0"*64,"zip_integrity":"PASS_REPORTED_BY_OWNER","zip_image_count":count,
                  "zip_file_count":len(snapshot(self.source)[0]),"readme_declared_image_count":count+36,
                  "license_approved":True}
        with self.assertRaisesRegex(ValueError,"not annotation/license"):
            build_gallery(self.source,self.root/"bad-archive",archive_evidence=evidence)
        self.assertFalse((self.root/"bad-archive").exists())
        evidence["license_approved"]=False
        evidence["zip_image_count"]+=1
        with self.assertRaisesRegex(ValueError,"disagrees"):
            build_gallery(self.source,self.root/"bad-count",archive_evidence=evidence)


if __name__=="__main__": unittest.main()
