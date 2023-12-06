import type { Payload } from '../../transport'
import { computeTransportConfiguration } from './transportConfiguration'

const DEFAULT_PAYLOAD = {} as Payload

describe('transportConfiguration', () => {
  const clientToken = 'some_client_token'
  const internalAnalyticsSubdomain = 'openobserve.ai'
  describe('site', () => {
    it('should use US site by default', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD)).toContain('openobserve.ai')
      expect(configuration.site).toBe('api.openobserve.ai')
    })

    it('should use site value when set', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: 'foo.com' })
      expect(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD)).toContain('foo.com')
      expect(configuration.site).toBe('foo.com')
    })
  })

  describe('internalAnalyticsSubdomain', () => {
    it('should use internal analytics subdomain value when set for openobserve.ai site', () => {
      const configuration = computeTransportConfiguration({
        clientToken,
        internalAnalyticsSubdomain,
      })
      expect(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD)).toContain(internalAnalyticsSubdomain)
    })

    it('should not use internal analytics subdomain value when set for other sites', () => {
      const configuration = computeTransportConfiguration({
        clientToken,
        site: 'foo.bar',
        internalAnalyticsSubdomain,
      })
      expect(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD)).not.toContain(internalAnalyticsSubdomain)
    })
  })

  describe('sdk_version, env, version and service', () => {
    it('should not modify the logs and rum endpoints tags when not defined', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).not.toContain(',env:')
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).not.toContain(
        ',service:'
      )
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).not.toContain(
        ',version:'
      )
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).not.toContain(
        ',datacenter:'
      )

      expect(decodeURIComponent(configuration.logsEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).not.toContain(',env:')
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).not.toContain(
        ',service:'
      )
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).not.toContain(
        ',version:'
      )
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).not.toContain(
        ',datacenter:'
      )
    })

    it('should be set as tags in the logs and rum endpoints', () => {
      const configuration = computeTransportConfiguration({ clientToken, env: 'foo', service: 'bar', version: 'baz' })
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).toContain(
        'env:foo,service:bar,version:baz'
      )
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).toContain(
        'env:foo,service:bar,version:baz'
      )
    })
  })

  describe('isIntakeUrl', () => {
    ;[
      { expectSubdomain: true, site: 'api.openobserve.ai', intakeDomain: 'api.openobserve.ai' }
    ].forEach(({ site, intakeDomain }) => {
      it(`should detect intake request for ${site} site`, () => {
        const configuration = computeTransportConfiguration({ clientToken, site, organizationIdentifier: 'xyz'})

        expect(configuration.isIntakeUrl(`https://${intakeDomain}/rum/v2/xyz/rum?xxx`)).toBe(true)
        expect(configuration.isIntakeUrl(`https://${intakeDomain}/rum/v2/xyz/logs?xxx`)).toBe(true)
        expect(configuration.isIntakeUrl(`https://${intakeDomain}/rum/v2/xyz/replay?xxx`)).toBe(true)
      })
    })

    it('should detect internal analytics intake request for openobserve.ai site', () => {
      const configuration = computeTransportConfiguration({
        clientToken,
        internalAnalyticsSubdomain,
        organizationIdentifier: 'xyz'
      })
      expect(configuration.isIntakeUrl(`https://api.openobserve.ai/rum/v2/xyz/rum?xxx`)).toBe(true)
    })

    it('should not detect non intake request', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(configuration.isIntakeUrl('https://www.foo.com')).toBe(false)
    })

    describe('proxy configuration', () => {
      
      it('should detect proxy intake request', () => {
        let configuration = computeTransportConfiguration({
          clientToken,
          proxy: 'https://www.proxy.com',
          organizationIdentifier: 'xyz'
        })
        expect(
          configuration.isIntakeUrl(`https://www.proxy.com/?ooforward=${encodeURIComponent('/rum/v2/xyz/rum?foo=bar')}`)
        ).toBe(true)

        configuration = computeTransportConfiguration({
          clientToken,
          proxy: 'https://www.proxy.com/custom/path',
          organizationIdentifier: 'xyz'
        })
        expect(
          configuration.isIntakeUrl(
            `https://www.proxy.com/custom/path?ooforward=${encodeURIComponent('/rum/v2/xyz/rum?foo=bar')}`
          )
        ).toBe(true)
      })

      it('should not detect request done on the same host as the proxy', () => {
        const configuration = computeTransportConfiguration({
          clientToken,
          proxy: 'https://www.proxy.com',
        })
        expect(configuration.isIntakeUrl('https://www.proxy.com/foo')).toBe(false)
      })
    })
    ;[
      { site: 'openobserve.ai' },
    ].forEach(({ site }) => {
      it(`should detect replica intake request for site ${site}`, () => {
        const configuration = computeTransportConfiguration({
          clientToken,
          site,
          replica: { clientToken },
          internalAnalyticsSubdomain,
          organizationIdentifier: 'xyz'
        })

        expect(configuration.isIntakeUrl(`https://api.openobserve.ai/rum/v2/xyz/rum?xxx`)).toBe(
            true
          )
      })
    })
  })
})
