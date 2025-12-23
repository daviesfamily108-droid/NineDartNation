# Board Detection Fix: Gradient Voting Algorithm

## Problem
The previous "Edge Density Heatmap" algorithm was failing because it was easily distracted by background clutter (like tinsel, lights, or high-contrast objects) which often has higher edge density than the dartboard itself. This caused the detection center to drift away from the actual board center.

## Solution
We have replaced the density-based approach with a **Gradient Vector Voting (Hough-like)** algorithm.

### How it works:
1.  **Gradient Computation**: We calculate the direction of edges (gradients) in the image.
2.  **Voting**: Instead of just counting edges, each edge pixel "votes" for a center location along its gradient direction.
    *   Random clutter (tinsel) has random edge directions, so its votes are scattered and cancel out.
    *   The dartboard has concentric rings, so all its edge pixels vote for the same center point.
3.  **Peak Finding**: The location with the most intersecting votes is identified as the true board center.
4.  **Structural Lock**: We then verify this center by scanning for the specific Double/Treble ring pattern.

## Verification
1.  Open the **Calibrate** screen.
2.  Ensure the camera is active.
3.  The blue detection circle should now lock firmly onto the center of the dartboard, even with tinsel or clutter in the background.
4.  The "Confidence" score should be higher and more stable.

## Technical Details
- **File Modified**: `src/utils/boardDetection.ts`
- **Function**: `findDartboardRings`
- **Algorithm**: 
    - Downsample to 160px width.
    - Sobel-like gradient calculation.
    - Accumulator array for voting.
    - Geometric mean of Double/Treble ring scores for radius confirmation.
