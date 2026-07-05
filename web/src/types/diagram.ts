export interface Point {
    x: number;
    y: number;
}

export interface UmlClassConfig {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    className: string;
    attributes: string[];
}

export interface UmlArrowConfig {
    id: string;
    fromClassId: string;
    /** 
     * Perimeter position of the start point (0.0 to 1.0).
     * 0.0 = Top center, 0.25 = Right center, 0.5 = Bottom center, 0.75 = Left center.
     */
    fromPosition: number;
    toClassId: string;
    /** 
     * Perimeter position of the end point (0.0 to 1.0).
     */
    toPosition: number;
    /** 
     * Intermediate points that define the arrow's path.
     * Can be manipulated by the user.
     */
    waypoints: Point[];
    label?: string;
}
