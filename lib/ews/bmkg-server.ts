import 'server-only'
import { createBmkgService } from './bmkg'

export const getBmkgWeather = createBmkgService({
  now: Date.now,
  fetcher: (...args) => fetch(...args),
})
