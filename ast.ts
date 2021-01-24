// -*- mode: typescript; typescript-indent-level: 2; -*-

export type Parameter = { tag: "parameter", name: string, type: string }

export type Stmt =
  | { tag: "func", name: string, parameters: Array<Parameter>, ret: string, body: Array<Stmt> }
  | { tag: "define", name: string, staticType: string, value: Expr }
  | { tag: "assign", name: string, value: Expr }
  | { tag: "expr", expr: Expr }
  | { tag: "if", cond: Expr, ifBody: Array<Stmt>, branches: Array<[Expr, Array<Stmt>]>, elseBody: Array<Stmt> }
  | { tag: "return", expr: Expr }

export type Expr =
  | { tag: "num", value: number }
  | { tag: "none" }
  | { tag: "bool", value: boolean}
  | { tag: "id", name: string }
  | { tag: "binExp", name: string, arg: [Expr, Expr] }
  | { tag: "funcCall", name: string, args: Array<Expr> }
