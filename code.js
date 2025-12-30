"use strict";
figma.on('run', ({ command, parameters }) => {
    if (parameters) {
        if (!isNaN(parameters["space-in-pixels"]) && parameters["space-in-pixels"] > 0) {
            if (validateAndSendState(true)) {
                executeMovement(Number(parameters["space-in-pixels"]));
            }
        }
        else {
            figma.notify("Please enter a valid number in pixels and rerun", {
                error: true,
                timeout: 5000,
                onDequeue: () => {
                    figma.closePlugin();
                }
            });
        }
    }
    else {
        showPluginUI();
    }
});
figma.parameters.on("input", ({ parameters, key, query, result }) => {
    switch (key) {
        case "space-in-pixels":
            setSuggestion(result);
            figma.on('selectionchange', () => {
                setSuggestion(result);
            });
            break;
        default:
            break;
    }
});
function showPluginUI() {
    figma.showUI(__html__, { width: 400, height: 362, title: "Make way!" });
    validateAndSendState(false);
    figma.on('selectionchange', () => {
        validateAndSendState(false);
    });
    figma.ui.on('message', (msg) => {
        if (msg.type === 'move') {
            const space = parseInt(msg.value, 10);
            executeMovement(space);
        }
        if (msg.type === 'close') {
            figma.closePlugin();
        }
    });
}
function validateAndSendState(headless) {
    const selection = figma.currentPage.selection;
    if (selection.length < 1) {
        headless
            ? figma.notify("Please select a top level item and rerun", {
                error: true,
                timeout: 5000,
                onDequeue: () => {
                    figma.closePlugin();
                }
            })
            : figma.ui.postMessage({ type: 'selectionState', state: 'INVALID', message: "Please select a top level item" });
        return false;
    }
    if (selection.length > 1) {
        headless
            ? figma.notify("Please select exactly one top level item and rerun", {
                error: true,
                timeout: 5000,
                onDequeue: () => {
                    figma.closePlugin();
                }
            })
            : figma.ui.postMessage({ type: 'selectionState', state: 'INVALID', message: "Please select exactly one item" });
        return false;
    }
    const S = selection[0];
    const SParent = S.parent;
    if (SParent === figma.currentPage || (SParent === null || SParent === void 0 ? void 0 : SParent.type) === 'SECTION') {
        // Ensure the selected node has a width for default calculation
        const S_WIDTH = 'width' in S ? Math.round(S.width) : 0;
        const gap = getGap(S);
        const DEFAULT_SPACE = Math.round(S_WIDTH + (gap > 0 ? gap : 40));
        !headless && figma.ui.postMessage({
            type: 'selectionState',
            state: 'VALID',
            message: `${S_WIDTH}px (selected item width) + ${gap > 0 ? gap : 40}px for gap`,
            defaultSpace: DEFAULT_SPACE
        });
        return true;
    }
    else {
        headless
            ? figma.notify("Please select a top level item and rerun", {
                error: true,
                timeout: 5000,
                onDequeue: () => {
                    figma.closePlugin();
                }
            })
            : figma.ui.postMessage({ type: 'selectionState', state: 'INVALID', message: "Please select a top level item" });
        return false;
    }
}
function setSuggestion(result) {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1) {
        return false;
    }
    const S = selection[0];
    const SParent = S.parent;
    if (SParent === figma.currentPage || (SParent === null || SParent === void 0 ? void 0 : SParent.type) === 'SECTION') {
        // Ensure the selected node has a width for default calculation
        const S_WIDTH = 'width' in S ? Math.round(S.width) : 0;
        const gap = getGap(S);
        try {
            result.setSuggestions([
                { name: `${S_WIDTH + gap}px (${S_WIDTH}px + ${gap}px for gap)`, data: `${S_WIDTH + gap}` },
            ]);
        }
        catch (error) {
            console.error(`Ignoring selection change since updating suggestions is not allowed ${error}`);
        }
        return true;
    }
    else {
        return false;
    }
}
function getGap(S) {
    const Parent = S.parent;
    const SAbsBox = getAbsoluteBoundingBox(S);
    if (Parent && SAbsBox) {
        // Identify and sort relevant siblings(Vertically overlapping and to the right)
        const relevantSiblings = Parent.children.filter(N => {
            if (!('x' in N) || N === S || N.locked) {
                return false;
            }
            const siblingAbsBox = getAbsoluteBoundingBox(N);
            if (!siblingAbsBox) {
                return false;
            }
            const verticalOverlap = (siblingAbsBox.y < SAbsBox.y + SAbsBox.height) &&
                (siblingAbsBox.y + siblingAbsBox.height > SAbsBox.y);
            const startsToTheRight = siblingAbsBox.x >= SAbsBox.x;
            return verticalOverlap && startsToTheRight;
        });
        if (relevantSiblings && (relevantSiblings.length >= 1)) {
            relevantSiblings.sort((a, b) => {
                const absA = getAbsoluteBoundingBox(a);
                const absB = getAbsoluteBoundingBox(b);
                return (absA ? absA.x : 0) - (absB ? absB.x : 0);
            });
            const nearestSiblingAbsBox = getAbsoluteBoundingBox(relevantSiblings[0]);
            if (nearestSiblingAbsBox) {
                return (Math.round((nearestSiblingAbsBox.x) - (SAbsBox.x + SAbsBox.width)));
            }
            else {
                return 40;
            }
        }
        else {
            return 40;
        }
    }
    else {
        return 40;
    }
}
function executeMovement(SPACE_TO_CREATE) {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1) {
        return;
    }
    const S = selection[0];
    const SParent = S.parent;
    // if (!SParent || (SParent.type !== 'SECTION' && SParent.type !== 'PAGE')) {
    //   figma.notify("Error: Selected node must be a top-level child of a Section or the Page.", { error: true })
    //   return
    // }
    // Type guard for the selected node to ensure it has position/dimensions
    // if (!('x' in S) || !('width' in S) || !('height' in S)) {
    //   figma.notify("Error: Selected node type is not supported for movement.", { error: true })
    //   return
    // }
    console.log(`--- STARTING MOVEMENT: ${S.name} ---`);
    console.log(`SPACE_TO_CREATE: ${SPACE_TO_CREATE}px`);
    const S_FRAME = S;
    const SParent_CONTAINER = SParent;
    // 1. Initial Node Creation (The Push)
    const Z = figma.createFrame();
    Z.name = "MAKE_WAY_TEMP_Z";
    Z.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 0.1 }];
    Z.strokes = [];
    Z.opacity = 0.001;
    // Position Z immediately to the right of the selected node S
    Z.x = S_FRAME.x + S_FRAME.width;
    Z.y = S_FRAME.y;
    Z.resize(SPACE_TO_CREATE, S_FRAME.height);
    SParent_CONTAINER.appendChild(Z);
    console.log(`1. Created temp node Z at x: ${Z.x}, width: ${Z.width}`);
    try {
        //  2. Collision and Response Propagation (The Initial Ripple)
        figma.notify(`Pushing items on the right...`, { timeout: 2000 });
        // The initial call starts the chain from Z.
        const finalRippleFrontierX = PropagateShift(Z, SParent_CONTAINER, SPACE_TO_CREATE);
        //  3. Local Parent Container Resizing
        // If not a section, then the parent is a page. No resizing needed and nothing to propagate up.
        if (SParent_CONTAINER.type === 'SECTION') {
            const parentSection = SParent_CONTAINER;
            const P_ABS_BOX = getAbsoluteBoundingBox(parentSection);
            if (P_ABS_BOX) {
                // Calculate the absolute right edge of the Parent Section BEFORE any resize.
                const parentAbsoluteRightBoundary = P_ABS_BOX.x + P_ABS_BOX.width;
                console.log(`[Initial Resize Check] Parent boundary: ${parentAbsoluteRightBoundary}px. Ripple front: ${finalRippleFrontierX}px.`);
                const rippleReachedBoundary = finalRippleFrontierX >= parentAbsoluteRightBoundary;
                if (rippleReachedBoundary) {
                    // Resize only if the ripple extended beyond the parent's boundary
                    const oldWidth = parentSection.width;
                    parentSection.resizeWithoutConstraints(parentSection.width + SPACE_TO_CREATE, parentSection.height);
                    console.log(`3. Ripple reached boundary. Resized local parent '${parentSection.name}' from ${oldWidth}px to ${parentSection.width}px.`);
                    // Trigger Upward Propagation
                    PropagateResize(parentSection, SPACE_TO_CREATE, 1);
                }
                else {
                    // If the ripple was contained in the local parent, we stop here.
                    console.log(`3. Ripple contained within local parent '${parentSection.name}'. Stopping propagation.`);
                }
            }
            else {
                figma.notify("Error: Could not determine initial parent bounds.", { error: true });
            }
        }
    }
    catch (error) {
        console.error("Make Way algorithm error:", error);
        figma.notify("An error occurred during movement propagation. Check console for details.", { error: true });
    }
    finally {
        // 4. CLEANUP
        Z.remove();
        console.log("4. Removed temp node Z.");
        figma.notify(`Space created next to "${S.name}". Now go use that space!`);
        console.log(`--- FINISHED MOVEMENT ---`);
        figma.closePlugin();
    }
}
function getAbsoluteBoundingBox(node) {
    if (!('absoluteTransform' in node) || !('width' in node) || !('height' in node)) {
        return null;
    }
    // absoluteTransform is a 2x3 matrix: [[m00, m01, m02], [m10, m11, m12]]
    const transform = node.absoluteTransform;
    return {
        x: transform[0][2],
        y: transform[1][2],
        width: node.width,
        height: node.height,
    };
}
function PropagateShift(StartNode, Parent, ShiftAmount) {
    if (!('children' in Parent))
        return 0; // Return 0 if no shift can occur (default for safety)
    const startAbsBox = getAbsoluteBoundingBox(StartNode);
    if (!startAbsBox)
        return 0;
    // 1. Establish the initial ripple frontier (the right edge of the node causing the push)
    let rippleFrontierX = startAbsBox.x + startAbsBox.width;
    // 2. Identify and sort relevant siblings (Vertically overlapping and to the right)
    const relevantSiblings = Parent.children
        .filter(N => {
        if (!('x' in N) || N === StartNode || N.locked) {
            return false;
        }
        const siblingAbsBox = getAbsoluteBoundingBox(N);
        if (!siblingAbsBox) {
            return false;
        }
        const verticalOverlap = (siblingAbsBox.y < startAbsBox.y + startAbsBox.height) &&
            (siblingAbsBox.y + siblingAbsBox.height > startAbsBox.y);
        const startsToTheRight = siblingAbsBox.x >= startAbsBox.x;
        return verticalOverlap && startsToTheRight;
    });
    relevantSiblings.sort((a, b) => {
        const absA = getAbsoluteBoundingBox(a);
        const absB = getAbsoluteBoundingBox(b);
        return (absA ? absA.x : 0) - (absB ? absB.x : 0);
    });
    // 3. Perform the iterative sweep.
    for (const N of relevantSiblings) {
        const siblingAbsBox = getAbsoluteBoundingBox(N);
        if (!siblingAbsBox) {
            break;
        }
        // COLLISION CHECK: Does this sibling's left edge overlap the current ripple frontier?
        if (siblingAbsBox.x < rippleFrontierX) {
            // A. Move the node
            const oldX = N.x;
            N.x += ShiftAmount;
            console.log(`[Sweep] Moved '${N.name}' from x: ${oldX} to x: ${N.x} (Shift: ${ShiftAmount}px)`);
            // B. Update the ripple frontier with the NEW position of the moved node.
            const newSiblingAbsBox = getAbsoluteBoundingBox(N);
            if (newSiblingAbsBox) {
                rippleFrontierX = newSiblingAbsBox.x + newSiblingAbsBox.width;
            }
        }
        else {
            // If the node is not overlapping, the ripple stops. Also break since no nodes on the right need moving.
            break;
        }
    }
    // Return the absolute X-coordinate of the final ripple frontier.
    return rippleFrontierX;
}
function PropagateResize(ResizedNode, SpaceCreatedInResize, level) {
    const X = ResizedNode;
    const P = X.parent;
    const logPrefix = `[Resize Propagate L${level}]`;
    // 1. BASE CASE CHECK: Page, Document, or null.
    if (P && (P.type === 'PAGE' || P.type === 'DOCUMENT') && 'children' in P) {
        // Run the shift on the page, the return value is irrelevant here.
        PropagateShift(X, P, SpaceCreatedInResize);
        console.log(`${logPrefix} Stopping upward propagation at top level.`);
        return;
    }
    // 2. RECURSIVE STEP: Parent is another Section (P_SECTION)
    const P_SECTION = P;
    const P_ABS_BOX = getAbsoluteBoundingBox(P_SECTION);
    if (!P_ABS_BOX) {
        console.log(`${logPrefix} Could not get absolute box for parent '${P_SECTION.name}'. Stopping.`);
        return;
    }
    // Calculate the absolute right edge of the Parent Section BEFORE any resize.
    const parentAbsoluteRightBoundary = P_ABS_BOX.x + P_ABS_BOX.width;
    console.log(`${logPrefix} Parent '${P_SECTION.name}' boundary (absolute X): ${parentAbsoluteRightBoundary}px.`);
    // 2A. Collision and ripple propagation from resizing of X
    // Call PropagateShift and get the absolute final X-coordinate of the ripple.
    const finalRippleFrontierX = PropagateShift(X, P_SECTION, SpaceCreatedInResize);
    console.log(`${logPrefix} Final Ripple Frontier (absolute X): ${finalRippleFrontierX}px.`);
    // Determine if the ripple reached or extended beyond the parent's boundary.
    const rippleReachedBoundary = finalRippleFrontierX >= parentAbsoluteRightBoundary;
    // Terminate recursion as the ripple is contained
    if (!rippleReachedBoundary) {
        console.log(`${logPrefix} Ripple stopped at ${finalRippleFrontierX}px, contained within parent boundary ${parentAbsoluteRightBoundary}px. Terminating recursion.`);
        return;
    }
    // 2B. Resize P (Only if ripple reached the boundary)
    console.log(`${logPrefix} Ripple REACHED boundary. Resizing parent.`);
    const oldWidth = P_SECTION.width;
    P_SECTION.resizeWithoutConstraints(oldWidth + SpaceCreatedInResize, P_SECTION.height);
    console.log(`${logPrefix} Resized parent '${P_SECTION.name}' from ${oldWidth}px to ${P_SECTION.width}px.`);
    // 2C. Recursive Call to propagate up the node tree
    PropagateResize(P_SECTION, SpaceCreatedInResize, level + 1);
}
