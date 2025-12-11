# Make way! Figma plugin
![image](thumbnail.png)

## Algorithm visualisation
https://github.com/user-attachments/assets/24341dc1-d8e5-48cb-861b-b96eb70bab06


## ⚙️ The "Make Way" Algorithm: Conditional Space Creation

This process creates space next to a selected item (**S**) by simulating a horizontal "ripple" effect that pushes adjacent items, and then **conditionally** grows the parent containers up the hierarchy. A parent container only grows if the ripple reaches its absolute boundary.

---

### 1. Kick-Off: The Push Catalyst

The goal is to define the space that needs to be created and initiate the movement.

1.  **Define Space:** Determine the total **SPACE\_TO\_CREATE**.
2.  **Create Catalyst Z:** A temporary, invisible placeholder item (**Z**) is created immediately to the right of **S** with the width of **SPACE\_TO\_CREATE**.
3.  **Start Ripple:** The initial movement is triggered using **Z** as the starting point.

---

### 2. Horizontal Ripple Sweep (PropagateShift)

This non-recursive sweep calculates item movement and returns the reach of the ripple.

#### Function: **PropagateShift**(**StartNode**, **Parent**, **ShiftAmount**): **number** (Absolute X)

1.  **Identify Ripple Front:** The initial **Ripple Front** is the absolute right edge of the **StartNode** (e.g., the catalyst **Z**).
2.  **Find & Sort Targets:** Find all movable siblings that are positioned to the right and vertically overlap the **StartNode**. Strictly sort these targets from left-to-right.
3.  **Iterate and Push:** Sweep through the sorted items:
    * **IF** a target item's left edge is touching or overlapping the current **Ripple Front**:
        * Move that item to the right by the **ShiftAmount**.
        * Update the **Ripple Front** to the item's **new absolute right edge** to continue the push to the next item.
    * **ELSE (No Overlap):**
        * **STOP** the sweep immediately.
4.  **Result:** Return the final absolute X-coordinate of the **Ripple Front**.

---

### 3. Conditional Container Growth (PropagateResize)

This process handles cascading container growth, applying the containment check at every level, including the initial local parent.

#### 3.1 Local Parent Check (Handled in `executeMovement` function)

1.  **Run Initial Ripple:** Execute **PropagateShift** on the catalyst **Z** within its immediate parent (**P**). Get the **finalRippleFrontierX**.
2.  **Get Parent Boundary:** Calculate the **absolute right boundary** of **P** (before any resize).
3.  **Containment Check:**
    * **IF** `finalRippleFrontierX` is **less than** the **Parent Boundary**:
        * The ripple was **contained**. **DO NOT** resize **P**.
        * Skip Step 3.2 (PropagateResize) entirely.
    * **ELSE (Ripple Reached Boundary):**
        * **Resize P:** Increase the width of **P** by **SPACE\_TO\_CREATE**.
        * **Continue Upward:** Call **PropagateResize** with **P** as the starting node.

#### 3.2 Upward Propagation (PropagateResize)

This process continues recursively up the hierarchy, checking for containment at each parent level.

#### Function: **PropagateResize**(**ResizedNode**, **SpaceCreatedInResize**, **level**)

1.  **Identify X & P:** **X** is the **ResizedNode**. **P** is the parent of **X**.
2.  **Base Case:**
    * **IF P is the Page or Document node:** Run the final **PropagateShift** on P's children, and **STOP** the recursion.
3.  **Parent Boundary:** Calculate the **absolute right boundary** of **P**.
4.  **Lateral Collision Check & Get Ripple Front:** Call **PropagateShift**(**X**, **P**, **SpaceCreatedInResize**) to move siblings of **X** and get the **finalRippleFrontierX**.
5.  **Containment Decision:**
    * **IF** `finalRippleFrontierX` is **less than** the **Parent Boundary**:
        * The ripple was **contained**. **DO NOT** resize **P**.
        * **STOP** the recursion immediately.
    * **ELSE (Ripple Reached Boundary):**
        * **Resize P:** Increase the width of **P** by **SpaceCreatedInResize**.
        * **Recursive Call:** Recursively call **PropagateResize** with **P**.

---

### 4. Cleanup

1.  **Delete Z:** The temporary placeholder item **Z** is deleted.