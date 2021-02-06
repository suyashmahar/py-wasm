// -*- mode: typescript; typescript-indent-level: 2; -*-

export type Parameter = { tag: "parameter", name: string, type: Type }
export type Pos = { line: number, col: number, len: number } // For line information on error
export type Branch = { tag: "branch", cond: Expr, condPos: Pos, body : Array<Stmt> }

export type Value =
    { tag: "none" }
  | { tag: "bool", value: boolean }
  | { tag: "num", value: number }
  | { tag: "object", name: string, address: number}

export type Type =
  | {tag: "number"}
  | {tag: "bool"}
  | {tag: "none"}
  | {tag: "class", name: string}

export const BoolT: Type  = { tag: "bool" }
export const IntT: Type   = { tag: "number" }
export const NoneT: Type  = { tag: "none" }

export type Stmt =
  | { tag: "pass", pos: Pos }
  | { tag: "func", pos: Pos, name: string, parameters: Array<Parameter>, ret: Type, body: Array<Stmt> }
  | { tag: "define", pos: Pos, name: string, staticType: Type, value: Expr }
  | { tag: "assign", pos: Pos, namePos: Pos, name: string, value: Expr }
  | { tag: "expr", expr: Expr }
  | { tag: "while", cond: Expr, whileBody: Array<Stmt> }
  | { tag: "if", cond: Expr, condPos: Pos, ifBody: Array<Stmt>, branches: Array<Branch>, elseBody: Array<Stmt> }
  | { tag: "return", pos: Pos, expr: Expr }

export type Expr =
  | { tag: "num", pos: Pos, value: number }
  | { tag: "none", pos: Pos}
  | { tag: "bool", pos: Pos, value: boolean}
  | { tag: "id", pos: Pos, name: string }
  | { tag: "binExp", pos: Pos, name: string, arg: [Expr, Expr] }
  | { tag: "unaryExp", pos: Pos, name: string, arg: Expr }
  | { tag: "funcCall", pos: Pos, prmPos: Pos, prmsPosArr: Array<Pos>, name: string, args: Array<Expr> }
