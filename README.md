# SubBridge: Clash / Clash.Meta YAML to sing-box Converter

`SubBridge` 是一个面向 `Clash / Clash.Meta YAML` 的 `sing-box` Converter，适合需要做 **Clash 转 sing-box**、**Clash 订阅转换**、**Clash 配置迁移** 的用户。

它的目标不是只把 YAML 转成 JSON，而是产出**可运行的 sing-box 配置**，并同时给出可解释的迁移报告和验证结果。

- 输入：`Clash / Clash.Meta YAML`（文本、文件、URL）
- 输出：可运行的 `sing-box` JSON 配置 + 结构化迁移报告
- 适用场景：`Clash 转 sing-box`、`Clash 订阅转换`、`Clash 配置迁移`、`Clash.Meta YAML` 迁移
- 验证闭环：`convert -> verify -> sing-box check -> proxy:smoke`

## 为什么使用 SubBridge

- 不是手工改配置，而是自动生成可运行的 `sing-box` 配置
- 不是只给结果，而是同时输出 `issues / decisions / repairs / behaviorChanges`
- 不是只看结构合法，而是可以继续执行 `verify` 做端到端验证
- 当前主链路明确收口为 `Clash / Clash.Meta YAML -> sing-box`

## 快速开始

### 环境要求

- Bun `1.3.5+`
- 建议本机安装 `sing-box`，便于执行 `check` 和 `verify`

### 安装

```bash
git clone https://github.com/zzf2333/SubBridge.git
cd SubBridge
bun install
bun run build
```

### CLI：将 Clash 转换为 sing-box

```bash
# 本地 Clash YAML 文件
subbridge convert -i clash.yaml -o singbox.json

# 远程 Clash 订阅链接
subbridge convert -u https://example.com/clash -o singbox.json

# 输出迁移报告
subbridge convert -i clash.yaml -o singbox.json -r report.json --report-display report-display.json
```

### 转换后验证

```bash
subbridge verify -i singbox.json
```

`verify` 默认会执行：

- schema 校验
- `sing-box check`
- `proxy:smoke`

### Web API

```bash
# Development
bun run dev

# Production
bun run start
```

API：

- `POST /api/convert`
- `GET /api/subscribe?url=<clash-url>`

## 专题指南

如果你想直接看完整流程，而不是只看命令示例，先读这篇文档：

- [如何将 Clash / Clash.Meta YAML 转换为 sing-box 配置](./docs/how-to-convert-clash-to-sing-box.md)

## 功能概览

- `Clash / Clash.Meta YAML -> sing-box` 主迁移链路
- `proxies / proxy-groups / rules / DNS / TUN` 主流程覆盖
- `provider` 预拉取与展开：
  - `proxy-provider` cache 可展开为真实节点
  - `rule-provider` cache 可展开为 `inline rule_set`
- `verify` CLI：统一执行生成后验证
- Web URL 安全策略：协议限制、localhost/private-IP 拦截、DNS rebinding 防护、重定向逐跳校验

## 常见问题（FAQ）

### 1. Clash 能不能直接转换成 sing-box？

可以。`SubBridge` 的当前主能力就是把 `Clash / Clash.Meta YAML` 转换成 `sing-box` 配置，并尽量保证生成结果可运行。

### 2. Clash 订阅和 Clash.Meta YAML 都支持吗？

支持，当前对外承诺的输入范围就是 `Clash / Clash.Meta YAML`。本版本不扩展其他输入家族。

### 3. 转换后怎么确认 sing-box 配置真的可用？

使用：

```bash
subbridge verify -i singbox.json
```

这会继续执行 `schema`、`sing-box check` 和 `proxy:smoke`，而不是只做静态转换。

### 4. SubBridge 和手工改配置相比有什么价值？

手工迁移的主要问题是：字段容易漏、降级行为不透明、改完后不一定可运行。`SubBridge` 的价值在于：

- 先生成可运行配置
- 再解释哪里被降级、哪里被修复
- 最后用 `verify` 做自动验证

### 5. 这个项目是在线转换服务吗？

不是。当前定位是一个公开库和工具链，重点是把 `Clash / Clash.Meta YAML -> sing-box` 这件事做稳定，而不是提供公网在线转换服务。

## 开发与发布

```bash
bun run lint
bun run test
bun run build
bun run seo:check
bun run verify:fixtures
bun run check:public-real
bun run smoke
bun run release:check
```

## 文档入口

- [文档索引](./docs/README.md)
- [Clash / Clash.Meta YAML 转换专题指南](./docs/how-to-convert-clash-to-sing-box.md)
- [自动化验证工具](./docs/verification.md)
- [发布流程](./docs/release.md)

## License

MIT
