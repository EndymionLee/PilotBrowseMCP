/**
 * PAB AST 节点定义
 */
export type Expr =
  | StringLiteral
  | NumberLiteral
  | BoolLiteral
  | NullLiteral
  | Identifier
  | BinOp
  | FnCall
  | PropAccess
  | ArrayList
  | DictLiteral
  | NotExpr
  | IndexAccess;

export type Stmt =
  | VarDecl
  | FnCallStmt
  | IfStmt
  | ForStmt
  | WhileStmt
  | FnDecl
  | RetryStmt
  | InputStmt
  | AssertStmt
  | BreakStmt
  | ContinueStmt
  | ReturnStmt;

export interface StringLiteral { kind: 'StringLiteral'; value: string; }
export interface NumberLiteral { kind: 'NumberLiteral'; value: number; }
export interface BoolLiteral { kind: 'BoolLiteral'; value: boolean; }
export interface NullLiteral { kind: 'NullLiteral'; }
export interface Identifier { kind: 'Identifier'; name: string; }
export interface BinOp { kind: 'BinOp'; left: Expr; op: string; right: Expr; }

export interface PropAccess { kind: 'PropAccess'; obj: Expr; prop: string; }
export interface ArrayList { kind: 'ArrayList'; elements: Expr[]; }
export interface DictLiteral { kind: 'DictLiteral'; entries: { key: string; value: Expr }[]; }
export interface NotExpr { kind: 'NotExpr'; expr: Expr; }

export interface IndexAccess { kind: 'IndexAccess'; obj: Expr; index: Expr; }

export interface FnCall {
  kind: 'FnCall';
  name: string;
  args: Expr[];
  kwargs: Record<string, Expr>;
}

export interface VarDecl { kind: 'VarDecl'; name: string; type?: string; value: Expr; }
export interface FnCallStmt { kind: 'FnCallStmt'; call: FnCall; retry?: number; retryWait?: number; }
export interface IfStmt { kind: 'IfStmt'; cond: Expr; body: Stmt[]; elifs: { cond: Expr; body: Stmt[] }[]; elseBody: Stmt[]; }
export interface ForStmt { kind: 'ForStmt'; varName: string; iter: Expr; body: Stmt[]; }
export interface WhileStmt { kind: 'WhileStmt'; cond: Expr; body: Stmt[]; }
export interface FnDecl { kind: 'FnDecl'; name: string; params: string[]; body: Stmt[]; }
export interface RetryStmt { kind: 'RetryStmt'; count: number; wait?: number; body: Stmt[]; }
export interface InputStmt { kind: 'InputStmt'; name: string; default?: string; }
export interface AssertStmt { kind: 'AssertStmt'; expr: Expr; msg?: string; }
export interface BreakStmt { kind: 'BreakStmt'; }
export interface ContinueStmt { kind: 'ContinueStmt'; }
export interface ReturnStmt { kind: 'ReturnStmt'; value?: Expr; }

export interface Program {
  kind: 'Program';
  stmts: Stmt[];
  fns: Map<string, FnDecl>;
  inputs: Map<string, string | undefined>;
}

// 工具函数：创建 AST 节点
export const ast = {
  string(v: string): StringLiteral { return { kind: 'StringLiteral', value: v }; },
  number(v: number): NumberLiteral { return { kind: 'NumberLiteral', value: v }; },
  bool(v: boolean): BoolLiteral { return { kind: 'BoolLiteral', value: v }; },
  null(): NullLiteral { return { kind: 'NullLiteral' }; },
  ident(name: string): Identifier { return { kind: 'Identifier', name }; },
  binop(left: Expr, op: string, right: Expr): BinOp { return { kind: 'BinOp', left, op, right }; },
  fncall(name: string, args: Expr[], kwargs: Record<string, Expr> = {}): FnCall {
    return { kind: 'FnCall', name, args, kwargs };
  },
  prop(obj: Expr, prop: string): PropAccess {
    return { kind: 'PropAccess', obj, prop };
  },
  array(elements: Expr[]): ArrayList {
    return { kind: 'ArrayList', elements };
  },
  dict(entries: { key: string; value: Expr }[]): DictLiteral {
    return { kind: 'DictLiteral', entries };
  },
  index(obj: Expr, index: Expr): IndexAccess { return { kind: 'IndexAccess', obj, index }; },
  not(expr: Expr): NotExpr {
    return { kind: 'NotExpr', expr };
  },
};
