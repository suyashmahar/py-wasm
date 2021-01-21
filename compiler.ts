// -*- mode: typescript; typescript-indent-level: 2; -*-

import { Stmt, Expr } from "./ast";
import { parse } from "./parser";

// https://learnxinyminutes.com/docs/wasm/

type LocalEnv = Map<string, boolean>;

type CompileResult = {
  wasmSource: string,
};

export function compile(source: string) : CompileResult {
  const ast = parse(source);
  const definedVars = new Set();
  ast.forEach(s => {
    switch(s.tag) {
      case "define":
        definedVars.add(s.name);
        break;
    }
  }); 
  const scratchVar : string = `(local $$last i32)`;
  const localDefines = [scratchVar];
  definedVars.forEach(v => {
    localDefines.push(`(local $${v} i32)`);
  })
  
  const commandGroups = ast.map((stmt) => codeGen(stmt));
  const commands = localDefines.concat([].concat.apply([], commandGroups));
  console.log("Generated: ", commands.join("\n"));
  return {
    wasmSource: commands.join("\n"),
  };
}

function codeGen(stmt: Stmt) : Array<string> {
  switch(stmt.tag) {
    case "define":
      var valStmts = codeGenExpr(stmt.value);
      return valStmts.concat([`(local.set $${stmt.name})`]);
    case "expr":
      var exprStmts = codeGenExpr(stmt.expr);
      return exprStmts.concat([`(local.set $$last)`]);
  }
}

function codeGenOp(op: string) : Array<string> {
  switch (op) {
    case "+":
      return [`(i32.add)`];
    case "-":
      return [`(i32.sub)`];
    case "*":
      return [`(i32.mul)`];
  }
}

function codeGenExpr(expr : Expr) : Array<string> {
  console.log(expr.tag);
  switch(expr.tag) {
    case "builtin1":
      const argStmts = codeGenExpr(expr.arg);
      return argStmts.concat([`(call $${expr.name})`]);
    case "num":
      return ["(i32.const " + expr.value + ")"];
    case "id":
      return [`(local.get $${expr.name})`];
    case "binExp":
      const leftArg  = codeGenExpr(expr.arg[0]);
      const op       = codeGenOp(expr.name);
      const rightArg = codeGenExpr(expr.arg[1]);
      return leftArg.concat(rightArg).concat(op);
    case "builtin2":
      const firstArg = codeGenExpr(expr.arg[0]);
      const secondArg = codeGenExpr(expr.arg[1]);
      return [...firstArg, ...secondArg, `(call $${expr.name})`];      
  }
}
