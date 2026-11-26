import type { NextRequest } from 'next/server'

/** Keep the browser's exact origin when NextURL canonicalizes loopback to localhost. */
export function isSameOriginRequest(request: Pick<NextRequest, 'headers' | 'nextUrl'>): boolean {
  const origin = request.headers.get('origin')
  if (!origin || origin === 'null') return false
  let expected = request.nextUrl.origin
  if (request.nextUrl.hostname === 'localhost') {
    const host = request.headers.get('host')
    if (host) {
      try {
        const actual = new URL(`${request.nextUrl.protocol}//${host}`)
        // Host is the actual HTTP destination, not X-Forwarded-Host or a list of
        // equivalent aliases. Scheme/port and exact Host must still match.
        if (!['localhost', '127.0.0.1', '[::1]'].includes(actual.hostname) ||
            actual.host !== host.toLowerCase() || actual.port !== request.nextUrl.port) return false
        expected = actual.origin
      } catch { return false }
    }
  }
  return origin === expected
}
