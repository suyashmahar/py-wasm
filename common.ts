// -*- mode: typescript; typescript-indent-level: 2; -*-

import { Type, NoneT, IntT, BoolT } from "./ast";

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
