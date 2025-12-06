// code.ts

/**
 * Figma Plugin: Make way!
 * Automatically shifts elements to the right of the selection (S) 
 * that vertically overlap with S, creating empty space.
 */

// All helper functions (getAbsoluteBounds, checkVerticalOverlap, resizeAncestors, findNodesToMove) 
// remain the same as in your original code. 
// For brevity, I'll omit them here but they must be present in the final file.

// --- Helper Functions (KEEP YOUR ORIGINAL IMPLEMENTATION HERE) ---

function getAbsoluteBounds(node: SceneNode): { absX: number; absY: number; absXend: number; absYend: number } {
  // ... your original implementation
  const transform = node.absoluteTransform
  const absX = transform[0][2]
  const absY = transform[1][2]
  const absXend = absX + node.width
  const absYend = absY + node.height
  return { absX, absY, absXend, absYend }
}

function checkVerticalOverlap(NBounds: { absY: number; absYend: number }, SBounds: { absY: number; absYend: number }): boolean {
  // ... your original implementation
  const notFullyAbove = NBounds.absYend > SBounds.absY
  const notFullyBelow = NBounds.absY < SBounds.absYend
  return notFullyAbove && notFullyBelow
}

function resizeAncestors(S: SceneNode, resizeAmount: number) {
  // ... your original implementation
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
  // ... your original implementation
  if (!('visible' in node) || !node.visible || node.locked) {
    return
  }
  const NBounds = getAbsoluteBounds(node)

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

  if (!checkVerticalOverlap(NBounds, SBounds)) {
    return
  }

  const isToTheRight = NBounds.absX >= SBounds.absXend

  if (isToTheRight) {
    nodesToMove.push(node)
    return
  }

  if ('children' in node) {
    node.children.forEach(child => findNodesToMove(child, S, SBounds, nodesToMove))
  }
}

// --- Core Movement Logic ---

/**
 * Contains the main logic to find, move, and resize elements.
 * @param SPACE_TO_CREATE The amount of space to create (in pixels).
 */
function executeMovement(SPACE_TO_CREATE: number) {
  // Logic remains the same: Traversal, Movement, Resize, and figmaclosePlugin()
  // ... (Your previous executeMovement implementation)

  const selection = figma.currentPage.selection
  const S = selection[0]
  const SBounds = getAbsoluteBounds(S)
  const nodesToMove: SceneNode[] = []

  // 1. Traversal
  figma.currentPage.children.forEach(node => {
    findNodesToMove(node, S, SBounds, nodesToMove)
  })

  // 2. Sorting and Movement
  if (nodesToMove.length === 0) {
    figma.notify("Nothing to move on the right!", { error: false })
  } else {
    nodesToMove.sort((a, b) => getAbsoluteBounds(b).absX - getAbsoluteBounds(a).absX)
    figma.currentPage.setRelaunchData({ makeSpace: `Creates ${SPACE_TO_CREATE}px space to the right of this node` })

    let nodesMovedCount = 0
    for (const N of nodesToMove) {
      if ('x' in N) {
        N.x += SPACE_TO_CREATE
        nodesMovedCount++
      }
    }

    // 3. Resize Ancestors
    resizeAncestors(S, SPACE_TO_CREATE)

    figma.notify(`${nodesMovedCount} nodes moved by ${SPACE_TO_CREATE}px`)
  }

  // NOTE: Closing the plugin here, so it only runs once per button click.
  figma.closePlugin()
}

// --- Validation and UI Update Logic ---

/**
 * Checks selection validity and sends the appropriate state message to the UI.
 * @returns true if the selection is valid, false otherwise.
 */
function validateAndSendState(): boolean {
  const selection = figma.currentPage.selection

  if (selection.length !== 1) {
    figma.ui.postMessage({ type: 'selectionState', state: 'INVALID', message: "Please select a top level node" })
    return false
  }

  const S = selection[0] // The selected node
  const SParent = S.parent

  // Check if parent is a Page or a Section
  if (SParent === figma.currentPage || SParent?.type === 'SECTION') {
    // Valid selection

    // Calculate Default Space: Selected node width + 80px.
    const DEFAULT_SPACE = Math.round(S.width + 80)

    figma.ui.postMessage({
      type: 'selectionState',
      state: 'VALID',
      message: `${S.width}px (node width) + 80px`,
      defaultSpace: DEFAULT_SPACE
    })
    return true
  } else {
    // Invalid parent
    figma.ui.postMessage({ type: 'selectionState', state: 'INVALID', message: "Please select a top level node" })
    return false
  }
}


// --- Plugin Entry Point ---

figma.on('run', () => {
  // 1. Show UI immediately
  figma.showUI(__html__, { width: 300, height: 165, title: "Make way!" })

  // 2. Initial validation and state update
  validateAndSendState()

  // 3. Listen for selection changes and re-validate
  figma.on('selectionchange', () => {
    validateAndSendState()
  })

  // 4. Listen for the user's action from the UI
  figma.ui.on('message', (msg) => {
    if (msg.type === 'move') {
      // Re-validate just before running the movement
      if (!validateAndSendState()) {
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