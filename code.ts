// code.ts

/**
 * Figma Plugin: Make way!
 * Automatically shifts elements to the right of the selection (S) 
 * that vertically overlap with S, creating empty space.
 */

// --- Plugin Entry Point ---

figma.on('run', ({ command, parameters }: RunEvent) => {
  if (command) {
    switch (command) {
      case "makeSpaceDuplicateNode":
        if (validateAndSendState(true)) {
          const selection = figma.currentPage.selection
          executeMovement(selection[0].width + 80)
        }
        return
      case "makeSpacePixels":
        if (parameters && !isNaN(parameters["pixels"]) && parameters["pixels"] > 0) {
          if (validateAndSendState(true)) {
            executeMovement(Number(parameters["pixels"]))
          }
        }
        figma.notify("Please enter a valid number in pixels and rerun", { error: true })
        return
    }
  }

  // 1. Show UI immediately
  figma.showUI(__html__, { width: 400, height: 360, title: "Make way!" })

  // 2. Initial validation and state update
  validateAndSendState(false)

  // 3. Listen for selection changes and re-validate
  figma.on('selectionchange', () => {
    validateAndSendState(false)
  })

  // 4. Listen for the user's action from the UI
  figma.ui.on('message', (msg) => {
    if (msg.type === 'move') {
      // Re-validate just before running the movement
      if (!validateAndSendState(false)) {
        figma.notify("Please select a top level node.", { error: true })
        return
      }

      const space = parseInt(msg.value, 10)
      if (isNaN(space) || space <= 0) {
        figma.notify("Please enter a valid positive number for the space.", { error: true })
        // Do not close the plugin if the input is bad
      } else {
        executeMovement(space)
      }
    }
    // Handle UI close event (optional, but good practice)
    if (msg.type === 'close') {
      figma.closePlugin()
    }
  })
})

// --- Validation and UI Update Logic ---

/**
 * Checks selection validity and sends the appropriate state message to the UI or returns values in headless mode
 * @returns true if the selection is valid, false otherwise.
 */
function validateAndSendState(headless: boolean): boolean {
  const selection = figma.currentPage.selection

  if (selection.length !== 1) {
    headless
      ? figma.notify("Please select a top level node and rerun", { error: true })
      : figma.ui.postMessage({ type: 'selectionState', state: 'INVALID', message: "Please select a top level node" })
    return false
  }

  const S = selection[0] // The selected node
  const SParent = S.parent

  // Check if parent is a Page or a Section
  if (SParent === figma.currentPage || SParent?.type === 'SECTION') {
    // Valid selection

    // Calculate Default Space: Selected node width + 80px.
    const DEFAULT_SPACE = Math.round(S.width + 80)

    !headless && figma.ui.postMessage({
      type: 'selectionState',
      state: 'VALID',
      message: `${S.width}px (selected node width) + 80px buffer`,
      defaultSpace: DEFAULT_SPACE
    })
    return true
  } else {
    // Invalid parent
    headless
      ? figma.notify("Please select a top level node and rerun", { error: true })
      : figma.ui.postMessage({ type: 'selectionState', state: 'INVALID', message: "Please select a top level node" })
    return false
  }
}


// --- Core Movement Logic ---

/**
 * Contains the main logic to find, move, and resize elements.
 * @param SPACE_TO_CREATE The amount of space to create (in pixels).
 */
function executeMovement(SPACE_TO_CREATE: number) {
  figma.notify(`Moving all items on the right by ${SPACE_TO_CREATE}px...`)
  const selection = figma.currentPage.selection
  const S = selection[0]
  const SBounds = getAbsoluteBounds(S)
  let nodesToMove: SceneNode[] = []

  // 1. Traversal (Identification)
  figma.currentPage.children.forEach(node => {
    findNodesToMove(node, S, SBounds, nodesToMove)
  })

  // 2. Post-Processing Filter
  const candidateCount = nodesToMove.length
  nodesToMove = filterNodesByProximity(nodesToMove, S, SPACE_TO_CREATE)
  const filteredCount = candidateCount - nodesToMove.length

  // 3. Sorting and Movement
  if (nodesToMove.length === 0) {
    figma.notify("No elements to move in the affected zone.", { error: false })
  } else {
    // Sort nodes by absX in descending order (farthest right first)
    nodesToMove.sort((a, b) => getAbsoluteBounds(b).absX - getAbsoluteBounds(a).absX)
    figma.currentPage.setRelaunchData({ makeSpace: `Creates ${SPACE_TO_CREATE}px space to the right of this node` })

    let nodesMovedCount = 0
    for (const N of nodesToMove) {
      if ('x' in N) {
        N.x += SPACE_TO_CREATE
        nodesMovedCount++
      }
    }

    // 4. Resize Ancestors
    resizeAncestors(S, SPACE_TO_CREATE)

    let message = `${nodesMovedCount} nodes moved by ${SPACE_TO_CREATE}px`
    if (filteredCount > 0) {
      message += `. ${filteredCount} distant nodes not touched.`
    }
    figma.notify(message)
  }

  figma.closePlugin()
}



// --- Helper Functions ---

function getAbsoluteBounds(node: SceneNode): { absX: number; absY: number; absXend: number; absYend: number } {
  const transform = node.absoluteTransform
  const absX = transform[0][2]
  const absY = transform[1][2]
  const absXend = absX + node.width
  const absYend = absY + node.height
  return { absX, absY, absXend, absYend }
}

function checkVerticalOverlap(NBounds: { absY: number; absYend: number }, SBounds: { absY: number; absYend: number }): boolean {
  const notFullyAbove = NBounds.absYend > SBounds.absY
  const notFullyBelow = NBounds.absY < SBounds.absYend
  return notFullyAbove && notFullyBelow
}

function resizeAncestors(S: SceneNode, resizeAmount: number) {
  let parent = S.parent
  while (parent && parent.type !== 'PAGE') {
    if (
      (parent.type === 'FRAME' || parent.type === 'SECTION') &&
      !parent.locked
    ) {
      try {
        const resizableParent = parent as (FrameNode | SectionNode)
        const newWidth = resizableParent.width + resizeAmount
        resizableParent.resizeWithoutConstraints(newWidth, resizableParent.height)
        console.log(`Resized ancestor '${resizableParent.name}' (${resizableParent.type}) by ${resizeAmount}px using resizeWithoutConstraints.`)
      } catch (e) {
        console.warn(`CRITICAL ERROR: resizeWithoutConstraints failed on ancestor node ${parent.name} (${parent.type}):`, e)
      }
    } else {
      console.log(`Skipping ancestor '${parent.name}' (${parent.type}) - not Frame/Section or is locked.`)
    }
    parent = parent.parent
  }
}

function findNodesToMove(
  node: SceneNode,
  S: SceneNode,
  SBounds: { absX: number; absY: number; absXend: number; absYend: number },
  nodesToMove: SceneNode[]
) {
  if (!('visible' in node) || !node.visible || node.locked) {
    return
  }
  const NBounds = getAbsoluteBounds(node)

  // Rule 1: Ancestor Check
  let isAncestor = false
  let tempParent = S.parent
  while (tempParent) {
    if (tempParent.id === node.id) {
      isAncestor = true
      break
    }
    tempParent = tempParent.parent
  }

  if (isAncestor) {
    if ('children' in node) {
      node.children.forEach(child => findNodesToMove(child, S, SBounds, nodesToMove))
    }
    return
  }

  // Rule 2: Vertical Pruning
  if (!checkVerticalOverlap(NBounds, SBounds)) {
    return
  }

  const isToTheRight = NBounds.absX >= SBounds.absXend

  // Rule 3: Affected Zone (without proximity check yet)
  if (isToTheRight) {
    nodesToMove.push(node)
    return // Prune the branch
  }

  // Rule 4: Horizontal Pass
  if ('children' in node) {
    node.children.forEach(child => findNodesToMove(child, S, SBounds, nodesToMove))
  }
}

/**
 * Checks if N is an immediate sibling of S (i.e., they share the same parent).
 */
function isImmediateSibling(S: SceneNode, N: SceneNode): boolean {
  // Ensure both nodes have a parent and their parents are the same, 
  // and N is not S itself (though Rule 1 handles the latter).
  return S.parent !== null && S.parent.id === N.parent?.id
}

/**
 * Finds the sibling ancestor (X) of S relative to N.
 * X is the ancestor of S that shares N's immediate parent (the Nearest Common Ancestor, C).
 */
function findAncestorX(S: SceneNode, N: SceneNode): SceneNode | null {
  const NParent = N.parent
  if (!NParent) return null // N has no parent (e.g., it's the root itself)

  // Find the ancestor of S that is a direct child of N's parent (NParent)
  let ancestor = S as SceneNode | BaseNode
  while (ancestor && ancestor.parent && ancestor.parent.id !== NParent.id) {
    ancestor = ancestor.parent
  }

  // 'ancestor' is now the node X, the direct child of NParent that contains S.
  // Check if we reached the root of the search without finding X (shouldn't happen 
  // if N was found via the traversal, but necessary for safety).
  if (ancestor && ancestor.parent && ancestor.parent.id === NParent.id) {
    return ancestor as SceneNode
  }

  return null
}

/**
 * Applies the post-processing filter to remove nodes that are too far horizontally 
 * from the *projected* new edge of S's ancestor (X).
 * @param nodesToMove The array of candidate nodes.
 * @param S The selected node.
 * @param SPACE_TO_CREATE The amount of space being created.
 */
function filterNodesByProximity(
  nodesToMove: SceneNode[],
  S: SceneNode,
  SPACE_TO_CREATE: number
): SceneNode[] {
  const MAX_H_DISTANCE = 100 // The maximum allowed horizontal gap

  const filteredList: SceneNode[] = []

  for (const N of nodesToMove) {
    // Compulsory Movement for Immediate Siblings
    if (isImmediateSibling(S, N)) {
      console.log(`[FILTER] Compulsory move: Node '${N.name}' is an immediate sibling of S.`)
      filteredList.push(N)
      continue // Skip the proximity check
    }

    const X = findAncestorX(S, N)

    if (X) {
      const XBounds = getAbsoluteBounds(X)
      const NBounds = getAbsoluteBounds(N)

      const projectedXRightEdge = XBounds.absX + X.width + SPACE_TO_CREATE
      const projectedDeltaX = NBounds.absX - projectedXRightEdge

      // Add detailed logging here:
      console.log(`[FILTER] Checking N: ${N.name} (absX: ${NBounds.absX.toFixed(0)}) against X: ${X.name} (Projected R-Edge: ${projectedXRightEdge.toFixed(0)}). Delta: ${projectedDeltaX.toFixed(0)}`)

      // Proximity Check
      if (projectedDeltaX <= MAX_H_DISTANCE) {
        filteredList.push(N)
      } else {
        console.log(`[FILTER] Removed N: ${N.name}. Delta > 100px.`)
      }
    } else {
      // If X cannot be found, the node is considered too structurally remote for proximity check.
      console.warn(`[FILTER] Could not find structural reference X for node '${N.name}'. Filtering it out by default.`)
    }
  }

  return filteredList
}

