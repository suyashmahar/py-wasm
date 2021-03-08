// -*- mode: typescript; typescript-indent-level: 2; -*-

import * as cmn from "../common";

export function str_eq(importObject: any) {
  return (offBigInt1: any, offBigInt2: any): any => {
    const lower32Mask = ((BigInt(1)<<BigInt(32)) - BigInt(1));
    const off1: number = Number(offBigInt1 & lower32Mask);
    const off2: number = Number(offBigInt2 & lower32Mask);

    const memUint8 = importObject.imports.get_uint8_repr();
    
    // Copy the first and second strings
    var siter1: number = off1;
    var siter2: number = off2;

    var result = true;
    
    while (memUint8[siter1] != 0 && memUint8[siter2] != 0) {
      if (memUint8[siter1] != memUint8[siter2]) {
	result = false;
	break;
      }	
      siter1 += 1;
      siter2 += 1;
    }

    return (result ? cmn.TRUE_BI : cmn.FALSE_BI);
  };
}

export function str_neq(importObject: any) {
  return (offBigInt1: any, offBigInt2: any): any => {
    const result = importObject.imports.str_eq(offBigInt1, offBigInt2);

    return result == cmn.TRUE_BI ? cmn.FALSE_BI : cmn.TRUE_BI;
  };
}

export function str_concat(importObject: any) {
  return (offBigInt1: any, offBigInt2: any): any => {
    const off1: number = Number(offBigInt1 - cmn.STR_BI);
    const off2: number = Number(offBigInt2 - cmn.STR_BI);

    const len1: number = Number(importObject.imports.str_len(offBigInt1));
    const len2: number = Number(importObject.imports.str_len(offBigInt2));
    const newLen = len1 + len2 + 1;

    const heapPtr = Number(importObject.imports.malloc(newLen));
    const memUint8 = importObject.imports.get_uint8_repr();
    
    // Copy the first and second strings
    var diter: number = heapPtr;
    var siter: number = off1;

    while (siter < off1 + len1) {
      memUint8[diter] = memUint8[siter];
      siter += 1;
      diter += 1;
    }
    
    siter = off2;
    while (siter < off2 + len2) {
      memUint8[diter] = memUint8[siter];
      siter += 1;
      diter += 1;
    }
    memUint8[diter] = 0; // Add the final null char

    // Return pointer to the new string
    return cmn.STR_BI + BigInt(heapPtr);
  };
}

export function str_len(importObject: any) {
  return (offBigInt: any): any => {
    const off: number = Number(offBigInt - cmn.STR_BI);
    
    const memBuffer: ArrayBuffer = (importObject as any).js.memory.buffer;
    const memUint8 = new Uint8Array(memBuffer);

    var iter = off;
    while (memUint8[iter] != 0) {
      iter += 1;
    }

    return BigInt(iter - off);
  };
}

export function str_mult(importObject: any) {
  return (str: any, times: any): any => {
    const strLen: number = Number(importObject.imports.str_len(str));
    const strOff: number = Number(str - cmn.STR_BI);
    
    const newLen: number = strLen * Number(times) + 1;

    const newStr = Number(importObject.imports.malloc(newLen));
    const memUint8 = importObject.imports.get_uint8_repr();
    
    var iter = 0;
    while (iter < times) {

      var strIter = 0;

      while (strIter < strLen) {
	memUint8[newStr + iter*strLen + strIter] = memUint8[strOff + strIter];
	strIter += 1;
      }
      iter += 1;
    }

    return BigInt(newStr) + cmn.STR_BI;
  };
}

export function str_slice(importObject: any) {
  return (str: any, arg1: any, arg2: any, arg3: any, explicitArgs: any): any => {
    const strOff: number = Number(str - cmn.STR_BI);
    const strLen: number = Number(importObject.imports.str_len(str));
    const memUint8 = importObject.imports.get_uint8_repr();

    const getSign  = (arg: any) => { return Number(arg)/Math.abs(Number(arg)); }
    const arg1Sign = getSign(arg1);
    const arg2Sign = (arg2 != cmn.NONE_BI) ? getSign(arg2) : 1;
    const arg3Sign = (arg3 != cmn.NONE_BI) ? getSign(arg3) : 1;
    
    
    /* Add the missing arguments */
    if (arg1 == cmn.NONE_BI && explicitArgs > 1) {
      if (arg3Sign == 1) {
	arg1 = 0;
      } else {
	arg1 = BigInt(-1);
      }
    }

    if (arg2 == cmn.NONE_BI && explicitArgs > 1) {
      if (arg3Sign == 1) {
	arg2 = BigInt(strLen);
      } else {
	arg2 = BigInt(0);
      }
    } 

    /* Copy the first and second strings */
    var siter: number = strOff + (strLen + Number(arg1))%strLen;

    var end = siter + 1;
    var step = 1;

    
    // Fix out of bound index
    if (Math.abs(Number(arg1)) > strLen) {
      arg1 = BigInt(strLen) * BigInt(arg1Sign);
    }
    
    if (arg2 != cmn.NONE_BI) {
      // Fix out of bound index
      if (Math.abs(Number(arg2)) > strLen) {
	arg2 = BigInt(strLen) * BigInt(arg2Sign);
      }	

      if (arg1Sign == arg2Sign && Number(arg1) > Number(arg2)) {
	/* Invalid bound, return empty string */
	end = siter;
      }

      if (Number(arg2) > 0) {
	end = strOff + Number(arg2);
	if (end > strOff + strLen) {
	  end = strOff + strLen;
	}
      } else {
	end = strOff + (strLen + Number(arg2))%strLen;
      }
    }

    if (arg3 != cmn.NONE_BI) {
      step = Number(arg3);
    }
    
    const resultOff = Number(importObject.imports.malloc(end-siter));
    var diter: number = resultOff;
    
    while ((step > 0 && siter < end) || (step < 0 && siter >= end)) {
      memUint8[diter] = memUint8[siter];
      siter += step;
      diter += 1;
    }
    
    memUint8[diter] = 0;

    // Return pointer to the new string
    return cmn.STR_BI + BigInt(resultOff);
  };    
}
