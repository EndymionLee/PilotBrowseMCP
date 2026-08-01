---
name: js-reverse
description: Analyze front-end JS to understand API construction (endpoints/params/crypto/signatures), reproduce encrypted API calls, and persist website capability models
---

# JS Reverse (Website Capability Intelligence)

Analyze front-end JavaScript to understand how a website constructs its API requests (signatures/encryption/parameter generation), turning encrypted APIs into callable capabilities.

## When to Trigger

- The user needs to understand how a website generates request parameters (sign/token/encrypted fields)
- A network request replay fails (missing signature/encrypted parameters)
- The user asks to analyze a website's front-end logic

## Workflow

1. `js_extract({ tabId })` collect page JS files
2. `js_analyze({ source })` AST analysis: endpoints / function call graph / crypto / signature params / **algorithm pipeline / key constants / request transformers**
3. `js_find_function({ source, keyword })` locate key functions (e.g. "sign", "encrypt")
4. `js_trace_request({ requestId, source })` associate request params with generator functions
5. `js_capability_query({ site, keyword })` query learned capabilities (no re-analysis)
6. `js_reverse({ site, tabId })` full reverse and persist `js/` + `capabilities/` report

## Advanced Analysis (v1.5)

- **Algorithm pipeline**: not a bare "AES", but the full transform chain, e.g. NetEase Cloud `asrsea`: JSON.stringify → AES-CBC(presetKey) → AES-CBC(randomKey) → RSA(raw)
- **Key constants**: presetKey / iv / level are part of the API capability and persisted with the report
- **Request transformers**: identify request serializers like `asrsea` (plaintext → { params, encSecKey }) for reproduction
- **Semi-dynamic Hook**: when static analysis fails (obfuscation/closure/dynamic generation), `js_hook` injects a page hook (MAIN world records fetch/XHR/CryptoJS calls with input/output), trigger the page action, then `js_hook_collect` reads the runtime ground truth

## Crack Loop (reproduce encrypted API)

```
js_trace_request → locate sign's generator generateSign() / transformer asrsea()
    ↓
browser_evaluate → execute the generator in page context → get signature/ciphertext
    ↓
network_replay   → call the API directly with the correct signature (no UI interaction)
```

## Capability Model (final artifact)

capabilities/<cap>.md describes: endpoints, source of each parameter (user_input / builtin / function), which function + algorithm generates the signature params, the algorithm pipeline, key constants, and request transformers.

## Boundaries

- Static analysis (AST) only reads source; never executes page code
- Executing front-end functions in page context (browser_evaluate) is an authorized-testing action; target must be authorized
- For obfuscated/webpack-compressed code, v1 only does detection + hex decoding; full restoration is not promised
