import { assertEquals } from "@std/assert";
import { parse } from "./parser.ts";
import { applyTextEdits, planEdit } from "./edits.ts";

// drag a block that already has an @pos: the coordinates should be rewritten
// in place and nothing else in the source should change.
Deno.test(function setPosReplacesExistingPos() {
  const src = `class User @pos(40, 40) @bg(#eef) {
    + name: String
}`;
  const ir = parse(src);
  const result = planEdit(
    { type: "setPos", target: { kind: "block", name: "User" }, pos: { x: 100, y: 250 } },
    ir,
  );
  if (!result.ok) throw new Error(result.error);

  const out = applyTextEdits(src, result.edits);
  assertEquals(
    out,
    `class User @pos(100, 250) @bg(#eef) {
    + name: String
}`,
  );

  // and the re-parsed IR reflects the new position (@pos takes two number args)
  const reparsed = parse(out);
  const pos = reparsed.blocks[0].annotations.find((a) => a.name === "pos");
  assertEquals(pos?.args, [
    { kind: "number", value: 100 },
    { kind: "number", value: 250 },
  ]);
});

// drag a block that has no @pos yet: one should be inserted after the name.
Deno.test(function setPosInsertsWhenMissing() {
  const src = `class User {
    + name: String
}`;
  const ir = parse(src);
  const result = planEdit(
    { type: "setPos", target: { kind: "block", name: "User" }, pos: { x: 10, y: 20 } },
    ir,
  );
  if (!result.ok) throw new Error(result.error);

  const out = applyTextEdits(src, result.edits);
  assertEquals(
    out,
    `class User @pos(10, 20) {
    + name: String
}`,
  );
});

// dragging a block that does not exist fails cleanly.
Deno.test(function setPosMissingBlockFails() {
  const ir = parse(`class User {}`);
  const result = planEdit(
    { type: "setPos", target: { kind: "block", name: "Ghost" }, pos: { x: 0, y: 0 } },
    ir,
  );
  assertEquals(result.ok, false);
});
