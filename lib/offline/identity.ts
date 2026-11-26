const CACHE_KEY = 'agriguard-user-id'
export function rememberOfflineUser(userId: string | null) {
  try {
    if (userId) window.localStorage.setItem(CACHE_KEY, userId)
    else window.localStorage.removeItem(CACHE_KEY)
  } catch { /* storage unavailable */ }
}
export function rememberedOfflineUser(): string | null {
  try { return window.localStorage.getItem(CACHE_KEY) } catch { return null }
}
export function fieldCacheKey(userId: string) { return `agriguard-lahan-cache:${userId}` }
