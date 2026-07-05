import { Point, UmlClassConfig } from "@/types/diagram";

/**
 * Calculates the exact point on the perimeter of the box based on a 0-1 parameter.
 * The parameter `t` maps linearly to the geometric distance along the perimeter.
 * It starts at the top-center (t=0.0) and moves clockwise around the rounded rectangle.
 *
 * @param box The class box configuration containing dimensions and position.
 * @param t The perimeter parameter, from 0.0 to 1.0.
 * @returns The {x, y} coordinates on the perimeter.
 */
export function getPerimeterPoint(box: UmlClassConfig, t: number): Point {
    // Normalize t to be within [0, 1)
    t = t % 1.0;
    if (t < 0) t += 1.0;

    const w = box.width;
    const h = box.height;
    
    // Ensure border radius doesn't exceed half the width or height
    const rx = Math.min(box.borderRadius || 0, w / 2, h / 2);
    
    // Lengths of the straight segments
    const topLen = w - 2 * rx;
    const rightLen = h - 2 * rx;
    const bottomLen = w - 2 * rx;
    const leftLen = h - 2 * rx;
    
    // Length of a single quarter-circle corner
    const cornerLen = (Math.PI * rx) / 2; 
    
    // Total perimeter length
    const perimeter = topLen * 2 + rightLen * 2 + cornerLen * 4;
    
    // Target distance along the perimeter
    let d = t * perimeter;

    // 1. Top edge (right half)
    if (d <= topLen / 2) return { x: box.x + w / 2 + d, y: box.y };
    d -= topLen / 2;

    // 2. Top-right corner
    if (d <= cornerLen) {
        const angle = -Math.PI / 2 + (d / cornerLen) * (Math.PI / 2); 
        return { x: box.x + w - rx + rx * Math.cos(angle), y: box.y + rx + rx * Math.sin(angle) };
    }
    d -= cornerLen;

    // 3. Right edge
    if (d <= rightLen) return { x: box.x + w, y: box.y + rx + d };
    d -= rightLen;

    // 4. Bottom-right corner
    if (d <= cornerLen) {
        const angle = 0 + (d / cornerLen) * (Math.PI / 2);
        return { x: box.x + w - rx + rx * Math.cos(angle), y: box.y + h - rx + rx * Math.sin(angle) };
    }
    d -= cornerLen;

    // 5. Bottom edge
    if (d <= bottomLen) return { x: box.x + w - rx - d, y: box.y + h };
    d -= bottomLen;

    // 6. Bottom-left corner
    if (d <= cornerLen) {
        const angle = Math.PI / 2 + (d / cornerLen) * (Math.PI / 2);
        return { x: box.x + rx + rx * Math.cos(angle), y: box.y + h - rx + rx * Math.sin(angle) };
    }
    d -= cornerLen;

    // 7. Left edge
    if (d <= leftLen) return { x: box.x, y: box.y + h - rx - d };
    d -= leftLen;

    // 8. Top-left corner
    if (d <= cornerLen) {
        const angle = Math.PI + (d / cornerLen) * (Math.PI / 2);
        return { x: box.x + rx + rx * Math.cos(angle), y: box.y + rx + rx * Math.sin(angle) };
    }
    d -= cornerLen;

    // 9. Top edge (left half)
    return { x: box.x + rx + d, y: box.y };
}

/**
 * Finds the 0-1 perimeter parameter `t` that is closest to a given (x,y) point.
 * Uses a binary search to find the point on the perimeter whose angle from the 
 * center of the box closest matches the angle to the target point.
 *
 * @param box The class box configuration.
 * @param px The target x coordinate.
 * @param py The target y coordinate.
 * @returns The closest perimeter parameter (0.0 to 1.0).
 */
export function getClosestPerimeterParam(box: UmlClassConfig, px: number, py: number): number {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    
    let targetAngle = Math.atan2(py - cy, px - cx) - (-Math.PI / 2);
    if (targetAngle < 0) targetAngle += 2 * Math.PI;
    
    let low = 0;
    let high = 1.0;
    
    // 20 iterations are more than enough for micro-pixel precision
    for (let i = 0; i < 20; i++) {
        let mid = (low + high) / 2;
        let pt = getPerimeterPoint(box, mid);
        let midAngle = Math.atan2(pt.y - cy, pt.x - cx) - (-Math.PI / 2);
        if (midAngle < 0) midAngle += 2 * Math.PI;
        
        if (midAngle < targetAngle) {
            low = mid;
        } else {
            high = mid;
        }
    }
    
    return (low + high) / 2;
}
