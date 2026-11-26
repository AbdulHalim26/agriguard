"""Human QA decision schema. This NEVER grants training/conversion permission."""
import argparse
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .data import digest
from detection.adapter import file_sha256
from .import_yolo import local_file
from .qa_mixed import snapshot

Action = Literal["accept","revise","exclude","unresolved"]


class ReviewRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    record_id: str = Field(pattern=r"^[a-f0-9]{24}$")
    record_type: Literal["image","annotation","leakage_pair"]
    image_ids: list[str]
    annotation_ids: list[str]
    pair_id: str | None = None
    source_fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    reviewer_id: str | None = None
    decision: Literal["pending","accept","revise","exclude","unresolved"] = "pending"
    proposed_action: Action | None = None
    annotation_scope: Literal["unresolved","lesion","leaf","other","not_applicable"] = "unresolved"
    reason: str = ""
    evidence: list[str] = Field(default_factory=list)
    reviewed_at: str | None = None
    relationship: Literal["unresolved","same_original","same_session","different_original","visually_similar_only"] = "unresolved"
    proposed_group_id: str | None = None
    negative_verified: bool = False
    training_approved: Literal[False] = False
    conversion_approved: Literal[False] = False

    @model_validator(mode="after")
    def human_fields_required(self):
        if self.decision == "pending":
            if self.reviewer_id or self.proposed_action or self.reason or self.evidence or self.reviewed_at or self.annotation_scope != "unresolved" or self.relationship != "unresolved" or self.proposed_group_id or self.negative_verified:
                raise ValueError("Pending records must remain untouched; an explicit human decision is required")
            return self
        if not self.reviewer_id or not self.reviewer_id.strip() or self.proposed_action != self.decision:
            raise ValueError("Explicit reviewer identity and matching proposed action required")
        if not self.reason.strip() or not self.evidence or any(not value.strip() for value in self.evidence):
            raise ValueError("Reason and actual review evidence references required")
        if not self.reviewed_at:
            raise ValueError("Human review timestamp required")
        when = datetime.fromisoformat(self.reviewed_at.replace("Z","+00:00"))
        if when.tzinfo is None:
            raise ValueError("Review timestamp must include timezone")
        if self.record_type == "annotation" and self.decision == "accept" and self.annotation_scope not in ("lesion","leaf","other"):
            raise ValueError("Accepted source annotation needs explicit observed scope")
        if self.record_type == "leakage_pair" and self.decision == "accept" and self.relationship == "unresolved":
            raise ValueError("Similarity alone cannot establish ancestry; record an explicit relationship")
        if self.proposed_group_id and (self.record_type != "leakage_pair" or self.relationship not in ("same_original","same_session")):
            raise ValueError("Group proposals require explicit shared-ancestry evidence; groups are never applied here")
        if self.negative_verified and (self.record_type != "image" or self.decision != "accept"):
            raise ValueError("Negative review must be a deliberate accepted image-level decision")
        return self


def pending_records(catalog):
    fingerprint = catalog["source_fingerprint"]
    records = []
    for sample in catalog["samples"]:
        records.append(ReviewRecord(record_id=digest(["image",sample["image_id"],fingerprint])[:24], record_type="image",
                                    image_ids=[sample["image_id"]], annotation_ids=[], source_fingerprint=fingerprint).model_dump())
    for annotation in catalog["annotations"]:
        records.append(ReviewRecord(record_id=digest(["annotation",annotation["annotation_id"],fingerprint])[:24], record_type="annotation",
                                    image_ids=[annotation["image_id"]], annotation_ids=[annotation["annotation_id"]], source_fingerprint=fingerprint).model_dump())
    for pair in catalog["leakage_pairs"]:
        records.append(ReviewRecord(record_id=digest(["pair",pair["pair_id"],fingerprint])[:24], record_type="leakage_pair",
                                    image_ids=[pair["left_image_id"],pair["right_image_id"]], annotation_ids=[], pair_id=pair["pair_id"],
                                    source_fingerprint=fingerprint).model_dump())
    return records


def validate_reviews(catalog, records, source_root=None, artifact_root=None):
    if catalog.get("catalog_sha256") != digest({k:v for k,v in catalog.items() if k != "catalog_sha256"}):
        raise ValueError("QA catalog changed")
    if source_root is not None and snapshot(source_root)[1] != catalog["source_fingerprint"]:
        raise ValueError("Source changed since QA generation; old reviews cannot authorize new data")
    if artifact_root is not None:
        for relative,expected_hash in catalog.get("artifacts_sha256",{}).items():
            if file_sha256(local_file(Path(artifact_root).resolve(),relative)) != expected_hash:
                raise ValueError("QA visual/evidence artifact changed")
    expected = {row["record_id"]: row for row in pending_records(catalog)}
    seen, counts = set(), Counter()
    immutable = ("record_id","record_type","image_ids","annotation_ids","pair_id","source_fingerprint")
    annotations = {row["annotation_id"]:row for row in catalog["annotations"]}
    for raw in records:
        review = ReviewRecord.model_validate(raw).model_dump()
        key = review["record_id"]
        if key in seen or key not in expected or any(review[field] != expected[key][field] for field in immutable):
            raise ValueError("Review identity/context duplicated, missing or altered")
        if review["record_type"] == "annotation" and review["decision"] == "accept" and not annotations[review["annotation_ids"][0]]["geometry_valid"]:
            raise ValueError("Invalid geometry requires revision/exclusion, not an accepted conversion proposal")
        if review["negative_verified"]:
            sample = next(s for s in catalog["samples"] if s["image_id"] == review["image_ids"][0])
            if sample["classes"] and sample["classes"] != ["Healthy"]:
                raise ValueError("Disease-labelled images cannot be promoted to verified negatives here")
        seen.add(key); counts[review["decision"]] += 1
    if seen != set(expected):
        raise ValueError("Every image, annotation and leakage pair requires its own review record")
    unresolved = sum(counts[action] for action in ("pending","revise","unresolved"))
    return {"schema_valid":True,"records":len(seen),"decisions":dict(counts),"unresolved_or_revision_records":unresolved,
            "approval_status":"PENDING" if unresolved else "QA_DECISIONS_RECORDED_ONLY",
            "conversion_authorized":False,"training_authorized":False,"groups_applied":False,
            "scope":"Reviewer declarations only; no license/diagnosis/training approval or source modification"}


def main():
    parser = argparse.ArgumentParser(description="Validate a human-edited QA review file; pending never becomes approved.")
    parser.add_argument("--catalog",type=Path,required=True)
    parser.add_argument("--reviews",type=Path,required=True)
    parser.add_argument("--source-root",type=Path,required=True)
    args = parser.parse_args()
    catalog = json.loads(args.catalog.read_text())
    records = [json.loads(line) for line in args.reviews.read_text().splitlines() if line.strip()]
    result = validate_reviews(catalog,records,args.source_root,args.catalog.parent)
    print(json.dumps(result,indent=2))
    return 2 if result["unresolved_or_revision_records"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
