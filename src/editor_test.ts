import { assertEquals, assertStringIncludes } from "@std/assert";
import { EditableDiagram } from "./editor.ts";
import { parse } from "./parser.ts";

// a drag updates the source text in place, leaving other annotations alone.
Deno.test(function editUpdatesSource() {
  const doc = new EditableDiagram(`class User @pos(40, 40) @bg(#eef) {
    + name: String
}`);
  const result = doc.edit({
    type: "setPos",
    target: { kind: "block", name: "User" },
    pos: { x: 100, y: 250 },
  });

  assertEquals(result.ok, true);
  assertEquals(
    doc.getSource(),
    `class User @pos(100, 250) @bg(#eef) {
    + name: String
}`,
  );
});

// the live IR is mutated too, so it matches a fresh parse of the new source
// without EditableDiagram ever re-parsing internally.
Deno.test(function editKeepsIrInSyncWithSource() {
  const doc = new EditableDiagram(`class User @pos(40, 40) {}`);
  doc.edit({
    type: "setPos",
    target: { kind: "block", name: "User" },
    pos: { x: 7, y: 8 },
  });

  const live = doc.getIR().blocks[0].annotations.find((a) => a.name === "pos");
  assertEquals(live?.args, [
    { kind: "number", value: 7 },
    { kind: "number", value: 8 },
  ]);

  // the in-memory IR agrees with what re-parsing the patched source would give
  const fromSource = parse(doc.getSource()).blocks[0].annotations.find(
    (a) => a.name === "pos",
  );
  assertEquals(live?.args, fromSource?.args);
});

// inserts @pos when the block has none, and the SVG reflects the position.
Deno.test(function editInsertsPosAndRenders() {
  const doc = new EditableDiagram(`class User {}`);
  doc.edit({
    type: "setPos",
    target: { kind: "block", name: "User" },
    pos: { x: 10, y: 20 },
  });

  assertStringIncludes(doc.getSource(), "class User @pos(10, 20) {");
  // getSvg renders straight from the mutated IR (no re-parse) and places the card
  assertStringIncludes(doc.getSvg(), '<rect x="10" y="20"');
});

// a request against a missing block is rejected and changes nothing.
Deno.test(function editRejectsMissingBlockAndLeavesStateUntouched() {
  const src = `class User @pos(40, 40) {}`;
  const doc = new EditableDiagram(src);
  const result = doc.edit({
    type: "setPos",
    target: { kind: "block", name: "Ghost" },
    pos: { x: 0, y: 0 },
  });

  assertEquals(result.ok, false);
  assertEquals(doc.getSource(), src); // untouched
});
