// Define the types we'll be working with for clarity
type ValidParentNode = (SectionNode | PageNode | DocumentNode) & ChildrenMixin
type SceneNodeWithLocation = FrameNode | GroupNode | ComponentNode | SectionNode | TextNode | VectorNode | SceneNode

// --- Helper to get absolute position ---
function getAbsoluteBoundingBox(node: SceneNode) {
  if (!('absoluteTransform' in node) || !('width' in node) || !('height' in node)) {
    return null
  }

  // absoluteTransform is a 2x3 matrix: [[m00, m01, m02], [m10, m11, m12]]
  const transform = (node as any).absoluteTransform

  return {
    x: transform[0][2],
    y: transform[1][2],
    width: node.width,
    height: node.height,
  }
}

// --------------------------------------------------------------------------------------------------
// --- CORE COLLISION RESOLUTION LOGIC ---
// --------------------------------------------------------------------------------------------------

/**
 * Propagates a fixed shift amount among siblings to the right of a starting node
 * in a single, controlled, iterative pass.
 * * This function is non-recursive, eliminating RangeError exceptions.
 * * @param StartNode The node whose final position defines the initial ripple frontier.
 * @param Parent The common parent container.
 * @param ShiftAmount The fixed amount (in pixels) all affected nodes will be moved.
 */
function PropagateShift(StartNode: SceneNode, Parent: ValidParentNode, ShiftAmount: number): void {
  if (!('children' in Parent)) return

  const startAbsBox = getAbsoluteBoundingBox(StartNode)
  if (!startAbsBox) return

  // 1. Establish the initial ripple frontier (the right edge of the node causing the push)
  let rippleFrontierX = startAbsBox.x + startAbsBox.width

  // 2. Identify all relevant siblings: vertically overlapping AND physically to the right.
  const relevantSiblings = Parent.children
    .filter(N => {
      // Exclude self, non-SceneNode, and locked nodes.
      if (!('x' in N) || N === StartNode || N.locked) {
        return false
      }

      const siblingAbsBox = getAbsoluteBoundingBox(N)
      if (!siblingAbsBox) {
        return false
      }

      // Vertical Overlap Check
      const verticalOverlap = (siblingAbsBox.y < startAbsBox.y + startAbsBox.height) &&
        (siblingAbsBox.y + siblingAbsBox.height > startAbsBox.y)

      // Horizontal Filter: Sibling must be positioned to the right of the StartNode's left edge.
      // This includes the target nodes for movement.
      const startsToTheRight = siblingAbsBox.x >= startAbsBox.x

      // We only include nodes that are vertically aligned and are candidates for being pushed.
      return verticalOverlap && startsToTheRight
    }) as SceneNode[]

  // 3. Sort the siblings strictly from left to right. This is CRITICAL for the iterative sweep.
  relevantSiblings.sort((a, b) => {
    const absA = getAbsoluteBoundingBox(a)
    const absB = getAbsoluteBoundingBox(b)
    return (absA ? absA.x : 0) - (absB ? absB.x : 0)
  })

  // 4. Perform the single, iterative sweep.
  relevantSiblings.forEach(N => {
    const siblingAbsBox = getAbsoluteBoundingBox(N)
    if (!siblingAbsBox) return

    // COLLISION CHECK: Does this sibling's left edge overlap the current ripple frontier?
    if (siblingAbsBox.x < rippleFrontierX) {

      // A. Move the node by the fixed amount.
      const oldX = N.x
      N.x += ShiftAmount

      console.log(`[Sweep] Moved '${N.name}' from x: ${oldX} to x: ${N.x} (Shift: ${ShiftAmount}px)`)
      figma.notify(`Moving ${N.name}...`, { timeout: 50 })

      // B. ⚠️ Propagate the movement: The new ripple frontier is set by this node's new right edge.
      // We must recalculate the absolute box for the next check.
      const newSiblingAbsBox = getAbsoluteBoundingBox(N)
      if (newSiblingAbsBox) {
        // The new frontier is the NEW position of the moved node.
        rippleFrontierX = newSiblingAbsBox.x + newSiblingAbsBox.width
      }

    } else {
      // If the node is not overlapping the current frontier, the ripple stops.
      // Because the list is sorted, we can safely break the loop for further efficiency.
      return // Equivalent to break in a typical for-loop
    }
  })
}
// --------------------------------------------------------------------------------------------------
// --- UPWARD PROPAGATION LOGIC ---
// --------------------------------------------------------------------------------------------------

/**
 * ⬆️ Upward Propagation and Parent Collision Check (Helper Function)
 */
// ...

function PropagateResize(ResizedNode: SectionNode, SpaceCreatedInResize: number, level: number): void {
  const X = ResizedNode
  // P is the parent of X (ResizedNode). We explicitly allow it to be DocumentNode now.
  const P = X.parent as (ValidParentNode | null)

  const logPrefix = `[Resize Propagate L${level}]`

  // 1. BASE CASE CHECK: If P is the Page, Document, or null.
  if (!P || P.type === 'DOCUMENT' || P.type === 'PAGE') {

    console.log(`${logPrefix} Reached Page/Document. Running final sibling shift check.`)

    // CRITICAL FIX: Run the shift on the Page's children (where Section 6 is).
    // We must ensure P is a valid parent type (SectionNode, PageNode, or DocumentNode) 
    // before passing it to PropagateShift.
    if (P && (P.type === 'PAGE' || P.type === 'DOCUMENT') && 'children' in P) {
      figma.notify(`Running final shift against elements on the Page...`, { timeout: 1000 })

      // 🚨 FIX: Type assertion to tell TypeScript that P conforms to ValidParentNode
      PropagateShift(X as SceneNode, P as ValidParentNode, SpaceCreatedInResize)
    }

    console.log(`${logPrefix} Stopping upward propagation.`)
    return
  }

  // 2. RECURSIVE STEP: Parent is another Section (P_SECTION)
  const P_SECTION = P as SectionNode

  console.log(`${logPrefix} Processing parent Section: '${P_SECTION.name}'.`)

  // 2A. Parent Collision Check
  figma.notify(`Propagating collision to siblings of ${X.name} in ${P_SECTION.name}...`, { timeout: 1000 })
  PropagateShift(X as SceneNode, P_SECTION, SpaceCreatedInResize)

  // 2B. Resize P
  const oldWidth = P_SECTION.width
  P_SECTION.resizeWithoutConstraints(P_SECTION.width + SpaceCreatedInResize, P_SECTION.height)
  console.log(`${logPrefix} Resized parent '${P_SECTION.name}' from ${oldWidth}px to ${P_SECTION.width}px (using resizeWithoutConstraints).`)
  figma.notify(`Resizing parent Section ${P_SECTION.name}...`, { timeout: 500 })

  // 2C. Recursive Call
  PropagateResize(P_SECTION, SpaceCreatedInResize, level + 1)
}

// --------------------------------------------------------------------------------------------------
// --- UTILITY AND CORE FUNCTIONS ---
// --------------------------------------------------------------------------------------------------

function validateAndSendState(headless: boolean): boolean {
  // ... (unchanged validation logic)
  const selection = figma.currentPage.selection

  if (selection.length !== 1) {
    !headless && figma.ui.postMessage({ type: 'selectionState', state: 'INVALID', message: "Please select exactly one node" })
    return false
  }

  const S = selection[0]
  const SParent = S.parent

  if (SParent === figma.currentPage || SParent?.type === 'SECTION') {
    // Ensure the selected node has a width for default calculation
    const S_WIDTH = 'width' in S ? S.width : 0
    const DEFAULT_SPACE = Math.round(S_WIDTH + 80)

    !headless && figma.ui.postMessage({
      type: 'selectionState',
      state: 'VALID',
      message: `${S_WIDTH}px (selected node width) + 80px buffer`,
      defaultSpace: DEFAULT_SPACE
    })
    return true
  } else {
    const message = "Please select a node whose parent is the Page or a Section."
    headless
      ? figma.notify(message, { error: true })
      : figma.ui.postMessage({ type: 'selectionState', state: 'INVALID', message: message })
    return false
  }
}

/**
 * Executes the Collision-Based Path Mimicry ("Make Way") algorithm.
 * @param SPACE_TO_CREATE The distance in pixels to shift elements to the right.
 */
function executeMovement(SPACE_TO_CREATE: number): void {
  const selection = figma.currentPage.selection
  if (selection.length !== 1) return

  const S = selection[0] as SceneNodeWithLocation
  const SParent = S.parent

  if (!SParent || (SParent.type !== 'SECTION' && SParent.type !== 'PAGE')) {
    figma.notify("Error: Selected node must be a top-level child of a Section or the Page.", { error: true })
    return
  }

  // Type guard for the selected node to ensure it has position/dimensions
  if (!('x' in S) || !('width' in S) || !('height' in S)) {
    figma.notify("Error: Selected node type is not supported for movement.", { error: true })
    return
  }


  console.log(`--- STARTING MOVEMENT: ${S.name} ---`)
  console.log(`SPACE_TO_CREATE: ${SPACE_TO_CREATE}px`)

  const S_FRAME = S
  const SParent_CONTAINER = SParent as ValidParentNode

  /**
   * 1. 🎯 Initial Node Creation (The Push)
   */
  const Z = figma.createFrame()
  Z.name = "MAKE_WAY_TEMP_Z"
  Z.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 0.1 }]
  Z.strokes = []
  Z.opacity = 0.001 // Make it practically invisible

  // Position Z immediately to the right of the selected node S
  Z.x = S_FRAME.x + S_FRAME.width
  Z.y = S_FRAME.y
  Z.resize(SPACE_TO_CREATE, S_FRAME.height)
  SParent_CONTAINER.appendChild(Z)
  console.log(`1. Created temp node Z at x: ${Z.x}, width: ${Z.width}`)

  // Create the set of nodes that must remain stationary
  const nodesToBlock = new Set<SceneNode>([S, Z])

  try {
    /**
     * 2. 💥 Collision and Response Propagation (The Initial Ripple)
     */
    figma.notify(`Starting initial collision ripple...`, { timeout: 1000 })
    // The initial call starts the chain from Z and blocks S and Z from moving.
    PropagateShift(Z, SParent_CONTAINER, SPACE_TO_CREATE)

    /**
     * 3. 🖼️ Container Resizing (Local Parent)
     */
    if (SParent_CONTAINER.type === 'SECTION') {
      const parentSection = SParent_CONTAINER as SectionNode

      const oldWidth = parentSection.width
      parentSection.resizeWithoutConstraints(parentSection.width + SPACE_TO_CREATE, parentSection.height)
      console.log(`3. Resized local parent '${parentSection.name}' from ${oldWidth}px to ${parentSection.width}px (using resizeWithoutConstraints)`)
      figma.notify(`Resized local parent ${parentSection.name}...`, { timeout: 1000 })

      // Trigger Upward Propagation
      PropagateResize(parentSection, SPACE_TO_CREATE, 1)
    }

  } catch (error) {
    console.error("Make Way algorithm error:", error)
    figma.notify("An error occurred during movement propagation. Check console for details.", { error: true })
  } finally {
    // 4. CLEANUP
    Z.remove()
    console.log("5. Removed temp node Z.")
    figma.notify(`Movement Complete! Created ${SPACE_TO_CREATE}px space next to '${S.name}'!`, { timeout: 2000 })
    console.log(`--- FINISHED MOVEMENT ---`)
    figma.closePlugin()
  }
}

// --------------------------------------------------------------------------------------------------
// --- PLUGIN ENTRY POINT ---
// --------------------------------------------------------------------------------------------------
figma.on('run', ({ command, parameters }: RunEvent) => {
  if (command) {
    switch (command) {
      case "makeSpaceDuplicateNode":
        if (validateAndSendState(true)) {
          const selection = figma.currentPage.selection
          const selectedNode = selection[0] as (FrameNode | GroupNode | ComponentNode | SectionNode | TextNode | VectorNode)
          if (selectedNode && 'width' in selectedNode) {
            executeMovement(selectedNode.width + 80)
          }
        }
        return
      case "makeSpacePixels":
        if (parameters && !isNaN(parameters["pixels"]) && parameters["pixels"] > 0) {
          if (validateAndSendState(true)) {
            executeMovement(Number(parameters["pixels"]))
            return
          }
        }
        figma.notify("Please select a top-level node and enter a valid positive number for the space.", { error: true })
        return
    }
  }

  figma.showUI(__html__, { width: 400, height: 360, title: "Make way!" })
  validateAndSendState(false)
  figma.on('selectionchange', () => {
    validateAndSendState(false)
  })
  figma.ui.on('message', (msg) => {
    if (msg.type === 'move') {
      if (!validateAndSendState(false)) {
        figma.notify("Please select a top level node.", { error: true })
        return
      }

      const space = parseInt(msg.value, 10)
      if (isNaN(space) || space <= 0) {
        figma.notify("Please enter a valid positive number for the space.", { error: true })
      } else {
        executeMovement(space)
      }
    }
    if (msg.type === 'close') {
      figma.closePlugin()
    }
  })
})