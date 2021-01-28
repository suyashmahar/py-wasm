// -*- mode: typescript; typescript-indent-level: 2; -*-

import {BasicREPL} from './repl';
import {emptyEnv, GlobalEnv} from './compiler';
import {run} from './runner';


function webStart() {

  document.addEventListener("DOMContentLoaded", function() {
    var importObject = {
      imports: {
        print: (arg : any) => {
	  console.log(arg);
	  var processedArg = arg;
	  console.log(typeof arg);
	  if (((arg & BigInt(1)<<BigInt(62)) != BigInt(0))
	    && ((arg & BigInt(1)<<BigInt(63)) == BigInt(0))) {
	    console.log("Found boolean type in print function");
	    const mask = ((BigInt(1)<<BigInt(62))-BigInt(1));
	    const boolVal = Number(arg & mask);
	    console.log("boolVal " + boolVal.toString());
	    if (boolVal == 0) {
	      processedArg = "False";
	    } else {
	      processedArg = "True";
	    }
	  }

	  if (arg == BigInt(1)<<BigInt(61)) {
	    processedArg = "None";
	  }
	  
          console.log("Logging from WASM: ", processedArg);
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          elt.innerText = processedArg;
          return arg;
        },
        abs: (arg : any) => {
          return Math.abs(arg);
        },
        max: (arg1 : any, arg2 : any) => {
	  return arg1 > arg2 ? arg1 : arg2;
        },
        min: (arg1 : any, arg2: any) => {
	  return arg2 > arg1 ? arg1 : arg2;
        },
        pow: (arg1 : any, arg2 : any) => {
          return Math.pow(arg1, arg2);
        },
	imported_func: (arg : any) => {
          console.log("Logging from WASM: ", arg);
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          elt.innerText = arg;
        },

        print_global_func: (pos: number, value: number) => {
          var name = importObject.nameMap[pos];
          var msg = name + " = " + value;
          renderResult(msg);
        }

      },
      nameMap: new Array<string>(),
      
      updateNameMap : (env : GlobalEnv) => {
        env.globals.forEach((pos, name) => {
          importObject.nameMap[pos] = name;
        })
      }

    };

    const env = emptyEnv;
    var repl = new BasicREPL(importObject);

    function renderResult(result : any) : void {
      if(result === undefined) { console.log("skip"); return; }
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
          repl.run(source).then((r) => { renderResult(r); console.log ("run finished") })
              .catch((e) => { renderError(e); console.log("run failed", e) });;
        }
      });
    }


    document.getElementById("run").addEventListener("click", function(e) {
      repl = new BasicREPL(importObject);
      const source = document.getElementById("user-code") as HTMLTextAreaElement;
      setupRepl();
      //   const output = document.getElementById("output").innerHTML = "";
      repl.run(source.value).then((r) => { renderResult(r); console.log ("run finished") })
        .catch((e) => { renderError(e); console.log("run failed", e) });;
    });
  });
}

webStart();
