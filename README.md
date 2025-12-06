## Algorithm: How "Make way" Works

The "Make way" plugin automates the complex task of shifting adjacent content and resizing containers when a new screen or note needs to be inserted. The core logic involves a recursive tree traversal and a **multi-step conditional process** that ensures only relevant and nearby nodes are moved.

---

### 1. Initialization and Setup

The plugin begins by validating the user's input and establishing the absolute reference point for the entire operation.

* **Validation:** The plugin requires exactly **one node ($S$)** to be selected. This node must be a direct child of the **Page** or a **Section** (i.e., a "top-level" screen/element).
* **Target Space:** A dynamic value of `selectedNodeWidth` + 80px (`SPACE_TO_CREATE`) is defined for the horizontal shift. This value is used for both the movement and the projected width calculation in the filter.
* **Proximity Threshold:** A fixed value, $\text{MAX\_H\_DISTANCE} = 100\text{px}$, is set for the horizontal filtering step.
* **Boundary Calculation:** The **absolute bounding box** of the selected node ($S_{Bounds}$) is calculated. All subsequent vertical checks are performed against these absolute coordinates.
* **Movement List:** An empty list, `nodesToMove`, is initialized to store the SceneNodes that are **candidates** for movement.

---

### 2. Core Traversal and Node Identification (Identify Candidates)

The plugin employs a **Depth-First Pre-order Traversal** starting from the page root. For every node ($N$) encountered, the algorithm determines its fate using the following four rules in sequence. The key strategy is **pruning**—stopping the traversal down a branch as soon as we determine that the container or its contents are irrelevant or have already been captured for movement.

| Rule | Condition Check | Action | Logic |
| :--- | :--- | :--- | :--- |
| **Rule 1: Ancestor Check** | Is $N$ an ancestor of $S$? | **Continue** traversal to $N$'s children. | $N$ is a container of $S$ and must not be moved itself. |
| **Rule 2: Vertical Pruning** | Does $N$ have **NO** vertical overlap with $S$? (i.e., $N$ is entirely above or entirely below $S$). | **Prune** the branch (stop checking $N$'s descendants). | If the container $N$ is vertically irrelevant, nothing inside it can be in the Affected Zone. |
| **Rule 3: Candidate Zone** | Does $N$ vertically overlap $S$ **AND** start to the right of $S$'s end ($N.\text{absX} \geq S.\text{absXend}$)? | **Add $N$** to `nodesToMove` and **Prune** the branch. | This node (or container) is a candidate for movement; moving the parent moves all children automatically. |
| **Rule 4: Horizontal Pass** | Does $N$ vertically overlap $S$ **BUT** start before $S$'s end? | **Continue** traversal to $N$'s children. | $N$ overlaps $S$ or is to its left; $N$ is not moved, but its descendants must be checked as they could start to the right of $S$. |

---

### 3. Proximity Filtering (Filter Distant Nodes)

The candidate list (`nodesToMove`) is filtered out to remove any nodes that are sufficiently far from the selected node's ($S$'s) structure, using the $\text{MAX\_H\_DISTANCE}$ threshold.

1.  **Identify Structural Reference ($X$):** For every candidate node $N$, the algorithm finds its **structural sibling ancestor ($X$)**. $X$ is the ancestor of $S$ that shares the same parent as $N$.
2.  **Calculate Projected Distance ($\Delta x$):** The gap between $N$'s current absolute left edge and the **projected right edge of $X$** (after the resizing operation) is calculated:
    $$\Delta x = N.\text{absX} - (X.\text{absX} + X.\text{width} + \text{SPACE\_TO\_CREATE})$$
3.  **Filtering:** If $\Delta x > \text{100px}$, node $N$ is removed from `nodesToMove`. This filters out distant, irrelevant nodes like far-off screens.

---

### 4. Execution and Cleanup

The final, filtered list of nodes is sorted and moved, and the ancestor containers of $S$ are resized.

1.  **Sorting:** Nodes in the final `nodesToMove` list are sorted by their absolute $x$ coordinate in **descending order (farthest right first)**. This ensures stability and prevents any potential cascading issues during movement.
2.  **Movement:** Each node $N$ in the sorted list is moved by modifying its relative $x$ coordinate:
    $$\text{N.x} \leftarrow \text{N.x} + \text{SPACE\_TO\_CREATE}$$
3.  **Ancestor Resizing:** Starting from $S$'s immediate parent, the plugin traverses up the ancestor chain.
    * For every ancestor that is a **Frame** or **Section** and is not locked, its width is increased by $\text{SPACE\_TO\_CREATE}$.
    * The plugin uses the robust method: `Ancestor.resizeWithoutConstraints(newWidth, currentHeight)`
