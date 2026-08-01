---
name: sql-injection
description: 检测网站 SQL 注入漏洞，管理安全清单，生成可复用安全脚本
---

# SQL 注入检测

检测网站输入点的 SQL 注入，产出可管理、可复用的安全知识。

## 触发时机

- 用户要求检测网站安全性
- 网络流量中出现可疑注入特征（被动检测已标记 SUSPECT）

## 流程

### 验证模式（对已捕获请求确认）
1. `sql_injection_list_findings` 查看被动发现（SUSPECT）
2. `browser_start_network_monitor` 触发目标请求 → `browser_network_search` 拿 requestId
3. `sql_injection_scan({ site, requestId })` → 命中项 VALIDATED

### 攻击模式（URL 直扫，深度提取）
1. `sql_injection_scan({ site, url })` 直接扫目标 URL，自动枚举参数（query/表单/JSON/Cookie）
2. 技术探测：error → boolean → time → union → stacked；被 WAF 拦截时自动 tamper 绕过
3. `extract: "structure"` 提取库/表/列（默认）；`extract: "dump"` 提取数据行
4. 注意：攻击模式需扩展弹窗已授权「SQL 注入扫描」权限

### 管理复用
5. 复核后 `sql_injection_update_finding` 推进 CONFIRMED / FIXED，误报标 false_positive
6. `sql_injection_generate_script` 生成 security-check.pab，可脱离 LLM 定期复检

## 攻击能力（v2）

- **技术**：报错、布尔盲注、时间盲注、UNION 联合查询、堆叠注入
- **WAF 绕过**：tamper 引擎（大小写混合/内联注释/关键字拆分/URL 编码），被拦截自动重试
- **数据提取**：version/database/user → 库名 → 表名 → 列名 → 数据行（只读，无写 payload）
- **参数枚举**：query / 表单 / JSON / Cookie

## 降噪原则

- 请求侧语法特征命中 ≠ 可注入，必须主动验证后才写报告
- 扫描 `failed > 0` 或 `total = 0` 时是「扫描未执行成功」（WAF 拦截/请求失败），**不是**「未发现注入」，务必查看 warnings
- Scope Lock：扫描默认锁定目标 origin，防止误扫 CDN/第三方域名

## 边界

- 攻击性扫描会向目标发送测试 payload 并提取数据，**必须**在授权测试场景、目标明确授权后执行
- 扫描前告知用户目标；`sql_injection_stop` 可中止
- 报告落盘 `website-manuals/<site>/security/`，自动脱敏（cookie/token/密码不落盘）
