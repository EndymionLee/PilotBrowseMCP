---
name: js-reverse
description: 分析前端 JS 理解 API 构造（端点/参数/加密/签名），复现加密 API 调用，沉淀网站能力模型
---

# JS 逆向（Website Capability Intelligence）

分析前端 JavaScript，理解网站如何构造 API 请求（签名/加密/参数生成），使加密 API 变为可调用能力。

## 触发时机

- 用户需要理解网站如何生成请求参数（sign/token/加密字段）
- 网络请求重放失败（缺少签名/加密参数）
- 用户要求分析网站前端逻辑

## 流程

1. `js_extract({ tabId })` 抓取页面 JS 文件
2. `js_analyze({ source })` AST 分析：端点 / 函数调用图 / 加密库 / 签名参数 / **算法管线 / 关键常量 / 请求转换器**
3. `js_find_function({ source, keyword })` 定位关键函数（如 "sign"、"encrypt"）
4. `js_trace_request({ requestId, source })` 关联网络请求参数 ↔ 生成函数
5. `js_capability_query({ site, keyword })` 查询已学习能力（不重复分析）
6. `js_reverse({ site, tabId })` 综合逆向并沉淀 `js/` + `capabilities/` 报告

## 高级分析（v1.5）

- **算法管线（pipeline）**：不再只报孤立 "AES"，而是完整变换链，如网易云 `asrsea`：JSON.stringify → AES-CBC(presetKey) → AES-CBC(randomKey) → RSA(raw)
- **关键常量（constants）**：presetKey / iv / level 等是 API 能力的一部分，随报告沉淀
- **请求转换器（transformer）**：识别 `asrsea` 这类"请求序列化器"（把明文转成 { params, encSecKey }），Agent 据此复现
- **半动态 Hook**：静态分析失败（混淆/闭包/动态生成）时，`js_hook` 注入页面 hook（MAIN world 记录 fetch/XHR/CryptoJS 调用输入输出），触发页面操作后 `js_hook_collect` 读取运行时真相

## 破解闭环（复现加密 API）

```
js_trace_request → 定位 sign 的生成函数 generateSign() / 转换器 asrsea()
    ↓
browser_evaluate → 页面上下文执行生成函数 → 拿到签名/密文
    ↓
network_replay   → 带正确签名直接调 API（不依赖页面交互）
```

## 能力模型（最终产物）

capabilities/<cap>.md 描述：端点、每个参数的来源（user_input / builtin / function）、签名参数由哪个函数用什么算法生成、算法管线、关键常量、请求转换器。

## 边界

- 静态分析（AST）只读源码，不执行页面代码
- 在页面上下文执行前端函数（browser_evaluate）属于授权测试行为，目标需授权
- 混淆/webpack 压缩代码 v1 只做检测与十六进制解码，不承诺完整还原
