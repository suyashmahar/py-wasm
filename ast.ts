// -*- mode: typescript; typescript-indent-level: 2; -*-

export type Stmt =
  | { tag: "define", name: string, staticType: string, value: Expr }
  | { tag: "expr", expr: Expr }
  | { tag: "if", cond: Expr, ifBody: Array<Stmt>, branches: Array<[Expr, Array<Stmt>]>, elseBody: Array<Stmt> }

export type Expr =
    { tag: "num", value: number }
  | { tag: "bool", value: boolean}
  | { tag: "id", name: string }
  | { tag: "binExp", name: string, arg: [Expr, Expr] }
  | { tag: "builtin1", name: string, arg: Expr }
  | { tag: "builtin2", name: string, arg: [Expr, Expr] }
