/**
 * PAB Lexer - Token 定义
 */
export enum TokenType {
  // 关键字
  If = 'If', Else = 'Else', For = 'For', While = 'While',
  Fn = 'Fn', Retry = 'Retry', Input = 'Input',
  True = 'True', False = 'False', Null = 'Null',
  Break = 'Break', Continue = 'Continue', Assert = 'Assert',

  // 标识符 / 字面量
  Identifier = 'Identifier',
  String = 'String', Number = 'Number',

  // 运算符
  Assign = 'Assign', In = 'In', Not = 'Not',
  Eq = 'Eq',                   // ==
  Neq = 'Neq',                 // !=
  Lt = 'Lt', Gt = 'Gt',        // < >
  Le = 'Le', Ge = 'Ge',        // <= >=
  Plus = 'Plus', Minus = 'Minus',
  Star = 'Star', Slash = 'Slash',

  // 分隔符
  LParen = 'LParen', RParen = 'RParen',       // ( )
  LBrace = 'LBrace', RBrace = 'RBrace',       // { }
  LBracket = 'LBracket', RBracket = 'RBracket', // [ ]
  Comma = 'Comma', Dot = 'Dot', Colon = 'Colon',

  // 特殊
  Newline = 'Newline', Indent = 'Indent', Dedent = 'Dedent',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}
