// -*- mode: typescript; typescript-indent-level: 2; -*-

import { Stmt, Expr, Parameter, Pos, Type, NoneT, BoolT, IntT } from "./ast";
import { parse } from "./parser";
import * as err from "./error";
import { typecheck, tc_expr, EnvType }  from "./tc";
import { getClassHeapSize, getClassTableSize, getClassMemVars, getFieldOffset, getLocal, getClassName } from "./classes";
import { codeGenOp, codeGenUOp } from "./codegen_operators";
import { FuncEnv, ClassEnv } from "./env"
import * as envM from './env';
import * as cmn from "./common";

// https://learnxinyminutes.com/docs/wasm/

// Store all the functions separately
export var funcs : Array<Array<string>> = [];

export const emptyEnv = {
  globals: new Map(),
  classes: new Map(),
  funcs: new Map([['print', { name: "print", members: [NoneT], retType: IntT}],
		 ]),
  offset: 8,
  classOffset: 0
};
export type GlobalEnv = envM.GlobalEnv;

type CompileResult = {
  wasmSource: string,
  newEnv: envM.GlobalEnv,
  funcs: string,
};

function getEnv(pos: Pos, env: envM.GlobalEnv, name: string, source: string) : number {
  const result = env.globals.get(name);
  if (result == undefined) {
    
    err.scopeError(pos, `Variable ${name} not in scope`, source);
  }
  return result[1];
}

export function augmentEnv(env: envM.GlobalEnv, stmts: Array<Stmt>) : envM.GlobalEnv {
  const newEnv = new Map(env.globals);
  var newOffset = env.offset;
  var newClassOff = env.classOffset;
  var newFuncs = new Map(env.funcs);
  var newClasses = new Map(env.classes);
  
  stmts.forEach((s) => {
    switch(s.tag) {
      case "define":
        newEnv.set(s.name.str, [s.staticType, newOffset]);
        newOffset += 8;
        break;
      case "func":
	const paramTypes: Array<Type> = [];
	s.content.parameters.forEach(param => {
	  paramTypes.push(param.type);
	});
	newFuncs.set(s.content.name.str, {name: s.content.name.str, members: paramTypes, retType: s.content.ret});
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

	  var funName = "";
	  var fEnv: FuncEnv;

	  if (f.name.str == "__init__") {
	    ctor = { name: "__init__", members:params,  body: f.body, retType: f.ret };

	    funName = `${s.name.str}$ctor`;
	    
	  } else {
	    fEnv = {name: f.name.str, members: params, retType: f.ret};
	    memberFuncs.set(f.name.str, fEnv);

	    funName = `${s.name.str}$f.name`;
	  }
	  fEnv = {name: f.name.str, members: params, retType: f.ret};
	  newFuncs.set(funName, fEnv);
	});

	newClassOff += 1; // WARN: For now, incrementing by 1

	const classVal: ClassEnv = {
	  tableOff: newClassOff,
	  memberVars: memberVars,
	  ctor: ctor,
	  memberFuncs: memberFuncs
	};
	newClasses.set(s.name.str, classVal);
    }
  });
  const result: envM.GlobalEnv = {
    globals: newEnv,
    classes: newClasses,
    offset: newOffset,
    classOffset: newClassOff,
    funcs: newFuncs
  }

  return result;
}

export function typecheck_(source: string, env: envM.GlobalEnv) : Type {
  const ast = parse(source);
  const withDefines = augmentEnv(env, ast);

  return typecheck(ast, source, withDefines);
}

export function compile(source: string, env: envM.GlobalEnv) : CompileResult {
  const ast = parse(source);
  const definedVars = new Set();
  ast.forEach(s => {
    switch(s.tag) {
      case "define":
        definedVars.add(s.name);
        break;
    }
  }); 

  const withDefines = augmentEnv(env, ast);
  
  const scratchVar : string = `(local $$last i64)
(i32.const 0)
(i64.const ${withDefines.offset})
(i64.store) ;; Save the new heap offset`;
  
  const localDefines = [scratchVar];
  

  /* Typecheck stuff */
  typecheck(ast, source, withDefines);
  
  const commandGroups = ast.map((stmt) => codeGen(stmt, withDefines, source));
  const commands = localDefines.concat([].concat.apply([], commandGroups));

  var funcsStr = "";
  funcs.forEach(fun => {
    funcsStr = funcsStr.concat(fun.join("\n"))
  });
  
  return {
    wasmSource: commands.join("\n"),
    newEnv: withDefines,
    funcs: funcsStr,
  };
}

function codeGenFunc(stmt: Stmt, env : envM.GlobalEnv, source: string, prefix: string = "", resultTStr: string = "(result i64)", classT: Type) : Array<string> {
  if (stmt.tag == "func") {
    var result: Array<string> = [``,``];

    var header = `(func ${prefix}$${stmt.content.name.str}`;
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
      stmt.content.body.forEach(s => {
	result = result.concat(codeGen(s, env, source, stmt.content.parameters, classT));
      });

    }

    if (stmt.content.ret != NoneT) {
      // result.push(`(local.get $$last)`);
    } else if (resultTStr != "") { // Return None
      result.push(`(i64.const ${cmn.NONE_VAL})`); // 1UL << 62
    }
    
    // Close the function body
    result = result.concat([")", ""]);

    // Add this function to the global function list
    funcs.push(result);

    return [];
  } else {
    throw "Cannot run codeGenFunc on non func statement";
  }
}

function codeGenRet(stmt : Stmt, env : envM.GlobalEnv, localParams: Array<Parameter>, source: string, classT: Type = undefined) : Array<string> {
  if (stmt.tag == "return") {
    var result : Array<string> = [];
    
    result = codeGenExpr(stmt.expr, env, localParams, source, classT);
    return result.concat([`(return)`]);
  } else {
    err.internalError();
  }
}

function codeGenClass(stmt: Stmt, env : envM.GlobalEnv, source: string, classT: Type = undefined) : Array<string> {
  if (stmt.tag == "class") {
    stmt.body.funcs.forEach(fun => {
      const funStmt: Stmt = {
	tag: "func",
	content: fun
      };
      const resultType = fun.name.str == "__init__" ? "" : "(result i64)";
      
      codeGenFunc(funStmt, env, source, `$${stmt.name.str}`,
		  resultType, classT={tag: "class", name: stmt.name.str});
    });
  } else {
    err.internalError();
  }
  
  return [];
}

function paramToEnvType(localParams: Array<Parameter>) : EnvType {
  var result: EnvType = {};

  localParams.forEach(p => {
    result[p.name] = p.type;
  });
  
  return result;
}

function codeGenMemberExpr(expr: Expr, env: envM.GlobalEnv, source: string, localParams: Array<Parameter> = [], classT: Type = undefined): Array<string> {
  if (expr.tag == "memExp") {
    var result: Array<string> = [];

    const lhsType = tc_expr(expr.expr, source, env, paramToEnvType(localParams), classT)
    const varType = lhsType;
    
    var className: string = "";
    if (varType.tag == "class") {
      className = varType.name;
    } else {
      err.internalError()
    }
    
    const memName = expr.member.str;

    /* Get the obj pointer */
    const varExpr: Expr = expr.expr;
    result = result.concat(codeGenExpr(varExpr, env, localParams, source, classT));

    /* Add the field offset */
    var result = codeGenExpr(varExpr, env, localParams, source, classT);

    result = result.concat([`(i64.const ${getFieldOffset(className, memName, env)}) ;; Offset for field ${memName}`,
			    `(i64.add)`,
			    `(i32.wrap/i64)`,
			    `(i64.load) ;;  Load ${className}.${memName}`]);
    return result;
  } else {
    err.internalError();
  }
}

function codeGen(stmt: Stmt, env : envM.GlobalEnv, source: string, localParams: Array<Parameter> = [], classT: Type = undefined) : Array<string> {
  switch(stmt.tag) {
    case "class":
      return codeGenClass(stmt, env, source, classT);
    case "pass":
      return ["(nop)", ``];
    case "func":
      return codeGenFunc(stmt, env, source, "", "(result i64)", classT=classT);
    case "return":
      return codeGenRet(stmt, env, localParams, source, classT);
    case "define":
      if (localParams.length == 0) { // Global context
	var valStmts = [`(i32.const ${getEnv(stmt.pos, env, stmt.name.str, source)}) ;; Get gbl location for ${stmt.name.str}`];
	valStmts = valStmts.concat(codeGenExpr(stmt.value, env, localParams, source, classT));
	return valStmts.concat([`(i64.store)`]);
      } else { // Local context
	var valStmts = codeGenExpr(stmt.value, env, localParams, source, classT);
	return valStmts.concat([`(local.set $${stmt.name.str})`]);
      }
    case "assign":
      if (stmt.lhs.tag == "id") {
	if (getLocal(localParams, stmt.lhs.name)) {
	  return codeGenExpr(stmt.value, env, localParams, source, classT).concat([`(local.set $${stmt.lhs.name})`])
	} else {
	  var rhs = [`(i32.const ${getEnv(stmt.pos, env, stmt.lhs.name, source)}) ;; Get gbl location for ${stmt.lhs.name}`]
	  rhs = rhs.concat(codeGenExpr(stmt.value, env, localParams, source, classT));
	  return rhs.concat([`(i64.store)`]);
	}
      } else {
	var assignExpStmts = codeGenExpr(stmt.lhs, env, localParams, source, classT);
	if (stmt.lhs.tag == "memExp") {
	  assignExpStmts = assignExpStmts.slice(0, assignExpStmts.length-1);
	}
	assignExpStmts = assignExpStmts.concat(codeGenExpr(stmt.value, env, localParams, source, classT));
	assignExpStmts.push(`(i64.store)`);
	return assignExpStmts;
      }
    case "expr":
      var exprStmts = codeGenExpr(stmt.expr, env, localParams, source, classT);
      return exprStmts.concat([`(local.set $$last)`]);
    case "if":
      var result: Array<string> = [];

      // Push the condition to the stack
      result = result.concat(codeGenExpr(stmt.cond, env, localParams, source, classT));

      // Generate the if block header
      result = result.concat("(if ");

      // Fix the size
      result = result.concat("(i32.wrap/i64) (then");
            
      // Add the ifBody
      stmt.ifBody.forEach(s => {
	result = result.concat(codeGen(s, env, source, localParams, classT));
      });

      // Close if body
      result = result.concat(") ");

      if (stmt.elseBody != [] && stmt.branches != []) {
	if (stmt.branches != []) {
	  stmt.branches.forEach(branch => {
	    result.push(" (else ");
	    result = result.concat(codeGenExpr(branch.cond, env, localParams, source, classT));
	    result.push("(if ");
	    result = result.concat("(i32.wrap/i64) (then ");

	    branch.body.forEach(s => {
	      result = result.concat(codeGen(s, env, source, localParams, classT));
	    });

	    result.push(")");
	  });
	}
	// The else block
	result = result.concat("(else ");

	// Add the elseBody
	stmt.elseBody.forEach(s => {
	  result = result.concat(codeGen(s, env, source, localParams, classT));
	});

	// Close the else body
	result = result.concat(")");
	result.push(")\n".repeat(stmt.branches.length*2));
      }

      result = result.concat(")");
      
      return result;
    case "while":
      var result: Array<string> = [];

      // Generate the if block header
      result = result.concat("(block (loop ");

      // Push the condition to the stack
      result = result.concat(codeGenExpr(stmt.cond, env, localParams, source, classT));
      result = result.concat(`(i32.wrap/i64)`);

      // Negate the condition
      result = result.concat(`(i32.const 1)`);
      result = result.concat(`(i32.xor)`);
      
      // Fix the size
      result = result.concat("(br_if 1)");

      // Add the whileBody
      stmt.whileBody.forEach(s => {
	result = result.concat(codeGen(s, env, source, localParams, classT));
      });            

      // Close while body
      result = result.concat("(br 0)");
      result = result.concat(")) ");

      return result;
  }
}

function codeGenFuncCall(expr: Expr, env: envM.GlobalEnv, localParams: Array<Parameter>, source: string, classT: Type = undefined): Array<string> {
  if (expr.tag == "funcCall") {
    var argStmts : Array<string> = [];
    
    /* WARN: Hacky way of passing class names to print() */
    if (expr.name.tag == "id" && expr.name.name == "print") {
      const classRef: Type = tc_expr(expr.args[0], source, env, paramToEnvType(localParams), classT);
      if (classRef != undefined && classRef.tag == "class") {
	const classEnv = env.classes.get(classRef.name);

	var result = [""];
	if (expr.name.tag == "id") {
	  result = result.concat(codeGenExpr(expr.args[0], env, localParams, source, classT));
	  result.push(`(i64.const ${cmn.PTR_BI}) ;; Tag bit for Ptr`);
	  result.push(`(i64.sub) ;; Remove the tag bit`);
	  result.push(`(i64.const ${classEnv.tableOff})`);
	  result = result.concat([`(call $print$obj)`]);
	} else {
	  err.internalError();
	}
	
	return result;
      } else {
	argStmts = argStmts.concat(codeGenExpr(expr.args[0], env, localParams, source, classT));
      }
    } else {
      expr.args.forEach(arg => {
	argStmts = argStmts.concat(codeGenExpr(arg, env, localParams, source, classT));
      });
    }


    var result = [""];
    if (expr.name.tag == "id") {
      if (expr.name.name == "print") {
      	result = argStmts.concat([`(call $print$other)`, ``]);
      } else {
	result = argStmts.concat([`(call $${expr.name.name})`, ``]);
      }
    } else {
      err.internalError();
    }

    return result;
  } else {
    throw `Can't call codeGenFuncCall() with non funcCall argument`;
  }
}

export function codeGenCtorCall(expr: Expr, env: envM.GlobalEnv, localParams: Array<Parameter>, source: string, classT: Type = undefined): Array<string> {
  if (expr.tag == "funcCall" && expr.name.tag == "id") {
    /* Allocate an object on the heap */   
    var result: Array<string> = []  // Load the dynamic heap head offset

    const classMemVars: Map<string, [Expr, Type]> = getClassMemVars(expr.name.name, env);
    var memId = 0;
    classMemVars.forEach((val, key) => {
      result = result.concat([`(i64.load (i32.const 0)) ;; Ctor, member ${key} init`,
			      `(i64.const ${memId*8})`,
			      `(i64.add)`,
			      `(i32.wrap/i64)`]);
      result = result.concat(codeGenExpr(val[0], env, localParams, source, classT));
      result.push(`(i64.store)`);
      
      memId += 1;
    });

    /* Increase the heap offset */
    result = result.concat([`(i32.const 0) ;; Increasing heap offset by class size, ${memId*8} bytes`,
			    `(i64.load (i32.const 0))`,
			    `(i64.const ${memId*8})`,
			    `(i64.add)`,
			    `(i64.store)`]);

    /* Call the actual constructor with self as the argument. 
       The constructor is always the first entry for the class in table */
    const classRef = env.classes.get(expr.name.name);
    result = result.concat([`(i64.load (i32.const 0)) ;; Calling the ctor func with self`,
			    `(i64.const ${memId*8})`,
			    `(i64.sub)`,
			    `(call $${expr.name.name}$__init__)`]);
    
    /* Generate the return value */
    result = result.concat([`(i64.load (i32.const 0)) ;; Generating return value`,
			    `(i64.const ${memId*8})`,
			    `(i64.sub) ;; Ctor ends`,
			    `(i64.const ${cmn.PTR_VAL}) ;; Add ptr tag`,
			    `(i64.add)`,
			    ``]);
    
    return result;
  } else {
    throw `Can't call codeGenCtor() with non funcCall argument`;
  } 
}

export function codeGenExpr(expr : Expr, env : envM.GlobalEnv, localParams : Array<Parameter>, source: string, classT: Type = undefined) : Array<string> {
  switch(expr.tag) {
    case "self":
      return [`(local.get $self)`];
    case "memExp":
      return codeGenMemberExpr(expr, env, source, localParams, classT);
    case "funcCall":
      if (expr.name.tag == "id") { /* Call to global function */
	if (env.funcs.get(expr.name.name) != undefined) { /* Call to global function */
	  return codeGenFuncCall(expr, env, localParams, source, classT);
	} else { /* call to ctor */
	  return codeGenCtorCall(expr, env, localParams, source, classT);
	}
      } else if (expr.name.tag == "memExp") {
	var result = codeGenExpr(expr.name.expr, env, localParams, source, classT);
	const className = tc_expr(expr.name.expr, source, env, paramToEnvType(localParams), classT);
	if (className.tag == "class") {
	  const fCallAug: Expr = {
	    tag: "funcCall",
	    name: {tag: "id", pos: expr.name.pos, name: `${className.name}$` + expr.name.member.str},
	    pos: expr.pos,
	    prmPos: expr.prmPos,
	    prmsPosArr: expr.prmsPosArr,
	    args: expr.args
	  }
	  result.push(`(i64.const ${cmn.PTR_VAL})`);
	  result.push(`(i64.sub)`);
	  return result.concat(codeGenFuncCall(fCallAug, env, localParams, source, classT));
	} else {
	  err.internalError()
	}
      } else {
	err.internalError();
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
      if (getLocal(localParams, expr.name)) {
	return [`(local.get $${expr.name})`];
      } else {
	return [`(i32.const ${getEnv(expr.pos, env, expr.name, source)}) ;; ${expr.name}`,
	      `(i64.load)`];
      }
    case "binExp":
      const leftArg  = codeGenExpr(expr.arg[0], env, localParams, source, classT);
      const op       = codeGenOp(expr.name);
      const rightArg = codeGenExpr(expr.arg[1], env, localParams, source, classT);
      return leftArg.concat(rightArg).concat(op);
    case "unaryExp":
      const uop  = codeGenUOp(expr.name);
      const uArg = codeGenExpr(expr.arg, env, localParams, source, classT);
      return uArg.concat(uop);
    case "none":
      return [`(i64.const ${cmn.NONE_VAL}) ;; None`];
  }
}
