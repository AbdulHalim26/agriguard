"""Build a NEW offline dashboard over an unchanged PHASE 1B.0.3 QA package."""
import argparse
import json
import shutil
import tempfile
from collections import Counter
from pathlib import Path

from detection.adapter import file_sha256
from .data import digest, write_json
from .import_yolo import local_file, output_slot
from .qa_mixed import snapshot
from .qa_review import pending_records, validate_reviews
from .review_export import conversion_assessment, initial_state, load_dashboard


def pilot_queue(catalog,records,pair_limit=40):
    if pair_limit<1: raise ValueError("Positive pilot pair limit required")
    image_ids=list(catalog["selected_visual_proposals"])
    images={sample["image_id"]:sample for sample in catalog["samples"]}
    if len(set(image_ids))!=len(image_ids) or not set(image_ids).issubset(images): raise ValueError("Invalid original representative image IDs")
    by_bucket={}
    for pair in catalog["leakage_pairs"]: by_bucket.setdefault(pair["review_bucket_id"],[]).append(pair)
    selected=[]
    def add(pair):
        if len(selected)<pair_limit and pair["pair_id"] not in {row["pair_id"] for row in selected}: selected.append(pair)
    # Diverse heuristic review buckets first; NEVER a merge of training groups.
    for bucket in by_bucket.values(): add(bucket[0])
    for bucket in by_bucket.values():
        candidate=next((pair for pair in bucket if pair["aug_filename_hint"]),None)
        if candidate: add(candidate)
    for offset in range(1,max((len(bucket) for bucket in by_bucket.values()),default=0)):
        for bucket in by_bucket.values():
            if offset<len(bucket): add(bucket[offset])
        if len(selected)>=pair_limit: break
    pair_ids={pair["pair_id"] for pair in selected}
    chosen=[record["record_id"] for record in records if
            (record["record_type"] in ("image","annotation") and record["image_ids"][0] in image_ids)
            or (record["record_type"]=="leakage_pair" and record["pair_id"] in pair_ids)]
    samples=[images[key] for key in image_ids]
    annotation_ids={aid for sample in samples for aid in sample["annotation_ids"]}
    annotations=[a for a in catalog["annotations"] if a["annotation_id"] in annotation_ids]
    summary={"base_representative_images":len(samples),"annotation_records":len(annotations),"pair_records":len(selected),"total_records":len(chosen),
             "source_classes":sorted({name for sample in samples for name in sample["classes"]}),
             "splits":dict(Counter(sample["split"] for sample in samples)),"formats":dict(Counter(sample["format"] for sample in samples)),
             "resolutions":dict(Counter(f'{sample["width"]}x{sample["height"]}' for sample in samples)),
             "high_inflation_polygons_gt5x":sum(a.get("envelope_inflation",0)>5 for a in annotations),
             "empty_label_images":sum(not sample["annotation_ids"] for sample in samples),
             "possible_object_duplicate_pairs":sum(len(sample["possible_duplicate_objects"]) for sample in samples),
             "aug_filename_images":sum("aug_filename_lineage_unverified" in sample["flags"] for sample in samples),
             "pair_aug_filename_hints":sum(pair["aug_filename_hint"] for pair in selected),
             "heuristic_review_buckets":len({pair["review_bucket_id"] for pair in selected}),
             "statistical_representativeness":"NOT_CLAIMED","groups_applied":False,
             "pair_endpoint_rule":"Pair endpoints may be viewed outside the 96-image queue; pair verdicts never approve those images/annotations"}
    return {"schema_version":1,"base_image_ids":image_ids,"pair_ids":[pair["pair_id"] for pair in selected],"record_ids":chosen,"summary":summary}


def build_dashboard(qa_root,source_root,output,pair_limit=40):
    qa_root,output=output_slot(qa_root,output)
    source_root,_=output_slot(source_root,output)
    catalog=json.loads(local_file(qa_root,"qa_catalog.json").read_text())
    records=[json.loads(line) for line in local_file(qa_root,"reviews.pending.jsonl").read_text().splitlines() if line.strip()]
    validate_reviews(catalog,records,source_root,qa_root)
    if records!=pending_records(catalog):
        raise ValueError("Original pending queue contains manual edits; preserve it and reconcile explicitly, never reset it")
    pilot=pilot_queue(catalog,records,pair_limit)
    assets=Path(__file__).with_name("review_dashboard")
    asset_files=("core.js","workspace.js","dashboard.js","style.css","page.html")
    asset_hashes={name:file_sha256(assets/name) for name in asset_files}
    dashboard_id=digest({"version":"1B.0.4","catalog_sha256":catalog["catalog_sha256"],"pilot":pilot,"code":asset_hashes})
    payload={"dashboard_id":dashboard_id,"catalog_sha256":catalog["catalog_sha256"],"source_fingerprint":catalog["source_fingerprint"],
             "catalog":catalog,"records":records,"pilot":pilot}
    initial=conversion_assessment(catalog,initial_state(catalog)["records"],pilot)
    # Existing hashed artifacts are copied byte-for-byte; the old package and all
    # unrelated user files remain untouched. No source scan/re-annotation needed.
    qa_files=dict(catalog["artifacts_sha256"])
    for relative in ("qa_catalog.json","reviews.pending.jsonl","qa_summary.json"):
        qa_files[relative]=file_sha256(local_file(qa_root,relative))
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".offline-review-",dir=output.parent) as temporary:
        root=Path(temporary)/"dashboard"; root.mkdir()
        for relative,expected in qa_files.items():
            target=root/"qa"/relative; target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(local_file(qa_root,relative),target)
            if file_sha256(target)!=expected: raise ValueError("QA package changed during copy")
        for name in ("core.js","workspace.js","dashboard.js","style.css"): shutil.copyfile(assets/name,root/name)
        encoded=json.dumps(payload,ensure_ascii=True,allow_nan=False,separators=(",",":")).replace("<","\\u003c").replace(">","\\u003e").replace("&","\\u0026")
        page=(assets/"page.html").read_text()
        if page.count("__AGRIGUARD_REVIEW_PAYLOAD__")!=1: raise ValueError("Invalid offline page payload marker")
        (root/"index.html").write_text(page.replace("__AGRIGUARD_REVIEW_PAYLOAD__",encoded))
        workflow=Path(__file__).resolve().parents[3]/"docs"/"OFFLINE-REVIEW-PILOT-1B004.md"
        if not workflow.is_file(): raise ValueError("Versioned human-review workflow documentation missing")
        shutil.copyfile(workflow,root/"workflow.md")
        shutil.copyfile(workflow.with_name("OFFLINE-REVIEW-UX-1B004A.md"),root/"ux-guide.md")
        write_json(root/"pilot_queue.json",pilot)
        summary={"dashboard_id":dashboard_id,"source_fingerprint":catalog["source_fingerprint"],"catalog_sha256":catalog["catalog_sha256"],
                 "pilot":pilot["summary"],"initial_pilot_progress":initial["pilot_progress"],"initial_full_progress":initial["full_progress"],
                 "human_decisions_created":0,"real_review_exports_created":0,"conversion_authorized":False,"training_authorized":False,
                 "payload_bytes":len(encoded.encode()),"source_unchanged":True,"qa_package_unchanged":True}
        write_json(root/"dashboard_summary.json",summary)
        write_json(root/"conversion_assessment.initial.json",initial)
        if snapshot(source_root)[1]!=catalog["source_fingerprint"]: raise ValueError("Raw source changed during dashboard generation")
        if any(file_sha256(local_file(qa_root,relative))!=expected for relative,expected in qa_files.items()): raise ValueError("Original QA artifacts changed during generation")
        manifest={"schema_version":1,"dashboard_version":"1B.0.4","dashboard_id":dashboard_id,"catalog_sha256":catalog["catalog_sha256"],
                  "source_fingerprint":catalog["source_fingerprint"],"pilot":pilot,"conversion_authorized":False,"training_authorized":False,
                  "artifacts_sha256":{path.relative_to(root).as_posix():file_sha256(path) for path in sorted(root.rglob("*")) if path.is_file()}}
        manifest["manifest_sha256"]=digest(manifest)
        write_json(root/"dashboard_manifest.json",manifest)
        root.rename(output)
    return {"output":str(output),"dashboard_id":dashboard_id,"pilot":pilot["summary"],"initial_full_progress":initial["full_progress"],
            "source_unchanged":True,"qa_package_unchanged":True,"human_decisions_created":0}


def refine_dashboard(existing,source_root,output):
    """UI-only refresh in a NEW directory, preserving the logical export context.

    No changes to core.js, records, fingerprints, pilot membership, validators or
    revision semantics. Existing browser sessions/files are never overwritten.
    """
    existing,output=output_slot(existing,output)
    source_root,_=output_slot(source_root,output)
    previous,catalog=load_dashboard(existing,source_root)
    assets=Path(__file__).with_name("review_dashboard")
    if file_sha256(assets/"core.js")!=file_sha256(existing/"core.js"):
        raise ValueError("UX refinement cannot replace the existing decision/export core")
    records=pending_records(catalog)
    payload={"dashboard_id":previous["dashboard_id"],"catalog_sha256":catalog["catalog_sha256"],
             "source_fingerprint":catalog["source_fingerprint"],"catalog":catalog,"records":records,"pilot":previous["pilot"]}
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".review-ux-",dir=output.parent) as temporary:
        root=Path(temporary)/"dashboard"; root.mkdir()
        for relative,expected in previous["artifacts_sha256"].items():
            destination=root/relative; destination.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(local_file(existing,relative),destination)
            if file_sha256(destination)!=expected: raise ValueError("Existing dashboard changed during UI refresh")
        for name in ("workspace.js","dashboard.js","style.css"): shutil.copyfile(assets/name,root/name)
        page=(assets/"page.html").read_text()
        if page.count("__AGRIGUARD_REVIEW_PAYLOAD__")!=1: raise ValueError("Invalid offline page payload marker")
        encoded=json.dumps(payload,ensure_ascii=True,allow_nan=False,separators=(",",":")).replace("<","\\u003c").replace(">","\\u003e").replace("&","\\u0026")
        (root/"index.html").write_text(page.replace("__AGRIGUARD_REVIEW_PAYLOAD__",encoded))
        guide=Path(__file__).resolve().parents[3]/"docs"/"OFFLINE-REVIEW-UX-1B004A.md"
        shutil.copyfile(guide,root/"ux-guide.md")
        summary=json.loads((root/"dashboard_summary.json").read_text())
        summary.update(ui_revision="1B.0.4A",export_context_preserved=True,source_dashboard_manifest_sha256=previous["manifest_sha256"],
                       existing_exports_compatible=True,human_decisions_created=0,real_review_exports_created=0)
        write_json(root/"dashboard_summary.json",summary)
        if snapshot(source_root)[1]!=catalog["source_fingerprint"]: raise ValueError("Raw source changed during UI refresh")
        if any(file_sha256(local_file(existing,path))!=expected for path,expected in previous["artifacts_sha256"].items()):
            raise ValueError("Original dashboard artifacts changed during UI refresh")
        manifest={key:value for key,value in previous.items() if key not in ("manifest_sha256","artifacts_sha256")}
        manifest.update(ui_revision="1B.0.4A",source_dashboard_manifest_sha256=previous["manifest_sha256"],
                        artifacts_sha256={path.relative_to(root).as_posix():file_sha256(path) for path in sorted(root.rglob("*")) if path.is_file()})
        manifest["manifest_sha256"]=digest(manifest)
        write_json(root/"dashboard_manifest.json",manifest)
        root.rename(output)
    return {"output":str(output),"ui_revision":"1B.0.4A","dashboard_id":previous["dashboard_id"],
            "catalog_sha256":catalog["catalog_sha256"],"source_fingerprint":catalog["source_fingerprint"],
            "pilot_records":len(previous["pilot"]["record_ids"]),"original_dashboard_unchanged":True,
            "source_unchanged":True,"decision_core_unchanged":True,"existing_exports_compatible":True,"human_decisions_created":0}


def main():
    parser=argparse.ArgumentParser(description="Build a NEW offline human-review dashboard; no verdicts, training or conversion.")
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--qa-root",type=Path)
    mode.add_argument("--refresh-from",type=Path)
    parser.add_argument("--source-root",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--pilot-pairs",type=int,default=40)
    args=parser.parse_args()
    result=refine_dashboard(args.refresh_from,args.source_root,args.output) if args.refresh_from else build_dashboard(args.qa_root,args.source_root,args.output,args.pilot_pairs)
    print(json.dumps(result,indent=2))


if __name__=="__main__": main()
