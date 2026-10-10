export interface AiAnalysisResult {
  status: 'aman' | 'rusak_ringan' | 'rusak_berat'
  confidence: number
  damage_pct: number
}

const AI_TIMEOUT_MS = 15000

export async function analyzeImage(image: Blob): Promise<AiAnalysisResult> {
  const aiApiUrl = process.env.AI_API_URL?.trim()

  if (!aiApiUrl) {
    throw new Error('AI_API_URL tidak dikonfigurasi')
  }

  const formData = new FormData()
  formData.append('image', image, 'scan.jpg')

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

  try {
    const response = await fetch(`${aiApiUrl.replace(/\/$/, '')}/predict`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      const message = body?.detail || `AI service error: ${response.status}`
      throw new Error(message)
    }

    const data = await response.json()

    if (
      !data ||
      typeof data.status !== 'string' ||
      !['aman', 'rusak_ringan', 'rusak_berat'].includes(data.status) ||
      typeof data.confidence !== 'number' ||
      typeof data.damage_pct !== 'number'
    ) {
      throw new Error('Respons AI tidak valid')
    }

    return {
      status: data.status,
      confidence: data.confidence,
      damage_pct: data.damage_pct,
    }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timeout: AI tidak merespons dalam 15 detik')
    }
    throw error
  }
}

export async function checkAiHealth(): Promise<boolean> {
  const aiApiUrl = process.env.AI_API_URL?.trim()

  if (!aiApiUrl) {
    return false
  }

  try {
    const response = await fetch(`${aiApiUrl.replace(/\/$/, '')}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}