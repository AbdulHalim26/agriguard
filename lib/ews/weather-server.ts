import 'server-only'
import { readEwsPolicy } from './data'
import { createWeatherService } from './weather'

export const ewsPolicy = () => readEwsPolicy(process.env)
export const ewsDemoEnabled = () => process.env.NODE_ENV !== 'production' && process.env.EWS_DEMO_ENABLED === 'true'

export const getWeather = createWeatherService({
  now: Date.now, fetcher: (...args) => fetch(...args),
  apiKey: () => process.env.OPENWEATHER_API_KEY, policy: ewsPolicy, demoEnabled: ewsDemoEnabled,
})
