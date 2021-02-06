// -*- mode: typescript; typescript-indent-level: 2; -*-

import { Expr, Parameter, Type } from "./ast";
import { GlobalEnv, ClassEnv, FuncEnv } from "./env";

export function getClassTableSize(className: string, env: GlobalEnv): number {
    const classRef: ClassEnv = env.classes.get(className);
    const memberFunCnt: number = (classRef.memberFuncs.size - 1); // Remove 1 for ctor
    const result: number = memberFunCnt * 8; // bytes
    
    return result;
}

export function getClassHeapSize(className: string, env: GlobalEnv): number {
    const classRef: ClassEnv = env.classes.get(className);
    const memberCnt: number = (classRef.memberVars.size + 1); // Extra one for the table offset ptr
    const result: number = memberCnt * 8; // bytes
    
    return result;
}

export function getClassMemVars(className: string, env: GlobalEnv): Map<string, [Expr, Type]> {
    const classRef: ClassEnv = env.classes.get(className);
    
    return classRef.memberVars;
}

