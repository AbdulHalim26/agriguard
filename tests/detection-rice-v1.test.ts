import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  RICE_V1_9CLASS_NAMES,
  detectionResponseSchema,
  interpretDetectionClass,
} from '@/lib/detection'
import { DetectionBoxLayer, DetectionPanel } from '@/components/features/DetectionOverlay'

const SHA = 'a'.repeat(64)

function sample9ClassResponse(detections: any[]) {
  return {
    model_version: 'yolov8n-rice-v1-2p',
    model_family: 'yolov8n',
    image_width: 300,
    image_height: 300,
    detections,
    inference_status: detections.length > 0 ? 'SUCCESS' : 'NO_DETECTIONS',
    severity_status: 'REVIEW_REQUIRED',
    status: null,
    confidence: null,
    damage_pct: null,
    severity: {
      review_required: true,
      reason: detections.length > 0 ? 'UNCALIBRATED_BOX_COVERAGE' : 'NO_DETECTIONS_NOT_HEALTHY',
      calibration_id: null,
      area_metrics: {
        lesion_box_union_px: detections.some((d) => d.class_name !== 'Healthy') ? 1200 : 0,
        leaf_box_union_px: detections.some((d) => d.class_name === 'Healthy') ? 1500 : 0,
        lesion_leaf_box_intersection_px: 0,
        lesion_image_box_coverage_ratio: detections.some((d) => d.class_name !== 'Healthy') ? 0.013 : 0,
        lesion_leaf_box_coverage_ratio: null,
      },
    },
    provenance: {
      source: 'onnxruntime',
      label_schema: 'rice_v1_9class',
      coordinate_convention: 'xyxy_pixels_exif_oriented',
      preprocessing: 'rgb_letterbox_114_bilinear_div255',
      output_format: 'raw_cxcywh_bcn',
      postprocessing: 'class_aware_nms',
      model_sha256: SHA,
      image_sha256: SHA,
      dataset_manifest_sha256: SHA,
      confidence_threshold: 0.25,
      iou_threshold: 0.45,
      inference_ms: 39.5,
      persistence: 'preview_only',
    },
  }
}

test('detectionResponseSchema accepts yolov8n + rice_v1_9class and rejects cross-schema mismatch', () => {
  assert.equal(RICE_V1_9CLASS_NAMES.length, 9)
  const valid = detectionResponseSchema.parse(sample9ClassResponse([
    { class_id: 0, class_name: 'Bacterial-Leaf-Blight', annotation_level: 'lesion', confidence: 0.79, bbox_xyxy: [15, 1, 292, 298] },
    { class_id: 3, class_name: 'Healthy', annotation_level: 'leaf', confidence: 0.64, bbox_xyxy: [10, 10, 120, 120] },
  ]))
  assert.equal(valid.model_family, 'yolov8n')
  assert.equal(valid.detections.length, 2)

  // Cross-schema mismatch (6-class name inside rice_v1_9class) must be rejected
  assert.throws(() => detectionResponseSchema.parse(sample9ClassResponse([
    { class_id: 0, class_name: 'leaf_blast', annotation_level: 'lesion', confidence: 0.7, bbox_xyxy: [10, 10, 100, 100] },
  ])))
})

test('interpretDetectionClass separates Healthy (non-damage) from visual disease indications', () => {
  const healthy = interpretDetectionClass('Healthy')
  assert.equal(healthy.kind, 'healthy_indicator')
  assert.equal(healthy.canonicalHint, null)
  assert.match(healthy.note, /bukan bukti kerusakan/i)

  const blb = interpretDetectionClass('Bacterial-Leaf-Blight')
  assert.equal(blb.kind, 'disease_indicator')
  assert.equal(blb.canonicalHint, 'bacterial_leaf_blight')

  const smut = interpretDetectionClass('False-Smut')
  assert.equal(smut.kind, 'disease_indicator')
  assert.equal(smut.canonicalHint, null)
})

test('DetectionBoxLayer and DetectionPanel render 9-class boxes, Healthy note, and NO_DETECTIONS state', () => {
  const parsed = detectionResponseSchema.parse(sample9ClassResponse([
    { class_id: 0, class_name: 'Bacterial-Leaf-Blight', annotation_level: 'lesion', confidence: 0.79, bbox_xyxy: [15, 1, 292, 298] },
    { class_id: 3, class_name: 'Healthy', annotation_level: 'leaf', confidence: 0.64, bbox_xyxy: [10, 10, 120, 120] },
  ]))
  const layerHtml = renderToStaticMarkup(React.createElement(DetectionBoxLayer, { detections: parsed.detections, width: 300, height: 300 }))
  assert.match(layerHtml, /Bacterial-Leaf-Blight · 79%/)
  assert.match(layerHtml, /Healthy · 64%/)

  const panelHtml = renderToStaticMarkup(React.createElement(DetectionPanel, { result: parsed, loading: false, error: null }))
  assert.match(panelHtml, /yolov8n · yolov8n-rice-v1-2p/)
  assert.match(panelHtml, /REVIEW_REQUIRED/)
  assert.match(panelHtml, /bukan bukti kerusakan/)

  const emptyParsed = detectionResponseSchema.parse(sample9ClassResponse([]))
  const emptyHtml = renderToStaticMarkup(React.createElement(DetectionPanel, { result: emptyParsed, loading: false, error: null }))
  assert.match(emptyHtml, /Tidak ada objek terdeteksi/)
})

test('PHASE 2.0R.3: UNSUPPORTED_IMAGE contract, classifier suppression, and mobile height-capped overlay', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const unsupportedBase = {
    ...sample9ClassResponse([]),
    inference_status: 'UNSUPPORTED_IMAGE' as const,
    severity: {
      ...sample9ClassResponse([]).severity,
      reason: 'UNSUPPORTED_NON_RICE_IMAGE' as const,
    },
  }
  const parsedUnsupported = detectionResponseSchema.parse(unsupportedBase)
  assert.equal(parsedUnsupported.inference_status, 'UNSUPPORTED_IMAGE')
  assert.equal(parsedUnsupported.detections.length, 0)

  // UNSUPPORTED_IMAGE with any detection box must fail contract validation
  assert.throws(() => detectionResponseSchema.parse({
    ...unsupportedBase,
    detections: [
      { class_id: 5, class_name: 'Rice-Blast', annotation_level: 'lesion', confidence: 0.26, bbox_xyxy: [10, 10, 100, 100] },
    ],
  }))

  // DetectionPanel renders UNSUPPORTED_IMAGE warning without disease labels
  const unsupportedHtml = renderToStaticMarkup(
    React.createElement(DetectionPanel, { result: parsedUnsupported, loading: false, error: null })
  )
  assert.match(unsupportedHtml, /UNSUPPORTED_IMAGE/)
  assert.doesNotMatch(unsupportedHtml, /Rice-Blast/)

  // Even if YOLO returned a box, suppressedByClassifier (classifier HTTP 422) suppresses disease labels
  const positiveParsed = detectionResponseSchema.parse(sample9ClassResponse([
    { class_id: 5, class_name: 'Rice-Blast', annotation_level: 'lesion', confidence: 0.26, bbox_xyxy: [15, 15, 180, 180] },
  ]))
  const suppressedHtml = renderToStaticMarkup(
    React.createElement(DetectionPanel, { result: positiveParsed, loading: false, error: null, suppressedByClassifier: true })
  )
  assert.match(suppressedHtml, /UNSUPPORTED_IMAGE/)
  assert.doesNotMatch(suppressedHtml, /Rice-Blast/)

  // Mobile scanner layout checks: height-capped aspect-ratio overlay, collapsible SHA-256 details, safe area
  const overlaySrc = readFileSync(resolve(process.cwd(), 'components/features/DetectionOverlay.tsx'), 'utf8')
  const scanSrc = readFileSync(resolve(process.cwd(), 'app/(app)/scan/page.tsx'), 'utf8')
  assert.match(overlaySrc, /min\(42vh, 280px\)/)
  assert.match(scanSrc, /Detail bukti foto &amp; SHA-256/)
  assert.match(scanSrc, /safe-area-inset-bottom/)
})
