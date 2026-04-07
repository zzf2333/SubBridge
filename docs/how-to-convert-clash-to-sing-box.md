# 如何将 Clash / Clash.Meta YAML 转换为 sing-box 配置

如果你的目标是把 `Clash` 或 `Clash.Meta YAML`（包括机场订阅）接入 `sing-box`，`SubBridge` 就是为这个场景设计的。

本文档面向这些问题：

- 如何做 `Clash 转 sing-box`
- 如何做 `Clash 订阅转换`
- 如何把机场订阅接入 `sing-box`
- 如何验证生成后的 `sing-box` 配置是否真的可用

## 1. 工作原理

SubBridge 的工作方式是**节点注入**，而非全量翻译：

1. 从你的 Clash 配置/订阅中提取节点列表
2. 识别节点名中的地区关键词，自动分组（香港/日本/美国等）
3. 将节点注入到 sing-box 模板的占位符位置
4. 输出完整可运行的 sing-box 配置

路由规则、DNS、入站配置由模板决定——工具内置一套默认模板，高级用户可完全替换。

## 2. 适用场景

- 手头有一份 `Clash / Clash.Meta YAML`，希望生成 `sing-box` 配置
- 需要把机场提供的 Clash 订阅接入 `sing-box`
- 想让工具自动按国家/地区生成分组，不想手工维护节点列表
- 想要完全控制路由/DNS/入站配置，不受工具内置规则限制

## 3. 输入与输出

输入（可多源同时指定）：

- 本地 Clash / Clash.Meta YAML 文件
- 远程 Clash 订阅 URL

输出：

- `sing-box` JSON 配置（直接可用，或经 `verify` 验证后使用）

## 4. 使用命令

### 4.1 零配置：使用内置默认模板

```bash
# 本地文件
subbridge build -i clash.yaml -o config.json

# 远程订阅
subbridge build -i https://example.com/sub -o config.json

# 多源合并（文件 + 订阅 URL）
subbridge build -i clash.yaml -i https://example.com/sub -o config.json
```

内置默认模板包含：TUN 全局代理、国家分组（自动展开）、geo 路由规则、双栈 DNS。

### 4.2 自定义模板

```bash
# 取得内置模板副本
subbridge init -o my-template.json

# 按需修改（DNS、路由、rule_set URL、入站等）
vim my-template.json

# 使用自定义模板构建
subbridge build -i clash.yaml -t my-template.json -o config.json
```

### 4.3 模板占位符说明

在 sing-box 模板的 `outbounds` 数组中使用以下占位符：

```json
{
  "outbounds": [
    { "type": "selector", "tag": "🚀 节点", "outbounds": ["auto", "$nodes"] },
    { "type": "urltest",  "tag": "auto",   "outbounds": ["$nodes"] },
    { "type": "selector", "tag": "🇭🇰 香港", "outbounds": ["$nodes:HK"] },
    { "type": "selector", "tag": "🇯🇵 日本", "outbounds": ["$nodes:JP"] },
    { "$subbridge": "nodes" },
    { "$subbridge": "country_groups" }
  ]
}
```

- `"$nodes"` — 所有节点 tag 列表
- `"$nodes:HK"` — 香港节点 tag 列表（支持 HK/JP/US/SG/TW/KR 等 20+ 地区代码）
- `{ "$subbridge": "nodes" }` — 展开为所有节点 outbound 对象
- `{ "$subbridge": "country_groups" }` — 自动为每个有节点的国家生成 selector + urltest 组

## 5. 转换后验证

```bash
subbridge verify -i config.json
```

默认验证链路：schema 校验 → `sing-box check` → `proxy:smoke`

只做静态合法性校验：

```bash
subbridge validate -i config.json --with-singbox
```

## 6. 常见问题

### Clash 订阅和 Clash.Meta YAML 都支持吗？

支持。当前公开承诺的输入范围就是 `Clash / Clash.Meta YAML`，包括本地文件和远程订阅 URL。

### 国家分组识别不准怎么办？

使用 `subbridge init` 取得模板，在模板中手动写死你想要的节点组逻辑，跳过 `{ "$subbridge": "country_groups" }` 占位符，改用 `"$nodes:HK"` 等精确指定。

### 这个项目是不是在线转换平台？

不是。当前定位是一个公开仓库和工具链，用于稳定完成 `Clash / Clash.Meta YAML -> sing-box` 的转换。

## 7. 下一步阅读

- [返回 README 快速开始](../README.md)
- [查看文档索引](./README.md)
- [查看自动化验证工具说明](./verification.md)
