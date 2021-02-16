// -*- mode: typescript; typescript-indent-level: 2; -*-

import { internalError, typeError, symLookupError, argError, scopeError, parseError } from './error';
import { GlobalEnv, ClassEnv, FuncEnv } from "./env";
import { Type, Value, Expr, Stmt, Parameter, Pos, Branch, ClassT, BoolT, IntT, NoneT } from "./ast";
import { tr, eqT, neqT, canAssignNone } from "./common"

export type EnvType = Record<string, Type>;
export var env : EnvType = {};


export function
tc_binExp(pos: Pos, op : string, leftType : Type, rightType : Type, source: string) : Type {
  switch (op) {
    case "-":
    case "+":
    case "*":
    case "%":
    case "//":
      if (leftType != IntT || rightType != IntT) {
	const errMsg = `Operator ${op} expects both args to be int, got ${tr(leftType)} `
	  + `and ${tr(rightType)}`;
	typeError(pos, errMsg, source);
      }
      return IntT;
    case ">=":
    case "<=":
    case ">":
    case "<":
    case "==":
    case "!=":
      if (leftType != rightType) {
	typeError(pos, `Operator ${op} on types that are neither both int nor bool (${tr(leftType)}`
	  + ` and ${tr(rightType)})`, source);
      }
      return BoolT;
    case "is":
      if (!canAssignNone(leftType) || neqT(rightType, NoneT)) {
	typeError(pos, `Operator \`is\` used on non-None types, ${tr(leftType)} and ${tr(rightType)}`,
		  source);
      }
      return BoolT;
    case "and":
    case "or":
      if (leftType != BoolT || rightType != BoolT) {
	typeError(pos, `Operator ${op} used on non-bool types, ${tr(leftType)} and ${tr(rightType)}`,
		  source);
      }
      return BoolT;
    default:
      throw "Unknown operator " + op;
  }
}

export function
tc_uExp(pos: Pos, op: string, exprType: Type, source: string) {
  switch (op) {
    case "-":
      if (exprType != IntT) {
	typeError(pos, `Cannot use unary operator '-' with ${tr(exprType)}`, source);
      }
      break;
    case "not":
      if (exprType != BoolT) {
	typeError(pos, `Cannot use unary operator 'not' with ${tr(exprType)}`, source);
      }
      break;
  }
}

export function
tc_class(stmt: Stmt, source: string, gblEnv: GlobalEnv, funEnv: EnvType = <EnvType>{}) : Type {
  if (stmt.tag == "class") {
    const classEnv: Type = {tag: "class", name: stmt.name.str};

    var foundCtor = false;
    var nameMap: Record<string, Pos> = {}

    /* Type check variable declarations */
    stmt.body.iVars.forEach(ivar => {
      if (ivar.tag == "define") {
	const lhsT = ivar.staticType;
	const rhsT = tc_expr(ivar.value, source, gblEnv, funEnv, classEnv);
	if (neqT(lhsT, rhsT) && (neqT(rhsT, NoneT) || !canAssignNone(lhsT))) {
	  typeError(ivar.pos, `Cannot assign value of type ${rhsT} to ${ivar.name} which is of type `
	    + `${lhsT}.`, source);
	}

	if (ivar.staticType == NoneT) {
	  typeError(ivar.pos, `Variable cannot be of type ${tr(ivar.staticType)}.`, source);
	}
	
      }
    });
    
    stmt.body.funcs.forEach(f => {
      if (f.name.str == '__init__') { /* Constructor for the class */
	foundCtor = true;

	if (f.parameters.length != 1) {
	  argError(f.parametersPos, `Constructor should only have self as its argument`, source);
	}

	if (f.ret.tag != "none") {
	  typeError(f.retPos, `Constructor cannot have an explicit return type`, source);
	}
      }

      /* Check for duplicate functions */
      const prevPos = nameMap[f.name.str];
      if (prevPos != undefined) {
	scopeError(f.name.pos, `Function redefined in the same class, first defined at `
	  + `Line ${prevPos.line}`, source);
      }
      nameMap[f.name.str] = f.name.pos;
      
      /* Typecheck function's content */
      const fStmt: Stmt = {tag: "func", content: f};
      tc_func(fStmt, source, gblEnv, funEnv, classEnv);
    });

    
    return {tag: "class", name: stmt.name.str};
  } else {
    internalError();
  }
}

export function
tc_func(stmt: Stmt, source: string, gblEnv: GlobalEnv, funEnv: EnvType = <EnvType>{},
	classEnv: Type = undefined) : Type {
  if (stmt.tag == "func") {
    stmt.content.body.forEach(s => {
      if (s.tag == "define") {
	funEnv[s.name.str] = s.staticType;
      }
    });
    
    stmt.content.parameters.forEach(param => { funEnv[param.name] = param.type; });

    // TODO: Add support for checking for return statements in all the possible paths
    
    stmt.content.body.forEach(s => {
      tc_stmt(s, source, gblEnv, funEnv, classEnv);
      if (s.tag == "return") {
	const retType = tc_expr(s.expr, source, gblEnv, funEnv, classEnv);
	if (neqT(retType, stmt.content.ret)
	    && (neqT(retType, NoneT) || !canAssignNone(stmt.content.ret))) {
	  const throwMsg = `Return's type ${tr(retType)} and function's return type `
	    + `${tr(stmt.content.ret)} don't match`;
	  typeError(s.pos, throwMsg, source);
	}
      }
    });

    return NoneT;
  } else {
    internalError();
  }
}

export function
tc_stmt(stmt: Stmt, source: string, gblEnv: GlobalEnv, funEnv: EnvType = <EnvType>{},
	classEnv: Type = undefined) : Type {
  switch (stmt.tag) {
    case "class":
      return tc_class(stmt, source, gblEnv, funEnv);
    case "expr":
      return tc_expr(stmt.expr, source, gblEnv, funEnv, classEnv);
    case "pass":
      return NoneT;
    case "define":
      const rhsType = tc_expr(stmt.value, source, gblEnv, funEnv, classEnv);
      const lhsType = stmt.staticType;

      if (neqT(rhsType, lhsType) && (neqT(rhsType, NoneT) || !canAssignNone(lhsType))) {
	const errMsg = `${tr(rhsType)} value assigned to '${stmt.name}' which is of `
	  + `type ${tr(lhsType)}`;
	typeError(stmt.pos, errMsg, source);
      }

      if (eqT(lhsType, NoneT)) {
	typeError(stmt.pos, `Variable cannot be of type None`, source);
      }

      env[stmt.name.str] = stmt.staticType;
      
      return stmt.staticType;
    case "assign":
      const assignRhsType = tc_expr(stmt.value, source, gblEnv, funEnv, classEnv);
      if (stmt.lhs.tag == "id") {
	if (env[stmt.lhs.name] == undefined) {
	  symLookupError(stmt.lhs.pos, `Cannot find value '${stmt.lhs.name}' in current scope`,
			 source);
	}
	const assignLhsPos: Pos = stmt.lhs.pos;
	const assignLhsExpr: Expr = { tag: "id", pos: assignLhsPos, name: stmt.lhs.name };
	const assignLhsType = tc_expr(assignLhsExpr, source, gblEnv, funEnv, classEnv);
	
	if (neqT(assignLhsType, assignRhsType)
	    && (neqT(assignRhsType, NoneT) || !canAssignNone(assignLhsType))) {
	  const errMsg = `Value of type ${tr(assignRhsType)} to '${stmt.lhs.name}' which is of `
	    + `type ${tr(assignLhsType)}`;
	  typeError(stmt.pos, errMsg, source);
	}
      } else if (stmt.lhs.tag == "memExp") {
	const exprT = tc_expr(stmt.lhs.expr, source, gblEnv, funEnv, classEnv);
	if (exprT.tag == "class") {
	  const classRef: ClassEnv = gblEnv.classes.get(exprT.name);
	  const memRef = classRef.memberVars.get(stmt.lhs.member.str);

	  console.log(`Checking for member ${stmt.lhs.member.str} in class ${exprT.name}`);
	  
	  if (memRef == undefined) {
	    scopeError(stmt.lhs.member.pos, `${stmt.lhs.member.str} is not a member of `
	      + `type ${exprT.name}`, source);
	  }
	} else {
	  typeError(stmt.lhs.pos, `Member expression (${stmt.lhs.member.str}) on a non-object `
	    + `type (${tr(exprT)}).`, source);
	}
      }
      return NoneT;
    case "while":
      const whileCondType = tc_expr(stmt.cond, source, gblEnv, funEnv, classEnv);

      if (neqT(whileCondType, BoolT)) {
	typeError(stmt.cond.pos, `While condition expected a bool, found ${tr(whileCondType)}.`,
		  source);
      }

      // Check the body
      stmt.whileBody.forEach(s => {
	tc_stmt(s, source, gblEnv, funEnv, classEnv);
      });
      
      return NoneT;
    case "if":
      const condType = tc_expr(stmt.cond, source, gblEnv, funEnv, classEnv);

      if (stmt.branches != []) {
	stmt.branches.forEach(branch => {
	  const condType = tc_expr(branch.cond, source, gblEnv, funEnv, classEnv);
	  if (condType != BoolT) {
	    typeError(stmt.condPos, `If condition expected bool but got ${tr(condType)}`, source);
	  }
	  
	  branch.body.forEach(s => { tc_stmt(s, source, gblEnv, funEnv, classEnv); });
	});
      }

      if (stmt.elseBody != []) {
	stmt.elseBody.forEach(s => { tc_stmt(s, source, gblEnv, funEnv, classEnv); });
      }

      if (stmt.ifBody != []) {
	stmt.ifBody.forEach(s => { tc_stmt(s, source, gblEnv, funEnv, classEnv); });
      }

      if (condType != BoolT) {
	typeError(stmt.condPos, `If condition expected bool but got ${tr(condType)}`, source);
      }

      return NoneT;
    case "return":
      const retType = tc_expr(stmt.expr, source, gblEnv, funEnv, classEnv);

      return retType;
    case "func":
      return tc_func(stmt, source, gblEnv, funEnv, classEnv);
  }
}

export function
tc_expr(expr : Expr, source: string, gblEnv: GlobalEnv, funEnv: EnvType = <EnvType>{},
	classEnv: Type = undefined): Type {
  switch(expr.tag) {
    case "memExp":
      const exprT = tc_expr(expr.expr, source, gblEnv, funEnv, classEnv);
      if (exprT.tag != "class") {
	typeError(expr.expr.pos, `Expression is not of type ${tr(exprT)}, and not of type class`,
		  source);
      } else {
	// TODO: Check if the member exists
	const classRef: ClassEnv = gblEnv.classes.get(exprT.name);
	const memRef = classRef.memberVars.get(expr.member.str);
	
	if (memRef == undefined) {
	  scopeError(expr.member.pos, `${expr.member.str} is not a member of type ${exprT.name}`,
		     source);
	} else {
	  return memRef[1];
	}
      }
    case "self":
      if (classEnv == undefined) {
	scopeError(expr.pos, `Cannot use self keyword without a class`, source);
      } else {
	return classEnv;
      }
    case "bool":
      return BoolT;

    case "num":
      return IntT;
      
    case "none":
      return NoneT;
      
    case "id":
      if (funEnv[expr.name] != undefined) {
	return funEnv[expr.name];
      } else if (env[expr.name] != undefined) {
	return env[expr.name];
      } else {
	if (classEnv.tag == "class") {
	  const classRef: ClassEnv = gblEnv.classes.get(classEnv.name);
	  return classRef.memberVars.get(expr.name)[1];
	}
      }
      break;

    case "funcCall":
      const callExpr = expr.name;
      var retType: Type = undefined;
      
      if (callExpr.tag == "memExp") {
	const firstPart = tc_expr(callExpr.expr, source, gblEnv, funEnv, classEnv);
	const memberFunName = callExpr.member.str;

	if (firstPart.tag == "class") {
	  const classRef: ClassEnv = gblEnv.classes.get(firstPart.name);
	  if (classRef == undefined) {
	    internalError();
	  } else {
	    const memFunRef = classRef.memberFuncs.get(memberFunName);
	    if (memFunRef == undefined) {
	      scopeError(callExpr.member.pos, `Function ${memberFunName}() is not a member of `
		+ `class ${firstPart.name}.`, source);
	    } else {
	      retType = memFunRef.retType;

	      /* Typecheck argument count */
	      const expectedArgCnt = classRef.memberFuncs.get(memFunRef.name).members.length-1;
	      const gotArgCnt = expr.args.length;

	      if (expectedArgCnt != gotArgCnt) {
		argError(expr.prmPos, `Expected ${expectedArgCnt}, got ${gotArgCnt} arguments.`,
			 source);
	      }

	      /* Typecheck argument's type */
	      var prmIter = 0;
	      expr.args.forEach(arg => {
		if (prmIter != 0) { /* Skip the first argument which is self for memExp */
		  const expArgType = memFunRef.members[prmIter];
		  const gotArgType = tc_expr(arg, source, gblEnv, funEnv, classEnv);
		  if (neqT(expArgType, gotArgType)) {
		    typeError(arg.pos, `Function ${firstPart.name}.${memberFunName}() expects its `
		      +`argument at pos ${prmIter} to be of type ${tr(expArgType)}, `
		      +`got ${tr(gotArgType)}.`, source);
		  }
		}
		prmIter += 1;
	      });
	    }
	  }
	} else {
	  typeError(callExpr.pos, `Cannot use dot access using function with expression of `
	    +`type ${callExpr.tag}`, source);
	}
      } else if (callExpr.tag == "id") {
	const callName = callExpr.name;
	
	/* Call to global function */
	if (gblEnv.funcs.get(callName) != undefined) {
	  const argsExpected = gblEnv.funcs.get(callName).members.length;
	  const argsProvided = expr.args.length;

	  if (argsExpected != argsProvided) {
	    argError(expr.prmPos, `${expr.name}() needs ${argsExpected} arguments, `
	      +`${argsProvided} provided`, source);
	  }

	  /* Only check if this function is not print() */
	  if (callName != "print") {
	    var argIter = 0;
	    expr.args.forEach(arg => {
	      const argTypeProvided = tc_expr(arg, source, gblEnv, funEnv, classEnv);
	      const argTypeExpected = gblEnv.funcs.get(callName).members[argIter];

	      if (neqT(argTypeProvided, argTypeExpected)) {
		typeError(expr.prmsPosArr[argIter], `Argument ${argIter} is of type `
			  +`${tr(argTypeExpected)}, ${tr(argTypeProvided)} provided`, source);
	      }
	      
	      argIter += 1;
	    });
	  }
	  retType = gblEnv.funcs.get(callName).retType;
	} else if (gblEnv.classes.get(callName) != undefined) { /* Constructor */
	  const argsProvided = expr.args.length;
	  if (argsProvided != 0) {
	    argError(expr.prmPos, `Constructor for classes take exactly 0 arguments, `
	      +`${argsProvided} provided`, source);
	  }
	  retType = { tag: "class", name: callName }; // Call name is same as the class name
	} else {
	  scopeError(expr.pos, `Function not in scope: ${expr.name}`, source);
	}
	
      }
      return retType;
      
    case "unaryExp":
      tc_uExp(expr.pos, expr.name, tc_expr(expr.arg, source, gblEnv, funEnv, classEnv), source);
      return tc_expr(expr.arg, source, gblEnv, funEnv, classEnv);
      
    case "binExp":
      const leftType = tc_expr(expr.arg[0], source, gblEnv, funEnv, classEnv);
      const rightType = tc_expr(expr.arg[1], source, gblEnv, funEnv, classEnv);
      const op = expr.name;
      return tc_binExp(expr.pos, op, leftType, rightType, source);
  }
}

export function
typecheck(ast : Array<Stmt>, source: string, env: GlobalEnv) : Type {
  var result: Type = undefined;
  
  ast.forEach(stmt => {
    result = tc_stmt(stmt, source, env);
  });

  return result;
}
