import {
  Annotation,
  AnnotationArg,
  Block,
  Diagram,
  Member,
  Note,
  Region,
  Relationship,
  Span,
} from "./ir.ts";

export interface Point {
  x: number;
  y: number;
}

export type TargetRef =
  | { kind: "block" | "region" | "note"; name: string }
  | { kind: "note"; span: Span };

export type EditKind =
  | "setPos"
  | "rename"
  | "addMember"
  | "removeMember"
  | "addBlock"
  | "removeBlock"
  | "addRelationship"
  | "removeRelationship"
  | "setAnnotation"
  | "reparent";

// a single, high-level change coming from the editor (drag, rename, ...).
export type EditRequest =
  | { type: "setPos"; target: TargetRef; pos: Point }
  | { type: "rename"; target: TargetRef; newName: string }
  | { type: "addMember"; target: TargetRef; member: Member }
  | { type: "removeMember"; target: TargetRef; memberName: string }
  | { type: "addBlock"; block: Block }
  | { type: "removeBlock"; target: TargetRef }
  | { type: "addRelationship"; rel: Relationship }
  | { type: "removeRelationship"; span: Span }
  // e.g. a color picker emitting @bg(#eef) on a block
  | { type: "setAnnotation"; target: TargetRef; annotation: Annotation }
  // drag a block into a region (or out, when region is undefined)
  | { type: "reparent"; block: string; region?: string };

export interface TextEdit {
  span: Span;
  text: string;
}

export type EditResult =
  { ok: true; edits: TextEdit[] } | { ok: false; error: string };

// find the IR node a TargetRef points at, or undefined if it is gone
export function resolveTarget(
  ir: Diagram,
  target: TargetRef,
): Block | Region | Note | undefined {
  switch (target.kind) {
    case "block":
      return ir.blocks.find((b) => b.name === target.name);
    case "region":
      return ir.regions.find((r) => r.name === target.name);
    case "note":
      return ir.notes.find(
        (n) =>
          n.span.start === target.span.start && n.span.end === target.span.end,
      );
  }
}

export function applyTextEdits(source: string, edits: TextEdit[]): string {
  const ordered = [...edits].sort((a, b) => b.span.start - a.span.start);
  let out = source;
  for (const e of ordered) {
    out = out.slice(0, e.span.start) + e.text + out.slice(e.span.end);
  }
  return out;
}

export function planEdit(request: EditRequest, ir: Diagram): EditResult {
  switch (request.type) {
    case "setPos": {
      // only blocks are draggable
      if (request.target.kind !== "block") {
        return {
          ok: false,
          error: `setPos is only supported on blocks, got "${request.target.kind}"`,
        };
      }
      const block = resolveTarget(ir, request.target);
      if (!(block instanceof Block)) {
        return {
          ok: false,
          error: `block "${request.target.name}" not found`,
        };
      }
      const posText = `@pos(${request.pos.x}, ${request.pos.y})`;
      const existing = block.annotations.find((a) => a.name === "pos");
      if (existing) {
        // replace the whole @pos(...) annotation in place
        return { ok: true, edits: [{ span: existing.span, text: posText }] };
      }
      // no @pos, insert one
      const at = block.nameSpan.end;
      return {
        ok: true,
        edits: [{ span: { start: at, end: at }, text: ` ${posText}` }],
      };
    }
    case "rename":
      return { ok: false, error: "rename not implemented" };
    case "addMember":
      return { ok: false, error: "addMember not implemented" };
    case "removeMember":
      return { ok: false, error: "removeMember not implemented" };
    case "addBlock":
      return { ok: false, error: "addBlock not implemented" };
    case "removeBlock":
      return { ok: false, error: "removeBlock not implemented" };
    case "addRelationship":
      return { ok: false, error: "addRelationship not implemented" };
    case "removeRelationship":
      return { ok: false, error: "removeRelationship not implemented" };
    case "setAnnotation":
      return { ok: false, error: "setAnnotation not implemented" };
    case "reparent":
      return { ok: false, error: "reparent not implemented" };
    default: {
      // exhaustiveness guard
      const _never: never = request;
      return { ok: false, error: `unknown request: ${_never}` };
    }
  }
}

export function mutateIR(ir: Diagram, request: EditRequest): void {
  switch (request.type) {
    case "setPos": {
      const block = resolveTarget(ir, request.target);
      if (!(block instanceof Block || block instanceof Note)) return; // regions are positioned via rects
      const pos = block.annotations.find((a) => a.name === "pos");

      const posArgs: AnnotationArg[] = [
        { kind: "number", value: request.pos.x },
        { kind: "number", value: request.pos.y },
      ];

      if (pos) {
        pos.args = posArgs;
      } else {
        block.annotations.push(new Annotation("pos", posArgs));
      }
      break;
    }
    case "rename":
    case "addMember":
    case "removeMember":
    case "addBlock":
    case "removeBlock":
    case "addRelationship":
    case "removeRelationship":
    case "setAnnotation":
    case "reparent":
  }
}
