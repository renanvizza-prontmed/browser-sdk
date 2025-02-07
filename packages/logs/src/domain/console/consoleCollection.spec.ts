import { ErrorSource, noop, objectEntries } from '@openobserve/browser-core'
import type { RawConsoleLogsEvent } from '../../rawLogsEvent.types'
import { validateAndBuildLogsConfiguration } from '../configuration'
import type { RawLogsEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { startConsoleCollection, LogStatusForApi } from './consoleCollection'

describe('console collection', () => {
  const initConfiguration = { clientToken: 'xxx', service: 'service' }
  let consoleSpies: { [key: string]: jasmine.Spy }
  let stopConsoleCollection: () => void
  let lifeCycle: LifeCycle
  let rawLogsEvents: Array<RawLogsEventCollectedData<RawConsoleLogsEvent>>

  beforeEach(() => {
    rawLogsEvents = []
    lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLogsEvent) =>
      rawLogsEvents.push(rawLogsEvent as RawLogsEventCollectedData<RawConsoleLogsEvent>)
    )
    stopConsoleCollection = noop
    consoleSpies = {
      log: spyOn(console, 'log').and.callFake(() => true),
      debug: spyOn(console, 'debug').and.callFake(() => true),
      info: spyOn(console, 'info').and.callFake(() => true),
      warn: spyOn(console, 'warn').and.callFake(() => true),
      error: spyOn(console, 'error').and.callFake(() => true),
    }
  })

  afterEach(() => {
    stopConsoleCollection()
  })

  objectEntries(LogStatusForApi).forEach(([api, status]) => {
    it(`should collect ${status} logs from console.${api}`, () => {
      ;({ stop: stopConsoleCollection } = startConsoleCollection(
        validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: 'all' })!,
        lifeCycle
      ))

      /* eslint-disable-next-line no-console */
      console[api as keyof typeof LogStatusForApi]('foo', 'bar')

      expect(rawLogsEvents[0].rawLogsEvent).toEqual({
        date: jasmine.any(Number),
        message: 'foo bar',
        status,
        origin: ErrorSource.CONSOLE,
        error: whatever(),
      })

      expect(consoleSpies[api]).toHaveBeenCalled()
    })
  })

  it('console error should have an error object defined', () => {
    ;({ stop: stopConsoleCollection } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardErrorsToLogs: true })!,
      lifeCycle
    ))

    /* eslint-disable-next-line no-console */
    console.error('foo', 'bar')

    expect(rawLogsEvents[0].rawLogsEvent.error).toEqual({
      stack: undefined,
      fingerprint: undefined,
    })
  })

  it('should retrieve fingerprint from console error', () => {
    ;({ stop: stopConsoleCollection } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardErrorsToLogs: true })!,
      lifeCycle
    ))
    interface DatadogError extends Error {
      dd_fingerprint?: string
    }
    const error = new Error('foo')
    ;(error as DatadogError).dd_fingerprint = 'my-fingerprint'

    // eslint-disable-next-line no-console
    console.error(error)

    expect(rawLogsEvents[0].rawLogsEvent.error).toEqual({
      stack: jasmine.any(String),
      fingerprint: 'my-fingerprint',
    })
  })
})

function whatever() {
  return {
    asymmetricMatch: () => true,
    jasmineToString: () => '<whatever>',
  }
}
