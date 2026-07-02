import { assertEquals, assertThrows } from "@std/assert";
import { ParseError, parse } from "./parser.ts";
import { RelationshipKind, Visibility } from "./ir.ts";

Deno.test(function buildsBlockWithMembersAndAnnotation() {
  const d = parse(`
    class User @bg(#eef) {
        + name: String
        - age: Int
        # greet(other: User): Void
    }
  `);
  assertEquals(d.blocks.length, 1);
  const b = d.blocks[0];
  assertEquals(b.kind, "class");
  assertEquals(b.name, "User");
  assertEquals(b.members.length, 3);
  assertEquals(b.annotations.length, 1);
  assertEquals(b.annotations[0].name, "bg");

  assertEquals(b.members[0].visibility, Visibility.PUBLIC);
  assertEquals(b.members[0].name, "name");
  assertEquals(b.members[0].returnType?.name, "String");

  const greet = b.members[2];
  assertEquals(greet.visibility, Visibility.PROTECTED);
  assertEquals(greet.name, "greet");
  assertEquals(greet.params?.length, 1);
  assertEquals(greet.params?.[0].name, "other");
  assertEquals(greet.params?.[0].typeRef?.name, "User");
});

Deno.test(function buildsRelationshipWithLabel() {
  const d = parse(`User --> Post : "writes"`);
  assertEquals(d.relationships.length, 1);
  const r = d.relationships[0];
  assertEquals(r.from, "User");
  assertEquals(r.to, "Post");
  assertEquals(r.kind, RelationshipKind.Association);
  assertEquals(r.label, "writes");
});

Deno.test(function buildsAllRelKinds() {
  const d = parse("A --> B\nA --o B\nA --* B\nA ..> B\nA --|> B");
  assertEquals(
    d.relationships.map((r) => r.kind),
    [
      RelationshipKind.Association,
      RelationshipKind.Aggregation,
      RelationshipKind.Composition,
      RelationshipKind.Dependency,
      RelationshipKind.Inheritance,
    ],
  );
});

Deno.test(function buildsNoteAndRegion() {
  const d = parse(`
    class User { }
    class Admin { }
    note "admins can edit" -> Admin
    region Auth @pos(0, 0, 200, 200) @bg(#eef) {
        User
        Admin
    }
  `);
  assertEquals(d.notes.length, 1);
  assertEquals(d.notes[0].text, "admins can edit");
  assertEquals(d.notes[0].target, "Admin");

  assertEquals(d.regions.length, 1);
  const r = d.regions[0];
  assertEquals(r.name, "Auth");
  assertEquals(r.members, ["User", "Admin"]);
  assertEquals(r.annotations.length, 2);
});

Deno.test(function annotationArgsAreTyped() {
  const d = parse("class X @pos(10, 20.5) @bg(#eef) @color(red) { }");
  const anns = d.blocks[0].annotations;
  assertEquals(anns[0].args[0], { kind: "number", value: 10 });
  assertEquals(anns[0].args[1], { kind: "number", value: 20.5 });
  assertEquals(anns[1].args[0], { kind: "hex", value: "#eef" });
  assertEquals(anns[2].args[0], { kind: "ident", value: "red" });
});

Deno.test(function topLevelAnnotationGoesToDiagram() {
  const d = parse("@bg(#202020)\nclass Foo { }");
  assertEquals(d.annotations.length, 1);
  assertEquals(d.annotations[0].name, "bg");
  assertEquals(d.blocks.length, 1);
  assertEquals(d.blocks[0].annotations.length, 0);
});

Deno.test(function spansArePopulated() {
  const src = "class Foo { }";
  const d = parse(src);
  const span = d.blocks[0].span;
  assertEquals(src.slice(span.start, span.end), "class Foo { }");
});

Deno.test(function skipsComments() {
  const d = parse(`
    // line comment
    class A { } /* block
    comment */ class B { }
  `);
  assertEquals(
    d.blocks.map((b) => b.name),
    ["A", "B"],
  );
});

Deno.test(function attributeAndZeroArgMethodDiffer() {
  const d = parse("class X { attr method() }");
  assertEquals(d.blocks[0].members[0].params, undefined);
  assertEquals(d.blocks[0].members[1].params, []);
});

Deno.test(function parsesNestedGenerics() {
  const d = parse("class X { items: List<Map<Int>> }");
  const t = d.blocks[0].members[0].returnType;
  assertEquals(t?.name, "List");
  assertEquals(t?.generic?.name, "Map");
  assertEquals(t?.generic?.generic?.name, "Int");
});

Deno.test(function noteRequiresQuotedString() {
  const err = assertThrows(
    () => parse("note admins can edit -> Admin"),
    ParseError,
    "note text must be a quoted string",
  );
  // the error should point at the unquoted text, not somewhere downstream
  assertEquals(err.span.start, "note ".length);
});

Deno.test(function regionRequiresName() {
  assertThrows(
    () => parse("region { User }"),
    ParseError,
    "expected region name",
  );
});

Deno.test(function noteTargetRejectsRelationshipArrow() {
  assertThrows(
    () => parse(`note "x" --> Admin`),
    ParseError,
    'note targets use "->", not "-->"',
  );
});

Deno.test(function relOpNeedsWordBoundary() {
  // "--owner" must not parse as "--o" followed by an ident "wner"
  assertThrows(() => parse("A --owner B"), ParseError);
  assertEquals(
    parse("A --o B").relationships[0].kind,
    RelationshipKind.Aggregation,
  );
});

Deno.test(function keywordsAreRejectedAsBlockNames() {
  assertThrows(
    () => parse("class note { }"),
    ParseError,
    '"note" is a keyword and cannot be used as a block name',
  );
  assertThrows(
    () => parse("class region { }"),
    ParseError,
    '"region" is a keyword and cannot be used as a block name',
  );
});

Deno.test(function keywordsAreFineOutsideItemPosition() {
  const d = parse("class X { note: String render(region: Rect): Void }");
  const members = d.blocks[0].members;
  assertEquals(members[0].name, "note");
  assertEquals(members[1].params?.[0].name, "region");
});

Deno.test(function errorsCarryLineAndColumn() {
  const err = assertThrows(() => parse("class Foo {"), ParseError);
  assertEquals(err.message, "expected identifier at line 1, column 12");
  assertEquals(err.span, { start: 11, end: 11 });
});

Deno.test(function reportsUnterminatedString() {
  assertThrows(
    () => parse(`note "never closed`),
    ParseError,
    "unterminated string",
  );
});
