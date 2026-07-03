// [start, end[
export interface Span {
  start: number;
  end: number;
}

const EMPTY_SPAN: Span = { start: 0, end: 0 };

export class Diagram {
  public blocks: Block[];
  public relationships: Relationship[];
  public notes: Note[];
  public regions: Region[];
  // annotations for the entire diagram are written at the top level of the file, e.g. @bg(#202020)
  public annotations: Annotation[];

  constructor() {
    this.blocks = [];
    this.relationships = [];
    this.notes = [];
    this.regions = [];
    this.annotations = [];
  }
}

export class Block {
  // "class", "interface", ... — whatever keyword introduced the block
  public kind: string;
  public name: string;
  public members: Member[];
  public annotations: Annotation[];
  public span: Span;

  constructor(
    kind: string = "class",
    name: string = "",
    members: Member[] = [],
    annotations: Annotation[] = [],
    span: Span = EMPTY_SPAN,
  ) {
    this.kind = kind;
    this.name = name;
    this.members = members;
    this.annotations = annotations;
    this.span = span;
  }
}

export enum Visibility {
  PUBLIC = "public",
  PRIVATE = "private",
  PROTECTED = "protected",
}

export class Member {
  public visibility?: Visibility;
  public name: string;
  // undefined = attribute; present (even empty) = method
  public params?: Param[];
  public returnType?: TypeRef;
  public annotations: Annotation[];
  public span: Span;

  constructor(
    name: string = "",
    visibility?: Visibility,
    params?: Param[],
    returnType?: TypeRef,
    annotations: Annotation[] = [],
    span: Span = EMPTY_SPAN,
  ) {
    this.name = name;
    this.visibility = visibility;
    this.params = params;
    this.returnType = returnType;
    this.annotations = annotations;
    this.span = span;
  }
}

export class Param {
  public name: string;
  public typeRef?: TypeRef;

  constructor(name: string, typeRef?: TypeRef) {
    this.name = name;
    this.typeRef = typeRef;
  }
}

// a type name with an optional single generic argument, e.g. List<User>.
export class TypeRef {
  public name: string;
  public generic?: TypeRef;

  constructor(name: string, generic?: TypeRef) {
    this.name = name;
    this.generic = generic;
  }
}

export enum RelationshipKind {
  Association = "association",
  Aggregation = "aggregation",
  Composition = "composition",
  Dependency = "dependency",
  Inheritance = "inheritance",
  Realization = "realization",
}

export class Relationship {
  // block names as written in the source; resolved to blocks by validate/render
  public from: string;
  public to: string;
  public kind: RelationshipKind;
  public label?: string;
  public annotations: Annotation[];
  public span: Span;

  constructor(
    from: string,
    to: string,
    kind: RelationshipKind = RelationshipKind.Association,
    label?: string,
    annotations: Annotation[] = [],
    span: Span = EMPTY_SPAN,
  ) {
    this.from = from;
    this.to = to;
    this.kind = kind;
    this.label = label;
    this.annotations = annotations;
    this.span = span;
  }
}

export class Note {
  public text: string;
  // name of the block this note points at, if any
  public target?: string;
  public annotations: Annotation[];
  public span: Span;

  constructor(
    text: string = "",
    target?: string,
    annotations: Annotation[] = [],
    span: Span = EMPTY_SPAN,
  ) {
    this.text = text;
    this.target = target;
    this.annotations = annotations;
    this.span = span;
  }
}

export class Region {
  public name: string;
  // names of blocks contained in this region
  public members: string[];
  public annotations: Annotation[];
  public span: Span;

  constructor(
    name: string = "",
    members: string[] = [],
    annotations: Annotation[] = [],
    span: Span = EMPTY_SPAN,
  ) {
    this.name = name;
    this.members = members;
    this.annotations = annotations;
    this.span = span;
  }
}

export type AnnotationArg =
  | { kind: "hex"; value: string } // #eef
  | { kind: "str"; value: string } // "quoted text"
  | { kind: "number"; value: number } // 10, 20.5
  | { kind: "ident"; value: string } // red
  | { kind: "point"; value: [number, number] }; // (50, 40)

export class Annotation {
  public name: string;
  public args: AnnotationArg[];
  public span: Span;

  constructor(
    name: string = "",
    args: AnnotationArg[] = [],
    span: Span = EMPTY_SPAN,
  ) {
    this.name = name;
    this.args = args;
    this.span = span;
  }
}
