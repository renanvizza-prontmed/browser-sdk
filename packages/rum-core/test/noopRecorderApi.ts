import type { RecorderApi } from '@renanvizza-prontmed/browser-rum-core'
import { noop } from '@renanvizza-prontmed/browser-core'

export const noopRecorderApi: RecorderApi = {
  start: noop,
  stop: noop,
  isRecording: () => false,
  onRumStart: noop,
  getReplayStats: () => undefined,
  getSessionReplayLink: () => undefined,
}
