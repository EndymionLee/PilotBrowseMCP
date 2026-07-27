/**
 * PAB Interpreter - 执行器
 *
 * 输入：AST Program
 * 执行：通过 Router 调用 MCP 工具
 */
import { type Program, type Stmt, type Expr, type FnCall } from './ast.js';
import type { Router } from '../background/router.js';

/** 每步执行记录 */
export interface StepLog {
  step: number;
  type: 'tool_call' | 'control' | 'error';
  tool?: string;
  params?: any;
  result?: any;
  error?: string;
  timestamp: number;
}

export class Interpreter {
  private router: Router;
  private vars = new Map<string, any>();
  private fns: Map<string, any>;
  private inputs: Map<string, string | undefined>;
  private stepCount = 0;
  private logs: StepLog[] = [];
  private maxLoopIterations = 1000;
  private tabId: number | null = null;
  private tabMapping = new Map<string, number>(); // tab variable -> tabId
  private currentTabId: number | null = null;
  private breakFlag = false;
  private continueFlag = false;
  private returnValue: any = undefined;
  private inputValues: Record<string, string> = {};

  // MCP 工具名到内部 handler 名的映射
  private methodMap: Record<string, string> = {
    browser_open: 'open_tab', browser_close: 'close_tab', browser_activate: 'activate_tab',
    browser_list_tabs: 'list_tabs', browser_current_page: 'list_tabs',
    browser_click: 'click_element', browser_type: 'type_text', browser_scroll: 'scroll_page',
    browser_query: 'query_dom', browser_evaluate: 'evaluate', browser_find: 'find_element',
    browser_wait: 'wait', browser_wait_for_element: 'wait_for_element',
    browser_get_markdown: 'get_markdown', browser_get_html: 'get_html', browser_get_text: 'get_text',
    browser_extract_article: 'extract_article', browser_extract_table: 'extract_table',
    browser_extract_links: 'extract_links', browser_extract_images: 'extract_images',
    browser_inspect_page: 'inspect_page',
    browser_save_content: 'save_content', browser_save_xpath: 'save_xpath',
    browser_start_network_monitor: 'start_network_monitor',
    browser_stop_network_monitor: 'stop_network_monitor',
    browser_network_search: 'network_search', browser_network_detail: 'network_get',
    browser_network_wait: 'network_wait', browser_network_replay: 'network_replay',
    browser_network_clear_cache: 'network_clear_cache', browser_network_analyze: 'network_analyze',
    browser_cookies: 'get_cookies', browser_local_storage: 'get_local_storage',
    browser_screenshot: 'screenshot',
    browser_permissions_list: 'permissions_list', browser_permissions_grant: 'permissions_grant',
    browser_permissions_revoke: 'permissions_revoke',
  };

  private abortController: AbortController | null = null;

  constructor(router: Router, inputValues: Record<string, string> = {}, abortController?: AbortController) {
    this.router = router;
    this.fns = new Map();
    this.inputs = new Map();
    this.inputValues = inputValues;
    this.abortController = abortController || null;
    // 内置函数
    this.vars.set('print', (...args: any[]) => console.log('[PAB]', ...args));
    this.vars.set('range', (n: number) => { const r: number[] = []; for (let i = 0; i < n; i++) r.push(i); return r; });
    this.vars.set('len', (x: any) => x?.length || 0);
    this.vars.set('str', (x: any) => String(x));
    this.vars.set('pab_help', () => `PAB Syntax:
  # comment
  name: str = "value"     # variable (type optional)
  items: list = ["a","b"]  # list
  data: dict = {k: v}     # dict (for overrides, headers)

  browser_open(url)       # tool call (same as MCP tools)
  result = browser_evaluate("1+1")  # return value

  if cond:              # if
  for i in range(5):    # for loop
  while cond:           # while loop
  fn name():            # function def
  retry 3:              # retry block
  input name            # input param

  not cond              # not operator
  "x" in str            # in operator (contains)
  arr[0]                # index access
  obj.prop              # property access
  a + b                 # arithmetic / concat
`);
  }

  getLogs(): StepLog[] { return this.logs; }

  async run(program: Program): Promise<any> {
    // 注册函数
    for (const fn of program.fns.values()) {
      this.fns.set(fn.name, fn);
    }

    // 注入输入参数
    for (const [name, defaultVal] of program.inputs) {
      this.vars.set(name, this.inputValues[name] || defaultVal || '');
    }

    let result: any = undefined;
    for (const stmt of program.stmts) {
      if (stmt.kind === 'FnDecl' || stmt.kind === 'InputStmt') continue;
      result = await this.execStmt(stmt);
      if (this.returnValue !== undefined) break;
    }
    return result;
  }

  private async execStmt(stmt: Stmt): Promise<any> {
    if (this.breakFlag || this.continueFlag) return;
    if (this.abortController?.signal.aborted) throw new Error('Script stopped by user');

    switch (stmt.kind) {
      case 'VarDecl':
        this.vars.set(stmt.name, await this.evalExpr(stmt.value));
        return;

      case 'FnCallStmt':
        return this.execFnCallWithRetry(stmt);

      case 'IfStmt':
        return this.execIf(stmt);

      case 'ForStmt':
        return this.execFor(stmt);

      case 'WhileStmt':
        return this.execWhile(stmt);

      case 'RetryStmt':
        return this.execRetry(stmt);

      case 'AssertStmt':
        return this.execAssert(stmt);

      case 'BreakStmt':
        this.breakFlag = true;
        return;
      case 'ContinueStmt':
        this.continueFlag = true;
        return;
      case 'ReturnStmt':
        this.returnValue = stmt.value ? await this.evalExpr(stmt.value) : null;
        return;
    }
  }

  private async execFnCallWithRetry(stmt: any): Promise<any> {
    const { call, retry, retryWait } = stmt;
    const maxAttempts = retry || 1;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await this.execFnCall(call);
        this.log('tool_call', call.name, this.fnCallToParams(call), result);
        return result;
      } catch (err) {
        this.log('error', call.name, this.fnCallToParams(call), undefined, (err as Error).message);
        if (attempt < maxAttempts - 1) {
          if (retryWait) await this.sleep(retryWait);
          continue;
        }
        throw err;
      }
    }
  }

  private async execFnCall(call: FnCall): Promise<any> {
    const { name, args, kwargs } = call;

    // 内置函数
    if (this.vars.has(name)) {
      const fn = this.vars.get(name);
      const evaluatedArgs = await Promise.all(args.map(a => this.evalExpr(a)));
      return fn(...evaluatedArgs);
    }

    // 用户定义函数
    if (this.fns.has(name)) {
      const fn = this.fns.get(name);
      const oldVars = new Map(this.vars);
      for (let i = 0; i < fn.params.length; i++) {
        this.vars.set(fn.params[i], i < args.length ? await this.evalExpr(args[i]) : null);
      }
      let result: any;
      for (const s of fn.body) {
        await this.execStmt(s);
        if (this.returnValue !== undefined) { result = this.returnValue; this.returnValue = undefined; break; }
      }
      this.vars = oldVars;
      return result;
    }

    // MCP 工具调用
    // 处理 tab 参数：如果传了 tab，用对应的 tabId
    let params: Record<string, any> = {};
    for (const [k, v] of Object.entries(kwargs)) {
      if (k === 'tab') {
        const tabVarName = await this.evalExpr(v);
        const tabId = this.tabMapping.get(tabVarName) || this.currentTabId;
        if (tabId) params.tabId = tabId;
      } else {
        params[k] = await this.evalExpr(v);
      }
    }
    // 位置参数按方法名映射
    const posParamMap: Record<string, string[]> = {
      browser_open: ['url'],
      browser_click: ['selector'],
      browser_type: ['selector', 'text'],
      browser_evaluate: ['code'],
      browser_wait: ['ms'],
      browser_find: ['text'],
      browser_query: ['selector'],
      browser_scroll: ['direction', 'amount'],
      browser_network_wait: ['urlPattern'],
      browser_network_search: ['keyword'],
      browser_save_content: ['filePath'],
      browser_save_xpath: ['filePath', 'xpath'],
      browser_get_markdown: ['tabId'],
      browser_get_text: ['tabId'],
      browser_get_html: ['tabId'],
      browser_screenshot: ['tabId'],
      browser_cookies: ['domain'],
      browser_local_storage: ['tabId'],
    };
    const posParams = posParamMap[name] || ['url', 'selector', 'text', 'code', 'tabId', 'requestId', 'filePath', 'xpath', 'key', 'value'];
    for (let i = 0; i < args.length; i++) {
      if (i < posParams.length) {
        params[posParams[i]] = await this.evalExpr(args[i]);
      }
    }

    const innerMethod = this.methodMap[name] || name;
    this.stepCount++;

    // wait 特殊处理
    if (innerMethod === 'wait') {
      const ms = params.ms || params[0] || 1000;
      await this.sleep(ms);
      return { success: true };
    }

    // 自动注入 tabId
    const needTab = ['click_element', 'type_text', 'scroll_page', 'query_dom', 'evaluate', 'find_element',
      'wait_for_element', 'screenshot', 'get_markdown', 'get_html', 'get_text',
      'extract_article', 'extract_table', 'extract_links', 'extract_images',
      'start_network_monitor', 'stop_network_monitor',
      'network_search', 'network_wait', 'network_replay', 'network_clear_cache',
      'get_cookies', 'get_local_storage', 'inspect_page', 'save_content', 'save_xpath'];
    if (needTab.includes(innerMethod) && !params.tabId && this.currentTabId) {
      params.tabId = this.currentTabId;
    }

    // 通过 Router 调用
    return new Promise((resolve, reject) => {
      const req = { type: 'request' as const, id: `pab_${this.stepCount}_${Date.now()}`, method: innerMethod, params };
      this.router.dispatch(req, (result, error) => {
        if (error) reject(new Error(error.message));
        else {
          // 解包常见工具返回的包裹对象
          if (result && typeof result === 'object') {
            const r = result as any;
            // evaluate: { result: value } -> value
            if (innerMethod === 'evaluate' && 'result' in r) { resolve(r.result); return; }
            // extract_links: { links: [...] } -> [...]
            if (innerMethod === 'extract_links' && Array.isArray(r.links)) { resolve(r.links); return; }
            // extract_images: { images: [...] } -> [...]
            if (innerMethod === 'extract_images' && Array.isArray(r.images)) { resolve(r.images); return; }
            // query_dom: { elements: [...] } -> [...]
            if (innerMethod === 'query_dom' && Array.isArray(r.elements)) { resolve(r.elements); return; }
            // extract_table: { table: [...] } -> [...]
            if (innerMethod === 'extract_table' && Array.isArray(r.table)) { resolve(r.table); return; }
            // list_tabs: { tabs: [...] } -> [...]
            if (innerMethod === 'list_tabs' && Array.isArray(r.tabs)) { resolve(r.tabs); return; }
            // find_element: { elements: [...] } -> [...]
            if (innerMethod === 'find_element' && Array.isArray(r.elements)) { resolve(r.elements); return; }
            // cookies: { cookies: [...] } -> [...]
            if (innerMethod === 'get_cookies' && Array.isArray(r.cookies)) { resolve(r.cookies); return; }
            // screenshot: { data: string } -> { data, mimeType }
            if (innerMethod === 'screenshot' && r.data) { resolve(r); return; }
          }
          // 保存 tabId（从 open_tab 结果中提取）
          if (innerMethod === 'open_tab' && result?.tab?.id) {
            this.currentTabId = result.tab.id;
          }
          resolve(result);
        }
      }).catch(reject);
    });
  }

  private async execIf(stmt: any): Promise<void> {
    const cond = await this.evalExpr(stmt.cond);
    if (cond) {
      for (const s of stmt.body) { await this.execStmt(s); if (this.breakFlag || this.continueFlag) return; }
    } else {
      let matched = false;
      for (const el of stmt.elifs || []) {
        if (await this.evalExpr(el.cond)) {
          for (const s of el.body) { await this.execStmt(s); if (this.breakFlag || this.continueFlag) return; }
          matched = true; break;
        }
      }
      if (!matched && stmt.elseBody) {
        for (const s of stmt.elseBody) { await this.execStmt(s); if (this.breakFlag || this.continueFlag) return; }
      }
    }
  }

  private async execFor(stmt: any): Promise<void> {
    const iter = await this.evalExpr(stmt.iter);
    if (!Array.isArray(iter)) return;
    let count = 0;
    for (const val of iter) {
      if (count++ >= this.maxLoopIterations) throw new Error('Loop iteration limit exceeded');
      this.vars.set(stmt.varName, val);
      for (const s of stmt.body) {
        await this.execStmt(s);
        if (this.breakFlag) { this.breakFlag = false; return; }
        if (this.continueFlag) { this.continueFlag = false; break; }
      }
    }
  }

  private async execWhile(stmt: any): Promise<void> {
    let count = 0;
    while (await this.evalExpr(stmt.cond)) {
      if (count++ >= this.maxLoopIterations) throw new Error('Loop iteration limit exceeded');
      for (const s of stmt.body) {
        await this.execStmt(s);
        if (this.breakFlag) { this.breakFlag = false; return; }
        if (this.continueFlag) { this.continueFlag = false; break; }
      }
    }
  }

  private async execRetry(stmt: any): Promise<void> {
    for (let i = 0; i < stmt.count; i++) {
      try {
        for (const s of stmt.body) await this.execStmt(s);
        return;
      } catch (err) {
        this.log('error', 'retry', {}, undefined, (err as Error).message);
        if (i < stmt.count - 1) { if (stmt.wait) await this.sleep(stmt.wait); continue; }
        throw err;
      }
    }
  }

  private async execAssert(stmt: any): Promise<void> {
    const val = await this.evalExpr(stmt.expr);
    if (!val) throw new Error(stmt.msg || 'Assertion failed');
  }

  // === 表达式求值 ===

  private async evalExpr(expr: Expr): Promise<any> {
    switch (expr.kind) {
      case 'StringLiteral': return expr.value;
      case 'NumberLiteral': return expr.value;
      case 'BoolLiteral': return expr.value;
      case 'NullLiteral': return null;
      case 'Identifier':
        if (this.vars.has(expr.name)) return this.vars.get(expr.name);
        return expr.name; // 未定义变量当作字符串
      case 'BinOp':
        const left = await this.evalExpr(expr.left);
        const right = await this.evalExpr(expr.right);
        switch (expr.op) {
          case '+': return left + right;
          case '-': return left - right;
          case '*': return left * right;
          case '/': return left / right;
          case '==': return left == right;
          case '!=': return left != right;
          case '<': return left < right;
          case '>': return left > right;
          case '<=': return left <= right;
          case '>=': return left >= right;
          case 'in': return (typeof right === 'string' || Array.isArray(right)) && right.includes(left);
          default: return null;
        }
      case 'FnCall':
        return this.execFnCall(expr);
      case 'PropAccess':
        const obj = await this.evalExpr(expr.obj);
        return obj ? obj[expr.prop] : null;
      case 'ArrayList':
      case 'IndexAccess':
        const obj2 = await this.evalExpr(expr.obj);
        const idx = await this.evalExpr(expr.index);
        return obj2 ? obj2[idx] : null;
        return Promise.all(expr.elements.map(e => this.evalExpr(e)));
    }
  }

  // === 日志 ===

  private log(type: string, tool?: string, params?: any, result?: any, error?: string) {
    this.logs.push({ step: this.stepCount, type: type as any, tool, params, result, error, timestamp: Date.now() });
  }

  private fnCallToParams(call: FnCall): any {
    const p: any = {};
    for (const [k, v] of Object.entries(call.kwargs)) p[k] = v;
    return p;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      // 监听中止信号，提前唤醒
      if (this.abortController) {
        const onAbort = () => { clearTimeout(timer); resolve(); };
        this.abortController.signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }
}
