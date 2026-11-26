import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { detectionResponseSchema, RICE_DETECTION_CLASSES, boxPercentages, imageDimensionsMatch, isYoloEnabled } from '../lib/detection'
import { requestDetection } from '../lib/detection-server'
import { aiResultSchema } from '../lib/reports/evidence'
import DetectionOverlay, { DetectionBoxLayer, DetectionPanel } from '../components/features/DetectionOverlay'

function fixture(imageHash = '0'.repeat(64), empty = false) {
  return detectionResponseSchema.parse({
    model_family: 'yolo26n', model_version: 'synthetic-contract-fixture', image_width: 200, image_height: 100,
    detections: empty ? [] : [{ class_id: 0, class_name: 'leaf_blast', annotation_level: 'lesion', confidence: .9, bbox_xyxy: [20, 10, 120, 60] }],
    inference_status: empty ? 'NO_DETECTIONS' : 'SUCCESS', severity_status: 'REVIEW_REQUIRED',
    status: null, confidence: null, damage_pct: null,
    severity: { review_required: true, reason: empty ? 'NO_DETECTIONS_NOT_HEALTHY' : 'UNCALIBRATED_BOX_COVERAGE', calibration_id: null,
      area_metrics: { lesion_box_union_px: empty ? 0 : 5000, leaf_box_union_px: 0, lesion_leaf_box_intersection_px: 0,
        lesion_image_box_coverage_ratio: empty ? 0 : .25, lesion_leaf_box_coverage_ratio: null } },
    provenance: { source: 'onnxruntime', label_schema: 'rice_detection_v1', coordinate_convention: 'xyxy_pixels_exif_oriented',
      preprocessing: 'rgb_letterbox_114_bilinear_div255', output_format: 'end2end_xyxy', postprocessing: 'nms_free',
      model_sha256: '1'.repeat(64), image_sha256: imageHash, dataset_manifest_sha256: '2'.repeat(64),
      confidence_threshold: .25, iou_threshold: null, inference_ms: 1, persistence: 'preview_only' },
  })
}

test('Python and TypeScript rice taxonomies agree exactly', () => {
  const taxonomy = JSON.parse(readFileSync(new URL('../ai-service/detection/taxonomy.json', import.meta.url), 'utf8'))
  assert.deepEqual(taxonomy.classes, [...RICE_DETECTION_CLASSES])
})

test('detection contract rejects non-finite, reversed, out-of-bounds, unknown-class and inconsistent results', () => {
  for (const mutate of [
    (data: any) => { data.detections[0].confidence = NaN },
    (data: any) => { data.detections[0].confidence = 1.01 },
    (data: any) => { data.detections[0].bbox_xyxy = [5, 5, 1, 1] },
    (data: any) => { data.detections[0].bbox_xyxy = [1, 1, 201, 50] },
    (data: any) => { data.detections[0].class_name = 'person' },
    (data: any) => { data.detections[0].class_id = 5 },
    (data: any) => { data.inference_status = 'NO_DETECTIONS' },
    (data: any) => { data.status = 'aman' },
    (data: any) => { data.damage_pct = 75 },
    (data: any) => { data.provenance.postprocessing = 'class_aware_nms' },
  ]) {
    const data = fixture(); mutate(data)
    assert.equal(detectionResponseSchema.safeParse(data).success, false)
  }
})

test('legacy response remains compatible and a review-only detector is not a legacy receipt', () => {
  assert.equal(aiResultSchema.safeParse({ status: 'rusak_ringan', confidence: .8, damage_pct: 54 }).success, true)
  assert.equal(aiResultSchema.safeParse(fixture()).success, false)
  assert.equal(detectionResponseSchema.safeParse({ detections: [], inference_status: 'UNAVAILABLE' }).success, false)
})

test('responsive boxes use original image dimensions, never a cropped viewport', () => {
  assert.deepEqual(boxPercentages([20, 10, 120, 60], 200, 100), { left: 10, top: 10, width: 50, height: 50 })
  assert.equal(imageDimensionsMatch(200, 100, 200, 100), true)
  assert.equal(imageDimensionsMatch(100, 200, 200, 100), false)
  assert.equal(imageDimensionsMatch(0, 0, 200, 100), false)
  assert.throws(() => boxPercentages([0, 0, 200, 100], 0, 100))
  const html = renderToStaticMarkup(createElement(DetectionBoxLayer, { detections: fixture().detections, width: 200, height: 100 }))
  assert.match(html, /left:10%/)
  assert.match(html, /width:50%/)
  assert.match(html, /leaf blast/)
  const overlay = renderToStaticMarkup(createElement(DetectionOverlay, { imageSrc: '/synthetic-test.png', result: fixture() }))
  assert.match(overlay, /object-contain/)
  assert.match(overlay, /aspect-ratio:200 \/ 100/)
  // Boxes remain hidden until natural dimensions have been checked on load.
  assert.doesNotMatch(overlay, /left:10%/)
})

test('frontend renders loading, unavailable, model version and empty REVIEW_REQUIRED states', () => {
  assert.match(renderToStaticMarkup(createElement(DetectionPanel, { result: null, loading: true, error: null })), /role="status"/)
  assert.match(renderToStaticMarkup(createElement(DetectionPanel, { result: null, loading: false, error: 'Detektor belum tersedia' })), /role="alert"/)
  const html = renderToStaticMarkup(createElement(DetectionPanel, { result: fixture(undefined, true), loading: false, error: null }))
  assert.match(html, /REVIEW_REQUIRED/)
  assert.match(html, /Kondisi sehat belum dapat disimpulkan/)
  assert.match(html, /synthetic-contract-fixture/)
  assert.match(html, /Persentase kerusakan belum dihitung/)
})

test('YOLO is OFF by default and disabled/anonymous requests never reach the upstream', async () => {
  assert.equal(isYoloEnabled(), false)
  assert.equal(isYoloEnabled('false'), false)
  let forwarded = false
  const options = { enabled: false, aiApiUrl: 'http://isolated-test', authenticate: async () => ({ id: randomUUID() }),
    fetcher: (async () => { forwarded = true; throw new Error('must not forward') }) as typeof fetch }
  const image = new Blob(['synthetic'], { type: 'image/png' })
  await assert.rejects(requestDetection(image, options), { status: 503, code: 'DETECTOR_DISABLED' })
  await assert.rejects(requestDetection(image, { ...options, enabled: true, authenticate: async () => null }), { status: 401 })
  assert.equal(forwarded, false)
})

test('proxy validates photo provenance and propagates unavailable instead of successful empty detections', async () => {
  const image = new Blob(['synthetic'], { type: 'image/png' })
  const hash = createHash('sha256').update(new Uint8Array(await image.arrayBuffer())).digest('hex')
  const options = { enabled: true, aiApiUrl: 'http://isolated-test', authenticate: async () => ({ id: randomUUID() }) }
  const valid = await requestDetection(image, { ...options, fetcher: (async (url) => {
    assert.equal(url, 'http://isolated-test/predict/detect')
    return new Response(JSON.stringify(fixture(hash, true)))
  }) as typeof fetch })
  assert.equal(valid.inference_status, 'NO_DETECTIONS')
  assert.equal(valid.status, null)
  await assert.rejects(requestDetection(image, { ...options, fetcher: (async () => new Response('{}', { status: 503 })) as typeof fetch }), { status: 503 })
  await assert.rejects(requestDetection(image, { ...options, fetcher: (async () => new Response(JSON.stringify(fixture()))) as typeof fetch }), { code: 'INVALID_DETECTION_RESPONSE' })
})
