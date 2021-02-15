// -*- mode: typescript; typescript-indent-level: 2; -*-

import { internalError, typeError, symLookupError, argError, scopeError, parseError } from './error';
import { GlobalEnv } from "./env";
import { Type, Value, Expr, Stmt, Parameter, Pos, Branch, BoolT, IntT, NoneT } from "./ast";
import { tr, eqT, neqT, canAssignNone } from "./common"

export type EnvType = Record<string, Type>;
export var env : EnvType = {};


export function tc_binExp(pos: Pos, op : string, leftType : Type, rightType : Type, source: string) : Type {
  switch (op) {
    case "-":
    case "+":
    case "*":
    case "%":
    case "//":
      if (leftType != IntT || rightType != IntT) {
	const errMsg = `Operator ${op} expects both args to be int, got ${tr(leftType)} and ${tr(rightType)}`;
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
	typeError(pos, `Operator ${op} on types that are neither both int nor bool (${tr(leftType)} and ${tr(rightType)})`, source);
      }
      return BoolT;
    case "is":
      if (leftType != NoneT || rightType != NoneT) {
	typeError(pos, `Operator \`is\` used on non-None types, ${tr(leftType)} and ${tr(rightType)}`, source);
      }
      return BoolT;
    case "and":
    case "or":
      if (leftType != BoolT || rightType != BoolT) {
	typeError(pos, `Operator ${op} used on non-bool types, ${tr(leftType)} and ${tr(rightType)}`, source);
      }
      return BoolT;
    default:
      throw "Unknown operator " + op;
  }
}

export function tc_uExp(pos: Pos, op: string, exprType: Type, source: string) {
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

export function tc_class(stmt: Stmt, source: string, gblEnv: GlobalEnv, funEnv: EnvType = <EnvType>{}) : Type {
  if (stmt.tag == "class") {

    var foundCtor = false;
    var nameMap: Record<string, Pos> = {}
    
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
	scopeError(f.name.pos, `Function redefined in the same class, first defined at Line ${prevPos.line}`, source);
      }
      nameMap[f.name.str] = f.name.pos;
      
      /* Typecheck function's content */
      const fStmt: Stmt = {tag: "func", content: f};
      tc_func(fStmt, source, gblEnv, funEnv);
    });

    
    return {tag: "class", name: stmt.name.str};
  } else {
    internalError();
  }
}

export function tc_func(stmt: Stmt, source: string, gblEnv: GlobalEnv, funEnv: EnvType = <EnvType>{}) : Type {
  if (stmt.tag == "func") {
    stmt.content.body.forEach(s => {
      if (s.tag == "define") {
	funEnv[s.name.str] = s.staticType;
      }
    });
    
    stmt.content.parameters.forEach(param => { funEnv[param.name] = param.type; });

    stmt.content.body.forEach(s => {
      tc_stmt(s, source, gblEnv, funEnv);
      if (s.tag == "return") {
	const retType = tc_expr(s.expr, source, gblEnv, funEnv);
	if (retType != stmt.content.ret) {
	  const throwMsg = `Return's type ${tr(retType)} and function's return type ${tr(stmt.content.ret)} don't match`;
	  typeError(s.pos, throwMsg, source);
	}
      }
    });

    return NoneT;
  } else {
    internalError();
  }
}

export function tc_stmt(stmt: Stmt, source: string, gblEnv: GlobalEnv, funEnv: EnvType = <EnvType>{}) : Type {
  switch (stmt.tag) {
    case "class":
      return tc_class(stmt, source, gblEnv, funEnv);
    case "expr":
      return tc_expr(stmt.expr, source, gblEnv, funEnv);
    case "pass":
      return NoneT;
    case "define":
      const rhsType = tc_expr(stmt.value, source, gblEnv, funEnv);
      const lhsType = stmt.staticType;

      if (neqT(rhsType, lhsType) && (neqT(rhsType, NoneT) || !canAssignNone(lhsType))) {
	const errMsg = `${tr(rhsType)} value assigned to '${stmt.name}' which is of type ${tr(lhsType)}`;
	typeError(stmt.pos, errMsg, source);
      }

      if (eqT(lhsType, NoneT)) {
	typeError(stmt.pos, `Variable cannot be of type None`, source);
      }

      env[stmt.name.str] = stmt.staticType;
      
      return stmt.staticType;
    case "assign":
      const assignRhsType = tc_expr(stmt.value, source, gblEnv, funEnv);
      if (stmt.lhs.tag == "id") {
	if (env[stmt.lhs.name] == undefined) {
	  symLookupError(stmt.lhs.pos, `Cannot find value '${stmt.lhs.name}' in current scope`, source);
	}
	const assignLhsPos: Pos = stmt.lhs.pos;
	const assignLhsExpr: Expr = { tag: "id", pos: assignLhsPos, name: stmt.lhs.name };
	const assignLhsType = tc_expr(assignLhsExpr, source, gblEnv, funEnv);
	
	if (neqT(assignLhsType, assignRhsType)) {
	  const errMsg = `Value of type ${tr(assignRhsType)} to '${stmt.lhs.name}' which is of type ${tr(assignLhsType)}`;
	  typeError(stmt.pos, errMsg, source);
	}
      }
      return NoneT;
    case "while":
      const whileCondType = tc_expr(stmt.cond, source, gblEnv, funEnv);

      if (neqT(whileCondType, BoolT)) {
	typeError(stmt.cond.pos, `While condition expected a bool, found ${tr(whileCondType)}.`, source);
      }

      // Check the body
      stmt.whileBody.forEach(s => {
	tc_stmt(s, source, gblEnv, funEnv);
      });
      
      return NoneT;
    case "if":
      const condType = tc_expr(stmt.cond, source, gblEnv, funEnv);

      if (stmt.branches != []) {
	stmt.branches.forEach(branch => {
	  const condType = tc_expr(branch.cond, source, gblEnv, funEnv);
	  if (condType != BoolT) {
	    typeError(stmt.condPos, `If condition expected bool but got ${tr(condType)}`, source);
	  }
	  
	  branch.body.forEach(s => { tc_stmt(s, source, gblEnv, funEnv); });
	});
      }

      if (stmt.elseBody != []) {
	stmt.elseBody.forEach(s => { tc_stmt(s, source, gblEnv, funEnv); });
      }

      if (stmt.ifBody != []) {
	stmt.ifBody.forEach(s => { tc_stmt(s, source, gblEnv, funEnv); });
      }

      if (condType != BoolT) {
	typeError(stmt.condPos, `If condition expected bool but got ${tr(condType)}`, source);
      }

      return NoneT;
    case "return":
      const retType = tc_expr(stmt.expr, source, gblEnv, funEnv);

      return retType;
    case "func":
      return tc_func(stmt, source, gblEnv, funEnv);
  }
}

export function tc_expr(expr : Expr, source: string, gblEnv: GlobalEnv, funEnv: EnvType = <EnvType>{}, classEnv: Type = undefined): Type {
  switch(expr.tag) {
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
      } else {
	return env[expr.name];
      }

    case "funcCall":
      const callExpr = expr.name;
      var retType: Type = undefined;
      
      if (callExpr.tag == "memExp") {
	const firstPart = tc_expr(callExpr.expr, source, gblEnv, funEnv, classEnv);
	const memberFunName = callExpr.member.str;

	if (firstPart.tag == "class") {
	  const classRef = gblEnv.classes.get(firstPart.name);
	  if (classRef == undefined) {
	    internalError();
	  } else {
	    const memFunRef = classRef.memberFuncs.get(memberFunName);
	    if (memFunRef == undefined) {
	      scopeError(callExpr.member.pos, `Function ${memberFunName}() is not a member of class ${firstPart.name}.`, source);
	    } else {
	      retType = memFunRef.retType;
	    }
	  }
	} else {
	  typeError(callExpr.pos, `Cannot use dot access using function with expression of type ${callExpr.tag}`, source);
	}
      } else if (callExpr.tag == "id") {
	const callName = callExpr.name;
	
	/* Call to global function */
	if (gblEnv.funcs.get(callName) != undefined) {
	  const argsExpected = gblEnv.funcs.get(callName).members.length;
	  const argsProvided = expr.args.length;

	  if (argsExpected != argsProvided) {
	    argError(expr.prmPos, `${expr.name}() needs ${argsExpected} arguments, ${argsProvided} provided`, source);
	  }

	  /* Only check if this function is not print() */
	  if (callName != "print") {
	    var argIter = 0;
	    expr.args.forEach(arg => {
	      const argTypeProvided = tc_expr(arg, source, gblEnv, funEnv);
	      const argTypeExpected = gblEnv.funcs.get(callName).members[argIter];

	      if (argTypeProvided != argTypeExpected) {
		typeError(expr.prmsPosArr[argIter], `Argument ${argIter} is of type ${tr(argTypeExpected)}, ${tr(argTypeProvided)} provided`, source);
	      }
	      
	      argIter += 1;
	    });
	  }
	  retType = gblEnv.funcs.get(callName).retType;
	} else if (gblEnv.classes.get(callName) != undefined) { /* Constructor */
	  const argsProvided = expr.args.length;
	  if (argsProvided != 0) {
	    argError(expr.prmPos, `Constructor for classes take exactly 0 arguments, ${argsProvided} provided`, source);
	  }
	  retType = { tag: "class", name: callName }; // Call name is same as the class name
	} else {
	  scopeError(expr.pos, `Function not in scope: ${expr.name}`, source);
	}
	
      }
      
      return retType;
      
    case "unaryExp":
      tc_uExp(expr.pos, expr.name, tc_expr(expr.arg, source, gblEnv, funEnv), source);
      return tc_expr(expr.arg, source, gblEnv, funEnv);
      
    case "binExp":
      const leftType = tc_expr(expr.arg[0], source, gblEnv, funEnv);
      const rightType = tc_expr(expr.arg[1], source, gblEnv, funEnv);
      const op = expr.name;
      return tc_binExp(expr.pos, op, leftType, rightType, source);
  }
}

export function typecheck(ast : Array<Stmt>, source: string, env: GlobalEnv) : Type {
  var result: Type = undefined;
  
  ast.forEach(stmt => {
    result = tc_stmt(stmt, source, env);
  });

  return result;
}
