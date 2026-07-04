import { assertEquals, assertStringIncludes } from "@std/assert";
import { parse } from "./parser.ts";
import { render } from "./render.ts";
import { Block, Diagram, Relationship, RelationshipKind } from "./ir.ts";

// pulls every relationship connector out of the svg for geometry checks
function connectors(svg: string) {
  return [...svg.matchAll(/<polyline points="([^"]+)"[^>]*marker-end="url\(#([a-z-]+)\)"\/>/g)]
    .map((m) => ({
      points: m[1].split(" ").map((p) => p.split(",").map(Number) as [number, number]),
      marker: m[2],
      dashed: m[0].includes("stroke-dasharray"),
    }));
}

Deno.test(function emptyDiagramRendersMinimalSvg() {
  const svg = render(parse(""));
  assertEquals(svg.startsWith("<svg"), true);
  assertEquals(svg.endsWith("</svg>"), true);
});

Deno.test(function blockRendersRectNameAndStereotype() {
  const svg = render(parse("enum Foo { }"));
  assertStringIncludes(svg, 'rx="10"');
  assertStringIncludes(svg, ">Foo<");
  assertStringIncludes(svg, "«enum»");
});

Deno.test(function blockPosAndBgAreRespected() {
  const svg = render(parse("class A @pos(100, 50) @bg(#eef) { }"));
  assertStringIncludes(svg, 'x="100"');
  assertStringIncludes(svg, 'y="50"');
  assertStringIncludes(svg, 'fill="#eef"');
});

Deno.test(function defaultTextColorIsBlack() {
  const svg = render(parse("class A { }"));
  assertStringIncludes(svg, 'fill="#000"');
});

Deno.test(function topLevelBgFillsPageAndHollowMarkers() {
  const svg = render(parse("@bg(#202020)\nclass A { }"));
  assertStringIncludes(svg, '<rect width="100%" height="100%" fill="#202020"/>');
  // hollow markers read as outlines because they are filled with the page bg
  assertStringIncludes(
    svg,
    '<marker id="inherit" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#202020"',
  );
});

Deno.test(function attributesRenderAboveMethods() {
  const svg = render(parse("class S { -m(): bool\n +attr: i32 }"));
  const attr = svg.indexOf("+ attr: i32");
  const method = svg.indexOf("- m(): bool");
  assertEquals(attr >= 0 && method >= 0 && attr < method, true);
});

Deno.test(function separatorLinesAppearBetweenSections() {
  const svg = render(parse("class A { - x: Y\n + z(): W }"));
  assertEquals([...svg.matchAll(/<line /g)].length, 2);
});

Deno.test(function markersMatchRelationshipKinds() {
  const svg = render(
    parse("class A { }\nclass B { }\nA --|> B\nA --> B\nA --o B\nA --* B\nA ..> B"),
  );
  const c = connectors(svg);
  assertEquals(c.map((x) => x.marker), [
    "inherit",
    "arrow",
    "diamond",
    "diamond-filled",
    "arrow",
  ]);
  assertEquals(c.map((x) => x.dashed), [false, false, false, false, true]);
});

Deno.test(function realizationRendersDashedTriangle() {
  const d = new Diagram();
  d.blocks.push(new Block("class", "A"), new Block("interface", "B"));
  d.relationships.push(new Relationship("A", "B", RelationshipKind.Realization));
  const [c] = connectors(render(d));
  assertEquals(c.marker, "inherit");
  assertEquals(c.dashed, true);
});

Deno.test(function stackedInheritanceRoutesTopToBottomCenter() {
  const svg = render(parse("class P { }\nclass A { }\nA --|> P"));
  const [c] = connectors(svg);
  // auto layout: P spans y 40..112, A starts at 136; the child leaves its
  // top-center hub and arrives at the parent's bottom-center hub
  assertEquals(c.points[0], [180, 136]);
  assertEquals(c.points[c.points.length - 1], [180, 112]);
});

Deno.test(function siblingsConvergeOnOneParentHub() {
  const svg = render(parse(
    "class P @pos(200, 40) { }\nclass A @pos(40, 300) { }\nclass B @pos(360, 300) { }\nA --|> P\nB --|> P",
  ));
  const c = connectors(svg);
  const ends = c.map((x) => x.points[x.points.length - 1]);
  assertEquals(ends[0], ends[1]);
  assertEquals(ends[0], [340, 112]);
});

Deno.test(function sideBySideInheritanceUsesHeaderHubs() {
  const svg = render(parse("class P @pos(40, 40) { }\nclass A @pos(360, 40) { }\nA --|> P"));
  const [c] = connectors(svg);
  // both blocks span the same y range, so the line runs between the facing
  // edges at header height instead of wrapping through a card
  assertEquals(c.points[0], [360, 76]);
  assertEquals(c.points[c.points.length - 1], [320, 76]);
});

Deno.test(function parentBelowChildMirrorsTheVerticalRoute() {
  const svg = render(parse("class P @pos(40, 300) { }\nclass A @pos(40, 40) { }\nA --|> P"));
  const [c] = connectors(svg);
  assertEquals(c.points[0], [180, 112]);
  assertEquals(c.points[c.points.length - 1], [180, 300]);
});

Deno.test(function associationLeavesFromExplicitMemberRow() {
  const svg = render(parse(`
    class User @pos(40, 40) { + name: String\n + posts: List<Thing> }
    class Post @pos(460, 40) { }
    User.posts --> Post
  `));
  const [c] = connectors(svg);
  // second attribute row: header 72 + section pad 12 + one row 26 + half row
  assertEquals(c.points[0], [320, 40 + 72 + 12 + 26 + 13]);
  assertEquals(c.points[c.points.length - 1], [460, 76]);
});

Deno.test(function associationInfersCarryingMemberFromType() {
  const svg = render(parse(`
    class User @pos(40, 40) { + name: String\n + posts: List<Post> }
    class Post @pos(460, 40) { }
    User --> Post
  `));
  const [c] = connectors(svg);
  assertEquals(c.points[0][1], 40 + 72 + 12 + 26 + 13);
});

Deno.test(function associationFallsBackToHeaderHub() {
  const svg = render(parse(
    "class A @pos(40, 40) { + x: Int }\nclass B @pos(460, 40) { }\nA --> B",
  ));
  const [c] = connectors(svg);
  assertEquals(c.points[0], [320, 76]);
});

Deno.test(function lineStraightMakesTwoPointRoutes() {
  const svg = render(parse(
    "class A @pos(40, 40) { }\nclass B @pos(460, 300) { }\nA --> B @line(straight)",
  ));
  const [c] = connectors(svg);
  assertEquals(c.points.length, 2);
});

Deno.test(function viaCornersAppearInTheRoute() {
  const svg = render(parse(
    "class A @pos(40, 40) { }\nclass B @pos(460, 40) { }\nA --> B @via((390, 200))",
  ));
  const [c] = connectors(svg);
  assertEquals(c.points.includes(c.points.find(([x, y]) => x === 390 && y === 200)!), true);
});

Deno.test(function labelRendersNearTheRoute() {
  const svg = render(parse(
    `class A @pos(40, 40) { }\nclass B @pos(460, 40) { }\nA --> B : "writes"`,
  ));
  assertStringIncludes(svg, ">writes</text>");
});

Deno.test(function unresolvedRelationshipsAreSkipped() {
  const svg = render(parse("class A { }\nA --> Ghost"));
  assertEquals(connectors(svg).length, 0);
});

Deno.test(function arrivalLandsOnTheMemberMentioningTheSource() {
  const svg = render(parse(`
    class Order @pos(40, 40) { + items: List<OrderItem>\n + total: Money }
    class OrderItem @pos(460, 40) { + qty: Int }
    OrderItem --* Order
  `));
  const [c] = connectors(svg);
  // the diamond lands on Order's right edge at the items row, not the header
  assertEquals(c.points[c.points.length - 1], [320, 40 + 72 + 12 + 13]);
});

Deno.test(function differentKindsUseOffsetHubs() {
  const svg = render(parse(
    "class A @pos(40, 40) { }\nclass B @pos(460, 40) { }\nA --> B\nA ..> B",
  ));
  const [assoc, dep] = connectors(svg);
  // both lines want the header hubs; the second kind is nudged 8px down
  assertEquals(assoc.points[0], [320, 76]);
  assertEquals(dep.points[0], [320, 84]);
  assertEquals(assoc.points[assoc.points.length - 1], [460, 76]);
  assertEquals(dep.points[dep.points.length - 1], [460, 84]);
});

Deno.test(function sameKindStillSharesTheHub() {
  const svg = render(parse(
    "class A @pos(40, 40) { }\nclass B @pos(40, 300) { }\nclass C @pos(460, 170) { }\nA --> C\nB --> C",
  ));
  const [a, b] = connectors(svg);
  assertEquals(a.points[a.points.length - 1], b.points[b.points.length - 1]);
});

Deno.test(function viaGeometryExprsResolveAgainstBlocks() {
  const svg = render(parse(
    "class A @pos(40, 40) { }\nclass B @pos(40, 300) { }\nA --> B @via((right(A)+24, cy(A)))",
  ));
  const [c] = connectors(svg);
  assertEquals(c.points.some(([x, y]) => x === 344 && y === 76), true);
});

Deno.test(function viaWithUnknownBlockFallsBackToAutoRoute() {
  const base = "class A @pos(40, 40) { }\nclass B @pos(40, 300) { }\n";
  const auto = connectors(render(parse(base + "A --> B")));
  const broken = connectors(render(parse(base + "A --> B @via((right(Ghost), 10))")));
  assertEquals(broken[0].points, auto[0].points);
});

Deno.test(function blockPosCanReferenceEarlierBlocks() {
  const svg = render(parse(
    "class A @pos(40, 40) { }\nclass B @pos(right(A)+40, y(A)) { }",
  ));
  assertStringIncludes(svg, '<rect x="360" y="40"');
});

Deno.test(function targetedNoteRendersBesideTargetWithConnector() {
  const svg = render(parse(`class A @pos(40, 40) { }\nnote "hi there" -> A`));
  // sticky body to the right of the block, default sticky colors
  assertStringIncludes(svg, 'fill="#fff8c5"');
  assertStringIncludes(svg, ">hi there</text>");
  const note = svg.match(/<g data-note=""><rect x="([\d.]+)" y="([\d.]+)"/)!;
  assertEquals(Number(note[1]), 40 + 280 + 24);
  assertEquals(Number(note[2]), 40);
  // dashed connector from the note's left side to the block's header band
  const link = svg.match(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"[^>]*stroke-dasharray="4,3"/)!;
  assertEquals(Number(link[3]), 320);
  assertEquals(Number(link[4]), 76);
});

Deno.test(function untargetedNotesStackBelowBlocks() {
  const svg = render(parse(`class A { }\nnote "first"\nnote "second"`));
  const ys = [...svg.matchAll(/<g data-note=""><rect x="40" y="([\d.]+)"/g)]
    .map((m) => Number(m[1]));
  assertEquals(ys.length, 2);
  // block spans y 40..112, so the first note starts a gap below it
  assertEquals(ys[0], 136);
  assertEquals(ys[1] > ys[0], true);
});

Deno.test(function notePosAndBgWin() {
  const svg = render(parse(`note "pinned" @pos(500, 600) @bg(#cfe)`));
  assertStringIncludes(svg, '<g data-note=""><rect x="500" y="600"');
  assertStringIncludes(svg, 'fill="#cfe"');
});

Deno.test(function noteTextWrapsToMultipleLines() {
  const long = "this note has quite a lot of text so it should wrap onto several lines";
  const svg = render(parse(`note "${long}"`));
  const lines = [...svg.matchAll(/font-size="12"[^>]*>([^<]*)<\/text>/g)]
    .map((m) => m[1]);
  assertEquals(lines.length > 1, true);
  assertEquals(lines.join(" "), long);
});

Deno.test(function regionWrapsItsMemberBlocks() {
  const svg = render(parse(`
    class A @pos(100, 100) { }
    class B @pos(500, 300) { }
    region Core @bg(#eef) { A B }
  `));
  const m = svg.match(/<g data-region="Core"><rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/)!;
  // bounding box of both blocks plus 16 padding on each side
  assertEquals(Number(m[1]), 100 - 16);
  assertEquals(Number(m[2]), 100 - 16);
  assertEquals(Number(m[3]), 500 + 280 + 16 - (100 - 16));
  assertEquals(Number(m[4]), 300 + 72 + 16 - (100 - 16));
  assertStringIncludes(svg, ">Core</text>");
  assertStringIncludes(svg, 'fill="#eef"');
});

Deno.test(function regionExplicitRectWins() {
  const svg = render(parse(`class A @pos(40, 40) { }\nregion Zone @pos(0, 0, 900, 700) { A }`));
  assertStringIncludes(svg, '<g data-region="Zone"><rect x="0" y="0" width="900" height="700"');
});

Deno.test(function regionWithNoResolvableMembersIsSkipped() {
  const svg = render(parse("region Ghost { Missing }"));
  assertEquals(svg.includes("data-region"), false);
});

Deno.test(function regionsPaintBehindCards() {
  const svg = render(parse(`class A @pos(40, 40) { }\nregion R { A }`));
  assertEquals(svg.indexOf("data-region") < svg.indexOf("data-block"), true);
});
