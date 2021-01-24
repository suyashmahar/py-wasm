// -*- mode: typescript; typescript-indent-level: 2; -*-

import {parser} from "lezer-python";
import {TreeCursor} from "lezer-tree";
import { Expression } from "typescript";
import {Expr, Stmt, Parameter} from "./ast";

type EnvType = Record<string, string>;
export var env : EnvType = {};

export function traverseExpr(c : TreeCursor, s : string) : Expr {
  switch(c.type.name) {
    case "Boolean":
      var value = false;
      
      if (s.substring(c.from, c.to) == "True") {
        value = true;
      } else if (s.substring(c.from, c.to) == "True") {
        value = false;
      }

      return {
        tag: "bool",
        value: value
      }
    case "Number":
      return {
        tag: "num",
        value: Number(s.substring(c.from, c.to))
      }
    case "VariableName":
      return {
        tag: "id",
        name: s.substring(c.from, c.to)
      }

    case "CallExpression":
      c.firstChild();
      const callName = s.substring(c.from, c.to);
      c.nextSibling(); // go to arglist
      c.firstChild();  // go into arglist
      c.nextSibling(); // find single argument in arglist
      
      const arg1 = traverseExpr(c, s);
      c.nextSibling();
      console.log(c.type.name);
      if (c.node.type.name == ')') {
	c.parent(); // pop arglist
	c.parent(); // pop CallExpression
	
	return {
          tag: "builtin1",
          name: callName,
          arg: arg1
	};
      } else {
	c.nextSibling(); // pop the comma
	const arg2 = traverseExpr(c, s);
	c.parent();
	c.parent();
	
	return {
          tag: "builtin2",
          name: callName,
          arg: [arg1, arg2]
	};
      }
    case "BinaryExpression":
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
	name: op,
	arg: [leftArg, rightArg]
      };
      
    default:
      console.log(c);
      throw new Error("Could not parse expr at " + c.from + " " + c.to + ": " + s.substring(c.from, c.to));
  }
}

export function traverseStmt(c : TreeCursor, s : string) : Stmt {
  console.log(c.node);
  switch(c.node.type.name) {
    case "FunctionDefinition":
      console.log("Parsing function");
      
      c.firstChild(); // Descend to the function
      c.nextSibling(); // Skip the 'def' keyword

      const funName = s.substring(c.node.from, c.node.to);

      c.nextSibling(); // Skip to the parameter list
      c.firstChild(); // Descend to the variable list
      c.nextSibling(); // Skip the opening paren

      console.log("Parsing the parameters");
      console.log("<++> " + c.node.type.name + ": " + s.substring(c.node.from, c.node.to));
      
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

	console.log("<124> " + c.node.type.name + ": " + s.substring(c.node.from, c.node.to));

	paramList = paramList.concat({
	  tag: "parameter",
	  name: varName,
	  type: paramType
	});

	c.nextSibling(); // go to the next token (',', ')')
	
	// Check if the next token is a comma
	if (s.substring(c.node.from, c.node.to) == ",") {
	  console.log("Skipping to the next token on comma");
	  c.nextSibling(); // Skip it
	} 
	
	console.log("<132> " + c.node.type.name + ": " + s.substring(c.node.from, c.node.to));
      };

      c.parent(); // Get out of the parameter list
      
      c.nextSibling(); // Go to the function's typedef
      c.firstChild();

      const retType = s.substring(c.node.from, c.node.to);
      
      c.parent(); // Go back to the function

      c.nextSibling(); // Get to the function body
      c.firstChild();
      c.nextSibling(); // Skip the colon in the body

      var bodyStmts: Array<Stmt> = [];
      do {
        bodyStmts.push(traverseStmt(c, s));
      } while(c.nextSibling());
      
      c.parent();
      c.parent();
      console.log("<Parsing complete> " + c.node.type.name + ": " + s.substring(c.node.from, c.node.to));
      
      const resultVal: Stmt = {
	tag: "func",
	name: funName,
	parameters: paramList,
	ret: retType,
	body: bodyStmts	
      }

      console.log("Result function");
      console.log(resultVal);
      
      return resultVal;
    case "IfStatement":

      c.firstChild(); // go to if
      c.nextSibling(); // go to the condition
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
      c.firstChild(); // go to name

      const name = s.substring(c.from, c.to);
      c.nextSibling(); // go to colon

      const staticType = s.substring(c.from, c.to).replace(":", "").trim();
      c.nextSibling(); // go to equals
      c.nextSibling(); // go to value

      const value = traverseExpr(c, s);
      c.parent();
      
      return {
        tag: "define",
	staticType: staticType,
        name: name,
        value: value
      }
    case "ExpressionStatement":
      c.firstChild();
      const expr = traverseExpr(c, s);
      c.parent(); // pop going into stmt
      return { tag: "expr", expr: expr }
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

export function tc_binExp(op : String, leftType : String, rightType : String) : String {
  switch (op) {
    case "-":
    case "+":
    case "*":
    case ">=":
    case "<=":
    case ">":
    case "<":
    case "%":
      console.log("arguments are: " + leftType + " and " + rightType);
      if (leftType != "int" || rightType != "int") {
	throw "Operator " + op + " expects both arguments to be `int'. Actual arguments are: `" + leftType + "' and `" + rightType + "'";
      }
      return "int";
    case "==":
    case "!=":
      if (leftType != rightType) {
	throw "Operator " + op + " types that are neither both int nor bool.";
      }
      return leftType;
    default:
      throw "Unknown operator " + op;
  }
}

export function tc_expr(expr : Expr) : String {
  console.log("Checking expression:");
  console.log(expr);
  switch(expr.tag) {
    case "bool":
      return "bool";
    case "num":
      return "int";
    case "id":
      return env[expr.name];
    case "builtin1":
      return "int";
    case "builtin2":
      return "int";
    case "binExp":
      const leftType = tc_expr(expr.arg[0]);
      const rightType = tc_expr(expr.arg[1]);
      const op = expr.name;
      return tc_binExp(op, leftType, rightType);
  }
}

export function tc_stmt(stmt : Stmt) : String {
  switch (stmt.tag) {
    case "expr":
      return tc_expr(stmt.expr);
    case "define":
      const rhsType = tc_expr(stmt.value);
      const lhsType = stmt.staticType;

      if (rhsType != lhsType) {
	throw "Type mismatch in lhs and rhs in assignment, lhs is `" + lhsType + "' rhs is `" + rhsType + "'";
      }

      env[stmt.name] = stmt.staticType;
      
      return stmt.staticType;
    case "if":
      const condType = tc_expr(stmt.cond);

      if (condType != "bool") {
	throw "Type mismatch in if statement's condition, expected `bool' but got `" + condType + "'";
      }
  }
}

export function typecheck(ast : Array<Stmt>) : String {
  ast.forEach(stmt => {
    const staticType = tc_stmt(stmt);
  });

  return "Done";
}

export function parse(source : string) : Array<Stmt> {
  const t = parser.parse(source);
  const ast = traverse(t.cursor(), source);
  typecheck(ast);
  return ast;
}
