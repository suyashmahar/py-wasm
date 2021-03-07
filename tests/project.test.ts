// -*- mode: typescript; typescript-indent-level: 2; -*-

import { PyInt, PyBool, PyNone, PyStr, NUM, CLASS } from "../utils";
import { assert, asserts, assertPrint, assertTCFail, assertTC, assertFail } from "./utils.test";

const initStrs = `t0: str = "Hello!"\nt1: str = "World"\nnumbers: str = "1 2 3 4 5 6 7 8"`;

describe("String tests", () => {
  assert("static-allocation-0", `t0: str = "Hello! world\nt1: str = "Hmmm..."\nt1`, PyStr(44));
  assert("static-allocation-1", `t0: str = "Hello! world\nt1: str = "Hmmm..."\nt0`, PyStr(32));

  assertPrint("concat-0", `${initStrs}\nprint(t0 + " " + t1)`, [`Hello! World`]);
  assertPrint("concat-1", `${initStrs}\nt3: str = t0 + " "\nprint(t3 + t1)`, [`Hello! World`]);

  assertPrint("slice-single-literal", `${initStrs}\nprint("ABCDEF"[3])`, [`D`]);
  assertPrint("slice-single-var", `${initStrs}\nprint(t0[3])`, [`l`]);
  assertPrint("slice-range-literal", `${initStrs}\nprint("ABCDEF"[0:3])`, [`ABC`]);
  assertPrint("slice-range-var", `${initStrs}\nt2: str = t0 + " " + t1\nprint(t2[3:5])`, [`lo`]);

  assertPrint("slice-range-step", `nums: str = "1 2 3 4 5 6"\nprint(nums[0:len(nums):2])`, [`123456`]);

  assertPrint("slice-single-neg-0", `${initStrs}\nprint(numbers[-1])`, [`8`]);
  assertPrint("slice-single-neg-1", `${initStrs}\nprint(numbers[-2])`, [` `]);
  assertPrint("slice-single-neg-2", `${initStrs}\nprint(numbers[-3])`, [`7`]);

  assertPrint("slice-range-neg-0", `${initStrs}\nprint(numbers[0:-5])`, [`1 2 3 4 5 `]);
  assertPrint("slice-range-neg-1", `${initStrs}\nprint(numbers[-4:-1])`, [` 7 `]);
  assertPrint("slice-range-neg-2", `${initStrs}\nprint(numbers[-4:-3])`, [` `]);
  assertPrint("slice-range-neg-3", `${initStrs}\nprint(numbers[-4:-4])`, [``]);
  
  assertPrint("slice-range-rev-neg-0", `${initStrs}\nprint(numbers[-5:0])`, [``]);
  assertPrint("slice-range-rev-neg-1", `${initStrs}\nprint(numbers[-1:-4])`, [``]);
  assertPrint("slice-range-rev-neg-2", `${initStrs}\nprint(numbers[-3:-4])`, [``]);
  assertPrint("slice-range-rev-neg-3", `${initStrs}\nprint(numbers[-4:-4])`, [``]);

  assertPrint("for-loop", `${initStrs}\niter: str = None\nfor iter in t0:\n  print(iter)`, [`H`, `e`, `l`, `l`, `o`, `!`]);
  assertPrint("for-loop-comparison", `${initStrs}\niter: str = None\nfor iter in t0:\n  if iter == "H":\n    print(iter)`, [`H`]);


  assertPrint("escape-newline", `print("\\n")`, [``,``]);
  assertPrint("escape-tab", `print("\\t")`, [`\t`]);
  assertPrint("escape-escape", `print("\\\\")`, [`\\`]);
  assertPrint("escape-quote", `print("\\"")`, [`"`]);

  assertPrint("slice-escape-newline", `print(" \\n"[1])`, [``,``]);
  assertPrint("slice-escape-tab", `print(" \\t"[1])`, [`\t`]);
  assertPrint("slice-escape-escape", `print(" \\\\"[1])`, [`\\`]);
  assertPrint("slice-escape-quote", `print(" \\""[1])`, [`"`]);

  assertPrint("str-len-newline", `print(len("\\n"))`, [`1`]);
  assertPrint("str-len-tab", `print(len("\\t"))`, [`1`]);
  assertPrint("str-len-quote", `print(len("\\""))`, [`1`]);
  assertPrint("str-len-escape", `print(len("\\\\"))`, [`1`]);

  assertPrint("str-print-literal-0", `print("test_string")`, ["test_string"]);
  assertPrint("str-print-literal-1", `print("1234567890")`, ["1234567890"]);
  assertPrint("str-print-literal-2", `print("a")`, ["a"]);
  
  assert("str-len-0", `len("12345678")`, PyInt(8));
  assert("str-len-0", `a:str = "12345678"\nlen(a)`, PyInt(8));
  assert("str-len-1", `${initStrs}\nlen(t0)`, PyInt(6));

  assert("str-comparison-equality-true", `"a" == "a"`, PyBool(true));
  assert("str-comparison-inequality-true", `"a" != "b"`, PyBool(true));
  assert("str-comparison-equality-false", `"a" == "b"`, PyBool(false));
  assert("str-comparison-inequality-false", `"a" != "a"`, PyBool(false));

  assert("str-comparison-long-0", `"abcdefabcdef" == "abcdefabcdef"`, PyBool(true));
  assert("str-comparison-slice-0", `"abcdefabcdef"[1:3] == "abcdefabcdef"[1:3]`, PyBool(true));
  assert("str-comparison-slice-1", `"abcdefabcdef"[4] == "abcdefabcdef"[4]`, PyBool(true));
  assert("str-comparison-slice-2", `"abcdefabcdef"[-1] == "abcdefabcdef"[-1]`, PyBool(true));

});