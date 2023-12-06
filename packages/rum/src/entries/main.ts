// Keep the following in sync with packages/rum-slim/src/entries/main.ts
import { defineGlobal, getGlobalObject } from '@renanvizza-prontmed/browser-core'
import type { RumPublicApi } from '@renanvizza-prontmed/browser-rum-core'
import { makeRumPublicApi, startRum } from '@renanvizza-prontmed/browser-rum-core'

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
} from '@renanvizza-prontmed/browser-rum-core'
export { DefaultPrivacyLevel } from '@renanvizza-prontmed/browser-core'

const recorderApi = makeRecorderApi(startRecording)
export const openobserveRum = makeRumPublicApi(startRum, recorderApi, { startDeflateWorker, createDeflateEncoder })

interface BrowserWindow extends Window {
  OO_RUM?: RumPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'OO_RUM', openobserveRum)
