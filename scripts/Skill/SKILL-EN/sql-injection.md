---
name: sql-injection
description: Detect SQL injection vulnerabilities on websites, manage a security checklist, and generate reusable security scripts
---

# SQL Injection Detection

Detect SQL injection on website input points and produce manageable, reusable security knowledge.

## When to Trigger

- The user asks to check a website for security issues
- Suspicious injection patterns appear in network traffic (passive detection has flagged SUSPECT)

## Workflow

### Verification Mode (confirm a captured request)
1. `sql_injection_list_findings` to review passive findings (SUSPECT)
2. Run `browser_start_network_monitor`, trigger the target request, then `browser_network_search` to get a requestId
3. `sql_injection_scan({ site, requestId })` → hits are marked VALIDATED

### Aggressive Mode (URL direct scan, deep extraction)
1. `sql_injection_scan({ site, url })` scans the target URL directly, auto-enumerating parameters (query/form/JSON/Cookie)
2. Techniques: error → boolean → time → union → stacked; auto tamper bypass when WAF blocks
3. `extract: "structure"` extracts databases/tables/columns (default); `extract: "dump"` also extracts data rows
4. Note: aggressive mode requires the "SQL Injection Scan" permission granted in the extension popup

### Management & Reuse
5. After review, `sql_injection_update_finding` to advance to CONFIRMED / FIXED; mark false positives as false_positive
6. `sql_injection_generate_script` generates security-check.pab for periodic re-checks without an LLM

## Attack Capabilities (v2)

- **Techniques**: error-based, boolean blind, time blind, UNION-based, stacked queries
- **WAF bypass**: tamper engine (upper/lower, inline comments, keyword split, URL encoding) auto-retries on block
- **Data extraction**: version/database/user → databases → tables → columns → data rows (read-only, no write payloads)
- **Parameter enumeration**: query / form / JSON / Cookie

## Noise Reduction Rules

- A request-side syntax feature match does not mean injectable; only write a report after active verification
- When the scan has `failed > 0` or `total = 0`, the scan did NOT execute successfully (WAF block / request failure) — this is NOT "no injection found"; always check the warnings
- Scope Lock: scans are locked to the target origin by default to prevent scanning CDN/third-party domains by mistake

## Boundaries

- Aggressive scanning sends test payloads to the target and extracts data; only run in authorized testing scenarios with explicit target authorization
- Inform the user of the target before scanning; abort with `sql_injection_stop`
- Reports are saved to `website-manuals/<site>/security/` with automatic sanitization (cookies/tokens/passwords are never written to disk)
