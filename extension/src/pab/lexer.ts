/**
 * PAB Lexer - 词法分析器
 *
 * 输入：PAB 源码字符串
 * 输出：Token 流
 */
import { TokenType, type Token } from './token.js';

const KEYWORDS: Record<string, TokenType> = {
  if: TokenType.If, else: TokenType.Else, for: TokenType.For, while: TokenType.While,
  fn: TokenType.Fn, retry: TokenType.Retry, input: TokenType.Input,
  in: TokenType.In,
  true: TokenType.True, false: TokenType.False, null: TokenType.Null,
  not: TokenType.Not, break: TokenType.Break, continue: TokenType.Continue, assert: TokenType.Assert,
  str: TokenType.Identifier, int: TokenType.Identifier, bool: TokenType.Identifier, list: TokenType.Identifier,
};

export class Lexer {
  private source: string;
  private pos = 0;
  private line = 1;
  private col = 1;
  private indentStack: number[] = [0];
  private lineStart = true;
  private currentIndent = 0;

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.pos < this.source.length) {
      // 行首处理缩进
      if (this.lineStart) {
        this.lineStart = false;
        this.currentIndent = this.countIndent();
        // 空行跳过
        if (this.peek() === '\n' || this.peek() === '\r') continue;
        if (this.pos >= this.source.length) break;

        const prev = this.indentStack[this.indentStack.length - 1];
        if (this.currentIndent > prev) {
          this.indentStack.push(this.currentIndent);
          tokens.push(this.makeToken(TokenType.Indent, ''));
        } else if (this.currentIndent < prev) {
          while (this.indentStack.length > 1 && this.currentIndent < this.indentStack[this.indentStack.length - 1]) {
            this.indentStack.pop();
            tokens.push(this.makeToken(TokenType.Dedent, ''));
          }
        }
      }

      const ch = this.source[this.pos];

      // 换行
      if (ch === '\n') {
        this.advance();
        this.line++;
        this.col = 1;
        this.lineStart = true;
        tokens.push(this.makeToken(TokenType.Newline, '\\n'));
        continue;
      }
      if (ch === '\r') { this.advance(); continue; }

      // 空格
      if (ch === ' ' || ch === '\t') { this.advance(); continue; }

      // 注释
      if (ch === '#') {
        this.skipLine();
        continue;
      }

      // 字符串
      if (ch === '"' || ch === "'") {
        tokens.push(this.readString(ch));
        continue;
      }

      // 数字
      if (this.isDigit(ch)) {
        tokens.push(this.readNumber());
        continue;
      }

      // 标识符 / 关键字
      if (this.isAlpha(ch) || ch === '_') {
        tokens.push(this.readIdentifier());
        continue;
      }

      // 运算符和分隔符
      const twoChar = ch + this.peekNext();
      switch (twoChar) {
        case '==': tokens.push(this.makeToken(TokenType.Eq, '==')); this.advance(); this.advance(); continue;
        case '!=': tokens.push(this.makeToken(TokenType.Neq, '!=')); this.advance(); this.advance(); continue;
        case '<=': tokens.push(this.makeToken(TokenType.Le, '<=')); this.advance(); this.advance(); continue;
        case '>=': tokens.push(this.makeToken(TokenType.Ge, '>=')); this.advance(); this.advance(); continue;
      }
      switch (ch) {
        case '=': this.addToken(tokens, TokenType.Assign, '='); break;
        case '<': this.addToken(tokens, TokenType.Lt, '<'); break;
        case '>': this.addToken(tokens, TokenType.Gt, '>'); break;
        case '+': this.addToken(tokens, TokenType.Plus, '+'); break;
        case '-': this.addToken(tokens, TokenType.Minus, '-'); break;
        case '*': this.addToken(tokens, TokenType.Star, '*'); break;
        case '/': this.addToken(tokens, TokenType.Slash, '/'); break;
        case '(': this.addToken(tokens, TokenType.LParen, '('); break;
        case ')': this.addToken(tokens, TokenType.RParen, ')'); break;
        case '{': this.addToken(tokens, TokenType.LBrace, '{'); break;
        case '}': this.addToken(tokens, TokenType.RBrace, '}'); break;
        case '[': this.addToken(tokens, TokenType.LBracket, '['); break;
        case ']': this.addToken(tokens, TokenType.RBracket, ']'); break;
        case ',': this.addToken(tokens, TokenType.Comma, ','); break;
        case '.': this.addToken(tokens, TokenType.Dot, '.'); break;
        case ':': this.addToken(tokens, TokenType.Colon, ':'); break;
        default:
          throw new Error(`Unexpected character '${ch}' at line ${this.line}, col ${this.col}`);
      }
      this.advance();
    }

    // 闭合缩进
    while (this.indentStack.length > 1) {
      this.indentStack.pop();
      tokens.push(this.makeToken(TokenType.Dedent, ''));
    }
    tokens.push(this.makeToken(TokenType.EOF, ''));

    // 合并相邻的 Newline（多个空行算一个）
    const merged: Token[] = [];
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === TokenType.Newline && tokens[i + 1]?.type === TokenType.Newline) continue;
      merged.push(tokens[i]);
    }
    return merged;
  }

  private addToken(tokens: Token[], type: TokenType, value: string): void {
    tokens.push({ type, value, line: this.line, col: this.col });
  }

  private makeToken(type: TokenType, value: string): Token {
    return { type, value, line: this.line, col: this.col };
  }

  private advance(): void {
    this.pos++;
    this.col++;
  }

  private peek(): string { return this.source[this.pos] || ''; }
  private peekNext(): string { return this.source[this.pos + 1] || ''; }

  private isDigit(ch: string): boolean { return ch >= '0' && ch <= '9'; }
  private isAlpha(ch: string): boolean { return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_'; }
  private isAlphaNum(ch: string): boolean { return this.isAlpha(ch) || this.isDigit(ch); }

  private countIndent(): number {
    let count = 0;
    while (this.pos < this.source.length && (this.source[this.pos] === ' ' || this.source[this.pos] === '\t')) {
      count++;
      this.advance();
    }
    return count;
  }

  private skipLine(): void {
    while (this.pos < this.source.length && this.source[this.pos] !== '\n') this.advance();
  }

  private readString(quote: string): Token {
    const startLine = this.line;
    const startCol = this.col;
    this.advance(); // skip opening quote
    let value = '';
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === quote) { this.advance(); return { type: TokenType.String, value, line: startLine, col: startCol }; }
      if (ch === '\\') { this.advance(); value += this.source[this.pos] || ''; this.advance(); continue; }
      value += ch;
      this.advance();
    }
    throw new Error(`Unterminated string at line ${startLine}`);
  }

  private readNumber(): Token {
    const startCol = this.col;
    let value = '';
    while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) { value += this.source[this.pos]; this.advance(); }
    if (this.source[this.pos] === '.' && this.isDigit(this.source[this.pos + 1])) {
      value += '.';
      this.advance();
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) { value += this.source[this.pos]; this.advance(); }
    }
    return { type: TokenType.Number, value, line: this.line, col: startCol };
  }

  private readIdentifier(): Token {
    const startCol = this.col;
    let value = '';
    while (this.pos < this.source.length && this.isAlphaNum(this.source[this.pos])) { value += this.source[this.pos]; this.advance(); }
    const type = KEYWORDS[value] || TokenType.Identifier;
    return { type, value, line: this.line, col: startCol };
  }
}
