import { Span } from "./ir";

export type EditRequest = {
  type: "setPos";
  target: TargetRef;
  x: number;
  y: number;
};

export type TargetRef =
  | { kind: "block" | "region"; name: string } // ops: drag and drop (TODO: rename, add/remove members)
  | { kind: "note"; span: Span }; // note has to be identified via its span
