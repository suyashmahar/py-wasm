// -*- mode: typescript; typescript-indent-level: 2; -*-

import { run } from "./runner";
import { typecheck_ } from "./compiler";
import { GlobalEnv } from "./env";
import { Value, Type, BoolT, IntT, NoneT } from "./ast";
import { valueToStr, i64ToValue, NONE_BI } from "./common";
import * as compiler from './compiler';

interface REPL {
  run(source : string) : Promise<any>;
}

export class BasicREPL {
  currentEnv: GlobalEnv
  importObject: any
  memory: any
  constructor(importObject : any) {
    console.log("Constructing new object");

    compiler.reset();
    this.importObject = importObject;
    this.importObject.nameMap = new Array<string>();
    this.importObject.tableOffset = new Map<number, string>();
      
    this.importObject.updateNameMap = (env : GlobalEnv) => {
        env.globals.forEach((pos, name) => {
          importObject.nameMap[pos[1]] = name;
        })
    };
      
    this.importObject.updateTableMap = (env : GlobalEnv) => {
      env.classes.forEach((val, key) => {
	console.log("setting tableOffset");
        importObject.tableOffset.set(val.tableOff, key);
      })
    };


    this.importObject.imports.print_other = (arg: any) => {
      const res = i64ToValue(arg, this.importObject.tableOffset);
      if (res.tag == "bool") {
	importObject.imports.print_bool(res.value);
	return NONE_BI;
      } else if (res.tag == "num") {
	const typ: Type = {tag: "number"};
	const val = res.value;
	importObject.imports.print_num(val);
	return NONE_BI;
      } else if (res.tag == "str") {
	return importObject.imports.print_str(res.off);
      } else if (res.tag == "none") {
	importObject.imports.print_none(undefined);
      } else {
	importObject.imports.print({tag: res.tag} , undefined);
	return NONE_BI;
      }
    };


    this.importObject.imports.print_str = (off: number) => {
      const memBuffer: ArrayBuffer = (importObject as any).js.memory.buffer;
      const memUint8 = new Uint8Array(memBuffer);

      console.log(`Printing string at offset ${off}`);
      
      var iter = off*8;
      var str = "";
      while (memUint8[iter] != 0) {
	const nextChar = String.fromCharCode(memUint8[iter]);

	str = str.concat(nextChar);
	iter += 1;
      }

      console.log(`String: ${str}`);
      
      const elt = document.createElement("pre");
      document.getElementById("output").appendChild(elt);
      elt.innerText = str;

      return NONE_BI;	  
    },
    
    this.importObject.imports.print_obj = (arg : any, classId: any) => {
      const classObj: Value = {tag: "object", name: importObject.tableOffset.get(Number(classId)), address: arg};
      
      return importObject.imports.print({tag: "class", name: classObj.name}, undefined);
    };
    
    this.importObject.imports.assert_non_none = (arg : any): any => {
      const res = i64ToValue(arg, this.importObject.tableOffset);
      if (res.tag == "none") {
	throw new Error("Operation on None");
      }
      return arg;      
    };
    
    
    if(!importObject.js) {
      const memory = new WebAssembly.Memory({initial:10, maximum:20});
      const table = new WebAssembly.Table({element: "anyfunc", initial: 10});
      this.importObject.js = { memory: memory, table: table };
    }
    this.currentEnv = {
      globals: new Map(),
      globalStrs: new Map(),
      classes: new Map(),
      funcs: new Map([['print', { name: "print", members: [NoneT], retType: IntT}],
		     ]),
      offset: 8,
      classOffset: 0
    };
  }
  async run(source : string) : Promise<Value> {
    this.importObject.updateNameMap(this.currentEnv); // is this the right place for updating the object's env?
    this.importObject.updateTableMap(this.currentEnv);
    const [result, newEnv] = await run(source, {importObject: this.importObject, env: this.currentEnv});
    this.currentEnv = newEnv;
    console.log("returning");
    console.log(result);
    return result;
  }

  async tc(source : string) : Promise<Type> {
    return typecheck_(source, this.currentEnv);
  }
}
