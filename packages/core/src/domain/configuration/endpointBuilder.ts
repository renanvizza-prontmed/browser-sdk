import type { Payload } from '../../transport'
import { timeStampNow } from '../../tools/utils/timeUtils'
import { normalizeUrl } from '../../tools/utils/urlPolyfill'
import { ExperimentalFeature, isExperimentalFeatureEnabled } from '../../tools/experimentalFeatures'
import { generateUUID } from '../../tools/utils/stringUtils'
import type { InitConfiguration } from './configuration'
import { INTAKE_SITE_US1 } from './intakeSites'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

export type TrackType = 'logs' | 'rum' | 'replay'

export type EndpointBuilder = ReturnType<typeof createEndpointBuilder>

export function createEndpointBuilder(
  initConfiguration: InitConfiguration,
  trackType: TrackType,
  configurationTags: string[]
) {
  const buildUrlWithParameters = createEndpointUrlWithParametersBuilder(initConfiguration, trackType)

  return {
    build(api: 'xhr' | 'fetch' | 'beacon', payload: Payload) {
      const parameters = buildEndpointParameters(initConfiguration, trackType, configurationTags, api, payload)
      return buildUrlWithParameters(parameters)
    },
    urlPrefix: buildUrlWithParameters(''),
    trackType,
  }
}

/**
 * Create a function used to build a full endpoint url from provided parameters. The goal of this
 * function is to pre-compute some parts of the URL to avoid re-computing everything on every
 * request, as only parameters are changing.
 */
function createEndpointUrlWithParametersBuilder(
  initConfiguration: InitConfiguration,
  trackType: TrackType
): (parameters: string) => string {
  const { proxy, apiVersion, organizationIdentifier, insecureHTTP } = initConfiguration
  //const path = `/api/v2/${trackType}`
  const path = `/rum/${apiVersion ?? 'v2'}/${organizationIdentifier}/${trackType}`
  if (typeof proxy === 'string') {
    const normalizedProxyUrl = normalizeUrl(proxy)
    return (parameters) => `${normalizedProxyUrl}?ooforward=${encodeURIComponent(`${path}?${parameters}`)}`
  }
  if (typeof proxy === 'function') {
    return (parameters) => proxy({ path, parameters })
  }
  const host = buildEndpointHost(initConfiguration)
  const protocol = insecureHTTP ? 'http' : 'https'

  return (parameters) => `${protocol}://${host}${path}?${parameters}`
}

function buildEndpointHost(initConfiguration: InitConfiguration) {
  const { site = INTAKE_SITE_US1, internalAnalyticsSubdomain } = initConfiguration

  return site
  if (internalAnalyticsSubdomain && site === INTAKE_SITE_US1) {
    return `${internalAnalyticsSubdomain}.${INTAKE_SITE_US1}`
  }

  const domainParts = site.split('.')
  const extension = domainParts.pop()
  return `browser-intake-${domainParts.join('-')}.${extension!}`
}

/**
 * Build parameters to be used for an intake request. Parameters should be re-built for each
 * request, as they change randomly.
 */
function buildEndpointParameters(
  { clientToken, internalAnalyticsSubdomain }: InitConfiguration,
  trackType: TrackType,
  configurationTags: string[],
  api: 'xhr' | 'fetch' | 'beacon',
  { retry, flushReason, encoding }: Payload
) {
  const tags = [`sdk_version:${__BUILD_ENV__SDK_VERSION__}`, `api:${api}`].concat(configurationTags)
  if (flushReason && isExperimentalFeatureEnabled(ExperimentalFeature.COLLECT_FLUSH_REASON)) {
    tags.push(`flush_reason:${flushReason}`)
  }
  if (retry) {
    tags.push(`retry_count:${retry.count}`, `retry_after:${retry.lastFailureStatus}`)
  }

  const parameters = [
    'o2source=browser',
    `o2tags=${encodeURIComponent(tags.join(','))}`,
    `o2-api-key=${clientToken}`,
    `o2-evp-origin-version=${encodeURIComponent(__BUILD_ENV__SDK_VERSION__)}`,
    'o2-evp-origin=browser',
    `o2-request-id=${generateUUID()}`,
  ]

  if (encoding) {
    parameters.push(`oo-evp-encoding=${encoding}`)
  }

  if (trackType === 'rum') {
    parameters.push(`batch_time=${timeStampNow()}`)
  }

  if (internalAnalyticsSubdomain) {
    parameters.reverse()
  }

  return parameters.join('&')
}
