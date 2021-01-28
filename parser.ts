// -*- mode: typescript; typescript-indent-level: 2; -*-

import { parser } from "lezer-python";
import { TreeCursor } from "lezer-tree";
import { Expr, Stmt, Parameter, Pos, Branch } from "./ast";

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
  var errLinesArr = [padNum(pos.line-1, 4) + "| " + splitSource[pos.line-2],
		       padNum(pos.line, 4) + "| " + splitSource[pos.line-1]];

  if (pos.line == 1) {
    errLinesArr = [errLinesArr[1]];
  }
  
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
export const parseError = (pos: Pos, msg: string, source: string) => genericError('ParseError', pos, msg, source);


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

      var args: Array<Expr> = [];
      var prmsPosArr: Array<Pos> = [];
      
      if (s.substring(c.node.from, c.node.to) != ")") {
	args = [traverseExpr(c, s)];
	prmsPosArr = [getSourcePos(c, s)];
	c.nextSibling();
	
	while (c.node.type.name != ')') {
      	  c.nextSibling(); // pop the comma
	  
	  args.push(traverseExpr(c, s));
	  prmsPosArr.push(getSourcePos(c, s));
	  c.nextSibling();
	}
      }
      c.parent(); // pop arglist
      c.parent(); // pop CallExpression
      
      return {
        tag: "funcCall",
	pos: cExpPos,
	prmPos: prmPos,
	prmsPosArr: prmsPosArr,
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
      parseError(getSourcePos(c, s), `Parser failed (miserably), could not parse the expression.`, s); 
  }
}

export function traverseStmt(c : TreeCursor, s : string) : Stmt {
  console.log(c.node);
  switch(c.node.type.name) {
    case "PassStatement":
      return { tag: "pass", pos: getSourcePos(c, s) };
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
      var branches : Array<Branch> = [];
      
      
      // Check for elif/else
      while (c.nextSibling()) {
      	const branchName = s.substring(c.node.from, c.node.to)
	console.log(`Branch name: ${branchName}`);
	
	switch (branchName) {
	  case "else":
	    
	    c.nextSibling(); // Skip the keyword
	    c.firstChild(); // Get to the body
	    c.nextSibling(); // Skip the colon
	    
	    do {
	      elseBody = elseBody.concat(traverseStmt(c, s));
	    } while (c.nextSibling());

	    c.parent();
	    break;
	  case "elif":
	    console.log("Found elif statement");

	    console.log("<307> " + c.node.type.name + ": " + s.substring(c.node.from, c.node.to));
	    
	    c.nextSibling(); // Skip the keyword

	    console.log("<310> " + c.node.type.name + ": " + s.substring(c.node.from, c.node.to));
   
	    const condPos : Pos = getSourcePos(c, s);
	    const cond : Expr = traverseExpr(c, s);
	    var elifBody : Array<Stmt> = [];

	    c.nextSibling(); 
	    console.log("<318> " + c.node.type.name + ": " + s.substring(c.node.from, c.node.to));
	    c.firstChild(); // Get to the body
	    c.nextSibling(); // Skip the colon
	    console.log("<++> " + c.node.type.name + ": " + s.substring(c.node.from, c.node.to));
	    do {
	      elifBody = elifBody.concat(traverseStmt(c, s));
	    } while (c.nextSibling());
	    console.log("<++> " + c.node.type.name + ": " + s.substring(c.node.from, c.node.to));
	    c.parent();

	    const entry : Branch = {
	      tag: "branch",
	      cond: cond,
	      condPos: condPos,
	      body: elifBody
	    };
	    
	    branches.push(entry);
	    
	    break;
	}
      }

      
      const result: Stmt = {
	tag: "if",
	condPos: condPos,
	cond: cond,
	ifBody: ifBody,
	branches: branches,
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
      typeError(getSourcePos(c, s), `Could not parse stmt, failed miserably`, s);
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
	typeError(pos, `Operator ${op} on types that are neither both int nor bool (${leftType} and ${rightType})`, source);
      }
      return "bool";
    case "is":
      if (leftType != "none" || rightType != "none") {
	typeError(pos, `Operator \`is\` used on non-None types, ${leftType} and ${rightType}`, source);
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

export function tc_expr(expr : Expr, source: string, funEnv: EnvType = <EnvType>{}):string {
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
      if (funEnv[expr.name] != undefined) {
	return funEnv[expr.name];
      } else {
	return env[expr.name];
      }
    case "funcCall":
      expr.args.forEach(s => {tc_expr(s, source, funEnv)});
      return "int";
    case "unaryExp":
      // if (expr.arg.tag != "bool" && expr.arg.tag != "num") {
      // 	typeError(expr.pos, `Cannot use ${expr.name} with ${tc_expr(expr.arg, source)}`, source);
      // }
      tc_uExp(expr.pos, expr.name, tc_expr(expr.arg, source, funEnv), source);
      return tc_expr(expr.arg, source, funEnv);
    case "binExp":
      const leftType = tc_expr(expr.arg[0], source, funEnv);
      const rightType = tc_expr(expr.arg[1], source, funEnv);
      const op = expr.name;
      return tc_binExp(expr.pos, op, leftType, rightType, source);
  }
}

export function tc_stmt(stmt: Stmt, source: string, funEnv: EnvType = <EnvType>{}) : String {
  switch (stmt.tag) {
    case "expr":
      return tc_expr(stmt.expr, source, funEnv);
    case "pass":
      return "none";
    case "define":
      const rhsType = tc_expr(stmt.value, source, funEnv);
      const lhsType = stmt.staticType;

      console.log(`Found definition of ${stmt.name}`);
      
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
      const assignRhsType = tc_expr(stmt.value, source, funEnv);
      if (assignLhsType != assignRhsType) {
	const errMsg = `Value of type ${assignRhsType} to '${stmt.name}' which is of type ${assignLhsType}`;
	typeError(stmt.pos, errMsg, source);
      }
      return "None";
    case "while":
      console.log("funEnv:");
      console.log(funEnv);
      const whileCondType = tc_expr(stmt.cond, source, funEnv);

      if (whileCondType != "bool") {
	typeError(stmt.cond.pos, `While condition expected a bool, found ${whileCondType}.`, source);
      }
      return "None";
    case "if":
      const condType = tc_expr(stmt.cond, source, funEnv);

      if (condType != "bool") {
	typeError(stmt.condPos, `If condition expected bool but got ${condType}`, source);
      }
      return "None";
    case "return":
      const retType = tc_expr(stmt.expr, source, funEnv);

      return retType;
    case "func":
      stmt.body.forEach(s => {
	if (s.tag == "define") {
	  funEnv[s.name] = s.staticType;
	}
      });
      
      stmt.parameters.forEach(param => { funEnv[param.name] = param.type; });

      stmt.body.forEach(s => {
	tc_stmt(s, source, funEnv);
	if (s.tag == "return") {
	  const retType = tc_expr(s.expr, source, funEnv);
	  if (retType != stmt.ret) {
	    const throwMsg = `Return's type ${retType} and function's return type ${stmt.ret} don't match`;
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
