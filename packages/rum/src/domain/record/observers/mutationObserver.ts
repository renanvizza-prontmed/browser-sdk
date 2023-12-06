import { monitor, noop } from '@openobserve/browser-core'
import type { RumConfiguration } from '@openobserve/browser-rum-core'
import {
  isNodeShadowHost,
  getMutationObserverConstructor,
  getParentNode,
  forEachChildNodes,
} from '@openobserve/browser-rum-core'
import { NodePrivacyLevel } from '../../../constants'
import type {
  AddedNodeMutation,
  AttributeMutation,
  BrowserMutationPayload,
  RemovedNodeMutation,
  TextMutation,
} from '../../../types'
import { getNodePrivacyLevel, getTextContent } from '../privacy'
import type { NodeWithSerializedNode } from '../serialization'
import {
  getElementInputValue,
  getSerializedNodeId,
  hasSerializedNode,
  nodeAndAncestorsHaveSerializedNode,
  serializeNodeWithId,
  SerializationContextStatus,
  serializeAttribute,
} from '../serialization'
import { createMutationBatch } from '../mutationBatch'
import type { ShadowRootCallBack, ShadowRootsController } from '../shadowRootsController'

export type MutationCallBack = (m: BrowserMutationPayload) => void

type WithSerializedTarget<T> = T & { target: NodeWithSerializedNode }

// https://dom.spec.whatwg.org/#interface-mutationrecord
interface RumCharacterDataMutationRecord {
  type: 'characterData'
  target: Node
  oldValue: string | null
}

interface RumAttributesMutationRecord {
  type: 'attributes'
  target: Element
  oldValue: string | null
  attributeName: string | null
}

interface RumChildListMutationRecord {
  type: 'childList'
  target: Node
  addedNodes: NodeList
  removedNodes: NodeList
}

export type RumMutationRecord =
  | RumCharacterDataMutationRecord
  | RumAttributesMutationRecord
  | RumChildListMutationRecord

/**
 * Buffers and aggregate mutations generated by a MutationObserver into MutationPayload
 */
export function initMutationObserver(
  mutationCallback: MutationCallBack,
  configuration: RumConfiguration,
  shadowRootsController: ShadowRootsController,
  target: Node
) {
  const MutationObserver = getMutationObserverConstructor()
  if (!MutationObserver) {
    return { stop: noop, flush: noop }
  }

  const mutationBatch = createMutationBatch((mutations) => {
    processMutations(
      mutations.concat(observer.takeRecords() as RumMutationRecord[]),
      mutationCallback,
      configuration,
      shadowRootsController
    )
  })

  const observer = new MutationObserver(monitor(mutationBatch.addMutations) as (callback: MutationRecord[]) => void)

  observer.observe(target, {
    attributeOldValue: true,
    attributes: true,
    characterData: true,
    characterDataOldValue: true,
    childList: true,
    subtree: true,
  })

  return {
    stop: () => {
      observer.disconnect()
      mutationBatch.stop()
    },
    flush: () => {
      mutationBatch.flush()
    },
  }
}

function processMutations(
  mutations: RumMutationRecord[],
  mutationCallback: MutationCallBack,
  configuration: RumConfiguration,
  shadowRootsController: ShadowRootsController
) {
  mutations
    .filter((mutation): mutation is RumChildListMutationRecord => mutation.type === 'childList')
    .forEach((mutation) => {
      mutation.removedNodes.forEach((removedNode) => {
        traverseRemovedShadowDom(removedNode, shadowRootsController.removeShadowRoot)
      })
    })

  // Discard any mutation with a 'target' node that:
  // * isn't injected in the current document or isn't known/serialized yet: those nodes are likely
  // part of a mutation occurring in a parent Node
  // * should be hidden or ignored
  const filteredMutations = mutations.filter(
    (mutation): mutation is WithSerializedTarget<RumMutationRecord> =>
      mutation.target.isConnected &&
      nodeAndAncestorsHaveSerializedNode(mutation.target) &&
      getNodePrivacyLevel(mutation.target, configuration.defaultPrivacyLevel) !== NodePrivacyLevel.HIDDEN
  )

  const { adds, removes, hasBeenSerialized } = processChildListMutations(
    filteredMutations.filter(
      (mutation): mutation is WithSerializedTarget<RumChildListMutationRecord> => mutation.type === 'childList'
    ),
    configuration,
    shadowRootsController
  )

  const texts = processCharacterDataMutations(
    filteredMutations.filter(
      (mutation): mutation is WithSerializedTarget<RumCharacterDataMutationRecord> =>
        mutation.type === 'characterData' && !hasBeenSerialized(mutation.target)
    ),
    configuration
  )

  const attributes = processAttributesMutations(
    filteredMutations.filter(
      (mutation): mutation is WithSerializedTarget<RumAttributesMutationRecord> =>
        mutation.type === 'attributes' && !hasBeenSerialized(mutation.target)
    ),
    configuration
  )

  if (!texts.length && !attributes.length && !removes.length && !adds.length) {
    return
  }

  mutationCallback({
    adds,
    removes,
    texts,
    attributes,
  })
}

function processChildListMutations(
  mutations: Array<WithSerializedTarget<RumChildListMutationRecord>>,
  configuration: RumConfiguration,
  shadowRootsController: ShadowRootsController
) {
  // First, we iterate over mutations to collect:
  //
  // * nodes that have been added in the document and not removed by a subsequent mutation
  // * nodes that have been removed from the document but were not added in a previous mutation
  //
  // For this second category, we also collect their previous parent (mutation.target) because we'll
  // need it to emit a 'remove' mutation.
  //
  // Those two categories may overlap: if a node moved from a position to another, it is reported as
  // two mutation records, one with a "removedNodes" and the other with "addedNodes". In this case,
  // the node will be in both sets.
  const addedAndMovedNodes = new Set<Node>()
  const removedNodes = new Map<Node, NodeWithSerializedNode>()
  for (const mutation of mutations) {
    mutation.addedNodes.forEach((node) => {
      addedAndMovedNodes.add(node)
    })
    mutation.removedNodes.forEach((node) => {
      if (!addedAndMovedNodes.has(node)) {
        removedNodes.set(node, mutation.target)
      }
      addedAndMovedNodes.delete(node)
    })
  }

  // Then, we sort nodes that are still in the document by topological order, for two reasons:
  //
  // * We will serialize each added nodes with their descendants. We don't want to serialize a node
  // twice, so we need to iterate over the parent nodes first and skip any node that is contained in
  // a precedent node.
  //
  // * To emit "add" mutations, we need references to the parent and potential next sibling of each
  // added node. So we need to iterate over the parent nodes first, and when multiple nodes are
  // siblings, we want to iterate from last to first. This will ensure that any "next" node is
  // already serialized and have an id.
  const sortedAddedAndMovedNodes = Array.from(addedAndMovedNodes)
  sortAddedAndMovedNodes(sortedAddedAndMovedNodes)

  // Then, we iterate over our sorted node sets to emit mutations. We collect the newly serialized
  // node ids in a set to be able to skip subsequent related mutations.
  const serializedNodeIds = new Set<number>()

  const addedNodeMutations: AddedNodeMutation[] = []
  for (const node of sortedAddedAndMovedNodes) {
    if (hasBeenSerialized(node)) {
      continue
    }

    const parentNodePrivacyLevel = getNodePrivacyLevel(node.parentNode!, configuration.defaultPrivacyLevel)
    if (parentNodePrivacyLevel === NodePrivacyLevel.HIDDEN || parentNodePrivacyLevel === NodePrivacyLevel.IGNORE) {
      continue
    }

    const serializedNode = serializeNodeWithId(node, {
      serializedNodeIds,
      parentNodePrivacyLevel,
      serializationContext: { status: SerializationContextStatus.MUTATION, shadowRootsController },
      configuration,
    })
    if (!serializedNode) {
      continue
    }

    const parentNode = getParentNode(node)!
    addedNodeMutations.push({
      nextId: getNextSibling(node),
      parentId: getSerializedNodeId(parentNode)!,
      node: serializedNode,
    })
  }
  // Finally, we emit remove mutations.
  const removedNodeMutations: RemovedNodeMutation[] = []
  removedNodes.forEach((parent, node) => {
    if (hasSerializedNode(node)) {
      removedNodeMutations.push({
        parentId: getSerializedNodeId(parent),
        id: getSerializedNodeId(node),
      })
    }
  })

  return { adds: addedNodeMutations, removes: removedNodeMutations, hasBeenSerialized }

  function hasBeenSerialized(node: Node) {
    return hasSerializedNode(node) && serializedNodeIds.has(getSerializedNodeId(node))
  }

  function getNextSibling(node: Node): null | number {
    let nextSibling = node.nextSibling
    while (nextSibling) {
      if (hasSerializedNode(nextSibling)) {
        return getSerializedNodeId(nextSibling)
      }
      nextSibling = nextSibling.nextSibling
    }

    return null
  }
}

function processCharacterDataMutations(
  mutations: Array<WithSerializedTarget<RumCharacterDataMutationRecord>>,
  configuration: RumConfiguration
) {
  const textMutations: TextMutation[] = []

  // Deduplicate mutations based on their target node
  const handledNodes = new Set<Node>()
  const filteredMutations = mutations.filter((mutation) => {
    if (handledNodes.has(mutation.target)) {
      return false
    }
    handledNodes.add(mutation.target)
    return true
  })

  // Emit mutations
  for (const mutation of filteredMutations) {
    const value = mutation.target.textContent
    if (value === mutation.oldValue) {
      continue
    }

    const parentNodePrivacyLevel = getNodePrivacyLevel(
      getParentNode(mutation.target)!,
      configuration.defaultPrivacyLevel
    )
    if (parentNodePrivacyLevel === NodePrivacyLevel.HIDDEN || parentNodePrivacyLevel === NodePrivacyLevel.IGNORE) {
      continue
    }

    textMutations.push({
      id: getSerializedNodeId(mutation.target),
      // TODO: pass a valid "ignoreWhiteSpace" argument
      value: getTextContent(mutation.target, false, parentNodePrivacyLevel) ?? null,
    })
  }

  return textMutations
}

function processAttributesMutations(
  mutations: Array<WithSerializedTarget<RumAttributesMutationRecord>>,
  configuration: RumConfiguration
) {
  const attributeMutations: AttributeMutation[] = []

  // Deduplicate mutations based on their target node and changed attribute
  const handledElements = new Map<Element, Set<string>>()
  const filteredMutations = mutations.filter((mutation) => {
    const handledAttributes = handledElements.get(mutation.target)
    if (handledAttributes?.has(mutation.attributeName!)) {
      return false
    }
    if (!handledAttributes) {
      handledElements.set(mutation.target, new Set([mutation.attributeName!]))
    } else {
      handledAttributes.add(mutation.attributeName!)
    }
    return true
  })

  // Emit mutations
  const emittedMutations = new Map<Element, AttributeMutation>()
  for (const mutation of filteredMutations) {
    const uncensoredValue = mutation.target.getAttribute(mutation.attributeName!)
    if (uncensoredValue === mutation.oldValue) {
      continue
    }
    const privacyLevel = getNodePrivacyLevel(mutation.target, configuration.defaultPrivacyLevel)
    const attributeValue = serializeAttribute(mutation.target, privacyLevel, mutation.attributeName!, configuration)

    let transformedValue: string | null
    if (mutation.attributeName === 'value') {
      const inputValue = getElementInputValue(mutation.target, privacyLevel)
      if (inputValue === undefined) {
        continue
      }
      transformedValue = inputValue
    } else if (typeof attributeValue === 'string') {
      transformedValue = attributeValue
    } else {
      transformedValue = null
    }

    let emittedMutation = emittedMutations.get(mutation.target)
    if (!emittedMutation) {
      emittedMutation = {
        id: getSerializedNodeId(mutation.target),
        attributes: {},
      }
      attributeMutations.push(emittedMutation)
      emittedMutations.set(mutation.target, emittedMutation)
    }

    emittedMutation.attributes[mutation.attributeName!] = transformedValue
  }

  return attributeMutations
}

export function sortAddedAndMovedNodes(nodes: Node[]) {
  nodes.sort((a, b) => {
    const position = a.compareDocumentPosition(b)
    /* eslint-disable no-bitwise */
    if (position & Node.DOCUMENT_POSITION_CONTAINED_BY) {
      return -1
    } else if (position & Node.DOCUMENT_POSITION_CONTAINS) {
      return 1
    } else if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return 1
    } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return -1
    }
    /* eslint-enable no-bitwise */
    return 0
  })
}

function traverseRemovedShadowDom(removedNode: Node, shadowDomRemovedCallback: ShadowRootCallBack) {
  if (isNodeShadowHost(removedNode)) {
    shadowDomRemovedCallback(removedNode.shadowRoot)
  }
  forEachChildNodes(removedNode, (childNode) => traverseRemovedShadowDom(childNode, shadowDomRemovedCallback))
}
