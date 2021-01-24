// -*- mode: typescript; typescript-indent-level: 2; -*-

import {run} from "./runner";
import {emptyEnv, GlobalEnv} from "./compiler";

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
      this.importObject.js = { memory: memory };
    }
    this.currentEnv = {
      globals: new Map(),
      funcs: new Map([['print', [1, 'int']],
		      ['abs',   [1, 'int']],
		      ['max',   [2, 'int']],
		      ['min',   [2, 'int']],
		      ['pow',   [2, 'int']],
		     ]),
      offset: 0
    };
  }
  async run(source : string) : Promise<any> {
    this.importObject.updateNameMap(this.currentEnv); // is this the right place for updating the object's env?
    const [result, newEnv] = await run(source, {importObject: this.importObject, env: this.currentEnv});
    this.currentEnv = newEnv;
    return result;
  }
}
