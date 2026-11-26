"""Versioned human decision deltas and read-only conversion assessment.

No review verdict is created here. Missing/unmentioned records stay pending.
"""
import argparse
import copy
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from detection.adapter import file_sha256
from .data import digest
from .import_yolo import local_file
from .qa_review import ReviewRecord, pending_records, validate_reviews

CONTEXT=("record_id","record_type","image_ids","annotation_ids","pair_id","source_fingerprint")


def when(value):
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})",value):
        raise ValueError("Timezone-qualified ISO timestamp required")
    result=datetime.fromisoformat(value.replace("Z","+00:00"))
    if result.tzinfo is None: raise ValueError("Timezone-qualified timestamp required")
    return result


class Change(BaseModel):
    model_config=ConfigDict(extra="forbid")
    record_id: str
    before: ReviewRecord
    after: ReviewRecord

    @model_validator(mode="after")
    def no_cross_type_relationships(self):
        for row in (self.before,self.after):
            if row.record_type!="leakage_pair" and (row.relationship!="unresolved" or row.proposed_group_id is not None):
                raise ValueError("Ancestry fields apply only to pair reviews")
        return self


class HumanExport(BaseModel):
    model_config=ConfigDict(extra="forbid")
    format: Literal["agriguard-human-review-delta"]
    schema_version: int = Field(strict=True)
    dashboard_id: str = Field(pattern=r"^[a-f0-9]{64}$")
    catalog_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    export_id: UUID
    revision: int = Field(strict=True,ge=1)
    parent_export_id: UUID | None
    exported_at: str
    exporter_id: str = Field(min_length=1,max_length=128)
    changes: list[Change] = Field(min_length=1)

    @model_validator(mode="after")
    def header(self):
        if self.schema_version!=1 or not self.exporter_id.strip(): raise ValueError("Unsupported version or blank exporter identity")
        when(self.exported_at)
        return self


def initial_state(catalog):
    return {"revision":0,"parent_export_id":None,"records":{row["record_id"]:row for row in pending_records(catalog)}}


def apply_export(catalog,state,document,dashboard_id):
    export=HumanExport.model_validate(document)
    if export.dashboard_id!=dashboard_id or export.catalog_sha256!=catalog["catalog_sha256"] or export.source_fingerprint!=catalog["source_fingerprint"]:
        raise ValueError("Export belongs to a different dashboard/catalog/source")
    parent=str(export.parent_export_id) if export.parent_export_id else None
    if export.revision!=state["revision"]+1 or parent!=state["parent_export_id"]:
        raise ValueError("Conflicting revision/parent; apply the exact chain in order")
    if len(export.changes)>len(state["records"]): raise ValueError("Too many changed records")
    next_records=copy.deepcopy(state["records"])
    seen=set()
    for change in export.changes:
        key=change.record_id
        before,after=change.before.model_dump(),change.after.model_dump()
        if key in seen or key not in next_records or before["record_id"]!=key or after["record_id"]!=key:
            raise ValueError("Duplicate/unknown changed record")
        if next_records[key]!=before or any(before[field]!=after[field] for field in CONTEXT):
            raise ValueError("Conflicting/stale previous decision or changed review context")
        if after["decision"]=="pending" or before==after:
            raise ValueError("Cannot erase a review into pending or apply a no-op")
        if when(after["reviewed_at"])>when(export.exported_at) or (before["reviewed_at"] and when(after["reviewed_at"])<when(before["reviewed_at"])):
            raise ValueError("Invalid review/export chronology")
        next_records[key]=after; seen.add(key)
    # Reuse the existing authoritative annotation/negative/context guard. Commit
    # to in-memory state only after EVERY change succeeds (no partial merge).
    validate_reviews(catalog,list(next_records.values()))
    state.update(records=next_records,revision=export.revision,parent_export_id=str(export.export_id))
    return len(seen)


def record_context(catalog,record,samples=None,annotations=None):
    samples=samples or {s["image_id"]:s for s in catalog["samples"]}
    annotations=annotations or {a["annotation_id"]:a for a in catalog["annotations"]}
    linked=[samples[key] for key in record["image_ids"]]
    classes=sorted({name for sample in linked for name in sample["classes"]}) or ["EMPTY / NO SOURCE LABEL"]
    issues={flag for sample in linked for flag in sample["flags"]}
    if record["record_type"]=="annotation":
        annotation=annotations[record["annotation_ids"][0]]
        classes=[annotation["class_name"]]
        issues.update(annotation["issues"])
        if record["annotation_scope"]=="unresolved": issues.add("scope_review_required")
    if record["record_type"]=="leakage_pair": issues.add("cross_split_similarity_not_ancestry")
    return classes,sorted(issues)


def progress(catalog,records,record_ids=None):
    selected=set(record_ids) if record_ids is not None else None
    samples={s["image_id"]:s for s in catalog["samples"]}; annotations={a["annotation_id"]:a for a in catalog["annotations"]}
    result={"total":0,"touched":0,"resolved":0,"pending":0,"needs_work":0,"decisions":{},"by_class":{},"by_issue":{}}
    for row in records.values():
        if selected is not None and row["record_id"] not in selected: continue
        result["total"]+=1; result["touched"]+=row["decision"]!="pending"; result["pending"]+=row["decision"]=="pending"
        status="resolved" if row["decision"] in ("accept","exclude") else "needs_work"
        result[status]+=1; result["decisions"][row["decision"]]=result["decisions"].get(row["decision"],0)+1
        classes,issues=record_context(catalog,row,samples,annotations)
        for target,keys in (("by_class",classes),("by_issue",issues)):
            for key in keys:
                stats=result[target].setdefault(key,{"total":0,"pending":0,"needs_work":0,"resolved":0})
                stats["total"]+=1; stats["pending"]+=row["decision"]=="pending"; stats[status]+=1
    return result


def conversion_assessment(catalog,records,pilot):
    sample_by_id={s["image_id"]:s for s in catalog["samples"]}
    annotations={a["annotation_id"]:a for a in catalog["annotations"]}
    image_reviews={r["image_ids"][0]:r for r in records.values() if r["record_type"]=="image"}
    annotation_reviews={r["annotation_ids"][0]:r for r in records.values() if r["record_type"]=="annotation"}
    pair_reviews={r["pair_id"]:r for r in records.values() if r["record_type"]=="leakage_pair"}
    proposals={p["source_name"]:p for p in catalog["taxonomy_proposals"]}
    scopes={}
    for key,review in annotation_reviews.items():
        proposal=proposals.get(annotations[key]["class_name"],{})
        cid=proposal.get("canonical_class_id")
        if review["decision"]=="accept" and cid is not None:
            scopes.setdefault(cid,set()).add(review["annotation_scope"])
    conflicts=[{"canonical_class_id":cid,"accepted_scopes":sorted(values)} for cid,values in sorted(scopes.items()) if len(values)>1 or not values.issubset({"leaf","lesion"})]
    reviewed_ids={r["image_ids"][0] for r in records.values() if r["record_type"] in ("image","annotation") and r["decision"]!="pending"}
    assessments=[]
    for key in sorted(reviewed_ids):
        sample=sample_by_id[key]
        rows=[]
        for aid in sample["annotation_ids"]:
            annotation,review=annotations[aid],annotation_reviews[aid]
            rows.append({"annotation_id":aid,"source_line":annotation["line_number"],"source_class":annotation["class_name"],
                         "existing_format":annotation["kind"],"decision":review["decision"],"scope":review["annotation_scope"],
                         "geometry_concerns":annotation["issues"],"envelope_inflation":annotation.get("envelope_inflation"),
                         "proposed_method":"axis_aligned_extrema_REVIEW_ONLY" if annotation["kind"]=="polygon" else "retain_existing_bbox_REVIEW_ONLY"})
        touching=[p for p in catalog["leakage_pairs"] if key in (p["left_image_id"],p["right_image_id"])]
        unresolved=[p["pair_id"] for p in touching if pair_reviews[p["pair_id"]]["decision"]!="accept" or pair_reviews[p["pair_id"]]["relationship"]=="unresolved"]
        ancestry=[p["pair_id"] for p in touching if pair_reviews[p["pair_id"]]["relationship"] in ("same_original","same_session")]
        remaining=[image_reviews[key]["record_id"]] if image_reviews[key]["decision"] not in ("accept","exclude") else []
        remaining.extend(annotation_reviews[aid]["record_id"] for aid in sample["annotation_ids"] if annotation_reviews[aid]["decision"] not in ("accept","exclude"))
        assessments.append({"image_id":key,"source_image_id":sample["source_image_id"],"image_decision":image_reviews[key]["decision"],
                            "negative_verified":image_reviews[key]["negative_verified"],
                            "explicit_negative_review_required":image_reviews[key]["decision"]=="accept" and not image_reviews[key]["negative_verified"] and (not sample["classes"] or sample["classes"]==["Healthy"]),
                            "annotations":rows,"remaining_human_record_ids":remaining,"unresolved_leakage_pair_ids":unresolved,
                            "shared_ancestry_requires_group_policy":ancestry,"duplicate_object_concerns":sample["possible_duplicate_objects"],
                            "conversion_authorized":False,"training_authorized":False})
    return {"manually_reviewed_samples":assessments,"manually_reviewed_sample_count":len(assessments),
            "accepted_scope_conflicts":conflicts,"pilot_progress":progress(catalog,records,pilot["record_ids"]),
            "full_progress":progress(catalog,records),"global_blockers":["SOURCE_MAPPING_AND_LICENSE_NOT_APPROVED","CONVERSION_POLICY_DRAFT","NO_APPROVED_GROUP_LEDGER"],
            "conversion_authorized":False,"training_authorized":False,"groups_applied":False,
            "scope":"Read-only diagnostic/proposal summary; no converted coordinates/labels, approvals or fabricated decisions"}


def load_dashboard(root,source_root):
    root=Path(root).resolve()
    manifest=json.loads((root/"dashboard_manifest.json").read_text())
    if manifest.get("manifest_sha256")!=digest({k:v for k,v in manifest.items() if k!="manifest_sha256"}): raise ValueError("Dashboard manifest changed")
    for relative,expected in manifest["artifacts_sha256"].items():
        if file_sha256(local_file(root,relative))!=expected: raise ValueError("Dashboard/source evidence artifact changed")
    catalog=json.loads((root/"qa"/"qa_catalog.json").read_text())
    if manifest["catalog_sha256"]!=catalog["catalog_sha256"] or manifest["source_fingerprint"]!=catalog["source_fingerprint"]:
        raise ValueError("Dashboard/source identity mismatch")
    validate_reviews(catalog,pending_records(catalog),source_root,root/"qa")
    return manifest,catalog


def main():
    parser=argparse.ArgumentParser(description="Validate explicit human export revisions and summarize readiness; NEVER converts data.")
    parser.add_argument("--dashboard",type=Path,required=True)
    parser.add_argument("--source-root",type=Path,required=True)
    parser.add_argument("--exports",type=Path,nargs="*",default=[])
    parser.add_argument("--report",type=Path)
    args=parser.parse_args()
    manifest,catalog=load_dashboard(args.dashboard,args.source_root)
    state=initial_state(catalog)
    for path in args.exports: apply_export(catalog,state,json.loads(path.read_text()),manifest["dashboard_id"])
    report={"schema_version":1,"revision":state["revision"],"parent_export_id":state["parent_export_id"],
            "source_fingerprint":catalog["source_fingerprint"],"catalog_sha256":catalog["catalog_sha256"],
            "assessment":conversion_assessment(catalog,state["records"],manifest["pilot"])}
    if args.report:
        destination=args.report.resolve()
        if destination.is_relative_to(args.source_root.resolve()) or destination.is_relative_to((args.dashboard/"qa").resolve()):
            raise ValueError("Report must not modify immutable source/QA evidence")
        with destination.open("x") as handle: json.dump(report,handle,indent=2,allow_nan=False); handle.write("\n")
    print(json.dumps(report,indent=2,allow_nan=False))
    return 2 if report["assessment"]["full_progress"]["needs_work"] else 0


if __name__=="__main__": raise SystemExit(main())
