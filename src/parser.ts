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
  Span,
  TypeRef,
  Visibility,
} from "./ir.ts";

export class ParseError extends Error {
  public span: Span;

  constructor(message: string, span: Span) {
    super(message);
    this.name = "ParseError";
    this.span = span;
  }
}

export function parse(source: string): Diagram {
  return new Parser(source).parseDiagram();
}

const REL_OPS: [string, RelationshipKind][] = [
  ["--|>", RelationshipKind.Inheritance],
  ["-->", RelationshipKind.Association],
  ["--o", RelationshipKind.Aggregation],
  ["--*", RelationshipKind.Composition],
  ["..>", RelationshipKind.Dependency],
];

class Parser {
  private src: string;
  private pos = 0;

  constructor(source: string) {
    this.src = source;
  }

  parseDiagram(): Diagram {
    const diagram = new Diagram();
    this.skip();
    while (this.pos < this.src.length) {
      this.parseItem(diagram);
      this.skip();
    }
    return diagram;
  }

  private parseItem(diagram: Diagram) {
    if (this.at("@")) {
      diagram.annotations.push(this.parseAnnotation());
      return;
    }

    const start = this.pos;
    const first = this.parseIdent();

    if (first === "note") {
      diagram.notes.push(this.parseNote(start));
      return;
    }
    if (first === "region") {
      diagram.regions.push(this.parseRegion(start));
      return;
    }
    const relKind = this.tryRelOp();
    if (relKind !== undefined) {
      diagram.relationships.push(this.parseRelationship(first, relKind, start));
      return;
    }
    // a dot after the ident can only be a member-qualified relationship
    // source like "User.posts --> Post" (the "..>" operator was already
    // consumed above, so a single dot is unambiguous here)
    if (this.at(".")) {
      this.expect(".");
      const memberName = this.parseIdent();
      const qualifiedKind = this.tryRelOp();
      if (qualifiedKind === undefined) {
        throw this.error(
          `expected relationship operator after "${first}.${memberName}"`,
        );
      }
      diagram.relationships.push(
        this.parseRelationship(first, qualifiedKind, start, memberName),
      );
      return;
    }
    diagram.blocks.push(this.parseBlock(first, start));
  }

  // block = kind name annotation* { member* }
  private parseBlock(kind: string, start: number): Block {
    this.skip();
    const nameStart = this.pos;
    const name = this.parseIdent();
    const nameSpan: Span = { start: nameStart, end: this.pos };
    // a block with one of these names could never be referenced, since the
    // top-level dispatch would take it for a note/region
    if (name === "note" || name === "region") {
      throw this.error(
        `"${name}" is a keyword and cannot be used as a block name`,
        nameStart,
      );
    }
    const annotations = this.parseAnnotations();
    this.expect("{");
    const members: Member[] = [];
    while (!this.at("}")) {
      members.push(this.parseMember());
    }
    this.expect("}");
    return new Block(
      kind,
      name,
      members,
      annotations,
      this.spanFrom(start),
      nameSpan,
    );
  }

  // member = visibility? name params? return_type? annotation*
  private parseMember(): Member {
    this.skip();
    const start = this.pos;

    let visibility: Visibility | undefined;
    if (this.eat("+")) visibility = Visibility.PUBLIC;
    else if (this.eat("-")) visibility = Visibility.PRIVATE;
    else if (this.eat("#")) visibility = Visibility.PROTECTED;

    const name = this.parseIdent();
    const params = this.at("(") ? this.parseParams() : undefined;
    const returnType = this.eat(":") ? this.parseTypeRef() : undefined;
    const annotations = this.parseAnnotations();
    return new Member(
      name,
      visibility,
      params,
      returnType,
      annotations,
      this.spanFrom(start),
    );
  }

  private parseParams(): Param[] {
    this.expect("(");
    const params: Param[] = [];
    if (!this.at(")")) {
      do {
        const name = this.parseIdent();
        const typeRef = this.eat(":") ? this.parseTypeRef() : undefined;
        params.push(new Param(name, typeRef));
      } while (this.eat(","));
    }
    this.expect(")");
    return params;
  }

  private parseTypeRef(): TypeRef {
    const name = this.parseIdent();
    let generic: TypeRef | undefined;
    if (this.eat("<")) {
      generic = this.parseTypeRef();
      this.expect(">");
    }
    return new TypeRef(name, generic);
  }

  // relationship = from(.member)? rel_op to (: "label")? annotation*
  // the source, optional qualifier and operator were consumed by parseItem
  private parseRelationship(
    from: string,
    kind: RelationshipKind,
    start: number,
    fromMember?: string,
  ): Relationship {
    const to = this.parseIdent();
    if (this.at(".") && !this.at("..")) {
      throw this.error("member qualifiers are only allowed on the source side");
    }
    let label: string | undefined;
    if (this.eat(":")) {
      label = this.parseString();
    }
    const annotations = this.parseAnnotations();
    return new Relationship(
      from,
      to,
      kind,
      label,
      annotations,
      this.spanFrom(start),
      fromMember,
    );
  }

  // note = "note" "text" (-> target)? annotation*
  private parseNote(start: number): Note {
    if (!this.at('"')) {
      throw this.error("note text must be a quoted string");
    }
    const text = this.parseString();
    let target: string | undefined;
    if (this.at("-->")) {
      throw this.error('note targets use "->", not "-->"');
    }
    if (this.eat("->")) {
      target = this.parseIdent();
    }
    const annotations = this.parseAnnotations();
    return new Note(text, target, annotations, this.spanFrom(start));
  }

  // region = "region" name annotation* { block_name* }
  private parseRegion(start: number): Region {
    if (!this.atIdent()) {
      throw this.error("expected region name");
    }
    const name = this.parseIdent();
    const annotations = this.parseAnnotations();
    this.expect("{");
    const members: string[] = [];
    while (!this.at("}")) {
      members.push(this.parseIdent());
    }
    this.expect("}");
    return new Region(name, members, annotations, this.spanFrom(start));
  }

  private parseAnnotations(): Annotation[] {
    const annotations: Annotation[] = [];
    while (this.at("@")) {
      annotations.push(this.parseAnnotation());
    }
    return annotations;
  }

  // annotation = @name or @name(arg, arg, ...)
  private parseAnnotation(): Annotation {
    this.skip();
    const start = this.pos;
    this.expect("@");
    const name = this.parseIdent();
    const args: AnnotationArg[] = [];
    if (this.eat("(")) {
      if (!this.at(")")) {
        do {
          args.push(this.parseAnnotationArg());
        } while (this.eat(","));
      }
      this.expect(")");
    }
    return new Annotation(name, args, this.spanFrom(start));
  }

  private parseAnnotationArg(): AnnotationArg {
    this.skip();
    const c = this.src[this.pos];
    if (c === "#") return { kind: "hex", value: this.parseHexColor() };
    if (c === '"') return { kind: "str", value: this.parseString() };
    if (c === "(") return this.parseParenArg();
    if (c === "-" || isDigit(c)) {
      const expr = this.parseNumExpr();
      // a bare literal stays a plain number arg
      return expr.op === "num"
        ? { kind: "number", value: expr.value }
        : { kind: "expr", value: expr };
    }
    if (isIdentStart(c)) {
      // an ident followed by "(" is a geometry call like width(User),
      // otherwise it is a plain ident arg like red
      if (this.atCall()) return { kind: "expr", value: this.parseNumExpr() };
      return { kind: "ident", value: this.parseIdent() };
    }
    throw this.error(
      "expected annotation argument (color, string, number, expression, identifier or point)",
    );
  }

  // "(" opens either a point arg like (50, 40) or a parenthesized
  // expression like (2+3)*4: a comma after the first expression makes it
  // a point
  private parseParenArg(): AnnotationArg {
    this.expect("(");
    const first = this.parseNumExpr();
    if (this.eat(",")) {
      const y = this.parseNumExpr();
      this.expect(")");
      return { kind: "point", value: [first, y] };
    }
    this.expect(")");
    const expr = this.parseNumExpr(first);
    return expr.op === "num"
      ? { kind: "number", value: expr.value }
      : { kind: "expr", value: expr };
  }

  // expr = term (("+" | "-") term)*
  // an already-parsed factor can be passed in to continue after a
  // parenthesized expression, e.g. the *4 in (2+3)*4
  private parseNumExpr(initial?: NumExpr): NumExpr {
    let left = this.parseNumTerm(initial);
    for (;;) {
      if (this.eat("+")) {
        left = { op: "+", left, right: this.parseNumTerm() };
      } else if (this.eat("-")) {
        left = { op: "-", left, right: this.parseNumTerm() };
      } else {
        return left;
      }
    }
  }

  // term = factor (("*" | "/") factor)*
  private parseNumTerm(initial?: NumExpr): NumExpr {
    let left = initial ?? this.parseNumFactor();
    for (;;) {
      if (this.eat("*")) {
        left = { op: "*", left, right: this.parseNumFactor() };
      } else if (this.eat("/")) {
        left = { op: "/", left, right: this.parseNumFactor() };
      } else {
        return left;
      }
    }
  }

  // factor = "-" factor | "(" expr ")" | number | fn "(" block ")"
  private parseNumFactor(): NumExpr {
    this.skip();
    if (this.eat("-")) {
      return {
        op: "-",
        left: { op: "num", value: 0 },
        right: this.parseNumFactor(),
      };
    }
    if (this.eat("(")) {
      const inner = this.parseNumExpr();
      this.expect(")");
      return inner;
    }
    if (isDigit(this.src[this.pos])) {
      return { op: "num", value: this.parseNumber() };
    }
    if (isIdentStart(this.src[this.pos])) {
      const fn = this.parseIdent();
      this.expect("(");
      const block = this.parseIdent();
      this.expect(")");
      return { op: "ref", fn, block };
    }
    throw this.error("expected number or geometry call like width(Block)");
  }

  // lookahead: does an ident followed by "(" start here?
  private atCall(): boolean {
    this.skip();
    let i = this.pos;
    if (!isIdentStart(this.src[i])) return false;
    while (i < this.src.length && isIdentChar(this.src[i])) i++;
    return this.src[i] === "(";
  }

  // token-level parsers. each one skips leading trivia itself, so the
  // grammar functions above never have to think about whitespace

  private parseIdent(): string {
    this.skip();
    if (!isIdentStart(this.src[this.pos])) {
      throw this.error("expected identifier");
    }
    const start = this.pos;
    while (this.pos < this.src.length && isIdentChar(this.src[this.pos])) {
      this.pos++;
    }
    return this.src.slice(start, this.pos);
  }

  // quoted string with no escape sequences, returned without the quotes
  private parseString(): string {
    this.skip();
    if (this.src[this.pos] !== '"') {
      throw this.error("expected string");
    }
    const start = ++this.pos;
    while (this.pos < this.src.length && this.src[this.pos] !== '"') {
      this.pos++;
    }
    if (this.pos >= this.src.length) {
      throw this.error("unterminated string", start - 1);
    }
    return this.src.slice(start, this.pos++);
  }

  private parseNumber(): number {
    this.skip();
    const start = this.pos;
    if (this.src[this.pos] === "-") this.pos++;
    if (!isDigit(this.src[this.pos])) {
      throw this.error("expected number", start);
    }
    while (isDigit(this.src[this.pos])) this.pos++;
    if (this.src[this.pos] === "." && isDigit(this.src[this.pos + 1])) {
      this.pos++;
      while (isDigit(this.src[this.pos])) this.pos++;
    }
    return Number(this.src.slice(start, this.pos));
  }

  // hex color like #eef, kept as written (including the #)
  private parseHexColor(): string {
    this.skip();
    const start = this.pos;
    if (this.src[this.pos] !== "#" || !isHexDigit(this.src[this.pos + 1])) {
      throw this.error("expected hex color");
    }
    this.pos++;
    while (isHexDigit(this.src[this.pos])) this.pos++;
    return this.src.slice(start, this.pos);
  }

  private tryRelOp(): RelationshipKind | undefined {
    this.skip();
    for (const [op, kind] of REL_OPS) {
      if (this.src.startsWith(op, this.pos)) {
        // "--o" ends in a letter, so require a word boundary to keep it
        // from biting the front of something like "--owner"
        if (
          isIdentChar(op[op.length - 1]) &&
          isIdentChar(this.src[this.pos + op.length])
        ) {
          continue;
        }
        this.pos += op.length;
        return kind;
      }
    }
    return undefined;
  }

  // low-level cursor helpers

  private at(text: string): boolean {
    this.skip();
    return this.src.startsWith(text, this.pos);
  }

  private atIdent(): boolean {
    this.skip();
    return isIdentStart(this.src[this.pos]);
  }

  private eat(text: string): boolean {
    if (this.at(text)) {
      this.pos += text.length;
      return true;
    }
    return false;
  }

  private expect(text: string) {
    if (!this.eat(text)) {
      throw this.error(`expected "${text}"`);
    }
  }

  private skip() {
    for (;;) {
      const c = this.src[this.pos];
      if (c === " " || c === "\t" || c === "\r" || c === "\n") {
        this.pos++;
      } else if (this.src.startsWith("//", this.pos)) {
        while (this.pos < this.src.length && this.src[this.pos] !== "\n") {
          this.pos++;
        }
      } else if (this.src.startsWith("/*", this.pos)) {
        const end = this.src.indexOf("*/", this.pos + 2);
        if (end === -1) throw this.error("unterminated block comment");
        this.pos = end + 2;
      } else {
        break;
      }
    }
  }

  // node spans run from the first character of the node to the character
  // after its last token, so source.slice(span.start, span.end) gives back
  // the exact text the node was parsed from
  private spanFrom(start: number): Span {
    return { start, end: this.pos };
  }

  private error(message: string, at: number = this.pos): ParseError {
    let line = 1;
    let col = 1;
    for (let i = 0; i < at && i < this.src.length; i++) {
      if (this.src[i] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
    }
    return new ParseError(`${message} at line ${line}, column ${col}`, {
      start: at,
      end: Math.min(at + 1, this.src.length),
    });
  }
}

function isIdentStart(c: string | undefined): boolean {
  return c !== undefined && (/[a-zA-Z]/.test(c) || c === "_");
}

function isIdentChar(c: string | undefined): boolean {
  return c !== undefined && (/[a-zA-Z0-9]/.test(c) || c === "_");
}

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9";
}

function isHexDigit(c: string | undefined): boolean {
  return c !== undefined && /[0-9a-fA-F]/.test(c);
}
