// -*- mode: typescript; typescript-indent-level: 2; -*-

import { Stmt, Expr, Parameter } from "./ast";
import { parse } from "./parser";

// https://learnxinyminutes.com/docs/wasm/

type LocalEnv = Map<string, boolean>;

// Store all the functions separately
export var funcs : Array<Array<string>> = [];
export const NONE_VAL = "2305843009213693952"; // 1<<62

// Numbers are offsets into global memory
export type GlobalEnv = {
  globals: Map<string, number>;
  funcs: Map<string, [number, string]>; // Stores the number of
				      // arguments and return type for
				      // a functions
  offset: number;
}

export const emptyEnv = { globals: new Map(), offset: 0 };

type CompileResult = {
  wasmSource: string,
  newEnv: GlobalEnv,
  funcs: string
};

function getEnv(env: GlobalEnv, name: string) {
  const result = env.globals.get(name);
  if (result == undefined) {
    throw "Variable `" + name + "' not in scope" ;
  }
  return result;
}

function getLocal(localParams: Array<Parameter>, name: string) : boolean {
  var result:boolean = false;
  localParams.forEach((p) => {
    if (p.name == name) {
      result = true;
    }
  })
  
  return result;
}

export function augmentEnv(env: GlobalEnv, stmts: Array<Stmt>) : GlobalEnv {
  console.log("Augmenting env");
  const newEnv = new Map(env.globals);
  console.log("environment agumented");
  var newOffset = env.offset;
  var newFuncs = new Map(env.funcs);
  
  stmts.forEach((s) => {
    switch(s.tag) {
      case "define":
        newEnv.set(s.name, newOffset);
        newOffset += 8;
        break;
      case "func":
	newFuncs.set(s.name, [s.parameters.length, s.ret]);
	break;
    }
  })
  return {
    globals: newEnv,
    offset: newOffset,
    funcs: newFuncs
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

  var funcsStr = "";
  funcs.forEach(fun => {
    funcsStr = funcsStr.concat(fun.join("\n"))
  });

  
  console.log("Generated: ", commands.join("\n"));
  return {
    wasmSource: commands.join("\n"),
    newEnv: withDefines,
    funcs: funcsStr
  };
}

function codeGenFunc(stmt: Stmt, env : GlobalEnv) : Array<string> {
  if (stmt.tag == "func") {
    var result: Array<string> = [];

    var header = `(func $${stmt.name}`;
    var funcLocals:Array<Parameter> = stmt.parameters;

    stmt.parameters.forEach(param => {
      header += ` (param $${param.name} i64) `;
    });

    stmt.body.forEach(s => {
      if (s.tag == "define") {
	funcLocals.push({tag : "parameter", name: s.name, type: s.staticType});
      }
    });

    header += ` (result i64) `;

    result.push(header);

    result.push(`(local $$last i64)`)
    
    if (stmt.body != []) {
      console.log("parameters:");
      console.log(stmt.parameters);
      stmt.body.forEach(s => {
	result = result.concat(codeGen(s, env, stmt.parameters));
      });

    }

    if (stmt.ret != "None") {
      // result.push(`(local.get $$last)`);
    } else { // Return None
      result.push(`(i64.const ${NONE_VAL})`); // 1UL << 62
    }
    
    // Close the function body
    result = result.concat([")", ""]);

    console.log("function compiled:");
    console.log(result);

    // Add this function to the global function list
    funcs.push(result);

    return [];
  } else {
    throw "Cannot run codeGenFunc on non func statement";
  }
}

function codeGenRet(stmt : Stmt, env : GlobalEnv, localParams: Array<Parameter>) : Array<string> {
  if (stmt.tag == "return") {
    var result : Array<string> = [];
    
    result = codeGenExpr(stmt.expr, env, localParams);
    console.log("codeGenRet resuilt:");
    console.log(result);
    return result.concat([`(return)`]);
  } else {
    throw "Cannot run codeGenRet on non return statement";
  }
}

function codeGen(stmt: Stmt, env : GlobalEnv, localParams: Array<Parameter> = []) : Array<string> {
  console.log("tag: " + stmt.tag);
  switch(stmt.tag) {
    case "func":
      return codeGenFunc(stmt, env);
    case "return":
      return codeGenRet(stmt, env, localParams);
    case "define":
      if (localParams.length == 0) { // Global context
	var valStmts = [`(i32.const ${getEnv(env, stmt.name)})`];
	valStmts = valStmts.concat(codeGenExpr(stmt.value, env, localParams));
	return valStmts.concat([`(i64.store)`]);
      } else { // Local context
	var valStmts = [`(local $${stmt.name} i64)`];
	return valStmts;
      }
    case "assign":
      if (getLocal(localParams, stmt.name)) {
	return codeGenExpr(stmt.value, env, localParams).concat([`(local.set $${stmt.name})`])
      } else {
	var rhs = [`(i32.const ${getEnv(env, stmt.name)})`]
	rhs = rhs.concat(codeGenExpr(stmt.value, env, localParams));
	return rhs.concat([`(i64.store)`]);
      }
    case "expr":
      var exprStmts = codeGenExpr(stmt.expr, env, localParams);
      return exprStmts.concat([`(local.set $$last)`]);
    case "if":
      var result: Array<string> = [];

      // Push the condition to the stack
      result = result.concat(codeGenExpr(stmt.cond, env, localParams));

      // Generate the if block header
      result = result.concat("(if ");

      // Fix the size
      result = result.concat("(i32.wrap/i64) (then");
            
      // Add the ifBody
      stmt.ifBody.forEach(s => {
	result = result.concat(codeGen(s, env, localParams));
      });

      // Close if body
      result = result.concat(") ");

      if (stmt.elseBody != []) {
	// The else block
	result = result.concat("(else ");

	// Add the elseBody
	stmt.elseBody.forEach(s => {
	  result = result.concat(codeGen(s, env, localParams));
	});

	// Close the else body
	result = result.concat(")");
      }

      result = result.concat(")");
      
      console.log("result = " + result);
      return result;
  }
}

function codeGenUOp(uop: string) : Array<string> {
  switch (uop) {
    case "-":
      return [`(i64.const -1)`,
	      `(i64.mul)`]
    case "not":
      return [`(i64.const 1)`,
	      `(i64.add)`,
	      `(i64.const 18446744073709551613)`, // Reset bit at pos 1 { ((1<<64)-1)-2 }
	      `(i64.and)`
	     ]
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
    case ">":
      return [`(i64.gt_s)`, `(i64.extend_i32_s)`];
    case "<":
      return [`(i64.lt_s)`, `(i64.extend_i32_s)`];
    case "<=":
      return [`(i64.le_s)`, `(i64.extend_i32_s)`];
    case ">=":
      return [`(i64.ge_s)`, `(i64.extend_i32_s)`];
    case "//":
      return [`(i64.div_s)`];
    case "%":
      return [`(i64.rem_s)`]
    case "==":
      return [`(i64.eq)`,
	      `(i64.extend_i32_s)`,
	      `(i64.const 1)`,
	      `(i64.const 62)`,
	      `(i64.shl)`,
	      `(i64.add)`];
    case "!=":
      return [`(i64.ne)`,
	      `(i64.extend_i32_s)`,
	      `(i64.const 1)`,
	      `(i64.const 62)`,
	      `(i64.shl)`,
	      `(i64.add)`];
    case "is":
      return [`(i64.sub)`,
	      `(i64.const 32)`,
	      `(i64.shr_u)`,
	      `(i64.const 0)`,
	      `(i64.eq)`,
	      `(i64.extend_i32_s)`,
	      `(i64.const 1)`,
	      `(i64.const 62)`,
	      `(i64.shl)`,
	      `(i64.add)`
	     ];
  }
}

function codeGenExpr(expr : Expr, env : GlobalEnv, localParams : Array<Parameter>) : Array<string> {
  console.log(expr.tag);
  switch(expr.tag) {
    case "funcCall":
      var argStmts : Array<string> = [];
      expr.args.forEach(arg => {
	argStmts = argStmts.concat(codeGenExpr(arg, env, localParams));
      });

      if (env.funcs.get(expr.name) == undefined) {
	throw "Function not in scope: `" + expr.name + "()'"
      }

      const argsExpected = env.funcs.get(expr.name)[0];
      const argsProvided = expr.args.length;
      if (argsExpected != argsProvided) {
	throw "`" + expr.name + "()' needs "
	  + `${argsExpected} arguments, ${argsProvided} provided`;
      }

      console.log("args:");
      console.log(expr.args);
      
      const result = argStmts.concat([`(call $${expr.name})`]);

      console.log("result: ");
      console.log(result);
      
      return result;
    case "bool":
      if (expr.value == true) {
	return ["(i64.const " + ((BigInt(1)<<BigInt(62)) + BigInt(1)).toString() + ")"];
      } else {
	return ["(i64.const " + ((BigInt(1)<<BigInt(62)) + BigInt(0)).toString() + ")"];
      }
    case "num":
      return ["(i64.const " + expr.value + ")"];
    case "id":
      console.log("Locals:");
      console.log(localParams);
      if (getLocal(localParams, expr.name)) {
	console.log("getting local");
	return [`(local.get $${expr.name})`];
      } else {
	console.log("Getting global");
	return [`(i32.const ${getEnv(env, expr.name)})`,
	      `(i64.load)`];
      }
    case "binExp":
      const leftArg  = codeGenExpr(expr.arg[0], env, localParams);
      const op       = codeGenOp(expr.name);
      const rightArg = codeGenExpr(expr.arg[1], env, localParams);
      return leftArg.concat(rightArg).concat(op);
    case "unaryExp":
      const uop  = codeGenUOp(expr.name);
      const uArg = codeGenExpr(expr.arg, env, localParams);
      return uArg.concat(uop);
    case "none":
      return [`(i64.const ${NONE_VAL})`];
  }
}
