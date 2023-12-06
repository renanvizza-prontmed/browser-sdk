import type { RumConfiguration } from '@renanvizza-prontmed/browser-rum-core'
import { getSessionReplayUrl } from '@renanvizza-prontmed/browser-rum-core'

export function getSessionReplayLink(configuration: RumConfiguration): string | undefined {
  return getSessionReplayUrl(configuration, { errorType: 'slim-package' })
}
