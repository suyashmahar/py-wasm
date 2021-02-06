// -*- mode: typescript; typescript-indent-level: 2; -*-

import { Type, Expr, Stmt } from "./ast";

export type FuncEnv = {
  members: Array<Type>;
  retType: Type;
  body?: Array<Stmt>;
};

export type ClassEnv = {
  tableOff: number;
  memberVars: Map<string, [Expr, Type]>;
  ctor: FuncEnv;
  memberFuncs: Map<string, FuncEnv>;
};

// Numbers are offsets into global memory
export type GlobalEnv = {
  globals: Map<string, number>;
  funcs: Map<string, FuncEnv>; // Stores the argument types and return
			       // type for a functions
  classes: Map<string, ClassEnv>; // Classes are a 
  offset: number;
  classOffset: number;
};
