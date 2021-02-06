// -*- mode: typescript; typescript-indent-level: 2; -*-

import { Stmt, Expr, Parameter, Pos, Type, NoneT, BoolT, IntT } from "./ast";
import { parse, typeError, symLookupError, argError, scopeError } from "./parser";
import { typecheck }  from "./tc";
import { getClassHeapSize, getClassTableSize, getClassMemVars } from "./classes";
import { codeGenOp, codeGenUOp } from "./codegen_operators";
import { GlobalEnv, FuncEnv, ClassEnv } from "./env"
import * as cmn from "./common";

// https://learnxinyminutes.com/docs/wasm/

// Store all the functions separately
export var funcs : Array<Array<string>> = [];

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

export function augmentEnv(env: GlobalEnv, stmts: Array<Stmt>) : GlobalEnv {
  const newEnv = new Map(env.globals);
  var newOffset = env.offset;
  var newClassOff = env.classOffset;
  var newFuncs = new Map(env.funcs);
  var newClasses = new Map(env.classes);
  
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
	newFuncs.set(s.content.name, {members: paramTypes, retType: s.content.ret});
	break;
      case "class":
	var memberVars: Map<string, [Expr, Type]> = new Map();
	s.body.iVars.forEach(f => {
	  if (f.tag == "define") {
	    memberVars.set(f.name.str, [f.value, f.staticType]);
	  } else {
	    throw "Unknown error";
	  }
	});

	var memberFuncs: Map<string, FuncEnv> = new Map();
	var ctor: FuncEnv;
	s.body.funcs.forEach(f => {
	  var params: Array<Type> = [];
	  f.parameters.forEach(p => {
	    params.push(p.type);
	  });

	  var fEnv: FuncEnv = {members: params, retType: f.ret};
	  var funName = "";

	  if (f.name == "__init__") {
	    ctor = fEnv;
	    ctor.body = f.body;

	    funName = `${s.name.str}$ctor`;
	    
	  } else {
	    memberFuncs.set(f.name, fEnv);

	    funName = `${s.name.str}$f.name`
	  }

	  newFuncs.set(funName, fEnv);
	});
	
	const classVal: ClassEnv = {
	  tableOff: newClassOff,
	  memberVars: memberVars,
	  ctor: ctor,
	  memberFuncs: memberFuncs
	};
	newClasses.set(s.name.str, classVal);
    }
  });
  return {
    globals: newEnv,
    classes: newClasses,
    offset: newOffset,
    classOffset: newClassOff,
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

function codeGenFunc(stmt: Stmt, env : GlobalEnv, source: string, prefix: string = "", resultTStr: string = "(result i64)") : Array<string> {
  if (stmt.tag == "func") {
    var result: Array<string> = [];

    var header = `(func ${prefix}$${stmt.content.name}`;
    var funcLocals:Array<Parameter> = stmt.content.parameters;

    stmt.content.parameters.forEach(param => {
      header += ` (param $${param.name} i64) `;
    });

    stmt.content.body.forEach(s => {
      if (s.tag == "define") {
	funcLocals.push({tag : "parameter", name: s.name.str, type: s.staticType});
      }
    });

    header += ` ${resultTStr} `;

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
    } else if (resultTStr != "") { // Return None
      result.push(`(i64.const ${cmn.NONE_VAL})`); // 1UL << 62
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

function codeGenClass(stmt: Stmt, env : GlobalEnv, source: string) : Array<string> {
  if (stmt.tag == "class") {
    stmt.body.funcs.forEach(fun => {
      const funStmt: Stmt = {
	tag: "func",
	content: fun
      };
      codeGenFunc(funStmt, env, source, `$${stmt.name.str}`, "");
    });
  } else {
    throw `Something went wrong`;
  }
  
  return [];
}

function codeGen(stmt: Stmt, env : GlobalEnv, source: string, localParams: Array<Parameter> = []) : Array<string> {
  console.log("tag: " + stmt.tag);
  switch(stmt.tag) {
    case "class":
      return codeGenClass(stmt, env, source);
    case "pass":
      return ["(nop)"];
    case "func":
      return codeGenFunc(stmt, env, source);
    case "return":
      return codeGenRet(stmt, env, localParams, source);
    case "define":
      if (localParams.length == 0) { // Global context
	var valStmts = [`(i32.const ${getEnv(stmt.pos, env, stmt.name.str, source)}) ;; Get gbl location for ${stmt.name.str}`];
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
	var rhs = [`(i32.const ${getEnv(stmt.pos, env, stmt.name.str, source)}) ;; Get gbl location for ${stmt.name.str}`]
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

function codeGenFuncCall(expr: Expr, env: GlobalEnv, localParams: Array<Parameter>, source: string): Array<string> {
  if (expr.tag == "funcCall") {
    var argStmts : Array<string> = [];
    expr.args.forEach(arg => {
      argStmts = argStmts.concat(codeGenExpr(arg, env, localParams, source));
    });
    
    const result = argStmts.concat([`(call $${expr.name})`]);

    return result;
  } else {
    throw `Can't call codeGenFuncCall() with non funcCall argument`;
  }
}

export function codeGenCtorCall(expr: Expr, env: GlobalEnv, localParams: Array<Parameter>, source: string): Array<string> {
  if (expr.tag == "funcCall") {
    /* Allocate an object on the heap */   
    var result: Array<string> = []  // Load the dynamic heap head offset

    const classMemVars: Map<string, [Expr, Type]> = getClassMemVars(expr.name, env);
    var memId = 0;
    classMemVars.forEach((val, _) => {
      result = result.concat([`(i64.load (i32.const 0))`,
			      `(i64.const ${memId*8})`,
			      `(i64.add)`,
			      `(i32.wrap/i64)`]);
      result = result.concat(codeGenExpr(val[0], env, localParams, source));
      result.push(`(i64.store)`);
      
      memId += 1;
    });

    /* Increase the heap offset */
    result = result.concat([`(i32.const 0)`,
			    `(i64.load (i32.const 0))`,
			    `(i64.const ${memId*8})`,
			    `(i64.add)`,
			    `(i64.store)`]);

    /* Call the actual constructor with self as the argument. 
       The constructor is always the first entry for the class in table */
    const classRef = env.classes.get(expr.name);
    result = result.concat([`(i64.load (i32.const 0))`,
			    `(i64.const ${memId*8})`,
			    `(i64.sub)`,
			    `(call $${expr.name}$__init__)`]);
    
    /* Generate the return value */
    result = result.concat([`(i64.load (i32.const 0))`,
			    `(i64.const ${memId*8})`,
			    `(i64.sub)`]);
    
    return result;
  } else {
    throw `Can't call codeGenCtor() with non funcCall argument`;
  } 
}

export function codeGenExpr(expr : Expr, env : GlobalEnv, localParams : Array<Parameter>, source: string) : Array<string> {
  console.log(expr.tag);
  switch(expr.tag) {
    case "funcCall":
      if (env.funcs.get(expr.name) != undefined) { /* Call to global function */
	return codeGenFuncCall(expr, env, localParams, source);
      } else { /* call to ctor */
	return codeGenCtorCall(expr, env, localParams, source);
      }
    case "bool":
      if (expr.value == true) {
	return ["(i64.const " + ((BigInt(1)<<BigInt(62)) + BigInt(1)).toString() + ") ;; True"];
      } else {
	return ["(i64.const " + ((BigInt(1)<<BigInt(62)) + BigInt(0)).toString() + ") ;; False"];
      }
    case "num":
      return ["(i64.const " + expr.value + ") ;; int"];
    case "id":
      console.log("Locals:");
      console.log(localParams);
      if (getLocal(localParams, expr.name)) {
	console.log("getting local");
	return [`(local.get $${expr.name})`];
      } else {
	console.log("Getting global");
	return [`(i32.const ${getEnv(expr.pos, env, expr.name, source)}) ;; ${expr.name}`,
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
      return [`(i64.const ${cmn.NONE_VAL}) ;; None`];
  }
}
