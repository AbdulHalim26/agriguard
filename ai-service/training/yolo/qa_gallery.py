"""Offline QA package: originals, annotations, SELECTED visual proposals, no labels.

No server, network, model inference, approval, group mutation or dataset conversion.
"""
import argparse
import csv
import html
import json
import math
import re
import shutil
import tempfile
import textwrap
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from detection.adapter import file_sha256
from detection.contracts import CLASS_NAMES
from .data import digest, write_json
from .import_yolo import local_file, output_slot
from .qa_mixed import envelope, leakage_queue, points, scan_mixed, select_samples, snapshot
from .qa_review import pending_records, validate_reviews

BLUE,GREEN,ORANGE = "#2563eb","#15803d","#ea580c"
STYLE = """body{font:15px system-ui,sans-serif;color:#163126;background:#f6f9f6;margin:24px;max-width:1600px}a{color:#1456a0}h1,h2{color:#166534}.warning{background:#fff3cd;padding:12px;border:1px solid #c89c21}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.card{background:white;padding:12px;border:1px solid #cdd9cd;border-radius:8px;overflow-wrap:anywhere}.canvas{position:relative;max-width:420px}.canvas img{width:100%;height:auto;display:block}.canvas svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}table{border-collapse:collapse;width:100%;background:white}td,th{border:1px solid #cdd9cd;padding:6px;text-align:left;overflow-wrap:anywhere}code{font-size:12px}img{max-width:100%}.legend{padding:10px;background:#eef5ee}.small{font-size:12px}section{margin:20px 0}"""


def e(value): return html.escape(str(value),quote=True)


def document(title,body):
    return f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(title)}</title><style>{STYLE}</style><body>{body}</body></html>'


def svg(sample,annotations,proposals=False):
    if "orientation_scope_unverified" in sample["flags"]:
        return ""
    width,height=sample["width"],sample["height"]
    shapes=[]
    for annotation in annotations:
        box=envelope(annotation)
        if box is None: continue
        x1,y1,x2,y2=box
        x1,x2,y1,y2=x1*width,x2*width,y1*height,y2*height
        title=e(f'L{annotation["line_number"]} c{annotation["class_id"]} {annotation["class_name"]} / {annotation["annotation_id"]}')
        if annotation["kind"]=="bbox":
            shapes.append(f'<rect x="{x1}" y="{y1}" width="{x2-x1}" height="{y2-y1}" stroke="{BLUE}" stroke-width="1.5" fill="none"><title>{title}</title></rect>')
        elif proposals:
            shapes.append(f'<rect x="{x1}" y="{y1}" width="{x2-x1}" height="{y2-y1}" stroke="{ORANGE}" stroke-dasharray="5 3" stroke-width="1.5" fill="none"><title>PROPOSAL ONLY {title}</title></rect>')
        else:
            vertices=" ".join(f"{x*width},{y*height}" for x,y in points(annotation))
            shapes.append(f'<polygon points="{vertices}" stroke="{GREEN}" stroke-width="1.5" fill="{GREEN}" fill-opacity="0.08"><title>{title}</title></polygon>')
        color=ORANGE if proposals and annotation["kind"]=="polygon" else BLUE if annotation["kind"]=="bbox" else GREEN
        shapes.append(f'<text x="{max(0,min(x1,width-35))}" y="{max(10,min(y1+10,height-2))}" fill="{color}" stroke="white" stroke-width="0.5" paint-order="stroke" font-size="10">L{annotation["line_number"]}/c{annotation["class_id"]}</text>')
    return f'<svg viewBox="0 0 {width} {height}" preserveAspectRatio="xMidYMid meet" aria-label="Original annotations or unapproved visual proposals">'+"".join(shapes)+"</svg>"


def image_panel(sample,annotations,title,mode):
    overlay="" if mode=="original" else svg(sample,annotations,mode=="proposal")
    return f'<div class="card"><h3>{e(title)}</h3><div class="canvas"><img src="../{e(sample["source_copy_path"])}" alt="Original source image">{overlay}</div></div>'


def dashed_rectangle(draw,box,color,dash=6):
    x1,y1,x2,y2=box
    for start,end,y in ((x1,x2,y1),(x1,x2,y2)):
        for x in range(round(start),round(end)+1,dash*2): draw.line((x,y,min(x+dash,end),y),fill=color,width=2)
    for start,end,x in ((y1,y2,x1),(y1,y2,x2)):
        for y in range(round(start),round(end)+1,dash*2): draw.line((x,y,x,min(y+dash,end)),fill=color,width=2)


def contact_tile(root,sample,annotations):
    tile=Image.new("RGB",(340,430),"white")
    font=ImageFont.load_default(size=13)
    with Image.open(root/sample["source_copy_path"]) as source:
        view=ImageOps.contain(ImageOps.exif_transpose(source).convert("RGB"),(320,280))
    draw=ImageDraw.Draw(view)
    if "orientation_scope_unverified" not in sample["flags"]:
        for annotation in annotations:
            box=envelope(annotation)
            if box is None: continue
            scaled=tuple(value*(view.width if i%2==0 else view.height) for i,value in enumerate(box))
            if annotation["kind"]=="bbox": draw.rectangle(scaled,outline=BLUE,width=2)
            else:
                vertices=[(x*view.width,y*view.height) for x,y in points(annotation)]
                draw.line(vertices+vertices[:1],fill=GREEN,width=2)
                dashed_rectangle(draw,scaled,ORANGE)
            draw.text((max(0,scaled[0]),max(0,scaled[1])),f'L{annotation["line_number"]}',font=font,fill=BLUE if annotation["kind"]=="bbox" else GREEN,stroke_width=1,stroke_fill="white")
    tile.paste(view,((340-view.width)//2,8))
    draw=ImageDraw.Draw(tile)
    caption=(f'{sample["image_id"][:12]} | {sample["split"]} | {sample["format"]}\n'
             +"\n".join(textwrap.wrap(sample["source_image_id"],width=43)[:3])+"\n"
             +"\n".join(textwrap.wrap(", ".join(sample["classes"]) or "EMPTY - NOT VERIFIED NEGATIVE",width=43)[:2])+"\nPROPOSALS ONLY / PENDING REVIEW")
    draw.multiline_text((8,295),caption,font=font,fill="#163126",spacing=2)
    return tile


def mapping_proposals(names):
    path=Path(__file__).with_name("sources")/"ricedisease.proposal.json"
    proposal=json.loads(path.read_text())
    return [{"source_class_id":i,"source_name":name,
             "canonical_class_id":proposal["mappings"].get(name,{}).get("canonical_class_id"),
             "canonical_class_name":proposal["mappings"].get(name,{}).get("canonical_class_name"),
             "proposed_action":proposal["mappings"].get(name,{}).get("action","exclude_image"),
             "status":"PROPOSAL_NOT_APPROVED","training_approved":False} for i,name in enumerate(names)]


def build_gallery(source_root,output,limit=96,archive_evidence=None,expected_source_sha256=None,expected_pair_count=None):
    source_root,output=output_slot(source_root,output)
    catalog=scan_mixed(source_root)
    if expected_source_sha256 and catalog["source_fingerprint"]!=expected_source_sha256:
        raise ValueError("Source fingerprint differs from the inspected dataset")
    pairs,pair_summary=leakage_queue(catalog["samples"])
    if expected_pair_count is not None and len(pairs)!=expected_pair_count:
        raise ValueError("Candidate-pair count changed; investigate without forcing source/group changes")
    if archive_evidence:
        if not re.fullmatch(r"[a-f0-9]{64}",archive_evidence.get("zip_sha256","")) or archive_evidence.get("zip_integrity")!="PASS_REPORTED_BY_OWNER":
            raise ValueError("Explicit owner-verified ZIP identity/integrity evidence required")
        if any(archive_evidence.get(key,False) is not False for key in ("license_approved","annotations_approved","conversion_approved")):
            raise ValueError("ZIP integrity evidence is not annotation/license/conversion approval")
        if archive_evidence.get("zip_image_count")!=len(catalog["samples"]) or archive_evidence.get("zip_file_count")!=catalog["source_file_count"]:
            raise ValueError("Extracted-source inventory disagrees with owner-verified ZIP evidence")
    selected,coverage=select_samples(catalog["samples"],pairs,limit)
    proposals=mapping_proposals(catalog["source_classes"])
    represented={row["canonical_class_id"] for row in proposals if row["canonical_class_id"] is not None}
    catalog.update(schema_version=1,created_at=datetime.now(timezone.utc).isoformat(),leakage_pairs=pairs,
                   leakage_summary=pair_summary,selected_visual_proposals=selected,representative_coverage=coverage,
                   archive_evidence=archive_evidence,taxonomy_proposals=proposals,
                   missing_canonical_classes=[{"class_id":cid,"class_name":name,"status":"MISSING_SOURCE_DATA"} for cid,name in enumerate(CLASS_NAMES) if cid not in represented],
                   upstream_metadata_discrepancy={"status":"UNRESOLVED_UPSTREAM_METADATA_DISCREPANCY" if archive_evidence else "NOT_ASSESSED",
                                                 "readme_images":archive_evidence.get("readme_declared_image_count") if archive_evidence else None,
                                                 "actual_images":len(catalog["samples"]),"extraction_failure":False if archive_evidence else None},
                   conversion_policy_status="DRAFT_NOT_APPROVED",training_approved=False,conversion_approved=False,groups_applied=False)
    by_image={sample["image_id"]:sample for sample in catalog["samples"]}
    annotations_by_image={key:[] for key in by_image}
    for row in catalog["annotations"]: annotations_by_image[row["image_id"]].append(row)
    records=pending_records(catalog)
    by_context={row["annotation_ids"][0] if row["record_type"]=="annotation" else row["pair_id"] if row["record_type"]=="leakage_pair" else row["image_ids"][0]:row["record_id"] for row in records}
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".qa-gallery-",dir=output.parent) as temporary:
        root=Path(temporary)/"package"
        for name in ("source-images","samples","pairs","contact-sheets"): (root/name).mkdir(parents=True)
        for sample in catalog["samples"]:
            key=sample["image_id"]
            sample["source_copy_path"]=f'source-images/{key}{Path(sample["source_image_path"]).suffix.lower()}'
            shutil.copyfile(local_file(source_root,sample["source_image_path"]),root/sample["source_copy_path"])
            if file_sha256(root/sample["source_copy_path"])!=sample["source_image_sha256"]:
                raise ValueError("Source image changed while building QA package")
            annotations=annotations_by_image[key]
            panels=image_panel(sample,annotations,"Original pixels","original")+image_panel(sample,annotations,"Existing bbox + polygon","existing")
            if key in selected: panels+=image_panel(sample,annotations,"PROPOSED polygon envelopes - NOT converted labels","proposal")
            rows=[]
            for annotation in annotations:
                rows.append(f'<tr id="{annotation["annotation_id"]}"><td>L{annotation["line_number"]}<br><code>{annotation["annotation_id"]}</code></td><td>{e(annotation["class_name"])} (source {annotation["class_id"]})</td><td>{e(annotation["kind"])}</td><td>{annotation.get("envelope_inflation",0):.3f}x if polygon</td><td>{e(", ".join(annotation["issues"]))}</td><td><code>{by_context[annotation["annotation_id"]]}</code></td></tr>')
            body=(f'<a href="../index.html">Index</a><h1>{e(sample["source_image_id"])}</h1>'
                  f'<p>Image ID <code>{key}</code> | source <code>{e(sample["source_image_path"])}</code> | {sample["width"]}x{sample["height"]} | split {e(sample["split"])}</p>'
                  f'<p class="warning">PENDING / QA only. Flags: {e(", ".join(sample["flags"]) or "No automated flags; visual review still required")}</p>'
                  f'<p class="legend"><span style="color:{BLUE}">Blue solid = existing bbox</span> | <span style="color:{GREEN}">Green = existing polygon</span> | <span style="color:{ORANGE}">Orange dashed = unapproved envelope proposal</span>. L = original label line.</p>'
                  f'<p>Image review record: <code>{by_context[key]}</code>; original image SHA-256 <code>{sample["source_image_sha256"]}</code></p>'
                  f'<div class="grid">{panels}</div><h2>Original annotation references</h2><table><tr><th>Line / annotation ID</th><th>Source class</th><th>Format</th><th>Envelope inflation diagnostic</th><th>Flags</th><th>Review record ID</th></tr>'+"".join(rows)+"</table>")
            (root/"samples"/f"{key}.html").write_text(document("Source annotation QA",body))
        pair_pages=[]
        for start in range(0,len(pairs),20):
            name=f"page-{start//20+1:03d}.html"
            pair_pages.append(name)
            cards=[]
            for pair in pairs[start:start+20]:
                photos=""
                for side in ("left_image_id","right_image_id"):
                    sample=by_image[pair[side]]
                    photos+=f'<div><a href="../samples/{sample["image_id"]}.html"><img loading="lazy" src="../{sample["source_copy_path"]}" alt="Source image for lineage review"></a><p>{e(sample["source_image_id"])}<br>{e(sample["split"])} | {e(", ".join(sample["classes"]))}</p></div>'
                cards.append(f'<section class="card" id="{pair["pair_id"]}"><h2>Distance {pair["hamming_distance"]} | pair {pair["pair_id"]}</h2><p>Review bucket {pair["review_bucket_id"]} is NOT a training group. aug_ hint: {pair["aug_filename_hint"]}. Different source class sets: {pair["different_source_class_sets"]}.</p><div class="grid">{photos}</div><p>Relationship UNRESOLVED; group not applied. Review record <code>{by_context[pair["pair_id"]]}</code></p></section>')
            nav=" | ".join(f'<a href="page-{i+1:03d}.html">{i+1}</a>' for i in range(math.ceil(len(pairs)/20)))
            (root/"pairs"/name).write_text(document("Cross-split similarity review",f'<a href="../index.html">Index</a><h1>Similarity candidates, NOT proven ancestry</h1><p class="warning">No automatic grouping, exclusions or split changes.</p><p>{nav}</p>'+"".join(cards)))
        sheets=[]
        for start in range(0,len(selected),12):
            sheet=Image.new("RGB",(1360,1290),"#edf5ed")
            for slot,key in enumerate(selected[start:start+12]): sheet.paste(contact_tile(root,by_image[key],annotations_by_image[key]),((slot%4)*340,(slot//4)*430))
            name=f"contact-sheets/sheet-{start//12+1:02d}.jpg"
            sheet.save(root/name,quality=90)
            sheets.append(name)
        with (root/"leakage_queue.csv").open("x",newline="") as handle:
            fields=("pair_id","left_image_id","right_image_id","hamming_distance","review_bucket_id","aug_filename_hint","different_source_class_sets","relationship","proposed_group_id","groups_merged")
            writer=csv.DictWriter(handle,fieldnames=fields); writer.writeheader()
            for pair in pairs: writer.writerow({field:pair[field] for field in fields})
        catalog["contact_sheets"]=sheets
        catalog["pair_pages"]=pair_pages
        summary={"images":len(catalog["samples"]),"annotations":len(catalog["annotations"]),"polygon_annotations":sum(a["kind"]=="polygon" for a in catalog["annotations"]),
                 "bbox_annotations":sum(a["kind"]=="bbox" for a in catalog["annotations"]),"candidate_pairs":len(pairs),"selected_visual_proposals":len(selected),
                 "pending_review_records":len(records),"contact_sheets":len(sheets),"uncovered_features":coverage["uncovered_features"],
                 "possible_object_duplicate_pairs":sum(len(s["possible_duplicate_objects"]) for s in catalog["samples"]),
                 "images_with_possible_object_duplicates":sum(bool(s["possible_duplicate_objects"]) for s in catalog["samples"]),
                 "high_inflation_polygons_gt5x":sum(a.get("envelope_inflation",0)>5 for a in catalog["annotations"]),
                 "all_approvals":False,"source_fingerprint":catalog["source_fingerprint"]}
        details="".join(f'<li><a href="samples/{key}.html">{e(by_image[key]["source_image_id"])}</a> | {e(", ".join(by_image[key]["flags"]))}</li>' for key in selected)
        body=('<h1>AgriGuard - mixed annotation QA</h1><p class="warning">All reviews PENDING. Visual envelopes are proposals only, not converted labels. No license, diagnosis, negative, mapping or training approval.</p><p><a href="review-policy.md">Read the DRAFT review/conversion policy</a></p>'
              f'<p>Blue existing bbox / green existing polygon / orange dashed envelope proposal. {len(catalog["samples"])} original image copies; {len(selected)} representative proposal previews.</p>'
              '<h2>Summary</h2><pre>'+e(json.dumps(summary,indent=2))+'</pre><h2>Archive / upstream discrepancy</h2><pre>'+e(json.dumps(archive_evidence,indent=2))+'</pre>'
              '<h2>Contact sheets</h2>'+"".join(f'<a href="{name}"><img loading="lazy" src="{name}" alt="Representative annotation contact sheet" style="max-width:680px"></a>' for name in sheets)
              +'<h2>Leakage candidate queue</h2><p><a href="leakage_queue.csv">All pairs CSV (unresolved)</a></p>'+" | ".join(f'<a href="pairs/{name}">{name}</a>' for name in pair_pages)
              +'<h2>Representative samples</h2><ul>'+details+'</ul><h2>Review files</h2><p><a href="reviews.pending.jsonl">Pending records</a> | <a href="qa_catalog.json">Original annotation catalog/provenance</a></p>')
        (root/"index.html").write_text(document("AgriGuard local QA",body))
        policy=Path(__file__).resolve().parents[3]/"docs"/"MIXED-ANNOTATION-QA-1B003.md"
        if not policy.is_file():
            raise ValueError("Versioned human-review policy missing from repository")
        shutil.copyfile(policy,root/"review-policy.md")
        catalog["artifacts_sha256"]={path.relative_to(root).as_posix():file_sha256(path) for path in sorted(root.rglob("*")) if path.is_file()}
        if snapshot(source_root)[1]!=catalog["source_fingerprint"]:
            raise ValueError("Immutable source changed during QA generation")
        catalog["source_unchanged_during_generation"]=True
        catalog["catalog_sha256"]=digest(catalog)
        write_json(root/"qa_catalog.json",catalog)
        with (root/"reviews.pending.jsonl").open("x") as handle:
            for record in records: handle.write(json.dumps(record,allow_nan=False)+"\n")
        validation=validate_reviews(catalog,records)
        if validation["approval_status"]!="PENDING" or not validation["unresolved_or_revision_records"]:
            raise ValueError("Generated QA package must not contain resolved/approved decisions")
        write_json(root/"qa_summary.json",summary|{"review_validation":validation})
        root.rename(output)
    return summary|{"output":str(output),"source_unchanged":True}


def main():
    parser=argparse.ArgumentParser(description="Build LOCAL read-only visual QA artifacts, not a converted dataset.")
    parser.add_argument("--source-root",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--samples",type=int,default=96)
    parser.add_argument("--archive-evidence",type=Path)
    parser.add_argument("--expected-source-sha256")
    parser.add_argument("--expected-pair-count",type=int)
    args=parser.parse_args()
    evidence=json.loads(args.archive_evidence.read_text()) if args.archive_evidence else None
    print(json.dumps(build_gallery(args.source_root,args.output,args.samples,evidence,args.expected_source_sha256,args.expected_pair_count),indent=2))


if __name__=="__main__":
    main()
