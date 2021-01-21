// -*- mode: typescript; typescript-indent-level: 2; -*-

import {run} from './runner';


function webStart() {
  document.addEventListener("DOMContentLoaded", function() {
    var importObject = {
      imports: {
        print: (arg : any) => {
	  console.log(arg);
	  var processedArg = arg;
	  console.log(typeof arg);
	  
	  if ((arg & BigInt(1<<63)) != BigInt(0)) {
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
      },
    };

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

    document.getElementById("run").addEventListener("click", function(e) {
      const source = document.getElementById("user-code") as HTMLTextAreaElement;
      const output = document.getElementById("output").innerHTML = "";
      run(source.value, {importObject}).then((r) => { renderResult(r); console.log ("run finished") })
          .catch((e) => { renderError(e); console.log("run failed", e) });;
    });
  });
}

webStart();
