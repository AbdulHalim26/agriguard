"""Read-only mixed-annotation parsing and QA diagnostics, NEVER a training importer.

Only original coordinates are serialized. Envelopes are computed for scalar QA /
selected visual proposals, not emitted as a converted YOLO label dataset.
"""
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
import yaml

from detection.adapter import file_sha256
from .data import digest
from .import_yolo import local_file


def snapshot(root):
    root = Path(root).resolve()
    paths = sorted(root.rglob("*"))
    if any(path.is_symlink() for path in paths):
        raise ValueError("QA source must not contain symlinks")
    files = {path.relative_to(root).as_posix(): file_sha256(path) for path in paths if path.is_file()}
    # Same snapshot convention as the PHASE 1B.0.2 read-only inspection.
    return files, hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()


def points(annotation):
    coords = annotation["coordinates"]
    vertices = list(zip(coords[::2], coords[1::2]))
    return vertices[:-1] if vertices and vertices[-1] == vertices[0] else vertices


def envelope(annotation):
    if not annotation["geometry_valid"]:
        return None
    if annotation["kind"] == "bbox":
        cx, cy, width, height = annotation["coordinates"]
        return (cx-width/2, cy-height/2, cx+width/2, cy+height/2)
    xs, ys = zip(*points(annotation))
    return min(xs), min(ys), max(xs), max(ys)


def intersection_over_union(left, right):
    if left is None or right is None:
        return 0.0
    intersection = max(0., min(left[2],right[2])-max(left[0],right[0])) * max(0., min(left[3],right[3])-max(left[1],right[1]))
    union = (left[2]-left[0])*(left[3]-left[1]) + (right[2]-right[0])*(right[3]-right[1]) - intersection
    return intersection / union if union > 0 else 0.0


def parse_annotation(line, names, label_sha256, image_id, line_number):
    columns = line.split()
    annotation = {"annotation_id": digest([image_id,label_sha256,line_number,line])[:24], "image_id": image_id,
                  "line_number": line_number, "raw_line_sha256": hashlib.sha256(line.encode()).hexdigest(),
                  "source_label_sha256": label_sha256, "kind": "unknown", "coordinates": [],
                  "class_id": None, "class_name": "UNKNOWN", "geometry_valid": False, "issues": [],
                  "annotation_scope": "unresolved", "training_approved": False}
    if len(columns) == 5:
        annotation["kind"] = "bbox"
    elif len(columns) >= 7 and len(columns) % 2 == 1:
        annotation["kind"] = "polygon"
    else:
        annotation["issues"].append("unsupported_row_shape")
        return annotation
    try:
        cid = int(columns[0])
        coords = [float(value) for value in columns[1:]]
        if not 0 <= cid < len(names):
            raise ValueError("unknown_class")
        annotation.update(class_id=cid, class_name=names[cid])
        if not all(math.isfinite(value) for value in coords):
            raise ValueError("nonfinite_coordinates")
        annotation["coordinates"] = coords
        if annotation["kind"] == "bbox":
            cx, cy, width, height = coords
            if width <= 0 or height <= 0 or min(cx-width/2, cy-height/2) < -1e-8 or max(cx+width/2, cy+height/2) > 1+1e-8:
                raise ValueError("invalid_bbox")
        else:
            vertices = points(annotation)
            if len(set(vertices)) < 3 or min(coords) < -1e-8 or max(coords) > 1+1e-8:
                raise ValueError("invalid_polygon_vertices")
            area = abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(vertices,vertices[1:]+vertices[:1]))) / 2
            xs, ys = zip(*vertices)
            envelope_area = (max(xs)-min(xs))*(max(ys)-min(ys))
            if area <= 1e-12 or envelope_area <= 1e-12:
                raise ValueError("degenerate_polygon")
            annotation.update(polygon_area_ratio=area, envelope_area_ratio=envelope_area,
                              envelope_inflation=envelope_area/area, vertex_count=len(vertices))
            if envelope_area / area > 5:
                annotation["issues"].append("large_envelope_inflation_review_hint")
        annotation["geometry_valid"] = True
    except (ValueError, IndexError) as error:
        annotation["issues"].append(str(error))
    return annotation


def scan_mixed(root):
    root = Path(root).resolve()
    files, fingerprint = snapshot(root)
    data = yaml.safe_load(local_file(root,"data.yaml").read_text())
    names = data.get("names")
    if isinstance(names, dict):
        indexed = {int(key):value for key,value in names.items()}
        if sorted(indexed) != list(range(len(indexed))):
            raise ValueError("Noncontiguous source classes")
        names = [indexed[i] for i in range(len(indexed))]
    if not isinstance(names,list) or not names or len(set(names)) != len(names) or data.get("nc",len(names)) != len(names):
        raise ValueError("Invalid source taxonomy")
    image_paths = [path for path in files if "images" in Path(path).parts and Path(path).suffix.lower() in (".jpg",".jpeg",".png")]
    label_paths = {path for path in files if "labels" in Path(path).parts and Path(path).suffix.lower() == ".txt"}
    used, samples, annotations = set(), [], []
    for relative in image_paths:
        parts = list(Path(relative).parts)
        parts[len(parts)-1-parts[::-1].index("images")] = "labels"
        label = Path(*parts).with_suffix(".txt").as_posix()
        local_file(root,label)
        used.add(label)
        image_id = digest([relative,files[relative]])[:24]
        rows = [parse_annotation(line,names,files[label],image_id,n) for n,line in enumerate((root/label).read_text().splitlines(),1) if line.strip()]
        with Image.open(root/relative) as source:
            orientation = source.getexif().get(274,1)
            rgb = ImageOps.exif_transpose(source).convert("RGB")
            rgb.load()
            width,height = rgb.size
            pixels = rgb.tobytes()
            pixel_sha = hashlib.sha256(str(rgb.size).encode()+pixels).hexdigest()
            gray = np.asarray(rgb.convert("L").resize((9,8), Image.Resampling.BILINEAR))
            dhash = 0
            for bit in (gray[:,:-1] > gray[:,1:]).reshape(-1):
                dhash = (dhash << 1) | int(bit)
        kinds = {row["kind"] for row in rows}
        flags = []
        if not rows: flags.append("empty_labels_not_verified_negative")
        if kinds == {"bbox","polygon"}: flags.append("mixed_annotations")
        if orientation not in (None,1): flags.append("orientation_scope_unverified")
        if Path(relative).stem.lower().startswith("aug_"): flags.append("aug_filename_lineage_unverified")
        if any(not row["geometry_valid"] for row in rows): flags.append("invalid_geometry")
        if any(row["class_name"] in ("False-Smut","Narrow-Brown-Spot","Stem-Rot") for row in rows): flags.append("unsupported_diagnosis")
        if any(row["class_name"] == "Healthy" for row in rows): flags.append("healthy_not_disease_or_verified_negative")
        if any(row.get("envelope_inflation",0) > 5 for row in rows): flags.append("large_envelope_inflation_review_hint")
        duplicates = []
        for i,left in enumerate(rows):
            for right in rows[i+1:]:
                if left["class_id"] != right["class_id"] or not left["geometry_valid"] or not right["geometry_valid"]:
                    continue
                iou = intersection_over_union(envelope(left),envelope(right))
                threshold = .8 if left["kind"] != right["kind"] else .95
                if iou >= threshold:
                    duplicates.append({"left":left["annotation_id"],"right":right["annotation_id"],"envelope_iou":iou,
                                       "kind":"bbox_polygon" if left["kind"] != right["kind"] else "same_format",
                                       "status":"POSSIBLE_SHARED_OBJECT_NOT_PROVEN"})
        if duplicates: flags.append("possible_duplicate_object")
        samples.append({"image_id":image_id,"source_image_id":Path(relative).stem,"source_image_path":relative,
                        "source_image_sha256":files[relative],"source_label_path":label,"source_label_sha256":files[label],
                        "split":Path(relative).parts[0],"width":width,"height":height,"exif_orientation":orientation,
                        "dhash64":f"{dhash:016x}","oriented_rgb_sha256":pixel_sha,
                        "annotation_ids":[row["annotation_id"] for row in rows],"flags":flags,
                        "format":"empty" if not kinds else "mixed" if len(kinds)>1 else next(iter(kinds)),
                        "classes":sorted({row["class_name"] for row in rows}),"possible_duplicate_objects":duplicates,
                        "training_approved":False})
        annotations.extend(rows)
    if used != label_paths:
        raise ValueError("Unpaired image/label files require reconciliation before gallery generation")
    return {"source_fingerprint":fingerprint,"source_file_count":len(files),"source_files_sha256":files,
            "source_classes":names,"source_yaml":data,"samples":samples,"annotations":annotations}


def leakage_queue(samples, threshold=4):
    pairs, adjacency = [], defaultdict(set)
    comparisons = 0
    for i,left in enumerate(samples):
        for right in samples[i+1:]:
            if left["split"] == right["split"]: continue
            comparisons += 1
            distance = (int(left["dhash64"],16)^int(right["dhash64"],16)).bit_count()
            if distance > threshold: continue
            a,b = sorted((left["image_id"],right["image_id"]))
            aug = any("aug_filename_lineage_unverified" in row["flags"] for row in (left,right))
            pairs.append({"pair_id":digest([a,b])[:24],"left_image_id":left["image_id"],"right_image_id":right["image_id"],
                          "hamming_distance":distance,"cross_split":True,"aug_filename_hint":aug,
                          "different_source_class_sets":left["classes"] != right["classes"],
                          "exact_oriented_pixels":left["oriented_rgb_sha256"] == right["oriented_rgb_sha256"],
                          "relationship":"unresolved","proposed_group_id":None,"groups_merged":False,
                          "status":"VISUAL_SIMILARITY_CANDIDATE_NOT_ANCESTRY_PROOF"})
            adjacency[a].add(b); adjacency[b].add(a)
    buckets, visited = {}, set()
    for node in sorted(adjacency):
        if node in visited: continue
        stack,members=[node],set()
        while stack:
            item=stack.pop()
            if item in members: continue
            members.add(item); stack.extend(adjacency[item]-members)
        visited.update(members)
        bucket=digest(sorted(members))[:16]
        for member in members: buckets[member]=bucket
    for pair in pairs:
        pair["review_bucket_id"]=buckets[pair["left_image_id"]]
        pair["bucket_semantics"]="HEURISTIC_REVIEW_BUCKET_NOT_TRAINING_GROUP"
    pairs.sort(key=lambda pair:(pair["hamming_distance"],not pair["aug_filename_hint"],not pair["different_source_class_sets"],pair["pair_id"]))
    return pairs,{"threshold":threshold,"cross_split_comparisons":comparisons,"truncated":False,
                  "candidate_pairs":len(pairs),"heuristic_review_buckets":len(set(buckets.values()))}


def sample_features(sample):
    features={f'split:{sample["split"]}',f'resolution:{sample["width"]}x{sample["height"]}',f'format:{sample["format"]}'}
    for name in sample["classes"]:
        features.update((f"class:{name}",f'class_split:{name}:{sample["split"]}',f'class_format:{name}:{sample["format"]}',
                         f'class_resolution:{name}:{sample["width"]}x{sample["height"]}'))
    return features


def select_samples(samples,pairs,limit=96):
    if limit < 1: raise ValueError("Positive visual proposal sample limit required")
    by_id={row["image_id"]:row for row in samples}
    chosen=[]
    def add(identifier):
        if identifier not in chosen and len(chosen)<limit: chosen.append(identifier)
    for sample in samples:
        if "invalid_geometry" in sample["flags"] or sample["format"]=="empty": add(sample["image_id"])
    seen_buckets=set()
    for pair in pairs:
        if pair["review_bucket_id"] not in seen_buckets and len(seen_buckets)<10:
            add(pair["left_image_id"]); add(pair["right_image_id"])
            seen_buckets.add(pair["review_bucket_id"])
    all_features=set().union(*(sample_features(row) for row in samples)) if samples else set()
    uncovered=all_features-set().union(*(sample_features(by_id[i]) for i in chosen)) if chosen else all_features.copy()
    priority={row["image_id"]:100*("invalid_geometry" in row["flags"])+30*("mixed_annotations" in row["flags"])+
              20*("possible_duplicate_object" in row["flags"])+15*("unsupported_diagnosis" in row["flags"])+
              15*("large_envelope_inflation_review_hint" in row["flags"])+10*("aug_filename_lineage_unverified" in row["flags"])
              for row in samples}
    remaining={row["image_id"] for row in samples}-set(chosen)
    while uncovered and remaining and len(chosen)<limit:
        best=max(sorted(remaining),key=lambda i:(len(sample_features(by_id[i])&uncovered),priority[i]))
        add(best); remaining.remove(best); uncovered-=sample_features(by_id[best])
    for identifier in sorted(remaining,key=lambda i:(-priority[i],i)): add(identifier)
    return chosen,{"feature_count":len(all_features),"uncovered_features":sorted(uncovered),
                   "semantics":"Deterministic representative visual selection, not statistical acceptance or a dataset split"}
