"""Synthetic dashboard/export fixtures only. Never reviews the real dataset."""
import copy
import json
import shutil
import subprocess
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image, ImageDraw
from pydantic import ValidationError
import yaml

from training.yolo.qa_gallery import build_gallery
from training.yolo.qa_mixed import snapshot
from training.yolo.qa_review import pending_records
from training.yolo.review_dashboard import build_dashboard, pilot_queue, refine_dashboard
from training.yolo.review_export import apply_export, conversion_assessment, initial_state, load_dashboard, progress

NAMES=["Bacterial-Leaf-Blight","Brown-Spot","False-Smut","Healthy","Narrow-Brown-Spot","Rice-Blast","Sheath-Blight","Stem-Rot","Tungro-Virus"]
U1="10000000-0000-4000-8000-000000000001"
U2="10000000-0000-4000-8000-000000000002"
T0="2026-11-14T10:00:00Z"
T1="2026-11-14T10:01:00Z"
T2="2026-11-14T10:02:00Z"


class ReviewDashboardTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.root=Path(self.temp.name)
        self.source=self.root/"source"
        for split in ("train","valid","test"):
            for branch in ("images","labels"): (self.source/split/branch).mkdir(parents=True)
        (self.source/"data.yaml").write_text(yaml.safe_dump({"nc":9,"names":NAMES}))
        for i,rows in enumerate(("0 .5 .5 .6 .6\n0 .2 .2 .8 .2 .8 .8 .2 .8 .2 .2\n",
                                 "1 .2 .2 .8 .2 .8 .8 .2 .8 .2 .2\n","3 .5 .5 .8 .8\n","")):
            split=("train","valid","test")[i%3]
            name=f"aug_fixture_{i}" if i==0 else f"fixture_{i}"
            image=Image.new("RGB",(40,30) if i%2==0 else (30,40),(50+i*30,90,60))
            ImageDraw.Draw(image).line((0,0,image.width-1,image.height-1),fill="white")
            image.save(self.source/split/"images"/f"{name}.png")
            (self.source/split/"labels"/f"{name}.txt").write_text(rows)
        self.qa=self.root/"qa"
        build_gallery(self.source,self.qa,limit=8)
        self.catalog=json.loads((self.qa/"qa_catalog.json").read_text())
        self.dashboard=self.root/"dashboard"
        self.built=build_dashboard(self.qa,self.source,self.dashboard,pair_limit=2)
        self.manifest=json.loads((self.dashboard/"dashboard_manifest.json").read_text())
        self.dashboard_id=self.manifest["dashboard_id"]

    def tearDown(self): self.temp.cleanup()

    def document(self,state,record_id,decision="accept",export_id=U1,now=T1,review_time=T0,scope="leaf"):
        before=copy.deepcopy(state["records"][record_id]); after=copy.deepcopy(before)
        after.update(reviewer_id="SYNTHETIC-UNIT-REVIEWER",decision=decision,proposed_action=decision,annotation_scope=scope,
                     reason="Synthetic schema/interchange fixture, not real human review",evidence=["synthetic QA evidence"],reviewed_at=review_time)
        return {"format":"agriguard-human-review-delta","schema_version":1,"dashboard_id":self.dashboard_id,
                "catalog_sha256":self.catalog["catalog_sha256"],"source_fingerprint":self.catalog["source_fingerprint"],
                "export_id":export_id,"revision":state["revision"]+1,"parent_export_id":state["parent_export_id"],
                "exported_at":now,"exporter_id":"SYNTHETIC-UNIT-REVIEWER","changes":[{"record_id":record_id,"before":before,"after":after}]}

    def test_build_preserves_source_qa_ids_and_initial_human_progress(self):
        before_source=snapshot(self.source); before_qa=snapshot(self.qa)
        _,loaded=load_dashboard(self.dashboard,self.source)
        self.assertEqual(loaded["catalog_sha256"],self.catalog["catalog_sha256"])
        self.assertEqual(snapshot(self.source),before_source); self.assertEqual(snapshot(self.qa),before_qa)
        summary=json.loads((self.dashboard/"dashboard_summary.json").read_text())
        self.assertEqual(summary["human_decisions_created"],0)
        self.assertEqual(summary["initial_full_progress"]["resolved"],0)
        self.assertEqual(summary["initial_full_progress"]["pending"],len(pending_records(self.catalog)))
        self.assertFalse((self.dashboard/"labels").exists())
        self.assertIn("application/json",(self.dashboard/"index.html").read_text())
        with self.assertRaisesRegex(ValueError,"NEW output"):
            build_dashboard(self.qa,self.source,self.dashboard)

    def test_pilot_reuses_original_ids_without_selecting_or_approving_endpoints_implicitly(self):
        records=pending_records(self.catalog)
        pilot=pilot_queue(self.catalog,records,2)
        self.assertEqual(pilot["base_image_ids"],self.catalog["selected_visual_proposals"])
        self.assertTrue(set(pilot["record_ids"]).issubset({r["record_id"] for r in records}))
        self.assertLessEqual(len(pilot["pair_ids"]),2)
        self.assertFalse(pilot["summary"]["groups_applied"])
        self.assertEqual(pilot["summary"]["statistical_representativeness"],"NOT_CLAIMED")

    def test_delta_only_changes_one_record_and_unresolved_is_not_resolved(self):
        state=initial_state(self.catalog)
        image=next(r for r in state["records"].values() if r["record_type"]=="image" and r["annotation_ids"]==[])
        document=self.document(state,image["record_id"],"unresolved")
        apply_export(self.catalog,state,document,self.dashboard_id)
        stats=progress(self.catalog,state["records"])
        self.assertEqual(stats["touched"],1); self.assertEqual(stats["resolved"],0)
        self.assertEqual(stats["needs_work"],len(state["records"]))
        self.assertEqual(sum(r["decision"]!="pending" for r in state["records"].values()),1)

    def test_conflicting_versions_and_stale_before_values_are_atomic_rejections(self):
        state=initial_state(self.catalog)
        key=next(iter(state["records"]))
        v1=self.document(state,key)
        apply_export(self.catalog,state,v1,self.dashboard_id)
        before=copy.deepcopy(state)
        with self.assertRaisesRegex(ValueError,"revision/parent"):
            apply_export(self.catalog,state,v1,self.dashboard_id)
        v2=self.document(state,key,"revise",U2,T2,T1)
        v2["changes"][0]["before"]=v1["changes"][0]["before"]
        with self.assertRaisesRegex(ValueError,"stale"):
            apply_export(self.catalog,state,v2,self.dashboard_id)
        self.assertEqual(state,before)

    def test_incomplete_or_bulk_forged_approval_cannot_partially_apply(self):
        state=initial_state(self.catalog); keys=list(state["records"])
        doc=self.document(state,keys[0]); second=self.document(state,keys[1])["changes"][0]
        second["after"]["evidence"]=[]; doc["changes"].append(second)
        before=copy.deepcopy(state)
        with self.assertRaises(ValidationError): apply_export(self.catalog,state,doc,self.dashboard_id)
        self.assertEqual(state,before)
        doc=self.document(state,keys[0]); doc["changes"][0]["after"]["conversion_approved"]=True
        with self.assertRaises(ValidationError): apply_export(self.catalog,state,doc,self.dashboard_id)
        self.assertEqual(state,before)

    def test_wrong_source_version_chronology_and_cross_type_fields_fail_closed(self):
        state=initial_state(self.catalog); key=next(iter(state["records"])); before=copy.deepcopy(state)
        for mutate in (
            lambda d: d.update(source_fingerprint="0"*64),
            lambda d: d.update(schema_version=True),
            lambda d: d.update(exported_at="2026-11-14 10:01:00+00:00"),
            lambda d: d.update(exported_at="2026-11-14T09:59:00Z"),
            lambda d: d["changes"][0]["after"].update(relationship="same_original"),
        ):
            document=self.document(state,key); mutate(document)
            with self.assertRaises((ValueError,ValidationError)):
                apply_export(self.catalog,state,document,self.dashboard_id)
            self.assertEqual(state,before)
    def test_scope_conflict_is_reported_without_generating_labels_or_approvals(self):
        state=initial_state(self.catalog)
        annotations=[r for r in state["records"].values() if r["record_type"]=="annotation"]
        same=max(([r for r in annotations if r["image_ids"]==candidate["image_ids"]] for candidate in annotations),key=len)
        self.assertGreaterEqual(len(same),2)
        apply_export(self.catalog,state,self.document(state,same[0]["record_id"],scope="leaf"),self.dashboard_id)
        apply_export(self.catalog,state,self.document(state,same[1]["record_id"],export_id=U2,now=T2,review_time=T1,scope="lesion"),self.dashboard_id)
        assessment=conversion_assessment(self.catalog,state["records"],self.manifest["pilot"])
        self.assertTrue(assessment["accepted_scope_conflicts"])
        self.assertEqual(assessment["manually_reviewed_sample_count"],1)
        self.assertFalse(assessment["conversion_authorized"])
        self.assertFalse(assessment["groups_applied"])
        self.assertTrue(assessment["manually_reviewed_samples"][0]["duplicate_object_concerns"])
        self.assertNotIn("bbox_xyxy",json.dumps(assessment))

    def test_dashboard_or_source_changes_invalidate_export_validation(self):
        (self.dashboard/"core.js").write_text("tampered synthetic UI fixture")
        with self.assertRaisesRegex(ValueError,"artifact changed"):
            load_dashboard(self.dashboard,self.source)

    def test_ui_refinement_preserves_export_identity_core_and_old_decision_compatibility(self):
        old_state=initial_state(self.catalog); key=next(iter(old_state["records"]))
        old_export=self.document(old_state,key)
        notes=self.dashboard/"user-notes.txt"; notes.write_text("Private synthetic user work; never overwrite")
        before=snapshot(self.dashboard); source_before=snapshot(self.source)
        output=self.root/"refined"
        result=refine_dashboard(self.dashboard,self.source,output)
        manifest,catalog=load_dashboard(output,self.source)
        self.assertEqual(snapshot(self.dashboard),before)
        self.assertEqual(snapshot(self.source),source_before)
        self.assertEqual(result["dashboard_id"],self.dashboard_id)
        self.assertEqual(manifest["ui_revision"],"1B.0.4A")
        self.assertEqual(catalog["catalog_sha256"],self.catalog["catalog_sha256"])
        self.assertEqual((output/"core.js").read_bytes(),(self.dashboard/"core.js").read_bytes())
        self.assertFalse((output/"user-notes.txt").exists())
        self.assertEqual((output/"pilot_queue.json").read_bytes(),(self.dashboard/"pilot_queue.json").read_bytes())
        new_state=initial_state(catalog)
        apply_export(catalog,new_state,old_export,manifest["dashboard_id"])
        self.assertEqual(progress(catalog,new_state["records"])["touched"],1)
        with self.assertRaisesRegex(ValueError,"NEW output"):
            refine_dashboard(self.dashboard,self.source,output)

    def test_ui_refinement_cannot_replace_a_custom_decision_core(self):
        from training.yolo.data import digest
        from detection.adapter import file_sha256
        (self.dashboard/"core.js").write_text("Synthetic modified decision core")
        manifest=json.loads((self.dashboard/"dashboard_manifest.json").read_text())
        manifest["artifacts_sha256"]["core.js"]=file_sha256(self.dashboard/"core.js")
        manifest["manifest_sha256"]=digest({key:value for key,value in manifest.items() if key!="manifest_sha256"})
        (self.dashboard/"dashboard_manifest.json").write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError,"cannot replace"):
            refine_dashboard(self.dashboard,self.source,self.root/"refused")
        self.assertFalse((self.root/"refused").exists())

    def test_ux_page_has_three_distinct_panels_and_no_primary_raw_json(self):
        class Structure(HTMLParser):
            def __init__(self):
                super().__init__(); self.stack=[]; self.ids=[]; self.panels=[]; self.pre_outside_details=[]
            def handle_starttag(self,tag,attrs):
                values=dict(attrs)
                if "id" in values: self.ids.append(values["id"])
                classes=set(values.get("class","").split())
                if classes & {"queue-panel","viewer-panel","review-panel"}: self.panels.append(classes)
                if tag=="pre" and "details" not in self.stack: self.pre_outside_details.append(values.get("id"))
                if tag not in {"meta","link","input","img","br","hr"}: self.stack.append(tag)
            def handle_endtag(self,tag):
                if tag in self.stack:
                    while self.stack.pop()!=tag: pass
        page=Path(__file__).resolve().parents[1]/"training"/"yolo"/"review_dashboard"/"page.html"
        structure=Structure(); structure.feed(page.read_text())
        self.assertEqual(len(structure.ids),len(set(structure.ids)))
        self.assertEqual(len(structure.panels),3)
        self.assertEqual(structure.pre_outside_details,[])

    @unittest.skipUnless(shutil.which("node"),"Node unavailable for actual JS/Python interchange test")
    def test_actual_javascript_export_is_accepted_by_python_without_touching_other_records(self):
        records=pending_records(self.catalog)
        payload={"dashboard_id":self.dashboard_id,"catalog_sha256":self.catalog["catalog_sha256"],"source_fingerprint":self.catalog["source_fingerprint"],
                 "catalog":self.catalog,"records":records,"pilot":self.manifest["pilot"]}
        core=Path(__file__).resolve().parents[1]/"training"/"yolo"/"review_dashboard"/"core.js"
        # stdin/stdout only; synthetic fixture decisions are never written into
        # the user's real QA package or Downloads.
        script="const fs=require('node:fs');const C=require(process.argv[1]);const p=JSON.parse(fs.readFileSync(0,'utf8'));const s=C.createSession(p);const r=p.records.find(r=>r.record_type==='annotation');C.saveDecision(s,r.record_id,{reviewer_id:'SYNTHETIC-UNIT-REVIEWER',decision:'accept',annotation_scope:'leaf',reason:'Synthetic interchange only, NOT a human review',evidence:['synthetic QA evidence'],relationship:'unresolved',proposed_group_id:null,negative_verified:false},'2026-11-14T10:00:00Z');console.log(JSON.stringify(C.makeExport(s,'SYNTHETIC-UNIT-REVIEWER',{now:'2026-11-14T10:01:00Z',exportId:'10000000-0000-4000-8000-000000000001'})))"
        result=subprocess.run([shutil.which("node"),"-e",script,str(core)],input=json.dumps(payload),text=True,capture_output=True,check=True)
        state=initial_state(self.catalog)
        apply_export(self.catalog,state,json.loads(result.stdout),self.dashboard_id)
        self.assertEqual(progress(self.catalog,state["records"])["touched"],1)
        self.assertEqual(progress(self.catalog,state["records"])["pending"],len(records)-1)


if __name__=="__main__": unittest.main()
