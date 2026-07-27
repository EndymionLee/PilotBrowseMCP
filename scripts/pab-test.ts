/**
 * PAB 快速测试
 * 验证 Lexer + Parser 能正确解析
 */
import { Lexer } from '../extension/src/pab/lexer.js';
import { Parser } from '../extension/src/pab/parser.js';

const code = `
# daily checkin
name = "pixiv checkin"
page = 1

browser_open("https://pixiv.net", active=false)
browser_wait(3000)

for i in range(3):
    browser_click(".checkin-btn")
    result = browser_network_wait("/api/checkin", timeout=10000)
    if result.success:
        browser_screenshot()
        break
    browser_wait(2000)

fn login():
    browser_click("#login-btn")
    browser_wait(2000)

if page > 1:
    print("page 2")
else:
    print("page 1")
`;

try {
  const lexer = new Lexer(code);
  const tokens = lexer.tokenize();
  console.log(`Tokens: ${tokens.length}`);

  const parser = new Parser(tokens);
  const ast = parser.parse();
  console.log(`\n✅ Parsed OK`);
  console.log(`  statements: ${ast.stmts.length}`);
  console.log(`  functions: ${ast.fns.size}`);
  console.log(`  inputs: ${ast.inputs.size}`);
  ast.stmts.forEach(s => console.log(`  - ${s.kind}`));
} catch (err) {
  console.error('❌', (err as Error).message);
}
