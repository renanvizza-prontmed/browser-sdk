// Keep the following in sync with packages/rum/src/entries/main.ts
import { defineGlobal, getGlobalObject, noop } from '@renanvizza-prontmed/browser-core'
import type { RumPublicApi } from '@renanvizza-prontmed/browser-rum-core'
import { makeRumPublicApi, startRum } from '@renanvizza-prontmed/browser-rum-core'
import { getSessionReplayLink } from '../domain/getSessionReplayLink'

export {
  CommonProperties,
  RumPublicApi as RumGlobal,
  RumInitConfiguration,
  // Events
  RumEvent,
  RumActionEvent,
  RumErrorEvent,
  RumLongTaskEvent,
  RumResourceEvent,
  RumViewEvent,
  // Events context
  RumEventDomainContext,
  RumViewEventDomainContext,
  RumErrorEventDomainContext,
  RumActionEventDomainContext,
  RumFetchResourceEventDomainContext,
  RumXhrResourceEventDomainContext,
  RumOtherResourceEventDomainContext,
  RumLongTaskEventDomainContext,
} from '@renanvizza-prontmed/browser-rum-core'
export { DefaultPrivacyLevel } from '@renanvizza-prontmed/browser-core'

export const openobserveRum = makeRumPublicApi(startRum, {
  start: noop,
  stop: noop,
  onRumStart: noop,
  isRecording: () => false,
  getReplayStats: () => undefined,
  getSessionReplayLink,
})

interface BrowserWindow extends Window {
  OO_RUM?: RumPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'OO_RUM', openobserveRum)
