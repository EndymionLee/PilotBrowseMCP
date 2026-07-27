/**
 * PAB Parser - 语法分析器
 *
 * 输入：Token 流
 * 输出：AST Program
 */
import { TokenType, type Token } from './token.js';
import { ast, type Expr, type Stmt, type FnCall, type Program, type FnDecl } from './ast.js';

export class ParseError extends Error {
  constructor(msg: string, token: Token) {
    super(`[${token.line}:${token.col}] ${msg}`);
  }
}

export class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Program {
    const stmts: Stmt[] = [];
    const fns = new Map<string, FnDecl>();
    const inputs = new Map<string, string | undefined>();

    while (!this.eof()) {
      const stmt = this.parseStmt();
      if (stmt) {
        // 收集 fn 和 input 声明
        if (stmt.kind === 'FnDecl') fns.set(stmt.name, stmt);
        if (stmt.kind === 'InputStmt') inputs.set(stmt.name, stmt.default);
        stmts.push(stmt);
      }
    }
    return { kind: 'Program', stmts, fns, inputs };
  }

  private parseStmt(): Stmt | null {
    this.skipNewlines();
    if (this.eof()) return null;

    const t = this.peek();

    // fn name(...): 函数定义
    if (t.type === TokenType.Fn) return this.parseFnDecl();

    // input name
    if (t.type === TokenType.Input) return this.parseInput();

    // retry N: 重试块
    if (t.type === TokenType.Retry) return this.parseRetry();

    // if cond:
    if (t.type === TokenType.If) return this.parseIf();

    // for var in expr:
    if (t.type === TokenType.For) return this.parseFor();

    // while cond:
    if (t.type === TokenType.While) return this.parseWhile();

    // assert expr
    if (t.type === TokenType.Assert) return this.parseAssert();

    // break / continue
    if (t.type === TokenType.Break) { this.advance(); return { kind: 'BreakStmt' }; }
    if (t.type === TokenType.Continue) { this.advance(); return { kind: 'ContinueStmt' }; }

    // identifier 开头：可能是赋值或函数调用
    if (t.type === TokenType.Identifier) {
      const name = t.value;
      this.advance();
      // name = expr 或 name: type = expr
      if (this.peek().type === TokenType.Assign) {
        this.advance(); // skip =
        const value = this.parseExpr();
        this.expectNewline();
        return { kind: 'VarDecl', name, value };
      }
      if (this.peek().type === TokenType.Colon) {
        this.advance(); // skip :
        const typeName = this.expect(TokenType.Identifier).value;
        this.expect(TokenType.Assign);
        const value = this.parseExpr();
        this.expectNewline();
        return { kind: 'VarDecl', name, type: typeName, value };
      }
      // name(args) 函数调用
      if (this.peek().type === TokenType.LParen) {
        const call = this.parseFnCall(name);
        let retry: number | undefined;
        let retryWait: number | undefined;
        if (this.peek().type === TokenType.Retry) {
          this.advance();
          const countTok = this.peek();
          this.advance();
          retry = parseInt(countTok.value);
          if (this.peek().type === TokenType.Identifier && this.peek().value === 'wait') {
            this.advance();
            const waitTok = this.peek();
            this.advance();
            retryWait = parseInt(waitTok.value);
          }
        }
        this.expectNewline();
        return { kind: 'FnCallStmt', call, retry, retryWait };
      }
      throw new ParseError(`Unexpected token after identifier '${name}'`, this.peek());
    }

    // 不能识别的语句（如空行后的 Dedent），跳过
    return null;
  }

  // === 表达式 ===

  private parseExpr(): Expr {
    return this.parseBinOp();
  }

  private parseBinOp(): Expr {
    let left = this.parsePrimary();

    while (this.peek().type === TokenType.Plus || this.peek().type === TokenType.Minus ||
           this.peek().type === TokenType.Star || this.peek().type === TokenType.Slash ||
           this.peek().type === TokenType.Eq || this.peek().type === TokenType.Neq ||
           this.peek().type === TokenType.Lt || this.peek().type === TokenType.Gt ||
           this.peek().type === TokenType.Le || this.peek().type === TokenType.Ge ||
           this.peek().type === TokenType.In) {
      const op = this.advance().value;
      const right = this.parsePrimary();
      left = ast.binop(left, op, right);
    }
    return left;
  }

  private parsePrimary(): Expr {
    const t = this.peek();

    if (t.type === TokenType.Not) { this.advance(); return ast.not(this.parsePrimary()); }
    if (t.type === TokenType.String) { this.advance(); return ast.string(t.value); }
    if (t.type === TokenType.Number) { this.advance(); return ast.number(parseFloat(t.value)); }
    if (t.type === TokenType.True) { this.advance(); return ast.bool(true); }
    if (t.type === TokenType.False) { this.advance(); return ast.bool(false); }
    if (t.type === TokenType.Null) { this.advance(); return ast.null(); }

    if (t.type === TokenType.LBrace) {
      this.advance();
      const entries: { key: string; value: Expr }[] = [];
      while (this.peek().type !== TokenType.RBrace && !this.eof()) {
        const key = this.expect(TokenType.Identifier).value;
        this.expect(TokenType.Colon);
        entries.push({ key, value: this.parseExpr() });
        if (this.peek().type === TokenType.Comma) this.advance();
      }
      this.expect(TokenType.RBrace);
      return ast.dict(entries);
    }

    if (t.type === TokenType.LBracket) {
      this.advance();
      const elements: Expr[] = [];
      while (this.peek().type !== TokenType.RBracket && !this.eof()) {
        elements.push(this.parseExpr());
        if (this.peek().type === TokenType.Comma) this.advance();
      }
      this.expect(TokenType.RBracket);
      return ast.array(elements);
    }

    if (t.type === TokenType.LParen) {
      this.advance();
      const expr = this.parseExpr();
      this.expect(TokenType.RParen);
      return expr;
    }

    function parsePostfix(expr: Expr, parser: Parser): Expr {
      while (true) {
        if (parser.peek().type === TokenType.Dot) {
          parser.advance();
          const prop = parser.expect(TokenType.Identifier).value;
          expr = ast.prop(expr, prop);
        } else if (parser.peek().type === TokenType.LBracket) {
          parser.advance();
          const index = parser.parseExpr();
          parser.expect(TokenType.RBracket);
          expr = ast.index(expr, index);
        } else { break; }
      }
      return expr;
    }

    if (t.type === TokenType.Identifier) {
      const name = t.value;
      this.advance();
      if (this.peek().type === TokenType.LParen) {
        let expr: Expr = this.parseFnCall(name);
        return parsePostfix(expr, this);
      }
      let expr: Expr = ast.ident(name);
      return parsePostfix(expr, this);
    }

    const hints = {
      If: "Expected if cond:", For: "Expected for var in expr:", While: "Expected while cond:",
      Fn: "Expected fn name():", Colon: "Expected : - did you forget it?",
      In: "'in' used in 'for x in list' or 'if x in list'",
      Dedent: "Check indentation", RParen: "Unclosed '('",
    };
    throw new ParseError(hints[t.type] || "Unexpected token", t);
  }

  private parseFnCall(name: string): FnCall {
    this.expect(TokenType.LParen);
    const args: Expr[] = [];
    const kwargs: Record<string, Expr> = {};

    while (this.peek().type !== TokenType.RParen && !this.eof()) {
      // 检查是否是 keyword 参数 (name=value)
      let isKwarg = false;
      if (this.peek().type === TokenType.Identifier && this.tokens[this.pos + 1]?.type === TokenType.Assign) {
        const kwName = this.advance().value;
        this.advance(); // skip =
        kwargs[kwName] = this.parseExpr();
        isKwarg = true;
      } else {
        args.push(this.parseExpr());
      }
      if (this.peek().type === TokenType.Comma) this.advance();
      if (isKwarg) continue;
    }
    this.expect(TokenType.RParen);
    return ast.fncall(name, args, kwargs);
  }

  // === 语句 ===

  private parseBlock(): Stmt[] {
    this.expect(TokenType.Colon);
    this.expect(TokenType.Newline);
    this.expect(TokenType.Indent);
    const stmts: Stmt[] = [];
    while (this.peek().type !== TokenType.Dedent && !this.eof()) {
      const s = this.parseStmt();
      if (s) stmts.push(s);
    }
    this.expect(TokenType.Dedent);
    return stmts;
  }

  private parseIf(): IfStmt {
    this.advance(); // if
    const cond = this.parseExpr();
    const body = this.parseBlock();
    const elifs: { cond: Expr; body: Stmt[] }[] = [];
    let elseBody: Stmt[] = [];

    while (this.peek().type === TokenType.Else && this.tokens[this.pos + 1]?.type === TokenType.If) {
      this.advance(); this.advance(); // else if
      const econd = this.parseExpr();
      const ebody = this.parseBlock();
      elifs.push({ cond: econd, body: ebody });
    }

    if (this.peek().type === TokenType.Else) {
      this.advance(); // else
      elseBody = this.parseBlock();
    }

    return { kind: 'IfStmt', cond, body, elifs, elseBody };
  }

  private parseFor(): ForStmt {
    this.advance(); // for
    const varName = this.expect(TokenType.Identifier).value;
    this.expect(TokenType.In);
    const iter = this.parseExpr();
    const body = this.parseBlock();
    return { kind: 'ForStmt', varName, iter, body };
  }

  private parseWhile(): WhileStmt {
    this.advance(); // while
    const cond = this.parseExpr();
    const body = this.parseBlock();
    return { kind: 'WhileStmt', cond, body };
  }

  private parseFnDecl(): FnDecl {
    this.advance(); // fn
    const name = this.expect(TokenType.Identifier).value;
    this.expect(TokenType.LParen);
    const params: string[] = [];
    while (this.peek().type !== TokenType.RParen && !this.eof()) {
      params.push(this.expect(TokenType.Identifier).value);
      if (this.peek().type === TokenType.Comma) this.advance();
    }
    this.expect(TokenType.RParen);
    const body = this.parseBlock();
    return { kind: 'FnDecl', name, params, body };
  }

  private parseRetry(): RetryStmt {
    this.advance(); // retry
    const count = parseInt(this.expect(TokenType.Number).value);
    let wait: number | undefined;
    if (this.peek().type === TokenType.Identifier && this.peek().value === 'wait') {
      this.advance();
      wait = parseInt(this.expect(TokenType.Number).value);
    }
    const body = this.parseBlock();
    return { kind: 'RetryStmt', count, wait, body };
  }

  private parseInput(): InputStmt {
    this.advance(); // input
    const name = this.expect(TokenType.Identifier).value;
    let defaultVal: string | undefined;
    this.expectNewline();
    return { kind: 'InputStmt', name, default: defaultVal };
  }

  private parseAssert(): AssertStmt {
    this.advance(); // assert
    const expr = this.parseExpr();
    let msg: string | undefined;
    if (this.peek().type === TokenType.Comma) {
      this.advance();
      msg = this.expect(TokenType.String).value;
    }
    this.expectNewline();
    return { kind: 'AssertStmt', expr, msg };
  }

  // === 工具 ===

  private peek(): Token { return this.tokens[this.pos] || this.tokens[this.tokens.length - 1]; }
  private advance(): Token { return this.tokens[this.pos++] || this.tokens[this.tokens.length - 1]; }
  private eof(): boolean { return this.pos >= this.tokens.length || this.peek().type === TokenType.EOF; }

  private expect(type: TokenType): Token {
    const t = this.peek();
    if (t.type !== type) throw new ParseError(`Expected ${type}, got ${t.value}`, t);
    return this.advance();
  }

  private expectIdent(value: string): void {
    const t = this.peek();
    if (t.type !== TokenType.Identifier || t.value !== value) throw new ParseError(`Expected '${value}'`, t);
    this.advance();
  }

  private expectNewline(): void {
    if (this.peek().type === TokenType.Newline) this.advance();
  }

  private skipNewlines(): void {
    while (this.peek().type === TokenType.Newline) this.advance();
  }
}
