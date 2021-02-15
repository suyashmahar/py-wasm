import { Pos } from "./ast";

export const dummyPos: Pos = { line: 0, col: 0, len: 0 };

export function padNum(num: number, width: number): string {
  return String(num).padStart(width, " ");
}

export function getDecorator(pos: Pos, source: string): string {
  const splitSource = source.split("\n");
  var errLinesArr = [padNum(pos.line-1, 4) + "| " + splitSource[pos.line-2],
		       padNum(pos.line, 4) + "| " + splitSource[pos.line-1]];

  if (pos.line == 1) {
    errLinesArr = [errLinesArr[1]];
  }
  
  const errLines = errLinesArr.join("\n");
  const decorator = " ".repeat(pos.col+5) + "^".repeat(pos.len);
  
  return [errLines, decorator].join("\n");
}

export function genericError(errType: string, pos: Pos, msg: string, source: string): never {
  const errTxt = `${errType}: ${msg}`
  
  const text: string = [getDecorator(pos, source), errTxt].join('\n');
  throw text;
}

export const typeError = (pos: Pos, msg: string, source: string): never => genericError('TypeError', pos, msg, source);
export const symLookupError = (pos: Pos, msg: string, source: string): never => genericError('SymbolLookupError', pos, msg, source);
export const argError = (pos: Pos, msg: string, source: string): never => genericError('ArgumentError', pos, msg, source);
export const scopeError = (pos: Pos, msg: string, source: string): never => genericError('ScopeError', pos, msg, source);
export const valError = (pos: Pos, msg: string, source: string): never => genericError('ValueError', pos, msg, source);

export const parseError = (pos: Pos, msg: string, source: string): never => genericError('ParseError', pos, msg, source);
export function internalError(): never {
    const errTxt = `CompilerError: An internal function ran into an invalid state. Please report this bug to the compiler devs.`;
    throw errTxt;
}

