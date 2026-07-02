import {
  Annotation,
  AnnotationArg,
  Block,
  Diagram,
  Member,
  Param,
  Relationship,
  RelationshipKind,
  TypeRef,
  Visibility,
} from "./ir.ts";

const DEFAULT_W = 280;
const MARGIN = 20;
const GAP = 24;
const CORNER = 10;

// << >>
const STEREOTYPE_SIZE = 12;
const NAME_SIZE = 18;
const MEMBER_SIZE = 13;
const MONO_CHAR_RATIO = 0.62;

const HEADER_PAD_TOP = 16;
const HEADER_PAD_BOTTOM = 16;
const SECTION_PAD = 12;
const ROW_HEIGHT = 26;
const MEMBER_PAD_X = 16;

const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const SANS =
  "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

const DEFAULT_FILL = "#111214";
const DEFAULT_STROKE = "#3f4046";
const DEFAULT_TEXT = "#000";
const STEREOTYPE_COLOR = "#8a8d95";
const ARROW_COLOR = "#6a6d75";
const MARKER_FILL = "#111214";

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
  const [vw, vh] = viewport(placed);
  const diagramBg = findColor(diagram.annotations, "bg");

  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}">`;
  out += defs();
  if (diagramBg !== undefined) {
    out += `<rect width="100%" height="100%" fill="${diagramBg}"/>`;
  }
  out += relationshipsSvg(placed, diagram.relationships);
  for (const p of placed) {
    out += cardSvg(p);
  }
  out += "</svg>";
  return out;
}

function defs(): string {
  return (
    `<defs>` +
    `<marker id="inherit" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse">` +
    `<path d="M 0 0 L 10 5 L 0 10 z" fill="${MARKER_FILL}" stroke="${ARROW_COLOR}" stroke-width="1"/>` +
    `</marker>` +
    `</defs>`
  );
}

function relationshipsSvg(placed: Placed[], rels: Relationship[]): string {
  const byName = new Map<string, Placed>();
  for (const p of placed) byName.set(p.block.name, p);

  // only inheritance-like relationships are drawn for now, and only when both endpoints resolve to placed blocks
  const valid = rels
    .filter(
      (r) =>
        r.kind === RelationshipKind.Inheritance ||
        r.kind === RelationshipKind.Realization,
    )
    .filter((r) => byName.has(r.from) && byName.has(r.to));

  const incoming = new Map<string, string[]>();
  for (const rel of valid) {
    const list = incoming.get(rel.to) ?? [];
    list.push(rel.from);
    incoming.set(rel.to, list);
  }

  let out = "";
  for (const rel of valid) {
    const from = byName.get(rel.from)!;
    const to = byName.get(rel.to)!;

    const arrivals = incoming.get(rel.to)!;
    const idx = Math.max(arrivals.indexOf(rel.from), 0);
    const [x2, y2] = arrivalPoint(to, idx, arrivals.length);
    const [x1, y1] = edgeIntersection(from, x2, y2);

    const dash =
      rel.kind === RelationshipKind.Realization
        ? ` stroke-dasharray="6,4"`
        : "";

    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ARROW_COLOR}" stroke-width="1.5"${dash} marker-end="url(#inherit)"/>`;
  }
  return out;
}

// incoming edges spread along the bottom of the target card so multiple children never converge on the same point
function arrivalPoint(
  p: Placed,
  index: number,
  total: number,
): [number, number] {
  const frac = (index + 1) / (total + 1);
  return [p.x + p.w * frac, p.y + totalH(p)];
}

function cardCenter(p: Placed): [number, number] {
  return [p.x + p.w / 2, p.y + totalH(p) / 2];
}

// point on the card border where the line from the card center towards the target leaves the card
function edgeIntersection(
  p: Placed,
  targetX: number,
  targetY: number,
): [number, number] {
  const [cx, cy] = cardCenter(p);
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (Math.abs(dx) < Number.EPSILON && Math.abs(dy) < Number.EPSILON) {
    return [cx, cy];
  }
  const halfW = p.w / 2;
  const halfH = totalH(p) / 2;
  const tX = Math.abs(dx) < Number.EPSILON ? Infinity : halfW / Math.abs(dx);
  const tY = Math.abs(dy) < Number.EPSILON ? Infinity : halfH / Math.abs(dy);
  const t = Math.min(tX, tY);
  return [cx + dx * t, cy + dy * t];
}

function layout(diagram: Diagram): Placed[] {
  const order = depthSortedBlocks(diagram);
  const out: Placed[] = [];
  let autoY = MARGIN;
  for (const b of order) {
    const w = findNumber(b.annotations, "size") ?? autoWidth(b);
    const sections = groupByKind(b.members);
    const headerH =
      HEADER_PAD_TOP + STEREOTYPE_SIZE + 8 + NAME_SIZE + HEADER_PAD_BOTTOM;
    const sectionHeights = sections.map((ms) =>
      ms.length === 0 ? 0 : SECTION_PAD * 2 + ms.length * ROW_HEIGHT,
    );

    const [x, y] = findPos(b.annotations) ?? [MARGIN, autoY];
    const placed: Placed = {
      block: b,
      x,
      y,
      w,
      sections,
      headerH,
      sectionHeights,
      fill: findColor(b.annotations, "bg") ?? DEFAULT_FILL,
      stroke: findColor(b.annotations, "edge") ?? DEFAULT_STROKE,
      textColor: findColor(b.annotations, "color") ?? DEFAULT_TEXT,
    };
    autoY = y + totalH(placed) + GAP;
    out.push(placed);
  }
  return out;
}

function viewport(placed: Placed[]): [number, number] {
  let maxX = MARGIN;
  let maxY = MARGIN;
  for (const p of placed) {
    maxX = Math.max(maxX, p.x + p.w);
    maxY = Math.max(maxY, p.y + totalH(p));
  }
  return [maxX + MARGIN, maxY + MARGIN];
}

function cardSvg(p: Placed): string {
  const h = totalH(p);
  let out = `<g data-block="${escapeXml(p.block.name)}">`;

  out += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${h}" rx="${CORNER}" ry="${CORNER}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="1.5"/>`;

  const cx = p.x + p.w / 2;
  const stereotypeY = p.y + HEADER_PAD_TOP + STEREOTYPE_SIZE;
  out += `<text x="${cx}" y="${stereotypeY}" text-anchor="middle" font-family="${SANS}" font-size="${STEREOTYPE_SIZE}" font-style="italic" fill="${STEREOTYPE_COLOR}">«${escapeXml(p.block.kind)}»</text>`;
  const nameY = stereotypeY + 8 + NAME_SIZE;
  out += `<text x="${cx}" y="${nameY}" text-anchor="middle" font-family="${MONO}" font-size="${NAME_SIZE}" font-weight="700" fill="${p.textColor}">${escapeXml(p.block.name)}</text>`;

  let cursorY = p.y + p.headerH;
  for (const members of p.sections) {
    if (members.length === 0) continue;
    out += separator(p.x, cursorY, p.w, p.stroke);
    cursorY += SECTION_PAD;
    for (const m of members) {
      const textY = cursorY + ROW_HEIGHT / 2;
      out += memberSvg(p.x + MEMBER_PAD_X, textY, p.textColor, m);
      cursorY += ROW_HEIGHT;
    }
    cursorY += SECTION_PAD;
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
  const nameW = [...b.name].length * NAME_SIZE * MONO_CHAR_RATIO;
  let contentW = nameW;
  for (const m of b.members) {
    const w = [...formatMember(m)].length * MEMBER_SIZE * MONO_CHAR_RATIO;
    contentW = Math.max(contentW, w);
  }
  const needed = contentW + 2 * MEMBER_PAD_X;
  return Math.max(DEFAULT_W, Math.ceil(needed));
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
  return `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${MEMBER_SIZE}" fill="${color}" dominant-baseline="central">${escapeXml(formatMember(m))}</text>`;
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

function findPos(anns: Annotation[]): [number, number] | undefined {
  const a = findAnnotation(anns, "pos");
  if (a === undefined) return undefined;
  const x = argAsNumber(a.args[0]);
  const y = argAsNumber(a.args[1]);
  if (x === undefined || y === undefined) return undefined;
  return [x, y];
}

function findNumber(anns: Annotation[], name: string): number | undefined {
  const a = findAnnotation(anns, name);
  if (a === undefined) return undefined;
  return argAsNumber(a.args[0]);
}

function findColor(anns: Annotation[], name: string): string | undefined {
  const arg = findAnnotation(anns, name)?.args[0];
  if (arg === undefined || arg.kind === "number") return undefined;
  return arg.value;
}

function argAsNumber(arg: AnnotationArg | undefined): number | undefined {
  return arg?.kind === "number" ? arg.value : undefined;
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
