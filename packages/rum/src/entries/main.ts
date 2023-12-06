// Keep the following in sync with packages/rum-slim/src/entries/main.ts
import { defineGlobal, getGlobalObject } from '@openobserve/browser-core'
import type { RumPublicApi } from '@openobserve/browser-rum-core'
import { makeRumPublicApi, startRum } from '@openobserve/browser-rum-core'

import { startRecording } from '../boot/startRecording'
import { makeRecorderApi } from '../boot/recorderApi'
import { createDeflateEncoder, startDeflateWorker } from '../domain/deflate'

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
} from '@openobserve/browser-rum-core'
export { DefaultPrivacyLevel } from '@openobserve/browser-core'

const recorderApi = makeRecorderApi(startRecording)
export const openobserveRum = makeRumPublicApi(startRum, recorderApi, { startDeflateWorker, createDeflateEncoder })

interface BrowserWindow extends Window {
  OO_RUM?: RumPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'OO_RUM', openobserveRum)
