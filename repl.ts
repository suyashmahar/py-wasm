// -*- mode: typescript; typescript-indent-level: 2; -*-

import { run } from "./runner";
import { typecheck_ } from "./compiler";
import { GlobalEnv } from "./env";
import { Value, Type, BoolT, IntT, NoneT, StrT } from "./ast";
import { valueToStr, i64ToValue, NONE_BI, STR_BI } from "./common";
import * as compiler from './compiler';
import * as err from './error';

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
      var isEscaped = false;
      while (memUint8[iter] != 0) {
	const nextChar = String.fromCharCode(memUint8[iter]);

	if (isEscaped) {
	  switch (nextChar) {
	    case "t":
	      str = str.concat("    ");
	    case "\\":
	      str = str.concat("\\");
	    case "n":
	      str = str.concat("\n");
	    case "\"":
	      str = str.concat(`"`);
	    case "'":
	      str = str.concat(`'`);
	  }
	  isEscaped = false;
	} else if (nextChar == "\\") {
	  isEscaped = true;
	} else {
	  str = str.concat(nextChar);
	}
	
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

    this.importObject.imports.str_len = (offBigInt: any): any => {
      const off: number = Number(offBigInt - STR_BI);
      
      const memBuffer: ArrayBuffer = (importObject as any).js.memory.buffer;
      const memUint8 = new Uint8Array(memBuffer);
      
      var iter = off*8;
      while (memUint8[iter] != 0) {
	iter += 1;
      }

      return BigInt(iter - off*8);
    };
    
    this.importObject.imports.str_concat = (offBigInt1: any, offBigInt2: any): any => {
      const off1: number = Number(offBigInt1 - STR_BI);
      const off2: number = Number(offBigInt2 - STR_BI);

      const len1: number = Number(importObject.imports.str_len(offBigInt1));
      const len2: number = Number(importObject.imports.str_len(offBigInt2));
      const newLen = len1 + len2 + 1;

      const memBuffer: ArrayBuffer = (importObject as any).js.memory.buffer;
      const memUint8 = new Uint8Array(memBuffer);
      const memUint64 = new BigUint64Array(memBuffer);
      
      // Get the current heap pointer
      const heapPtrBuffer = importObject.js.memory.buffer.slice(0, 8);
      const heapPtrDV = new DataView(heapPtrBuffer, 0, 8);
      const heapPtr = Number(heapPtrDV.getBigUint64(0, true));

      // Write the new heap pointer
      memUint64[0] = BigInt(heapPtr + newLen);

      // Copy the first and second strings
      var diter: number = heapPtr*8;
      var siter: number = off1*8;

      while (siter < off1*8 + len1) {
	memUint8[diter] = memUint8[siter];
	siter += 1;
	diter += 1;
      }
      
      siter = off2*8;
      while (siter < off2*8 + len2) {
	memUint8[diter] = memUint8[siter];
	siter += 1;
	diter += 1;
      }
      memUint8[diter] = 0; // Add the final null char

      // Return pointer to the new string
      return STR_BI + BigInt(heapPtr);
    }; 
    // "adlkjfs"[1:2:1]
    this.importObject.imports.str_slice = (str: any, arg1: any, arg2: any, arg3: any): any => {
      const strOff: number = Number(str - STR_BI);
      const strLen: number = Number(importObject.imports.str_len(str));

      if (arg1 >= BigInt(strLen)) {
	err.idxError({line:0, col:0, len:0}, `Index ${arg1} out of range, string length ${strLen}.`, "");
      }
      
      const memBuffer: ArrayBuffer = (importObject as any).js.memory.buffer;
      const memUint8 = new Uint8Array(memBuffer);
      const memUint64 = new BigUint64Array(memBuffer);
      
      // Get the current heap pointer
      const heapPtrBuffer = importObject.js.memory.buffer.slice(0, 8);
      const heapPtrDV = new DataView(heapPtrBuffer, 0, 8);
      const heapPtr = Number(heapPtrDV.getBigUint64(0, true));

      // Write the new heap pointer
      memUint64[0] = BigInt(heapPtr + 2);

      // Copy the first and second strings
      var diter: number = heapPtr*8;
      var siter: number = strOff*8 + Number(arg1);

      while (siter < strOff*8 + Number(arg1) + 1) {
	memUint8[diter] = memUint8[siter];
	siter += 1;
	diter += 1;
      }
      
      memUint8[diter] = 0;

      // Return pointer to the new string
      return STR_BI + BigInt(heapPtr);
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
		      ['len', { name: "len", members: [StrT], retType: IntT}],
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
