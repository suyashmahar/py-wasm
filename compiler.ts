// -*- mode: typescript; typescript-indent-level: 2; -*-

import { Stmt, Expr, Parameter, Pos, Type, NoneT, BoolT, IntT } from "./ast";
import { parse, typeError, symLookupError, argError, scopeError } from "./parser";
import { typecheck }  from "./tc";

// https://learnxinyminutes.com/docs/wasm/

type LocalEnv = Map<string, boolean>;

// Store all the functions separately
export var funcs : Array<Array<string>> = [];
export const TRUE_VAL = "4611686018427387905"; // (1<<62)+1
export const FALSE_VAL = "4611686018427387904"; // 1<<62
export const NONE_VAL = "2305843009213693952"; // 1<<61

// Numbers are offsets into global memory
export type GlobalEnv = {
  globals: Map<string, number>;
  funcs: Map<string, [Array<Type>, Type]>; // Stores the argument
					       // types and return
					       // type for a functions
  offset: number;
}

export const emptyEnv = { globals: new Map(), offset: 0 };

type CompileResult = {
  wasmSource: string,
  newEnv: GlobalEnv,
  funcs: string
};

function getEnv(pos: Pos, env: GlobalEnv, name: string, source: string) {
  const result = env.globals.get(name);
  if (result == undefined) {
    
    scopeError(pos, `Variable ${name} not in scope`, source);
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

export function augmentEnv(env: GlobalEnv, stmts: Array<Stmt>) : GlobalEnv {;
  const newEnv = new Map(env.globals);
  var newOffset = env.offset;
  var newFuncs = new Map(env.funcs);
  
  stmts.forEach((s) => {
    switch(s.tag) {
      case "define":
        newEnv.set(s.name.str, newOffset);
        newOffset += 8;
        break;
      case "func":
	const paramTypes: Array<Type> = [];
	s.content.parameters.forEach(param => {
	  paramTypes.push(param.type);
	});
	newFuncs.set(s.content.name, [paramTypes, s.content.ret]);
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
  
  const withDefines = augmentEnv(env, ast);

  /* Typecheck stuff */
  typecheck(ast, source, withDefines);
  
  const commandGroups = ast.map((stmt) => codeGen(stmt, withDefines, source));
  const commands = localDefines.concat([].concat.apply([], commandGroups));

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

function codeGenFunc(stmt: Stmt, env : GlobalEnv, source: string) : Array<string> {
  if (stmt.tag == "func") {
    var result: Array<string> = [];

    var header = `(func $${stmt.content.name}`;
    var funcLocals:Array<Parameter> = stmt.content.parameters;

    stmt.content.parameters.forEach(param => {
      header += ` (param $${param.name} i64) `;
    });

    stmt.content.body.forEach(s => {
      if (s.tag == "define") {
	funcLocals.push({tag : "parameter", name: s.name.str, type: s.staticType});
      }
    });

    header += ` (result i64) `;

    result.push(header);

    result.push(`(local $$last i64)`)

    stmt.content.body.forEach(bodyStmt => {
      if (bodyStmt.tag == "define") {
	result.push(`(local $${bodyStmt.name.str} i64)`);
      }
    });
    
    if (stmt.content.body != []) {
      console.log("parameters:");
      console.log(stmt.content.parameters);
      stmt.content.body.forEach(s => {
	result = result.concat(codeGen(s, env, source, stmt.content.parameters));
      });

    }

    if (stmt.content.ret != NoneT) {
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

function codeGenRet(stmt : Stmt, env : GlobalEnv, localParams: Array<Parameter>, source: string) : Array<string> {
  if (stmt.tag == "return") {
    var result : Array<string> = [];
    
    result = codeGenExpr(stmt.expr, env, localParams, source);
    console.log("codeGenRet resuilt:");
    console.log(result);
    return result.concat([`(return)`]);
  } else {
    throw "Cannot run codeGenRet on non return statement";
  }
}

function codeGen(stmt: Stmt, env : GlobalEnv, source: string, localParams: Array<Parameter> = []) : Array<string> {
  console.log("tag: " + stmt.tag);
  switch(stmt.tag) {
    case "pass":
      return ["(nop)"];
    case "func":
      return codeGenFunc(stmt, env, source);
    case "return":
      return codeGenRet(stmt, env, localParams, source);
    case "define":
      if (localParams.length == 0) { // Global context
	var valStmts = [`(i32.const ${getEnv(stmt.pos, env, stmt.name.str, source)})`];
	valStmts = valStmts.concat(codeGenExpr(stmt.value, env, localParams, source));
	return valStmts.concat([`(i64.store)`]);
      } else { // Local context
	var valStmts = codeGenExpr(stmt.value, env, localParams, source);
	return valStmts.concat([`(local.set $${stmt.name.str})`]);
      }
    case "assign":
      if (getLocal(localParams, stmt.name.str)) {
	return codeGenExpr(stmt.value, env, localParams, source).concat([`(local.set $${stmt.name.str})`])
      } else {
	var rhs = [`(i32.const ${getEnv(stmt.pos, env, stmt.name.str, source)})`]
	rhs = rhs.concat(codeGenExpr(stmt.value, env, localParams, source));
	return rhs.concat([`(i64.store)`]);
      }
    case "expr":
      var exprStmts = codeGenExpr(stmt.expr, env, localParams, source);
      return exprStmts.concat([`(local.set $$last)`]);
    case "if":
      var result: Array<string> = [];

      console.log("Branches:");
      console.log(stmt.branches);

      // Push the condition to the stack
      result = result.concat(codeGenExpr(stmt.cond, env, localParams, source));

      // Generate the if block header
      result = result.concat("(if ");

      // Fix the size
      result = result.concat("(i32.wrap/i64) (then");
            
      // Add the ifBody
      stmt.ifBody.forEach(s => {
	result = result.concat(codeGen(s, env, source, localParams));
      });

      // Close if body
      result = result.concat(") ");

      if (stmt.elseBody != [] && stmt.branches != []) {
	if (stmt.branches != []) {
	  stmt.branches.forEach(branch => {
	    result.push(" (else ");
	    result = result.concat(codeGenExpr(branch.cond, env, localParams, source));
	    result.push("(if ");
	    result = result.concat("(i32.wrap/i64) (then ");

	    branch.body.forEach(s => {
	      result = result.concat(codeGen(s, env, source, localParams));
	    });

	    result.push(")");
	  });
	}
	// The else block
	result = result.concat("(else ");

	// Add the elseBody
	stmt.elseBody.forEach(s => {
	  result = result.concat(codeGen(s, env, source, localParams));
	});

	// Close the else body
	result = result.concat(")");
	result.push(")\n".repeat(stmt.branches.length*2));
      }

      result = result.concat(")");
      
      console.log("result = " + result);
      return result;
    case "while":
      var result: Array<string> = [];

      // Generate the if block header
      result = result.concat("(block (loop ");

      // Push the condition to the stack
      result = result.concat(codeGenExpr(stmt.cond, env, localParams, source));
      result = result.concat(`(i32.wrap/i64)`);

      // Negate the condition
      result = result.concat(`(i32.const 1)`);
      result = result.concat(`(i32.xor)`);
      
      // Fix the size
      result = result.concat("(br_if 1)");

      // Add the whileBody
      stmt.whileBody.forEach(s => {
	result = result.concat(codeGen(s, env, source, localParams));
      });            

      // Close while body
      result = result.concat("(br 0)");
      result = result.concat(")) ");

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
    case "and":
      return [`(i64.const ${TRUE_VAL})`,
	      `(i64.eq)`,
	      `(i64.extend_i32_s)`,
	      `(i64.sub)`,
	      `(i64.const ${FALSE_VAL})`,
	      `(i64.eq)`,
	      `(i64.extend_i32_s)`,
	      `(i64.const ${FALSE_VAL})`,
	      `(i64.add)`];
    case "or":
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

function codeGenExpr(expr : Expr, env : GlobalEnv, localParams : Array<Parameter>, source: string) : Array<string> {
  console.log(expr.tag);
  switch(expr.tag) {
    case "funcCall":
      var argStmts : Array<string> = [];
      expr.args.forEach(arg => {
	argStmts = argStmts.concat(codeGenExpr(arg, env, localParams, source));
      });
      
      const result = argStmts.concat([`(call $${expr.name})`]);

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
	return [`(i32.const ${getEnv(expr.pos, env, expr.name, source)})`,
	      `(i64.load)`];
      }
    case "binExp":
      const leftArg  = codeGenExpr(expr.arg[0], env, localParams, source);
      const op       = codeGenOp(expr.name);
      const rightArg = codeGenExpr(expr.arg[1], env, localParams, source);
      return leftArg.concat(rightArg).concat(op);
    case "unaryExp":
      const uop  = codeGenUOp(expr.name);
      const uArg = codeGenExpr(expr.arg, env, localParams, source);
      return uArg.concat(uop);
    case "none":
      return [`(i64.const ${NONE_VAL})`];
  }
}
