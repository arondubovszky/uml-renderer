import {
  Annotation,
  AnnotationArg,
  Block,
  Diagram,
  Member,
  Note,
  NumExpr,
  Param,
  Region,
  Relationship,
  RelationshipKind,
  TypeRef,
  Visibility,
} from "./ir.ts";

import config_file from "../config.json" with { type: "json" };

interface Placed {
  block: Block;
  x: number;
  y: number;
  w: number;
  sections: Member[][];
  headerH: number;
  sectionHeights: number[];
  fill: string;
  stroke: string;
  textColor: string;
}

function totalH(p: Placed): number {
  return p.headerH + p.sectionHeights.reduce((a, b) => a + b, 0);
}

export function render(diagram: Diagram): string {
  const placed = layout(diagram);
  const byName = new Map<string, Placed>();
  for (const p of placed) byName.set(p.block.name, p);

  const regions = layoutRegions(diagram.regions, byName);
  const notes = layoutNotes(diagram.notes, byName, placed);
  const [vw, vh] = viewport(placed, notes, regions);
  const diagramBg = findColor(diagram.annotations, "bg");

  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}">`;
  // hollow markers (inheritance triangle, aggregation diamond) are filled
  // with the page background so they read as outlines
  out += defs(diagramBg ?? "#fff");
  if (diagramBg !== undefined) {
    out += `<rect width="100%" height="100%" fill="${diagramBg}"/>`;
  }
  // paint order: region areas at the back, then connectors, then cards so
  // lines never cover content, then notes on top
  for (const r of regions) {
    out += regionSvg(r);
  }
  out += relationshipsSvg(byName, diagram);
  for (const n of notes) {
    if (n.target !== undefined) out += noteConnectorSvg(n);
  }
  for (const p of placed) {
    out += cardSvg(p);
  }
  for (const n of notes) {
    out += noteSvg(n);
  }
  out += "</svg>";
  return out;
}

function defs(hollowFill: string): string {
  return (
    `<defs>` +
    `<marker id="inherit" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse">` +
    `<path d="M 0 0 L 10 5 L 0 10 z" fill="${hollowFill}" stroke="${config_file.arrow_color}" stroke-width="1"/>` +
    `</marker>` +
    `<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">` +
    `<path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="${config_file.arrow_color}" stroke-width="1.5"/>` +
    `</marker>` +
    `<marker id="diamond" viewBox="0 0 14 8" refX="13" refY="4" markerWidth="14" markerHeight="8" orient="auto-start-reverse">` +
    `<path d="M 1 4 L 7 1 L 13 4 L 7 7 z" fill="${hollowFill}" stroke="${config_file.arrow_color}" stroke-width="1"/>` +
    `</marker>` +
    `<marker id="diamond-filled" viewBox="0 0 14 8" refX="13" refY="4" markerWidth="14" markerHeight="8" orient="auto-start-reverse">` +
    `<path d="M 1 4 L 7 1 L 13 4 L 7 7 z" fill="${config_file.arrow_color}" stroke="${config_file.arrow_color}" stroke-width="1"/>` +
    `</marker>` +
    `</defs>`
  );
}

// a connector is a polyline through these points; two points make the
// straight style, more make elbows (from @line(ortho) or @via corners)
type Route = [number, number][];
type LineStyle = "straight" | "ortho";

// a hub is a fixed attachment point on a card edge. axis is the direction
// a connector leaves it in (vertical for top/bottom hubs, horizontal for
// side hubs) and decides the ortho elbow shape
interface Hub {
  x: number;
  y: number;
  axis: "v" | "h";
}

function relationshipsSvg(
  byName: Map<string, Placed>,
  diagram: Diagram,
): string {
  const valid = diagram.relationships.filter(
    (r) => byName.has(r.from) && byName.has(r.to),
  );

  const defaultStyle = findLineStyle(diagram.annotations) ?? "ortho";

  // lines of the same kind share a hub so they merge into one junction;
  // a different kind landing on an occupied hub is nudged a few pixels
  // along the edge so e.g. a dependency never sits on top of an arrow
  const hubKinds = new Map<string, RelationshipKind[]>();
  const typedHub = (h: Hub, kind: RelationshipKind): Hub => {
    const key = `${h.x},${h.y},${h.axis}`;
    const kinds = hubKinds.get(key) ?? [];
    let i = kinds.indexOf(kind);
    if (i === -1) {
      i = kinds.length;
      kinds.push(kind);
      hubKinds.set(key, kinds);
    }
    const off = i * config_file.hub_type_gap;
    return h.axis === "v" ? { ...h, x: h.x + off } : { ...h, y: h.y + off };
  };

  let out = "";
  for (const rel of valid) {
    const from = byName.get(rel.from)!;
    const to = byName.get(rel.to)!;

    let start: Hub;
    let end: Hub;
    if (isHierarchical(rel.kind)) {
      [start, end] = hierarchyHubs(from, to);
    } else {
      start = sourceHub(from, rel, to);
      end = targetHub(to, from);
    }
    start = typedHub(start, rel.kind);
    end = typedHub(end, rel.kind);

    const route = routeFor(rel, start, end, defaultStyle, byName);
    const points = route.map(([x, y]) => `${x},${y}`).join(" ");
    const dash = isDashed(rel.kind) ? ` stroke-dasharray="6,4"` : "";

    out += `<polyline points="${points}" fill="none" stroke="${config_file.arrow_color}" stroke-width="1.5"${dash} marker-end="url(#${markerFor(rel.kind)})"/>`;

    if (rel.label !== undefined) {
      const [lx, ly] = routeMidpoint(route);
      out += `<text x="${lx}" y="${ly - 5}" text-anchor="middle" font-family="${config_file.sans_font_family}" font-size="${config_file.label_font_size}" fill="${config_file.stereotype_text_color}">${escapeXml(rel.label)}</text>`;
    }
  }
  return out;
}

function isHierarchical(k: RelationshipKind): boolean {
  return (
    k === RelationshipKind.Inheritance || k === RelationshipKind.Realization
  );
}

function isDashed(k: RelationshipKind): boolean {
  return (
    k === RelationshipKind.Realization || k === RelationshipKind.Dependency
  );
}

// the marker lands on the "to" end, matching where the symbol sits in the
// source text: A --o B draws the diamond touching B, so B is the whole
function markerFor(k: RelationshipKind): string {
  switch (k) {
    case RelationshipKind.Inheritance:
    case RelationshipKind.Realization:
      return "inherit";
    case RelationshipKind.Aggregation:
      return "diamond";
    case RelationshipKind.Composition:
      return "diamond-filled";
    default:
      return "arrow";
  }
}

// non-hierarchy lines leave from the row of the member that carries them:
// an explicit qualifier (User.posts --> Post) wins, otherwise the first
// member whose type mentions the target, otherwise the header band
function sourceHub(from: Placed, rel: Relationship, to: Placed): Hub {
  const right = cardCenter(to)[0] >= cardCenter(from)[0];
  const member =
    rel.fromMember !== undefined
      ? from.block.members.find((m) => m.name === rel.fromMember)
      : from.block.members.find((m) => memberMentions(m, to.block.name));
  const y =
    (member !== undefined ? memberRowY(from, member) : undefined) ??
    from.y + from.headerH / 2;
  return { x: right ? from.x + from.w : from.x, y, axis: "h" };
}

// side hub at header height, on the side facing the other block
function headerHub(p: Placed, toward: Placed): Hub {
  const right = cardCenter(toward)[0] >= cardCenter(p)[0];
  return { x: right ? p.x + p.w : p.x, y: p.y + p.headerH / 2, axis: "h" };
}

// the arrival side mirrors sourceHub: if the target has a member whose
// type mentions the source (the diamond end of a composition landing on
// its items: List<OrderItem> row, say), the line lands on that row,
// otherwise on the header band
function targetHub(to: Placed, from: Placed): Hub {
  const member = to.block.members.find((m) =>
    memberMentions(m, from.block.name),
  );
  if (member === undefined) return headerHub(to, from);
  const y = memberRowY(to, member);
  if (y === undefined) return headerHub(to, from);
  const right = cardCenter(from)[0] >= cardCenter(to)[0];
  return { x: right ? to.x + to.w : to.x, y, axis: "h" };
}

// each block has one hub per hierarchy direction: all inheritance lines
// leave through the top center and arrive at the bottom center (mirrored
// when the parent sits lower), so sibling lines merge into one junction.
// side-by-side blocks fall back to the header hubs so the line never has
// to pass through either card
function hierarchyHubs(from: Placed, to: Placed): [Hub, Hub] {
  const sx = from.x + from.w / 2;
  const ex = to.x + to.w / 2;
  if (to.y + totalH(to) <= from.y) {
    return [
      { x: sx, y: from.y, axis: "v" },
      { x: ex, y: to.y + totalH(to), axis: "v" },
    ];
  }
  if (to.y >= from.y + totalH(from)) {
    return [
      { x: sx, y: from.y + totalH(from), axis: "v" },
      { x: ex, y: to.y, axis: "v" },
    ];
  }
  return [headerHub(from, to), headerHub(to, from)];
}

function memberMentions(m: Member, name: string): boolean {
  if (typeMentions(m.returnType, name)) return true;
  return m.params?.some((p) => typeMentions(p.typeRef, name)) ?? false;
}

function typeMentions(t: TypeRef | undefined, name: string): boolean {
  if (t === undefined) return false;
  return t.name === name || typeMentions(t.generic, name);
}

// center y of a member's row, mirroring the cursor walk in cardSvg
function memberRowY(p: Placed, member: Member): number | undefined {
  let cursorY = p.y + p.headerH;
  for (const members of p.sections) {
    if (members.length === 0) continue;
    cursorY += config_file.section_padding;
    for (const m of members) {
      if (m === member) return cursorY + config_file.row_height / 2;
      cursorY += config_file.row_height;
    }
    cursorY += config_file.section_padding;
  }
  return undefined;
}

// route precedence: user corners from @via win, then the relationship's own
// @line style, then the diagram-level @line default
function routeFor(
  rel: Relationship,
  start: Hub,
  end: Hub,
  defaultStyle: LineStyle,
  byName: Map<string, Placed>,
): Route {
  const via = findPoints(rel.annotations, "via", byName);
  if (via.length > 0) {
    return dedupe([[start.x, start.y], ...via, [end.x, end.y]]);
  }
  const style = findLineStyle(rel.annotations) ?? defaultStyle;
  if (style === "straight") {
    return [
      [start.x, start.y],
      [end.x, end.y],
    ];
  }
  return routeOrtho(start, end);
}

// axis-aligned elbow between two hubs, shaped by their leave directions:
// two vertical hubs make a vertical-horizontal-vertical elbow, two
// horizontal ones the transpose, mixed axes a single corner
function routeOrtho(s: Hub, e: Hub): Route {
  if (s.axis === "v" && e.axis === "v") {
    const midY = (s.y + e.y) / 2;
    return dedupe([
      [s.x, s.y],
      [s.x, midY],
      [e.x, midY],
      [e.x, e.y],
    ]);
  }
  if (s.axis === "h" && e.axis === "h") {
    const midX = (s.x + e.x) / 2;
    return dedupe([
      [s.x, s.y],
      [midX, s.y],
      [midX, e.y],
      [e.x, e.y],
    ]);
  }
  const corner: [number, number] = s.axis === "v" ? [s.x, e.y] : [e.x, s.y];
  return dedupe([[s.x, s.y], corner, [e.x, e.y]]);
}

function routeMidpoint(route: Route): [number, number] {
  const i = Math.floor((route.length - 1) / 2);
  const [x1, y1] = route[i];
  const [x2, y2] = route[Math.min(i + 1, route.length - 1)];
  return [(x1 + x2) / 2, (y1 + y2) / 2];
}

function dedupe(route: Route): Route {
  const out: Route = [];
  for (const p of route) {
    const last = out[out.length - 1];
    if (last === undefined || last[0] !== p[0] || last[1] !== p[1]) {
      out.push(p);
    }
  }
  return out;
}

function cardCenter(p: Placed): [number, number] {
  return [p.x + p.w / 2, p.y + totalH(p) / 2];
}

function layout(diagram: Diagram): Placed[] {
  const order = depthSortedBlocks(diagram);
  const out: Placed[] = [];
  // filled as blocks are placed, so a block's geometry expressions can
  // reference any block laid out before it (forward refs fall back)
  const placedSoFar = new Map<string, Placed>();
  let autoY = config_file.margin;
  for (const b of order) {
    const w = findNumber(b.annotations, "size", placedSoFar) ?? autoWidth(b);
    const sections = groupByKind(b.members);
    const headerH =
      config_file.header_padding_top +
      config_file.stereotype_font_size +
      8 +
      config_file.name_font_size +
      config_file.header_padding_bottom;
    const sectionHeights = sections.map((ms) =>
      ms.length === 0
        ? 0
        : config_file.section_padding * 2 + ms.length * config_file.row_height,
    );

    const [x, y] = findPos(b.annotations, placedSoFar) ?? [
      config_file.margin,
      autoY,
    ];
    const placed: Placed = {
      block: b,
      x,
      y,
      w,
      sections,
      headerH,
      sectionHeights,
      fill: findColor(b.annotations, "bg") ?? config_file.default_fill_color,
      stroke:
        findColor(b.annotations, "edge") ?? config_file.default_stroke_color,
      textColor:
        findColor(b.annotations, "color") ?? config_file.default_text_color,
    };
    autoY = y + totalH(placed) + config_file.gap;
    out.push(placed);
    placedSoFar.set(b.name, placed);
  }
  return out;
}

function viewport(
  placed: Placed[],
  notes: PlacedNote[],
  regions: PlacedRegion[],
): [number, number] {
  let maxX = config_file.margin;
  let maxY = config_file.margin;
  const extend = (x: number, y: number) => {
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const p of placed) extend(p.x + p.w, p.y + totalH(p));
  for (const n of notes) extend(n.x + n.w, n.y + n.h);
  for (const r of regions) extend(r.x + r.w, r.y + r.h);
  return [maxX + config_file.margin, maxY + config_file.margin];
}

interface PlacedNote {
  note: Note;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  target?: Placed;
}

// notes size themselves to their wrapped text. @pos wins; a targeted note
// sits to the right of its target; the rest stack below the blocks
function layoutNotes(
  notes: Note[],
  byName: Map<string, Placed>,
  placed: Placed[],
): PlacedNote[] {
  let autoY = config_file.margin;
  for (const p of placed)
    autoY = Math.max(autoY, p.y + totalH(p) + config_file.gap);

  const out: PlacedNote[] = [];
  for (const note of notes) {
    const lines = wrapText(note.text, config_file.note_max_chars);
    const maxLen = Math.max(...lines.map((l) => l.length));
    const w =
      Math.ceil(
        maxLen * config_file.note_font_size * config_file.sans_char_ratio,
      ) +
      config_file.note_padding * 2;
    const h =
      lines.length * config_file.note_line_height +
      config_file.note_padding * 2;
    const target =
      note.target !== undefined ? byName.get(note.target) : undefined;

    let pos = findPos(note.annotations, byName);
    if (pos === undefined) {
      if (target !== undefined) {
        pos = [target.x + target.w + config_file.gap, target.y];
      } else {
        pos = [config_file.margin, autoY];
        autoY += h + config_file.gap;
      }
    }
    out.push({ note, x: pos[0], y: pos[1], w, h, lines, target });
  }
  return out;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (candidate.length > maxChars && line !== "") {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line !== "") lines.push(line);
  return lines.length > 0 ? lines : [""];
}

function noteSvg(n: PlacedNote): string {
  const fill =
    findColor(n.note.annotations, "bg") ?? config_file.note_fill_color;
  let out = `<g data-note="">`;
  out += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="4" fill="${fill}" stroke="${config_file.note_stroke_color}" stroke-width="1"/>`;
  for (let i = 0; i < n.lines.length; i++) {
    const y =
      n.y +
      config_file.note_padding +
      i * config_file.note_line_height +
      config_file.note_line_height / 2;
    // centered so estimate error in the box width splits evenly between
    // the two sides instead of piling up on one
    out += `<text x="${n.x + n.w / 2}" y="${y}" text-anchor="middle" font-family="${config_file.sans_font_family}" font-size="${config_file.note_font_size}" fill="${config_file.note_text_color}" dominant-baseline="central">${escapeXml(n.lines[i])}</text>`;
  }
  out += `</g>`;
  return out;
}

// dashed link from the note's facing side to the target's header band
function noteConnectorSvg(n: PlacedNote): string {
  const t = n.target!;
  const noteRightOfTarget = n.x + n.w / 2 >= cardCenter(t)[0];
  const x1 = noteRightOfTarget ? n.x : n.x + n.w;
  const x2 = noteRightOfTarget ? t.x + t.w : t.x;
  const y1 = n.y + n.h / 2;
  const y2 = t.y + t.headerH / 2;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${config_file.arrow_color}" stroke-width="1" stroke-dasharray="4,3"/>`;
}

interface PlacedRegion {
  region: Region;
  x: number;
  y: number;
  w: number;
  h: number;
}

// a region is an explicit rect from @pos(x, y, w, h), or the bounding box
// of its member blocks plus padding. regions with neither are skipped
function layoutRegions(
  regions: Region[],
  byName: Map<string, Placed>,
): PlacedRegion[] {
  const out: PlacedRegion[] = [];
  for (const region of regions) {
    const rect = findRect(region.annotations, byName);
    if (rect !== undefined) {
      out.push({ region, x: rect[0], y: rect[1], w: rect[2], h: rect[3] });
      continue;
    }
    const members = region.members
      .map((name) => byName.get(name))
      .filter((p): p is Placed => p !== undefined);
    if (members.length === 0) continue;
    const minX =
      Math.min(...members.map((p) => p.x)) - config_file.region_padding;
    const minY =
      Math.min(...members.map((p) => p.y)) - config_file.region_padding;
    const maxX =
      Math.max(...members.map((p) => p.x + p.w)) + config_file.region_padding;
    const maxY =
      Math.max(...members.map((p) => p.y + totalH(p))) +
      config_file.region_padding;
    out.push({ region, x: minX, y: minY, w: maxX - minX, h: maxY - minY });
  }
  return out;
}

function regionSvg(r: PlacedRegion): string {
  const fill = findColor(r.region.annotations, "bg") ?? "none";
  const stroke =
    findColor(r.region.annotations, "edge") ?? config_file.default_stroke_color;
  let out = `<g data-region="${escapeXml(r.region.name)}">`;
  out += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
  // label sits above the rect so member cards can never paint over it
  out += `<text x="${r.x + 4}" y="${r.y - 6}" font-family="${config_file.sans_font_family}" font-size="${config_file.region_label_font_size}" font-style="italic" fill="${config_file.stereotype_text_color}">${escapeXml(r.region.name)}</text>`;
  out += `</g>`;
  return out;
}

function cardSvg(p: Placed): string {
  const h = totalH(p);
  let out = `<g data-block="${escapeXml(p.block.name)}">`;

  out += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${h}" rx="${config_file.corner_radius}" ry="${config_file.corner_radius}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="1.5"/>`;

  const cx = p.x + p.w / 2;
  const stereotypeY =
    p.y + config_file.header_padding_top + config_file.stereotype_font_size;
  out += `<text x="${cx}" y="${stereotypeY}" text-anchor="middle" font-family="${config_file.sans_font_family}" font-size="${config_file.stereotype_font_size}" font-style="italic" fill="${config_file.stereotype_text_color}">«${escapeXml(p.block.kind)}»</text>`;
  const nameY = stereotypeY + 8 + config_file.name_font_size;
  out += `<text x="${cx}" y="${nameY}" text-anchor="middle" font-family="${config_file.mono_font_family}" font-size="${config_file.name_font_size}" font-weight="700" fill="${p.textColor}">${escapeXml(p.block.name)}</text>`;

  let cursorY = p.y + p.headerH;
  for (const members of p.sections) {
    if (members.length === 0) continue;
    out += separator(p.x, cursorY, p.w, p.stroke);
    cursorY += config_file.section_padding;
    for (const m of members) {
      const textY = cursorY + config_file.row_height / 2;
      out += memberSvg(
        p.x + config_file.member_padding_x,
        textY,
        p.textColor,
        m,
      );
      cursorY += config_file.row_height;
    }
    cursorY += config_file.section_padding;
  }

  out += "</g>";
  return out;
}

// blocks are laid out parents first: a block's depth is the longest inheritance chain above it, and ties keep source order
function depthSortedBlocks(diagram: Diagram): Block[] {
  const blockNames = new Set(diagram.blocks.map((b) => b.name));
  const parents = new Map<string, string[]>();
  for (const rel of diagram.relationships) {
    if (rel.kind !== RelationshipKind.Inheritance) continue;
    if (!blockNames.has(rel.to)) continue;
    const list = parents.get(rel.from) ?? [];
    list.push(rel.to);
    parents.set(rel.from, list);
  }

  const memo = new Map<string, number>();
  const seen = new Set<string>();
  function depth(name: string): number {
    const cached = memo.get(name);
    if (cached !== undefined) return cached;
    // cycle guard: a --|> b --|> a bottoms out at 0 instead of recursing
    if (seen.has(name)) return 0;
    seen.add(name);
    const ps = parents.get(name);
    const d =
      ps === undefined ? 0 : Math.max(...ps.map((p) => depth(p) + 1), 0);
    seen.delete(name);
    memo.set(name, d);
    return d;
  }

  return diagram.blocks
    .map((b, i) => ({ d: depth(b.name), i, b }))
    .sort((a, z) => a.d - z.d || a.i - z.i)
    .map(({ b }) => b);
}

// estimates text width from character count; good enough for monospace
// in the browser this is the natural place to swap in canvas measureText
function autoWidth(b: Block): number {
  const nameW =
    [...b.name].length *
    config_file.name_font_size *
    config_file.mono_char_ratio;
  let contentW = nameW;
  for (const m of b.members) {
    const w =
      [...formatMember(m)].length *
      config_file.member_font_size *
      config_file.mono_char_ratio;
    contentW = Math.max(contentW, w);
  }
  const needed = contentW + 2 * config_file.member_padding_x;
  return Math.max(config_file.default_width, Math.ceil(needed));
}

// uml card sections: attributes on top, operations below
function groupByKind(members: Member[]): Member[][] {
  const attrs: Member[] = [];
  const ops: Member[] = [];
  for (const m of members) {
    (m.params !== undefined ? ops : attrs).push(m);
  }
  return [attrs, ops];
}

function separator(x: number, y: number, w: number, stroke: string): string {
  return `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${stroke}" stroke-width="1"/>`;
}

function memberSvg(x: number, y: number, color: string, m: Member): string {
  return `<text x="${x}" y="${y}" font-family="${config_file.mono_font_family}" font-size="${config_file.member_font_size}" fill="${color}" dominant-baseline="central">${escapeXml(formatMember(m))}</text>`;
}

function formatMember(m: Member): string {
  let vis: string;
  switch (m.visibility) {
    case Visibility.PUBLIC:
      vis = "+ ";
      break;
    case Visibility.PRIVATE:
      vis = "- ";
      break;
    case Visibility.PROTECTED:
      vis = "# ";
      break;
    default:
      vis = "";
  }
  let out = vis + m.name;
  if (m.params !== undefined) {
    out += `(${m.params.map(formatParam).join(", ")})`;
  }
  if (m.returnType !== undefined) {
    out += `: ${formatType(m.returnType)}`;
  }
  return out;
}

function formatParam(p: Param): string {
  return p.typeRef !== undefined
    ? `${p.name}: ${formatType(p.typeRef)}`
    : p.name;
}

function formatType(t: TypeRef): string {
  return t.generic !== undefined
    ? `${t.name}<${formatType(t.generic)}>`
    : t.name;
}

function findAnnotation(
  anns: Annotation[],
  name: string,
): Annotation | undefined {
  return anns.find((a) => a.name === name);
}

function findPos(
  anns: Annotation[],
  env: Map<string, Placed>,
): [number, number] | undefined {
  const a = findAnnotation(anns, "pos");
  if (a === undefined) return undefined;
  const x = argAsNumber(a.args[0], env);
  const y = argAsNumber(a.args[1], env);
  if (x === undefined || y === undefined) return undefined;
  return [x, y];
}

// rect from a four-number @pos(x, y, w, h), used by regions
function findRect(
  anns: Annotation[],
  env: Map<string, Placed>,
): [number, number, number, number] | undefined {
  const a = findAnnotation(anns, "pos");
  if (a === undefined) return undefined;
  const nums = a.args.slice(0, 4).map((arg) => argAsNumber(arg, env));
  if (nums.length < 4 || nums.some((n) => n === undefined)) return undefined;
  return [nums[0]!, nums[1]!, nums[2]!, nums[3]!];
}

function findNumber(
  anns: Annotation[],
  name: string,
  env: Map<string, Placed>,
): number | undefined {
  const a = findAnnotation(anns, name);
  if (a === undefined) return undefined;
  return argAsNumber(a.args[0], env);
}

function findColor(anns: Annotation[], name: string): string | undefined {
  const arg = findAnnotation(anns, name)?.args[0];
  if (arg?.kind === "hex" || arg?.kind === "ident" || arg?.kind === "str") {
    return arg.value;
  }
  return undefined;
}

function findLineStyle(anns: Annotation[]): LineStyle | undefined {
  const arg = findAnnotation(anns, "line")?.args[0];
  if (
    arg?.kind === "ident" &&
    (arg.value === "straight" || arg.value === "ortho")
  ) {
    return arg.value;
  }
  return undefined;
}

// resolved point args; if any coordinate fails to evaluate the whole
// annotation is treated as absent so routing falls back to automatic
function findPoints(
  anns: Annotation[],
  name: string,
  env: Map<string, Placed>,
): [number, number][] {
  const a = findAnnotation(anns, name);
  if (a === undefined) return [];
  const out: [number, number][] = [];
  for (const arg of a.args) {
    if (arg.kind !== "point") continue;
    const x = evalNumExpr(arg.value[0], env);
    const y = evalNumExpr(arg.value[1], env);
    if (x === undefined || y === undefined) return [];
    out.push([x, y]);
  }
  return out;
}

function argAsNumber(
  arg: AnnotationArg | undefined,
  env: Map<string, Placed>,
): number | undefined {
  if (arg?.kind === "number") return arg.value;
  if (arg?.kind === "expr") return evalNumExpr(arg.value, env);
  return undefined;
}

// geometry refs resolve against laid-out blocks; unknown blocks or
// functions make the whole expression undefined so callers fall back
function evalNumExpr(e: NumExpr, env: Map<string, Placed>): number | undefined {
  switch (e.op) {
    case "num":
      return e.value;
    case "ref": {
      const p = env.get(e.block);
      if (p === undefined) return undefined;
      switch (e.fn) {
        case "x":
          return p.x;
        case "y":
          return p.y;
        case "width":
          return p.w;
        case "height":
          return totalH(p);
        case "right":
          return p.x + p.w;
        case "bottom":
          return p.y + totalH(p);
        case "cx":
          return p.x + p.w / 2;
        case "cy":
          return p.y + totalH(p) / 2;
        default:
          return undefined;
      }
    }
    default: {
      const l = evalNumExpr(e.left, env);
      const r = evalNumExpr(e.right, env);
      if (l === undefined || r === undefined) return undefined;
      switch (e.op) {
        case "+":
          return l + r;
        case "-":
          return l - r;
        case "*":
          return l * r;
        case "/":
          return l / r;
      }
    }
  }
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
