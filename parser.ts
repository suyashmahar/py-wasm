// -*- mode: typescript; typescript-indent-level: 2; -*-

import {parser} from "lezer-python";
import {TreeCursor} from "lezer-tree";
import { Expression } from "typescript";
import {Expr, Stmt, Parameter, Pos} from "./ast";

type EnvType = Record<string, string>;
export var env : EnvType = {};

export function getSourcePos(c : TreeCursor, s : string) : Pos {
  const substring = s.substring(0, c.node.to);
  const line = substring.split("\n").length;
  const prevContent = substring.split("\n").slice(0, line-1).join("\n");
  const col = c.node.from - prevContent.length
  
  return {
    line: line,
    col: col,
    len: c.node.to - c.node.from 
  }
}

export function padNum(num: number, width: number): string {
  return String(num).padStart(width, " ");
}

export function getDecorator(pos: Pos, source: string): string {
  const splitSource = source.split("\n");
  const errLinesArr = [padNum(pos.line-1, 4) + "| " + splitSource[pos.line-2],
		       padNum(pos.line, 4) + "| " + splitSource[pos.line-1]];
  const errLines = errLinesArr.join("\n");
  const decorator = " ".repeat(pos.col+5) + "^".repeat(pos.len);
  
  return [errLines, decorator].join("\n");
}

export function genericError(errType: string, pos: Pos, msg: string, source: string) {
  const errTxt = `${errType}: ${msg}`
  
  const text: string = [getDecorator(pos, source), errTxt].join('\n');
  throw text;
}

export const typeError = (pos: Pos, msg: string, source: string) => genericError('TypeError', pos, msg, source);
export const symLookupError = (pos: Pos, msg: string, source: string) => genericError('SymbolLookupError', pos, msg, source);
export const argError = (pos: Pos, msg: string, source: string) => genericError('ArgumentError', pos, msg, source);
export const scopeError = (pos: Pos, msg: string, source: string) => genericError('ScopeError', pos, msg, source);


export function traverseExpr(c : TreeCursor, s : string) : Expr {
  switch(c.type.name) {
    case "Boolean":
      const boolPos = getSourcePos(c, s);
      var value = false;
      
      if (s.substring(c.from, c.to) == "True") {
        value = true;
      } else if (s.substring(c.from, c.to) == "True") {
        value = false;
      }

      return {
        tag: "bool",
	pos: boolPos,
        value: value
      }
    case "Number":
      const numPos = getSourcePos(c, s);
      return {
        tag: "num",
	pos: numPos,
        value: Number(s.substring(c.from, c.to))
      }
    case "None":
      const nonePos = getSourcePos(c, s);
      return {
	tag: "none",
	pos: nonePos
      }
    case "VariableName":
      const idPos = getSourcePos(c, s);
      
      return {
        tag: "id",
	pos: idPos,
	name: s.substring(c.from, c.to)
      }

    case "CallExpression":
      const cExpPos = getSourcePos(c, s);
      
      c.firstChild();
      const callName = s.substring(c.from, c.to);
      c.nextSibling(); // go to arglist

      const prmPos = getSourcePos(c, s);
      
      c.firstChild();  // go into arglist
      c.nextSibling(); // find single argument in arglist
      
      var args: Array<Expr> = [traverseExpr(c, s)];
      c.nextSibling();
      
      while (c.node.type.name != ')') {
      	c.nextSibling(); // pop the comma
	
	console.log("<50> " + c.node.type.name + ": " + s.substring(c.node.from, c.node.to));
	args.push(traverseExpr(c, s));
	c.nextSibling();
  
	console.log("<54> " + c.node.type.name + ": " + s.substring(c.node.from, c.node.to));
      }

      c.parent(); // pop arglist
      c.parent(); // pop CallExpression
      
      return {
        tag: "funcCall",
	pos: cExpPos,
	prmPos: prmPos,
        name: callName,
        args: args
      };
    case "UnaryExpression":
      const uExpPos = getSourcePos(c, s);
      
      c.firstChild();

      const uop = s.substring(c.from, c.to);
      c.nextSibling();
      const uArg = traverseExpr(c, s);

      // Pop the expr
      c.parent();
      
      return {
	tag: "unaryExp",
	pos: uExpPos,
	name: uop,
	arg: uArg
      };
      
    case "BinaryExpression":
      const binExpPos = getSourcePos(c, s);
      
      c.firstChild();

      const leftArg  = traverseExpr(c, s);
      c.nextSibling();
      const op       = s.substring(c.from, c.to);
      c.nextSibling();
      const rightArg = traverseExpr(c, s);

      // Pop the expr
      c.parent();
      
      return {
	tag: "binExp",
	pos: binExpPos,
	name: op,
	arg: [leftArg, rightArg]
      };
    case "ParenthesizedExpression":
      c.firstChild();

      c.nextSibling(); // Skip the opening paren
      const expr = traverseExpr(c, s);
      c.parent();
      
      return expr;
    default:
      console.log(c);
      throw new Error("Could not parse expr at " + c.from + " " + c.to + ": " + s.substring(c.from, c.to));
  }
}

export function traverseStmt(c : TreeCursor, s : string) : Stmt {
  console.log(c.node);
  switch(c.node.type.name) {
    case "FunctionDefinition":
      c.firstChild(); // Descend to the function
      c.nextSibling(); // Skip the 'def' keyword

      const funName = s.substring(c.node.from, c.node.to);

      c.nextSibling(); // Skip to the parameter list
      c.firstChild(); // Descend to the variable list
      c.nextSibling(); // Skip the opening paren

      var paramList : Array<Parameter> = [];
      var iter = 0;
      while (s.substring(c.node.from, c.node.to) != ")") {
	iter+=1;
	if (iter > 10) {
	  break;
	}
	var varName = s.substring(c.node.from, c.node.to);
	c.nextSibling(); // go to the typedef
	c.firstChild(); // descend to the typedef
	c.nextSibling(); // Skip the colon
	var paramType = s.substring(c.node.from, c.node.to)
	c.parent();

	paramList = paramList.concat({
	  tag: "parameter",
	  name: varName,
	  type: paramType
	});

	c.nextSibling(); // go to the next token (',', ')')
	
	// Check if the next token is a comma
	if (s.substring(c.node.from, c.node.to) == ",") {
	  c.nextSibling(); // Skip it
	} 
	
      };

      c.parent(); // Get out of the parameter list
      
      c.nextSibling(); // Go to the function's typedef

      var retType = "None";
      
      if (c.node.name != "Body") {
	c.firstChild();
	retType = s.substring(c.node.from, c.node.to);
	c.parent(); // Go back to the function
      }
      
      c.nextSibling(); // Get to the function body
      c.firstChild();
      c.nextSibling(); // Skip the colon in the body

      var bodyStmts: Array<Stmt> = [];
      do {
        bodyStmts.push(traverseStmt(c, s));
      } while(c.nextSibling());
      
      c.parent();
      c.parent();
      
      const resultVal: Stmt = {
	tag: "func",
	pos: getSourcePos(c, s),
	name: funName,
	parameters: paramList,
	ret: retType,
	body: bodyStmts	
      }

      return resultVal;
    case "IfStatement":

      c.firstChild(); // go to if
      c.nextSibling(); // go to the condition
      const condPos = getSourcePos(c, s);
      const cond = traverseExpr(c, s);

      c.nextSibling(); // go to the if body
      c.firstChild(); // descend into the body
      c.nextSibling(); // Skip the colon
            
      var ifBody: Array<Stmt> = [];
      do {
	ifBody = ifBody.concat(traverseStmt(c, s));
      } while (c.nextSibling());

      console.log("ifbody:");
      console.log(ifBody);
                
      c.parent();

      var elseBody : Array<Stmt> = [];
      var branches = [];
      
      
      // Check for elif/else
      while (c.nextSibling()) {
      	const branchName = s.substring(c.node.from, c.node.to)
	switch (branchName) {
	  case "else":
	    console.log("Found else statement");
	    
	    c.nextSibling(); // Skip the keyword
	    c.firstChild(); // Get to the body
	    c.nextSibling(); // Skip the colon
	    console.log("<++> " + c.node.type.name + ": " + s.substring(c.node.from, c.node.to));
	    do {
	      elseBody = elseBody.concat(traverseStmt(c, s));
	    } while (c.nextSibling());
	    console.log("<++> " + c.node.type.name + ": " + s.substring(c.node.from, c.node.to));
	    c.parent();
	}
      }

      
      const result: Stmt = {
	tag: "if",
	condPos: condPos,
	cond: cond,
	ifBody: ifBody,
	branches: [],
	elseBody: elseBody
      }

      console.log("Result ");
      console.log(result);

      c.parent();

      return result;
      
    case "AssignStatement":
      const assignPos = getSourcePos(c, s);
      
      c.firstChild(); // go to name

      const namePos = getSourcePos(c, s);

      const name = s.substring(c.from, c.to);
      c.nextSibling(); // go to colon

      var staticType:string = undefined;
      if (s.substring(c.from, c.from+1) == ':') {
	staticType = s.substring(c.from, c.to).replace(":", "").trim();
	const staticTypePos = getSourcePos(c, s);
	
	if (staticType != "bool" && staticType != "int") {
	  typeError(staticTypePos, `Unknown type ${staticType}.`, s);
	}
      }
      
      c.nextSibling(); // go to equals
      c.nextSibling(); // go to value

      const value = traverseExpr(c, s);
      c.parent();

      if (staticType != undefined) {
	return {
          tag: "define",
	  pos: assignPos,
	  staticType: staticType,
          name: name,
          value: value
	}
      } else {
	return {
	  tag: "assign",
	  pos: assignPos,
	  namePos: namePos,
	  name: name,
	  value: value
	}
      }
    case "WhileStatement":
      c.firstChild();
      c.nextSibling(); // Skip the while keyword

      const condExpr = traverseExpr(c, s);
      c.nextSibling(); // Go to the body

      c.firstChild();
      c.nextSibling();
      
      var whileBody: Array<Stmt> = [];
      do {
	whileBody = whileBody.concat(traverseStmt(c, s));
      } while (c.nextSibling());
      
      c.parent();
      c.parent();

      return {
	tag: "while",
	cond: condExpr,
	whileBody: whileBody
      };
      
    case "ExpressionStatement":
      c.firstChild();
      const expr = traverseExpr(c, s);
      c.parent(); // pop going into stmt
      return { tag: "expr", expr: expr }
    case "ReturnStatement":
      c.firstChild();
      var retExpr: Expr = undefined;
      console.log("<54> " + c.node.type.name + ": " + s.substring(c.node.from, c.node.to));
      if (c.nextSibling() != undefined) { // Skip 'return'
	retExpr = traverseExpr(c, s);
      }
      console.log("<54> " + c.node.type.name + ": " + s.substring(c.node.from, c.node.to));
      c.parent();
      return { tag: "return", pos: getSourcePos(c, s), expr: retExpr };
    default:
      throw new Error("Could not parse stmt at " + c.node.from + " " + c.node.to + ": " + s.substring(c.from, c.to));
  }
}

export function traverse(c : TreeCursor, s : string) : Array<Stmt> {
  switch(c.node.type.name) {
    case "Script":
      const stmts = [];
      c.firstChild();
      do {
        stmts.push(traverseStmt(c, s));
      } while(c.nextSibling())
      console.log("traversed " + stmts.length + " statements ", stmts, "stopped at " , c.node);
      return stmts;
    default:
      throw new Error("Could not parse program at " + c.node.from + " " + c.node.to);
  }
}

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
	typeError(pos, `Operator ${op} on types that are neither both int nor bool`, source);
      }
      return "bool";
    case "is":
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
    case "not":
      if (exprType != "bool") {
	typeError(pos, `Cannot use unary operator 'not' with ${exprType}`, source);
      }
  }
}

export function tc_expr(expr : Expr, source: string) : string {
  console.log("Checking expression:");
  console.log(expr);
  switch(expr.tag) {
    case "bool":
      return "bool";
    case "num":
      return "int";
    case "none":
      return "none";
    case "id":
      return env[expr.name];
    case "funcCall":
      expr.args.forEach(s => {tc_expr(s, source)});
      return "int";
    case "unaryExp":
      if (expr.arg.tag != "bool" && expr.arg.tag != "num") {
	typeError(expr.pos, `Cannot use ${expr.name} with ${tc_expr(expr.arg, source)}`, source);
      }
      tc_uExp(expr.pos, expr.name, tc_expr(expr.arg, source), source);
      return tc_expr(expr.arg, source);
    case "binExp":
      const leftType = tc_expr(expr.arg[0], source);
      const rightType = tc_expr(expr.arg[1], source);
      const op = expr.name;
      return tc_binExp(expr.pos, op, leftType, rightType, source);
  }
}

export function tc_stmt(stmt: Stmt, source: string) : String {
  switch (stmt.tag) {
    case "expr":
      return tc_expr(stmt.expr, source);
    case "define":
      const rhsType = tc_expr(stmt.value, source);
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
      const assignRhsType = tc_expr(stmt.value, source);
      if (assignLhsType != assignRhsType) {
	const errMsg = `Value of type ${assignRhsType} to '${stmt.name}' which is of type ${assignLhsType}`;
	typeError(stmt.pos, errMsg, source);
      }
      return "None";
    case "while":
      const whileCondType = tc_expr(stmt.cond, source);

      if (whileCondType != "bool") {
	typeError(stmt.cond.pos, `While condition expected bool but got ${whileCondType}.`, source);
      }
      return "None";
    case "if":
      const condType = tc_expr(stmt.cond, source);

      if (condType != "bool") {
	typeError(stmt.condPos, `If condition expected bool but got ${condType}`, source);
      }
      return "None";
    case "return":
      const retType = tc_expr(stmt.expr, source);

      return retType;
    case "func":
      stmt.body.forEach(s => {
	if (s.tag == "return") {
	  if (tc_expr(s.expr, source) != stmt.ret) {
	    const throwMsg = `Return's type and function's return type don't match`;
	    typeError(s.pos, throwMsg, source);
	  }
	}
      });
  }
}

export function typecheck(ast : Array<Stmt>, source: string) : String {
  ast.forEach(stmt => {
    const staticType = tc_stmt(stmt, source);
  });

  return "Done";
}

export function parse(source : string) : Array<Stmt> {
  const t = parser.parse(source);
  const ast = traverse(t.cursor(), source);
  typecheck(ast, source);
  return ast;
}
