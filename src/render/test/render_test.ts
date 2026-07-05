import { renderUmlClassSvg, UmlClassConfig } from "../uml_objects/uml_class.ts";

// Save the test result SVG into the test folder
// 1. JSON arrives (from a file or default design)
const myClassJson: UmlClassConfig = {
    x: 50, y: 50, width: 150, height: 120,
    backgroundColor: "#f9f9f9", borderColor: "#333",
    borderWidth: 2, borderRadius: 5,
    className: "User",
    attributes: ["- id: int", "+ name: string", "+ login(): void"]
};

// 3. First render onto the canvas (insert the received string into innerHTML)
console.log(renderUmlClassSvg(myClassJson));

// 4. IF THE USER MOVES IT WITH THE MOUSE:
// We just update the JSON configuration directly!
myClassJson.x = 120;
myClassJson.y = 200;

// 5. Re-render:
const updatedSvgString = renderUmlClassSvg(myClassJson);

// Save the resulting SVG to a file
Deno.writeTextFileSync("src/render/test/output.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">${updatedSvgString}</svg>`);

