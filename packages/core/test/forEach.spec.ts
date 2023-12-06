import type { BuildEnvWindow } from './buildEnv'
import { startLeakDetection, stopLeakDetection } from './leakDetection'

beforeEach(() => {
  ;(window as unknown as BuildEnvWindow).__BUILD_ENV__SDK_VERSION__ = 'test'
  // reset globals
  ;(window as any).OO_LOGS = {}
  ;(window as any).OO_RUM = {}
  // prevent 'Some of your tests did a full page reload!' issue
  window.onbeforeunload = () => 'stop'
  startLeakDetection()
})

afterEach(() => {
  clearAllCookies()
  stopLeakDetection()
})

function clearAllCookies() {
  document.cookie.split(';').forEach((c) => {
    document.cookie = c.replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/;samesite=strict`)
  })
}
