# SubBridge 版本开发说明列表

本文件是版本发布文案的单一来源。

使用规则：

- 每个版本只维护一个 `## vX.Y.Z` 条目
- `### 提交文案` 用于 GitHub Release / 发版提交说明，内容必须使用英文编写
- `### 开发说明` 用于记录当前版本的开发边界、交付点与验证结果
- 发布时通过脚本按 `package.json` 当前版本自动提取，不再维护独立版本文档

## v0.3.0

### 提交文案

`v0.3.0` is a ground-up rewrite of SubBridge from a "Clash config translator" to a **node injector**.

The core model shift: instead of generating a complete sing-box config from scratch, SubBridge now takes a sing-box template you control, extracts nodes from your Clash subscription, and injects them into the template's placeholders. Routes, DNS, and inbound settings stay in your template — the tool only handles nodes.

Highlights:

1. New architecture: Fetch → Parse → Group → Convert → Load → Inject → Output
   - Zero config required: built-in default template (TUN + geo rules + country groups)
   - Bring your own template: `subbridge init -o my-template.json`, edit freely, use with `-t`

2. Placeholder syntax (JSON-friendly, IDE-safe)
   - `{ "$subbridge": "nodes" }` — expands to all node outbound objects
   - `{ "$subbridge": "country_groups" }` — expands to per-country selector + urltest pairs
   - `"$nodes"` — expands to all node tag list in string arrays
   - `"$nodes:HK"` — expands to country-filtered node tags (23+ region codes)

3. Country auto-grouping
   - Built-in keyword regex map for 23 regions (Chinese and English, abbreviations, city names)
   - Unmatched nodes go to `OTHER` (included in `$nodes`, excluded from country groups)

4. Multi-source merging
   - Accepts multiple `-i` inputs (local files and subscription URLs)
   - Deduplication and unified injection

5. sing-box 1.13 compatibility
   - Removed deprecated `dns` outbound type
   - Migrated to `action: "hijack-dns"` and `action: "sniff"` route rules
   - Added `default_domain_resolver` in route config

6. npm distribution
   - Node.js 18+ compatible CLI build (`#!/usr/bin/env node`)
   - `npm install -g subbridge`

7. Local Web UI
   - `subbridge serve` starts a local Hono server with browser UI
   - Paste YAML or enter subscription URL, download or copy the generated config

Breaking changes from v0.2.x:
- CLI command renamed: `subbridge convert` → `subbridge build`
- Output no longer includes migration report fields (`decisions`, `issues`, `repairs`, `behaviorChanges`)
- Core library API changed: use `runPipeline()` instead of `migrateClashConfig()`

### 开发说明

- 版本目标：从"配置翻译器"重构为"节点注入器"，核心代码从 ~8000 行降至 ~3000 行
- 关键决策：
  - 内置 1 套默认模板 + 用户可完全替换（`init` → 修改 → `-t` 覆写）
  - 占位符保持 JSON 合法，不破坏 IDE 语法高亮
  - 国家分组默认启用，23 个地区关键词正则表
  - 失败节点 stderr 警告，不中断整体流程
- 兼容性更新：sing-box 1.13 breaking changes（dns outbound 删除、legacy inbound fields 删除）
- npm 发布准备：Node.js 18+ 构建、`#!/usr/bin/env node` shebang、publishConfig
- 本地 Web UI：`subbridge serve`（Hono + @hono/node-server，Node.js 兼容）
- 测试：217 pass，20 个测试文件，覆盖所有核心模块

## v0.2.1

### 提交文案

`v0.2.1` focuses on repository SEO for users searching for `Clash to sing-box` migration in Chinese.

This release does not add new conversion protocols or new input families. It improves how the project is discovered and understood:

- Repositions `SubBridge` as `Clash / Clash.Meta YAML to sing-box Converter`
- Rewrites the README as a Chinese, search-oriented entry point
- Adds a focused guide for converting Clash / Clash.Meta YAML to sing-box
- Introduces automated SEO checks into the release gate

Highlights:

1. Clearer repository positioning
   - The public description now states exactly what SubBridge does
   - The README first screen is optimized for high-intent search terms

2. Better content routing for search users
   - Added one focused guide for the complete `Clash / Clash.Meta YAML -> sing-box` workflow
   - Linked README, docs index, guide, and verification flow together

3. SEO checks are now part of release quality
   - Added `bun run seo:check`
   - Release and CI gates now verify repository metadata and README entry quality

Current scope:

- No GitHub Pages site is introduced in this release
- The npm package name and CLI command remain `subbridge`
- Public discovery is centered on GitHub repository content

### 开发说明

- 版本目标：强化 GitHub 仓库的中文搜索命中能力，而不是扩展转换功能
- 品牌策略：保留 `SubBridge`，统一副标题为 `Clash / Clash.Meta YAML to sing-box Converter`
- SEO 主载体：
  - `README.md`
  - `docs/how-to-convert-clash-to-sing-box.md`
- 关键实现：
  - README 首屏重写为中文 SEO 入口
  - 新增专题文档承接长尾搜索词
  - 新增 `seo:check` 脚本并接入 CI / release gate
  - 更新 `package.json` 的 description / keywords / homepage
  - 修复 Web 首页、CLI、health、User-Agent 中的旧版本与旧文案残留
- 仓库外手工项：
  - GitHub About Description
  - GitHub Topics
- 截至当前版本，发布前仍必须执行：
  - `bun run release:check`
  - `bun run check:public-real`

## v0.2.0

### 提交文案

`v0.2.0` is the first SubBridge release focused on making `Clash / Clash.Meta YAML -> sing-box` stable and release-ready.

This version does not expand input types. It concentrates on finishing one workflow well:

- Narrow the supported input scope to `Clash / Clash.Meta YAML`
- Produce runnable `sing-box` client configurations
- Complete the `convert -> check -> smoke` validation loop
- Establish representative fixture gates and public real-world regression samples

Highlights:

1. More reliable Clash YAML conversion
   - Improved structural mapping stability for multi-protocol proxy nodes
   - Better emission coverage for common transport-layer fields
   - Stronger guarantees that generated output is runnable and verifiable

2. Formal post-generation verification
   - Added a unified verification command:

```bash
bun src/cli/index.ts verify -i singbox.json
```

   - The command always runs: `schema -> sing-box check -> proxy:smoke`

3. Two-layer regression coverage
   - Repository-maintained representative fixtures are used as release gates
   - Public real-world Clash YAML subsets are used for second-layer format and structure regression

Current scope:

- Only `Clash / Clash.Meta YAML` input is supported
- No new input families are introduced in this release
- Public node availability is not treated as a release-blocking signal

Release validation completed:

- `bun run release:check`
- Representative fixture verification
- Batched validation of public real-world samples

### 开发说明

- 版本目标：将 `Clash / Clash.Meta YAML -> sing-box` 做成稳定、可验证、可回归的交付能力
- 输入范围正式收口为 `Clash / Clash.Meta YAML`
- 生成后验证工具链已落地：
  - `verify`
  - `verify:fixtures`
  - `check:public-real`
- 代表性固定样例已建立并接入发布门禁，覆盖：
  - `ss`
  - `vmess`
  - `trojan`
  - `vless reality`
  - `hysteria2`
  - `http` 结构支持
- 公开真实样例二层回归已建立，当前样例集覆盖：
  - `ss`
  - `vmess ws / tcp / grpc`
  - `trojan tls`
  - `vless reality / grpc / ws`
  - `hysteria2`
  - `http`
- 关键修复：
  - 修复纯 TCP 代理被错误发射为非法 `transport.type=tcp` 的问题
  - 加强 `TLS / ALPN / client-fingerprint / Reality / gRPC / ws` 等关键字段的发射与回归验证
  - 加强 `proxy-smoke` 对运行时入站与端口的兼容处理
- 截至 `2026-03-13` 的验证状态：
  - `bun run release:check` 通过
  - `bun run check:public-real` 通过，结果：`passed: 10 / failed: 0`
  - npm 产物：`subbridge@0.2.0`
