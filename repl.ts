// -*- mode: typescript; typescript-indent-level: 2; -*-

import { run } from "./runner";
import { GlobalEnv } from "./env";
import { BoolT, IntT, NoneT } from "./ast";

interface REPL {
  run(source : string) : Promise<any>;
}

export class BasicREPL {
  currentEnv: GlobalEnv
  importObject: any
  memory: any
  constructor(importObject : any) {
    this.importObject = importObject;
    if(!importObject.js) {
      const memory = new WebAssembly.Memory({initial:10, maximum:20});
      const table = new WebAssembly.Table({element: "anyfunc", initial: 10});
      this.importObject.js = { memory: memory, table: table };
    }
    this.currentEnv = {
      globals: new Map(),
      classes: new Map(),
      funcs: new Map([['print', { name: "print", members: [NoneT], retType: IntT}],
		     ]),
      offset: 8,
      classOffset: 0
    };
  }
  async run(source : string) : Promise<any> {
    this.importObject.updateNameMap(this.currentEnv); // is this the right place for updating the object's env?
    const [result, newEnv] = await run(source, {importObject: this.importObject, env: this.currentEnv});
    this.currentEnv = newEnv;
    return result;
  }
}
