export interface AiAnalysisResult {
  status: 'aman' | 'rusak_ringan' | 'rusak_berat'
  confidence: number
  damage_pct: number
}

export async function analyzeImage(base64Image: string): Promise<AiAnalysisResult> {
  const aiApiUrl = process.env.AI_API_URL

  if (!aiApiUrl) {
    throw new Error('AI_API_URL tidak dikonfigurasi')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(`${aiApiUrl}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: base64Image }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`AI service error: ${response.status}`)
    }

    const data = await response.json()

    return {
      status: data.status,
      confidence: data.confidence,
      damage_pct: data.damage_pct,
    }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timeout: AI service tidak merespons dalam 15 detik')
    }
    throw error
  }
}

export async function checkAiHealth(): Promise<boolean> {
  const aiApiUrl = process.env.AI_API_URL

  if (!aiApiUrl) {
    return false
  }

  try {
    const response = await fetch(`${aiApiUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}