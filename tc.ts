// -*- mode: typescript; typescript-indent-level: 2; -*-

import { typeError, symLookupError, argError, scopeError, parseError } from './parser';
import { GlobalEnv } from "./compiler";
import { Expr, Stmt, Parameter, Pos, Branch } from "./ast";

export type EnvType = Record<string, string>;
export var env : EnvType = {};


export function tc_binExp(pos: Pos, op : string, leftType : string, rightType : String, source: string) : string {
  switch (op) {
    case "-":
    case "+":
    case "*":
    case "%":
    case "//":
      console.log("arguments are: " + leftType + " and " + rightType);
      if (leftType != "int" || rightType != "int") {
	const errMsg = `Operator ${op} expects both args to be int, got ${leftType} and ${rightType}`;
	typeError(pos, errMsg, source);
      }
      return "int";
    case ">=":
    case "<=":
    case ">":
    case "<":
    case "==":
    case "!=":
      if (leftType != rightType) {
	typeError(pos, `Operator ${op} on types that are neither both int nor bool (${leftType} and ${rightType})`, source);
      }
      return "bool";
    case "is":
      if (leftType != "none" || rightType != "none") {
	typeError(pos, `Operator \`is\` used on non-None types, ${leftType} and ${rightType}`, source);
      }
      return "bool";
    case "and":
    case "or":
      if (leftType != "bool" || rightType != "bool") {
	typeError(pos, `Operator ${op} used on non-bool types, ${leftType} and ${rightType}`, source);
      }
      return "bool";
    default:
      throw "Unknown operator " + op;
  }
}

export function tc_uExp(pos: Pos, op: string, exprType: string, source: string) {
  switch (op) {
    case "-":
      if (exprType != "int") {
	typeError(pos, `Cannot use unary operator '-' with ${exprType}`, source);
      }
      break;
    case "not":
      if (exprType != "bool") {
	typeError(pos, `Cannot use unary operator 'not' with ${exprType}`, source);
      }
      break;
  }
}

export function tc_stmt(stmt: Stmt, source: string, gblEnv: GlobalEnv, funEnv: EnvType = <EnvType>{}) : String {
  switch (stmt.tag) {
    case "expr":
      return tc_expr(stmt.expr, source, gblEnv, funEnv);
    case "pass":
      return "none";
    case "define":
      const rhsType = tc_expr(stmt.value, source, gblEnv, funEnv);
      const lhsType = stmt.staticType;

      if (rhsType != lhsType) {
	const errMsg = `${rhsType} value assigned to '${stmt.name}' which is of type ${lhsType}`;
	typeError(stmt.pos, errMsg, source);
      }

      env[stmt.name] = stmt.staticType;
      
      return stmt.staticType;
    case "assign":
      if (env[stmt.name] == undefined) {
	symLookupError(stmt.namePos, `Cannot find value '${stmt.name}' in current scope`, source);
      }
      
      const assignLhsType = env[stmt.name]
      const assignRhsType = tc_expr(stmt.value, source, gblEnv, funEnv);
      if (assignLhsType != assignRhsType) {
	const errMsg = `Value of type ${assignRhsType} to '${stmt.name}' which is of type ${assignLhsType}`;
	typeError(stmt.pos, errMsg, source);
      }
      return "None";
    case "while":
      const whileCondType = tc_expr(stmt.cond, source, gblEnv, funEnv);

      if (whileCondType != "bool") {
	typeError(stmt.cond.pos, `While condition expected a bool, found ${whileCondType}.`, source);
      }

      // Check the body
      stmt.whileBody.forEach(s => {
	tc_stmt(s, source, gblEnv, funEnv);
      });
      
      return "None";
    case "if":
      const condType = tc_expr(stmt.cond, source, gblEnv, funEnv);

      if (stmt.branches != []) {
	stmt.branches.forEach(branch => {
	  const condType = tc_expr(branch.cond, source, gblEnv, funEnv);
	  if (condType != "bool") {
	    typeError(stmt.condPos, `If condition expected bool but got ${condType}`, source);
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

      if (condType != "bool") {
	typeError(stmt.condPos, `If condition expected bool but got ${condType}`, source);
      }

      return "None";
    case "return":
      const retType = tc_expr(stmt.expr, source, gblEnv, funEnv);

      return retType;
    case "func":
      stmt.body.forEach(s => {
	if (s.tag == "define") {
	  funEnv[s.name] = s.staticType;
	}
      });
      
      stmt.parameters.forEach(param => { funEnv[param.name] = param.type; });

      stmt.body.forEach(s => {
	tc_stmt(s, source, gblEnv, funEnv);
	if (s.tag == "return") {
	  const retType = tc_expr(s.expr, source, gblEnv, funEnv);
	  if (retType != stmt.ret) {
	    const throwMsg = `Return's type ${retType} and function's return type ${stmt.ret} don't match`;
	    typeError(s.pos, throwMsg, source);
	  }
	}
      });
  }
}

export function tc_expr(expr : Expr, source: string, gblEnv: GlobalEnv, funEnv: EnvType = <EnvType>{}):string {
  switch(expr.tag) {
    case "bool":
      return "bool";
      
    case "num":
      return "int";
      
    case "none":
      return "none";
      
    case "id":
      if (funEnv[expr.name] != undefined) {
	return funEnv[expr.name];
      } else {
	return env[expr.name];
      }
      
    case "funcCall":
      if (gblEnv.funcs.get(expr.name) == undefined) {
	scopeError(expr.pos, `Function not in scope: ${expr.name}`, source);
      }

      const argsExpected = gblEnv.funcs.get(expr.name)[0].length;
      const argsProvided = expr.args.length;

      if (argsExpected != argsProvided) {
	argError(expr.prmPos, `${expr.name}() needs ${argsExpected} arguments, ${argsProvided} provided`, source);
      }

      var argIter = 0;
      expr.args.forEach(arg => {
	const argTypeProvided = tc_expr(arg, source, gblEnv, funEnv);
	const argTypeExpected = gblEnv.funcs.get(expr.name)[0][argIter];

	if (argTypeProvided != argTypeExpected && argTypeExpected != "any") {
	  typeError(expr.prmsPosArr[argIter], `Argument ${argIter} is of type ${argTypeExpected}, ${argTypeProvided} provided`, source);
	}
	
	argIter += 1;
      });
      return "int";
      
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

export function typecheck(ast : Array<Stmt>, source: string, env: GlobalEnv) : String {
  ast.forEach(stmt => {
    const staticType = tc_stmt(stmt, source, env);
  });

  return "Done";
}
