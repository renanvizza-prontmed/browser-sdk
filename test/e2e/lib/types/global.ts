import type { LogsGlobal } from '@renanvizza-prontmed/browser-logs'
import type { RumGlobal } from '@renanvizza-prontmed/browser-rum'

declare global {
  interface Window {
    OO_LOGS?: LogsGlobal
    OO_RUM?: RumGlobal
  }
}
