import { SvgGroup, SvgRect, SvgText } from "../svg_render.ts";

// Mivel a felhasználó megad minden pixel pontos adatot a JSON-ben (x, y, width, height),
// ez az interfész egy az egyben leírja a kirajzolandó elemet.
export interface UmlClassConfig {
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

// Mivel a JSON-ben minden benne van, nincs szükség köztes logikai osztályra!
// Csak egy egyszerű renderelő függvény kell a CLI számára, amit később
// a React is könnyen le fog váltani egy React komponensre.
export function renderUmlClassSvg(c: UmlClassConfig): string {
    const rootGroup = new SvgGroup();

    // 1. Befoglaló külső téglalap
    rootGroup.add(new SvgRect(
        c.x, c.y, c.width, c.height, 
        c.backgroundColor, c.borderColor, c.borderWidth, c.borderRadius
    ));

    // 2. Osztálynév (fix eltolással, ahogy a user JSON-jére építünk)
    rootGroup.add(new SvgText(c.x + 10, c.y + 20, c.className, 14));

    // Elválasztó vonal
    rootGroup.add(new SvgRect(c.x, c.y + 30, c.width, 1, c.borderColor, c.borderColor, 1, 0));

    // 3. Attribútumok
    let currentY = c.y + 45;
    for (const attr of c.attributes) {
        rootGroup.add(new SvgText(c.x + 10, currentY, attr, 12));
        currentY += 18; // Sortávolság
    }

    return rootGroup.render();
}