// -*- mode: typescript; typescript-indent-level: 2; -*-

import { Stmt, Expr } from "./ast";
import { parse } from "./parser";

// https://learnxinyminutes.com/docs/wasm/

type LocalEnv = Map<string, boolean>;

// Numbers are offsets into global memory
export type GlobalEnv = {
  globals: Map<string, number>;
  offset: number;
}

export const emptyEnv = { globals: new Map(), offset: 0 };

type CompileResult = {
  wasmSource: string,
  newEnv: GlobalEnv
};

export function augmentEnv(env: GlobalEnv, stmts: Array<Stmt>) : GlobalEnv {
  console.log("Augmenting env");
  const newEnv = new Map(env.globals);
  console.log("environment agumented");
  var newOffset = env.offset;
  stmts.forEach((s) => {
    switch(s.tag) {
      case "define":
        newEnv.set(s.name, newOffset);
        newOffset += 8;
        break;
    }
  })
  return {
    globals: newEnv,
    offset: newOffset
  }
}

export function compile(source: string, env: GlobalEnv) : CompileResult {
  const ast = parse(source);
  const definedVars = new Set();
  ast.forEach(s => {
    switch(s.tag) {
      case "define":
        definedVars.add(s.name);
        break;
    }
  }); 
  const scratchVar : string = `(local $$last i64)`;
  const localDefines = [scratchVar];
  // definedVars.forEach(v => {
  //   localDefines.push(`(local $${v} i64)`);
  // })
  
  const withDefines = augmentEnv(env, ast);
  const commandGroups = ast.map((stmt) => codeGen(stmt, withDefines));
  const commands = localDefines.concat([].concat.apply([], commandGroups));
  console.log("env:");
  console.log(env);
  
  console.log("Generated: ", commands.join("\n"));
  return {
    wasmSource: commands.join("\n"),
    newEnv: withDefines
  };
}

function codeGen(stmt: Stmt, env : GlobalEnv) : Array<string> {
  console.log("tag: " + stmt.tag);
  switch(stmt.tag) {
    case "define":
      
      var valStmts = [`(i32.const ${env.globals.get(stmt.name)})`];
      valStmts = valStmts.concat(codeGenExpr(stmt.value, env));
      return valStmts.concat([`(i64.store)`]);
    case "expr":
      var exprStmts = codeGenExpr(stmt.expr, env);
      return exprStmts.concat([`(local.set $$last)`]);
    case "if":
      var result: Array<string> = [];

      // Push the condition to the stack
      result = result.concat(codeGenExpr(stmt.cond, env));

      // Generate the if block header
      result = result.concat("(if ");

      // Fix the size
      result = result.concat("(i32.wrap/i64) (then");
            
      // Add the ifBody
      stmt.ifBody.forEach(s => {
	result = result.concat(codeGen(s, env));
      });

      // Close the if block
      result = result.concat("))");
      console.log("result = " + result);
      return result;
  }
}

function codeGenOp(op: string) : Array<string> {
  switch (op) {
    case "+":
      return [`(i64.add)`];
    case "-":
      return [`(i64.sub)`];
    case "*":
      return [`(i64.mul)`];
  }
}

function codeGenExpr(expr : Expr, env : GlobalEnv) : Array<string> {
  console.log(expr.tag);
  switch(expr.tag) {
    case "builtin1":
      const argStmts = codeGenExpr(expr.arg, env);
      return argStmts.concat([`(call $${expr.name})`]);
    case "bool":
      if (expr.value == true) {
	return ["(i64.const " + ((BigInt(1)<<BigInt(62)) + BigInt(1)).toString() + ")"];
      } else {
	return ["(i64.const " + ((BigInt(1)<<BigInt(62)) + BigInt(0)).toString() + ")"];
      }
    case "num":
      return ["(i64.const " + expr.value + ")"];
    case "id":
      return [`(i32.const ${env.globals.get(expr.name)})`,
	      `(i64.load)`];
    case "binExp":
      const leftArg  = codeGenExpr(expr.arg[0], env);
      const op       = codeGenOp(expr.name);
      const rightArg = codeGenExpr(expr.arg[1], env);
      return leftArg.concat(rightArg).concat(op);
    case "builtin2":
      const firstArg = codeGenExpr(expr.arg[0], env);
      const secondArg = codeGenExpr(expr.arg[1], env);
      return [...firstArg, ...secondArg, `(call $${expr.name})`];      
  }
}
