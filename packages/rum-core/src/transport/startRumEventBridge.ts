import type { Context } from '@renanvizza-prontmed/browser-core'
import { getEventBridge } from '@renanvizza-prontmed/browser-core'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { RumEvent } from '../rumEvent.types'

export function startRumEventBridge(lifeCycle: LifeCycle) {
  const bridge = getEventBridge<'rum', RumEvent>()!

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent: RumEvent & Context) => {
    bridge.send('rum', serverRumEvent)
  })
}
