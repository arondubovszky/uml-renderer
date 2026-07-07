import { EditRequest, EditResult } from "./edits.ts";
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
    return { ok: false, error: "idk" };
  }
}
