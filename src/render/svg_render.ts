// Component: Common interface for all SVG elements
export interface SvgNode {
    render(): string;
}

// Leaf: Rectangle (e.g., for class borders or separator lines)
export class SvgRect implements SvgNode {
    constructor(
        private x: number, private y: number, 
        private w: number, private h: number, 
        private fill: string, private stroke: string, 
        private strokeWidth: number, private rx: number
    ) {}

    render(): string {
        return `<rect x="${this.x}" y="${this.y}" width="${this.w}" height="${this.h}" ` +
               `fill="${this.fill}" stroke="${this.stroke}" stroke-width="${this.strokeWidth}" rx="${this.rx}" />`;
    }
}

// Leaf: Text (for class names, attributes, etc.)
export class SvgText implements SvgNode {
    constructor(
        private x: number, private y: number, 
        private text: string, private fontSize: number = 12
    ) {}

    render(): string {
        return `<text x="${this.x}" y="${this.y}" font-family="Arial, sans-serif" font-size="${this.fontSize}px" fill="black">${this.text}</text>`;
    }
}

// Composite: Group that holds leaf nodes (SVG <g> tag)
export class SvgGroup implements SvgNode {
    private children: SvgNode[] = [];

    add(child: SvgNode): void {
        this.children.push(child);
    }

    render(): string {
        const content = this.children.map(child => child.render()).join("\n  ");
        return `<g>\n  ${content}\n</g>`;
    }
}