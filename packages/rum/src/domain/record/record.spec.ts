import { DefaultPrivacyLevel, findLast, isIE } from '@openobserve/browser-core'
import type { RumConfiguration } from '@openobserve/browser-rum-core'
import { LifeCycle } from '@openobserve/browser-rum-core'
import type { Clock } from '@openobserve/browser-core/test'
import { createNewEvent, collectAsyncCalls } from '@openobserve/browser-core/test'
import { findFullSnapshot, findNode, recordsPerFullSnapshot } from '../../../test'
import type {
  BrowserIncrementalSnapshotRecord,
  BrowserMutationData,
  BrowserRecord,
  DocumentFragmentNode,
  ElementNode,
  FocusRecord,
} from '../../types'
import { NodeType, RecordType, IncrementalSource } from '../../types'
import { appendElement } from '../../../../rum-core/test'
import type { RecordAPI } from './record'
import { record } from './record'

describe('record', () => {
  let recordApi: RecordAPI
  let emitSpy: jasmine.Spy<(record: BrowserRecord) => void>
  let clock: Clock | undefined

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    emitSpy = jasmine.createSpy()
  })

  afterEach(() => {
    clock?.cleanup()
    recordApi?.stop()
  })

  it('captures stylesheet rules', (done) => {
    const styleElement = appendElement('<style></style>') as HTMLStyleElement

    startRecording()

    const styleSheet = styleElement.sheet as CSSStyleSheet
    const ruleIdx0 = styleSheet.insertRule('body { background: #000; }')
    const ruleIdx1 = styleSheet.insertRule('body { background: #111; }')
    styleSheet.deleteRule(ruleIdx1)
    setTimeout(() => {
      styleSheet.insertRule('body { color: #fff; }')
    }, 0)
    setTimeout(() => {
      styleSheet.deleteRule(ruleIdx0)
    }, 5)
    setTimeout(() => {
      styleSheet.insertRule('body { color: #ccc; }')
    }, 10)

    collectAsyncCalls(emitSpy, recordsPerFullSnapshot() + 6, () => {
      const records = getEmittedRecords()
      let i = 0

      expect(records[i++].type).toEqual(RecordType.Meta)
      expect(records[i++].type).toEqual(RecordType.Focus)
      expect(records[i++].type).toEqual(RecordType.FullSnapshot)

      if (window.visualViewport) {
        expect(records[i++].type).toEqual(RecordType.VisualViewport)
      }

      expect(records[i].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[i++] as BrowserIncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          adds: [{ rule: 'body { background: #000; }', index: undefined }],
        })
      )
      expect(records[i].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[i++] as BrowserIncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          adds: [{ rule: 'body { background: #111; }', index: undefined }],
        })
      )
      expect(records[i].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[i++] as BrowserIncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          removes: [{ index: 0 }],
        })
      )
      expect(records[i].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[i++] as BrowserIncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          adds: [{ rule: 'body { color: #fff; }', index: undefined }],
        })
      )
      expect(records[i].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[i++] as BrowserIncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          removes: [{ index: 0 }],
        })
      )
      expect(records[i].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[i++] as BrowserIncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          adds: [{ rule: 'body { color: #ccc; }', index: undefined }],
        })
      )

      done()
    })
  })

  it('flushes pending mutation records before taking a full snapshot', (done) => {
    startRecording()

    appendElement('<hr/>')

    recordApi.takeSubsequentFullSnapshot()

    collectAsyncCalls(emitSpy, 1 + 2 * recordsPerFullSnapshot(), () => {
      const records = getEmittedRecords()
      let i = 0

      expect(records[i++].type).toEqual(RecordType.Meta)
      expect(records[i++].type).toEqual(RecordType.Focus)
      expect(records[i++].type).toEqual(RecordType.FullSnapshot)

      if (window.visualViewport) {
        expect(records[i++].type).toEqual(RecordType.VisualViewport)
      }
      expect(records[i].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[i++] as BrowserIncrementalSnapshotRecord).data.source).toEqual(IncrementalSource.Mutation)
      expect(records[i++].type).toEqual(RecordType.Meta)
      expect(records[i++].type).toEqual(RecordType.Focus)
      expect(records[i++].type).toEqual(RecordType.FullSnapshot)

      done()
    })
  })

  describe('Focus records', () => {
    let hasFocus: boolean

    beforeEach(() => {
      hasFocus = true
      spyOn(Document.prototype, 'hasFocus').and.callFake(() => hasFocus)
    })

    it('adds an initial Focus record when starting to record', () => {
      startRecording()
      expect(getEmittedRecords()[1]).toEqual({
        type: RecordType.Focus,
        timestamp: jasmine.any(Number),
        data: {
          has_focus: true,
        },
      })
    })

    it('adds a Focus record on focus', () => {
      startRecording()
      emitSpy.calls.reset()

      window.dispatchEvent(createNewEvent('focus'))
      expect(getEmittedRecords()[0].type).toBe(RecordType.Focus)
    })

    it('adds a Focus record on blur', () => {
      startRecording()
      emitSpy.calls.reset()

      window.dispatchEvent(createNewEvent('blur'))
      expect(getEmittedRecords()[0].type).toBe(RecordType.Focus)
    })

    it('adds a Focus record on when taking a full snapshot', () => {
      startRecording()
      emitSpy.calls.reset()

      recordApi.takeSubsequentFullSnapshot()
      expect(getEmittedRecords()[1].type).toBe(RecordType.Focus)
    })

    it('set has_focus to true if the document has the focus', () => {
      hasFocus = true
      startRecording()
      expect((getEmittedRecords()[1] as FocusRecord).data.has_focus).toBe(true)
    })

    it("set has_focus to false if the document doesn't have the focus", () => {
      hasFocus = false
      startRecording()
      expect((getEmittedRecords()[1] as FocusRecord).data.has_focus).toBe(false)
    })
  })

  describe('Shadow dom', () => {
    it('should record a simple mutation inside a shadow root', () => {
      const element = appendElement('<hr class="toto" />', createShadow())
      startRecording()
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot())

      element.className = 'titi'

      recordApi.flushMutations()
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot() + 1)
      const innerMutationData = getLastIncrementalSnapshotData<BrowserMutationData>(
        getEmittedRecords(),
        IncrementalSource.Mutation
      )
      expect(innerMutationData.attributes[0].attributes.class).toBe('titi')
    })

    it('should record a direct removal inside a shadow root', () => {
      const element = appendElement('<hr/>', createShadow())
      startRecording()
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot())

      element.remove()

      recordApi.flushMutations()
      const fs = findFullSnapshot({ records: getEmittedRecords() })!
      const shadowRootNode = findNode(
        fs.data.node,
        (node) => node.type === NodeType.DocumentFragment && node.isShadowRoot
      )!
      expect(shadowRootNode).toBeTruthy()
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot() + 1)
      const innerMutationData = getLastIncrementalSnapshotData<BrowserMutationData>(
        getEmittedRecords(),
        IncrementalSource.Mutation
      )
      expect(innerMutationData.removes.length).toBe(1)
      expect(innerMutationData.removes[0].parentId).toBe(shadowRootNode.id)
    })

    it('should record a direct addition inside a shadow root', () => {
      const shadowRoot = createShadow()
      appendElement('<hr/>', shadowRoot)
      startRecording()
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot())

      appendElement('<span></span>', shadowRoot)

      recordApi.flushMutations()
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot() + 1)
      const fs = findFullSnapshot({ records: getEmittedRecords() })!
      const shadowRootNode = findNode(
        fs.data.node,
        (node) => node.type === NodeType.DocumentFragment && node.isShadowRoot
      )!
      expect(shadowRootNode).toBeTruthy()
      const innerMutationData = getLastIncrementalSnapshotData<BrowserMutationData>(
        getEmittedRecords(),
        IncrementalSource.Mutation
      )
      expect(innerMutationData.adds.length).toBe(1)
      expect(innerMutationData.adds[0].node.type).toBe(2)
      expect(innerMutationData.adds[0].parentId).toBe(shadowRootNode.id)
      const addedNode = innerMutationData.adds[0].node as ElementNode
      expect(addedNode.tagName).toBe('span')
    })

    it('should record mutation inside a shadow root added after the FS', () => {
      startRecording()
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot())

      // shadow DOM mutation
      const span = appendElement('<span class="toto"></span>', createShadow())
      recordApi.flushMutations()
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot() + 1)
      const hostMutationData = getLastIncrementalSnapshotData<BrowserMutationData>(
        getEmittedRecords(),
        IncrementalSource.Mutation
      )
      expect(hostMutationData.adds.length).toBe(1)
      const hostNode = hostMutationData.adds[0].node as ElementNode
      const shadowRoot = hostNode.childNodes[0] as DocumentFragmentNode
      expect(shadowRoot.type).toBe(NodeType.DocumentFragment)
      expect(shadowRoot.isShadowRoot).toBe(true)

      // inner mutation
      span.className = 'titi'
      recordApi.flushMutations()
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot() + 2)
      const innerMutationData = getLastIncrementalSnapshotData<BrowserMutationData>(
        getEmittedRecords(),
        IncrementalSource.Mutation
      )
      expect(innerMutationData.attributes.length).toBe(1)
      expect(innerMutationData.attributes[0].attributes.class).toBe('titi')
    })

    it('should record the change event inside a shadow root', () => {
      const radio = appendElement('<input type="radio"/>', createShadow()) as HTMLInputElement
      startRecording()
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot())

      // inner mutation
      radio.checked = true
      radio.dispatchEvent(createNewEvent('change', { target: radio, composed: false }))

      recordApi.flushMutations()
      const innerMutationData = getLastIncrementalSnapshotData<BrowserMutationData & { isChecked: boolean }>(
        getEmittedRecords(),
        IncrementalSource.Input
      )
      expect(innerMutationData.isChecked).toBe(true)
    })

    it('should clean the state once the shadow dom is removed to avoid memory leak', () => {
      const shadowRoot = createShadow()
      appendElement('<div class="toto"></div>', shadowRoot)
      startRecording()
      spyOn(recordApi.shadowRootsController, 'removeShadowRoot')

      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot())
      expect(recordApi.shadowRootsController.removeShadowRoot).toHaveBeenCalledTimes(0)
      shadowRoot.host.remove()
      recordApi.flushMutations()
      expect(recordApi.shadowRootsController.removeShadowRoot).toHaveBeenCalledTimes(1)
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot() + 1)
      const mutationData = getLastIncrementalSnapshotData<BrowserMutationData>(
        getEmittedRecords(),
        IncrementalSource.Mutation
      )
      expect(mutationData.removes.length).toBe(1)
    })

    it('should clean the state when both the parent and the shadow host is removed to avoid memory leak', () => {
      const host = appendElement(`
      <div id="grand-parent">
        <div id="parent">
          <div class="host" target></div>
        </div>
      </div>`)
      host.attachShadow({ mode: 'open' })
      const parent = host.parentElement!
      const grandParent = parent.parentElement!
      appendElement('<div></div>', host.shadowRoot!)

      startRecording()
      spyOn(recordApi.shadowRootsController, 'removeShadowRoot')
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot())
      expect(recordApi.shadowRootsController.removeShadowRoot).toHaveBeenCalledTimes(0)

      parent.remove()
      grandParent.remove()
      recordApi.flushMutations()
      expect(recordApi.shadowRootsController.removeShadowRoot).toHaveBeenCalledTimes(1)
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot() + 1)
      const mutationData = getLastIncrementalSnapshotData<BrowserMutationData>(
        getEmittedRecords(),
        IncrementalSource.Mutation
      )
      expect(mutationData.removes.length).toBe(1)
    })

    function createShadow() {
      const host = appendElement('<div></div>')
      const shadowRoot = host.attachShadow({ mode: 'open' })
      return shadowRoot
    }
  })

  function startRecording() {
    recordApi = record({
      emit: emitSpy,
      configuration: { defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW } as RumConfiguration,
      lifeCycle: new LifeCycle(),
    })
  }

  function getEmittedRecords() {
    return emitSpy.calls.allArgs().map(([record]) => record)
  }
})

export function getLastIncrementalSnapshotData<T extends BrowserIncrementalSnapshotRecord['data']>(
  records: BrowserRecord[],
  source: IncrementalSource
): T {
  const record = findLast(
    records,
    (record): record is BrowserIncrementalSnapshotRecord & { data: T } =>
      record.type === RecordType.IncrementalSnapshot && record.data.source === source
  )
  expect(record).toBeTruthy(`Could not find IncrementalSnapshot/${source} in ${records.length} records`)
  return record!.data
}
