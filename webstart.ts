// -*- mode: typescript; typescript-indent-level: 2; -*-

import {BasicREPL} from './repl';
import {emptyEnv} from './compiler';
import {GlobalEnv} from './env';
import {Value, Type} from './ast';
import {valueToStr, i64ToValue, NONE_BI} from './common';

import {NUM, BOOL, NONE} from './utils';

import * as ace from 'brace';
import 'brace/mode/python';
import 'brace/theme/monokai';

var editor: ace.Editor = undefined;

function stringify(typ: Type, arg: any): string {
  switch (typ.tag) {
    case "number":
      return (arg as number).toString();
    case "bool":
      return (arg as boolean) ? "True" : "False";
    case "none":
      return "None";
    case "class":
      return typ.name;
  }
}

function webStart() {
  document.addEventListener("DOMContentLoaded", function() {
    editor = ace.edit("user-code"); // sourceElem.value.replace(/\t/g, '    ');
    editor.setTheme("ace/theme/textmate");
    editor.session.setMode("ace/mode/python");

    document.getElementById("pattern-print").addEventListener("click", function() {
      editor.setValue(`def print_pattern(lines: int):
    iter: int = 1
    temp: int = 1

    while (iter < lines):
        print(temp)

        temp = temp*10 + 1
        iter = iter + 1

print_pattern(10)
`, -1);
    });

    document.getElementById("ex-class").addEventListener("click", function() {
      editor.setValue(`class Rat(object):
    n : int = 2
    d : int = 3
    def __init__(self : Rat):
        self.n = 200
        
    def new(self: Rat, a:int, b:int):
        self.n = a
        self.d = b
        
r1 : Rat = None
r1 = Rat()
r1.new(1, 2)
print(r1.n)
`, -1);2
    });
    
    document.getElementById("test-python").addEventListener("click", function() {
      editor.setValue(`a:int = 128
b:int = 12

temp1 : bool = False
temp2 : bool = not temp1

def assert_(cond:bool):
    temp:int = 0
    if not cond:
        temp = 1 // 0

def swap():
     temp: int = a

     a = b
     b = temp

def check_swap():
    a = 100
    b = 200
    
    assert_(a==100)
    assert_(b==200)

    swap()

    assert_(a==200)
    assert_(b==100)

def check_bools():
    assert_(True)
    assert_(not False)

def check_operators():
    assert_(1+1 == 2)
    assert_(1-1 == 0)
    assert_(0-1 == -1)
    assert_(1*0 == 0)
    assert_(2//2 == 1)
    assert_(5%3 == 2)
    assert_(5>0)
    assert_(5>-5)
    assert_(10<100)
    assert_(10!=1000)

def check_init():
    assert_(a == 128)
    assert_(b == 12)

def check_if():
	if temp1:
  		assert_(False)
	elif not temp2:
		assert_(False)
	elif not temp2:
		assert_(False)
	elif not temp2:
		assert_(False)
	elif not temp2:
		assert_(False)
	else:
		if not True:
			assert_(False)
		else:
			assert_(True)

print(1)

check_init()
print(2)

check_swap()
print(3)

check_bools()
print(4)

check_operators()
print(5)

check_if()
print(6)

pass

`, -1);
    });
    
    var importObject = {
      imports: {
	print_other: (arg: any) => {
	  const res = i64ToValue(arg, this.importObject.tableOffset);
	  if (res.tag == "bool") {
	    this.print_bool(res.value);
	    return NONE_BI;
	  } else if (res.tag == "num") {
	    const typ: Type = {tag: "number"};
	    const val = res.value;
	    this.print_num(val);
	    return NONE_BI;
	  } else if (res.tag == "none") {
	    this.print_none(undefined);
	  } else {
	    this.print({tag: res.tag} , undefined);
	    return NONE_BI;
	  }
	},
	print_num: (arg: number) => importObject.imports.print(NUM, arg),
	print_bool: (arg: number) => importObject.imports.print(BOOL, arg),
	print_none: (arg: number) => importObject.imports.print(NONE, arg),
	print_obj : (arg : any, classId: any) => {
	  const classObj: Value = {tag: "object", name: importObject.tableOffset.get(Number(classId)), address: arg};
	  const str = valueToStr(classObj);


          return this.print(str);
	},
	imported_func: (arg : any) => {
          console.log("Logging from WASM: ", arg);
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          elt.innerText = arg;
        },
	print: (typ: Type, arg : any) => {
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          elt.innerText = stringify(typ, arg);
        },

        print_global_func: (pos: number, value: number) => {
          var name = importObject.nameMap[pos];
          var msg = name + " = " + value;
          renderResult(msg);
        }

      },
      nameMap: new Array<string>(),
      tableOffset: new Map<number, string>(),
      
      updateNameMap : (env : GlobalEnv) => {
        env.globals.forEach((pos, name) => {
          importObject.nameMap[pos[1]] = name;
        })
      },
      
      updateTableMap : (env : GlobalEnv) => {
        env.classes.forEach((val, key) => {
	  console.log("setting tableOffset");
          importObject.tableOffset.set(val.tableOff, key);
        })
      }

    };

    const env = emptyEnv;
    var repl = new BasicREPL(importObject);

    function renderResult(result : any) : void {
      if (result === undefined || result == "None") {
	console.log("skip"); return;
      }
      
      const elt = document.createElement("pre");
      document.getElementById("output").appendChild(elt);
      elt.innerText = String(result);
    }

    function renderError(result : any) : void {
      const elt = document.createElement("pre");
      document.getElementById("output").appendChild(elt);
      elt.setAttribute("style", "color: red");
      elt.innerText = String(result);
    }


    function setupRepl() {
      document.getElementById("output").innerHTML = "";
      const replCodeElement = document.getElementById("next-code") as HTMLInputElement;
      replCodeElement.addEventListener("keypress", (e) => {
        if(e.key === "Enter" && !(e.shiftKey)) {
          const output = document.createElement("div");
          const prompt = document.createElement("span");
          prompt.innerText = "»";
          output.appendChild(prompt);
          const elt = document.createElement("textarea");
          // elt.type = "text";
          elt.disabled = true;
          elt.className = "repl-code";
          output.appendChild(elt);
          document.getElementById("output").appendChild(output);
          const source = replCodeElement.value;
          elt.value = source;
          replCodeElement.value = "";
          repl.run(source).then((r) => { renderResult(valueToStr(r)); console.log ("run finished") })
              .catch((e) => { renderError(e); console.log("run failed", e) });;
        }
      });
    }


    document.getElementById("run").addEventListener("click", function(e) {
      repl = new BasicREPL(importObject);

      // const sourceElem = document.getElementById("user-code") as HTMLTextAreaElement;
      const sourceElem = document.getElementById("user-code") as HTMLTextAreaElement;
      // const source = sourceElem.value.replace(/\t/g, '    ');
      const source = editor.getValue();
      setupRepl();
      //   const output = document.getElementById("output").innerHTML = "";
      repl.run(source).then((r) => { renderResult(valueToStr(r)); console.log ("run finished") })
        .catch((e) => { renderError(e); console.log("run failed", e) });;
    });
  });
}

webStart();
