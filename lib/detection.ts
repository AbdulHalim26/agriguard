import { z } from 'zod'

export const RICE_DETECTION_CLASSES = [
  'leaf_blast', 'bacterial_leaf_blight', 'brown_spot', 'sheath_blight',
  'tungro_symptom', 'leaf_folder_damage',
] as const

export const RICE_V1_9CLASS_NAMES = [
  'Bacterial-Leaf-Blight',
  'Brown-Spot',
  'False-Smut',
  'Healthy',
  'Narrow-Brown-Spot',
  'Rice-Blast',
  'Sheath-Blight',
  'Stem-Rot',
  'Tungro-Virus',
] as const

export const ALL_DETECTION_CLASS_NAMES = [
  ...RICE_DETECTION_CLASSES,
  ...RICE_V1_9CLASS_NAMES,
] as const

export type DetectionClassInterpretation = {
  kind: 'healthy_indicator' | 'disease_indicator'
  displayName: string
  note: string
  canonicalHint: (typeof RICE_DETECTION_CLASSES)[number] | null
}

export function interpretDetectionClass(className: string): DetectionClassInterpretation {
  if (className === 'Healthy') {
    return {
      kind: 'healthy_indicator',
      displayName: 'Healthy',
      note: 'Indikasi visual daun sehat (bukan bukti kerusakan, tetap perlu tinjauan PPL)',
      canonicalHint: null,
    }
  }
  const canonicalMap: Record<string, (typeof RICE_DETECTION_CLASSES)[number]> = {
    'Rice-Blast': 'leaf_blast',
    'Bacterial-Leaf-Blight': 'bacterial_leaf_blight',
    'Brown-Spot': 'brown_spot',
    'Sheath-Blight': 'sheath_blight',
    'Tungro-Virus': 'tungro_symptom',
  }
  return {
    kind: 'disease_indicator',
    displayName: className.replaceAll('_', ' ').replaceAll('-', ' '),
    note: 'Indikasi visual gejala (bukan diagnosis final)',
    canonicalHint: canonicalMap[className] ?? null,
  }
}

const finite = z.number().finite()
const probability = finite.min(0).max(1)
export const bboxSchema = z.tuple([finite, finite, finite, finite]).refine(
  ([x1, y1, x2, y2]) => x1 >= 0 && y1 >= 0 && x2 > x1 && y2 > y1, 'Invalid xyxy box'
)
export const objectDetectionSchema = z.object({
  class_id: z.number().int().min(0).max(Math.max(RICE_DETECTION_CLASSES.length, RICE_V1_9CLASS_NAMES.length) - 1),
  class_name: z.enum(ALL_DETECTION_CLASS_NAMES),
  annotation_level: z.enum(['lesion', 'leaf']),
  confidence: probability,
  bbox_xyxy: bboxSchema,
}).strict().refine((d) =>
  (RICE_DETECTION_CLASSES[d.class_id] === d.class_name) ||
  (RICE_V1_9CLASS_NAMES[d.class_id] === d.class_name),
  'Class ID/name mismatch'
)

export const detectionResponseSchema = z.object({
  model_version: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
  model_family: z.enum(['yolov8n', 'yolo26n', 'yolo26s']),
  image_width: z.number().int().min(1).max(16384),
  image_height: z.number().int().min(1).max(16384),
  detections: z.array(objectDetectionSchema).max(300),
  inference_status: z.enum(['SUCCESS', 'NO_DETECTIONS']),
  severity_status: z.literal('REVIEW_REQUIRED'),
  // Existing names remain explicit NULL until an expert-calibrated policy exists.
  status: z.null(), confidence: z.null(), damage_pct: z.null(),
  severity: z.object({
    review_required: z.literal(true),
    reason: z.enum(['UNCALIBRATED_BOX_COVERAGE', 'NO_DETECTIONS_NOT_HEALTHY']),
    calibration_id: z.null(),
    area_metrics: z.object({
      lesion_box_union_px: finite.min(0), leaf_box_union_px: finite.min(0),
      lesion_leaf_box_intersection_px: finite.min(0),
      lesion_image_box_coverage_ratio: probability,
      lesion_leaf_box_coverage_ratio: probability.nullable(),
    }).strict(),
  }).strict(),
  provenance: z.object({
    source: z.literal('onnxruntime'),
    label_schema: z.enum(['rice_detection_v1', 'rice_v1_9class']),
    coordinate_convention: z.literal('xyxy_pixels_exif_oriented'),
    preprocessing: z.literal('rgb_letterbox_114_bilinear_div255'),
    output_format: z.enum(['raw_cxcywh_bcn', 'end2end_xyxy']),
    postprocessing: z.enum(['class_aware_nms', 'nms_free']),
    model_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    image_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    dataset_manifest_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    confidence_threshold: probability.refine((v) => v > 0),
    iou_threshold: probability.refine((v) => v > 0).nullable(),
    inference_ms: finite.min(0), persistence: z.literal('preview_only'),
  }).strict(),
}).strict().superRefine((response, ctx) => {
  const nonempty = response.detections.length > 0
  if (nonempty !== (response.inference_status === 'SUCCESS') || response.severity.reason !==
      (nonempty ? 'UNCALIBRATED_BOX_COVERAGE' : 'NO_DETECTIONS_NOT_HEALTHY')) {
    ctx.addIssue({ code: 'custom', message: 'Inconsistent detection/review status' })
  }
  const schemaClasses: readonly string[] = response.provenance.label_schema === 'rice_v1_9class'
    ? RICE_V1_9CLASS_NAMES
    : RICE_DETECTION_CLASSES
  if (response.detections.some((d) => schemaClasses[d.class_id] !== d.class_name)) {
    ctx.addIssue({ code: 'custom', message: 'Detection class does not match label_schema' })
  }
  if (response.detections.some((d) => d.bbox_xyxy[2] > response.image_width || d.bbox_xyxy[3] > response.image_height)) {
    ctx.addIssue({ code: 'custom', message: 'Box outside original image' })
  }
  const free = response.provenance.output_format === 'end2end_xyxy'
  if (response.provenance.postprocessing !== (free ? 'nms_free' : 'class_aware_nms') ||
      (free ? response.provenance.iou_threshold !== null : response.provenance.iou_threshold === null)) {
    ctx.addIssue({ code: 'custom', message: 'Inconsistent exported head/postprocessing' })
  }
})

export type DetectionResponse = z.infer<typeof detectionResponseSchema>
export type ObjectDetection = z.infer<typeof objectDetectionSchema>
export type BoundingBox = z.infer<typeof bboxSchema>

export function isYoloEnabled(value?: string): boolean { return value?.trim().toLowerCase() === 'true' }

export function imageDimensionsMatch(actualWidth: number, actualHeight: number, expectedWidth: number, expectedHeight: number) {
  return [actualWidth, actualHeight, expectedWidth, expectedHeight].every((n) => Number.isFinite(n) && n > 0) &&
    actualWidth === expectedWidth && actualHeight === expectedHeight
}

// Container uses exactly the image aspect ratio + object-contain (no cropping).
// Percentages scale independently along the two original image axes.
export function boxPercentages(box: BoundingBox, width: number, height: number) {
  const parsed = bboxSchema.parse(box)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || parsed[2] > width || parsed[3] > height) {
    throw new Error('Invalid image dimensions/box')
  }
  return { left: 100 * box[0] / width, top: 100 * box[1] / height,
    width: 100 * (box[2] - box[0]) / width, height: 100 * (box[3] - box[1]) / height }
}
