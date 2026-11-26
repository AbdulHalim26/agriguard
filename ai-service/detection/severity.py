"""Geometric evidence only. No confidence-to-damage or healthy-by-default rule."""
from typing import Protocol, Sequence

from .contracts import AreaMetrics, Detection, SeverityReview

Box = tuple[float, float, float, float]


def union_area(boxes: Sequence[Box]) -> float:
    """Exact rectangle union by x sweep; overlapping annotations count once."""
    xs = sorted({edge for box in boxes for edge in (box[0], box[2])})
    area = 0.0
    for left, right in zip(xs, xs[1:]):
        intervals = sorted((y1, y2) for x1, y1, x2, y2 in boxes if x1 < right and x2 > left)
        height, end = 0.0, float("-inf")
        for y1, y2 in intervals:
            height += max(0.0, y2 - max(y1, end))
            end = max(end, y2)
        area += (right - left) * height
    return area


class SeverityEngine(Protocol):
    """Future expert-calibrated policies can replace the review-only engine.

    A calibrated policy must carry an expert-reviewed calibration ID and a
    versioned contract; none is registered or inferred from confidence here.
    """
    def __call__(self, detections: Sequence[Detection], width: int, height: int) -> SeverityReview: ...


def review_severity(detections: Sequence[Detection], width: int, height: int) -> SeverityReview:
    if width <= 0 or height <= 0:
        raise ValueError("Positive image dimensions required")
    # Healthy is never counted as lesion damage coverage.
    lesions = [d.bbox_xyxy for d in detections if d.annotation_level == "lesion" and d.class_name != "Healthy"]
    leaves = [d.bbox_xyxy for d in detections if d.annotation_level == "leaf"]
    intersections = []
    for a in lesions:
        for b in leaves:
            box = (max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3]))
            if box[2] > box[0] and box[3] > box[1]:
                intersections.append(box)
    lesion_area, leaf_area, intersection = union_area(lesions), union_area(leaves), union_area(intersections)
    return SeverityReview(
        reason="UNCALIBRATED_BOX_COVERAGE" if detections else "NO_DETECTIONS_NOT_HEALTHY",
        area_metrics=AreaMetrics(
            lesion_box_union_px=lesion_area, leaf_box_union_px=leaf_area,
            lesion_leaf_box_intersection_px=intersection,
            lesion_image_box_coverage_ratio=min(1.0, lesion_area / (width * height)),
            lesion_leaf_box_coverage_ratio=min(1.0, intersection / leaf_area) if leaf_area else None,
        ),
    )
