// -*- mode: typescript; typescript-indent-level: 2; -*-

import { Type, NoneT, IntT, BoolT } from "./ast";

export const TRUE_VAL = "4611686018427387905"; // (1<<62)+1
export const FALSE_VAL = "4611686018427387904"; // 1<<62
export const NONE_VAL = "2305843009213693952"; // 1<<61

export function tr(type: Type): string {
  switch (type) {
    case NoneT:
      return "None";
    case IntT:
      return "int";
    case BoolT:
      return "bool";
    default:
      if (type.tag == "class") {
	return `<${type.name}>`;
      }
      debugger;
      throw `Unable to translate type '${type}', called from ${tr.caller}`;
  }
}

export function eqT(type1: Type, type2: Type): boolean {
  if (type1.tag == type2.tag) {
    if (type1.tag == "class" && type2.tag == "class") {
      return type1.name == type2.name;
    } else {
      return true;
    }
  } else {
    return false;
  }
}

export function neqT(type1: Type, type2: Type): boolean {
  return !eqT(type1, type2);
}

export function strToType(str: string): Type {
  switch (str) {
    case "None":
      return NoneT;
    case "int":
      return IntT;
    case "bool":
      return BoolT;
    default:
      throw `Can't translate type '${str}'`;
  }
}
