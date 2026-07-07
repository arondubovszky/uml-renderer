import {
  applyTextEdits,
  EditRequest,
  EditResult,
  mutateIR,
  planEdit,
} from "./edits.ts";
import { Diagram } from "./ir.ts";
import { parse } from "./parser.ts";
import { render } from "./render.ts";

// orchestrator for the edits
export class EditableDiagram {
  private source: string;
  private ir: Diagram; // comp cuz this class handles source edits too

  constructor(src: string) {
    this.source = src;
    this.ir = parse(src);
  }

  getSource(): string {
    return this.source;
  }

  getIR(): Diagram {
    return this.ir;
  }

  getSvg(): string {
    return render(this.ir);
  }

  edit(req: EditRequest): EditResult {
    const result = planEdit(req, this.ir);
    if (!result.ok) return result;
    // keep both representations in sync from the same request:
    this.source = applyTextEdits(this.source, result.edits); // .uml text
    mutateIR(this.ir, req); // live IR (so getSvg() needs no re-parse)
    return result;
  }
}
