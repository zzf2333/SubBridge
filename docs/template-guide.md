# 模板使用指南

SubBridge 的核心工作方式是**把节点注入到你的 sing-box 模板中**——路由规则、DNS、入站配置由你的模板决定，工具只负责提取节点、按国家分组、展开占位符。

本文档是占位符语法的完整参考。

## 快速上手

```bash
# 取得内置默认模板副本
subbridge init -o my-template.json

# 修改模板（DNS、路由、rule_set URL 等）
vim my-template.json

# 用自定义模板构建
subbridge build -i clash.yaml -t my-template.json -o config.json
```

不传 `-t` 时，工具使用内置默认模板（TUN + geo 规则 + 国家分组）。

---

## 占位符完整参考

占位符写在 sing-box 模板的 `outbounds` 数组中，保持 JSON 合法，不破坏 IDE 语法高亮。

### 1. `{ "$subbridge": "nodes" }` — 展开全部节点

写在 outbounds 数组中，工具将其替换为所有转换后的节点 outbound 对象。

```json
{
  "outbounds": [
    { "type": "selector", "tag": "🚀 节点", "outbounds": ["$nodes"] },
    { "$subbridge": "nodes" },
    { "type": "direct", "tag": "direct" }
  ]
}
```

展开后：

```json
{
  "outbounds": [
    { "type": "selector", "tag": "🚀 节点", "outbounds": ["香港 01", "日本 02", "..."] },
    { "type": "shadowsocks", "tag": "香港 01", "server": "...", "..." : "..." },
    { "type": "vmess",       "tag": "日本 02", "server": "...", "..." : "..." },
    { "type": "direct", "tag": "direct" }
  ]
}
```

---

### 2. `{ "$subbridge": "country_groups" }` — 自动生成全部国家分组

工具为每个有节点的国家自动生成一个 `selector` + 一个 `urltest`，按识别到的国家顺序排列。

```json
{
  "outbounds": [
    { "type": "selector", "tag": "🚀 节点", "outbounds": ["♻️ 自动", "$nodes"] },
    { "type": "urltest",  "tag": "♻️ 自动", "outbounds": ["$nodes"] },
    { "$subbridge": "country_groups" },
    { "$subbridge": "nodes" },
    { "type": "direct", "tag": "direct" }
  ]
}
```

如果订阅中有香港和日本节点，展开后自动添加：

```json
{ "type": "selector", "tag": "🇭🇰 香港", "outbounds": ["香港 01", "香港 02"] },
{ "type": "urltest",  "tag": "🇭🇰 香港 auto", "outbounds": ["香港 01", "香港 02"], "interval": "5m" },
{ "type": "selector", "tag": "🇯🇵 日本", "outbounds": ["日本 01"] },
{ "type": "urltest",  "tag": "🇯🇵 日本 auto", "outbounds": ["日本 01"], "interval": "5m" }
```

> **提示**：无节点的国家不会生成分组。未能识别地区的节点归入 `OTHER` 组（不出现在 country_groups 中，但出现在 `$nodes` 里）。

---

### 3. `"$nodes"` — 在字符串数组中展开为所有节点 tag

用在 `outbounds` 字段的字符串数组中，工具将它替换为所有节点的 tag 列表。

```json
{ "type": "selector", "tag": "🚀 节点", "outbounds": ["♻️ 自动", "$nodes"] }
```

展开后：

```json
{ "type": "selector", "tag": "🚀 节点", "outbounds": ["♻️ 自动", "香港 01", "日本 02", "美国 03"] }
```

---

### 4. `"$nodes:XX"` — 展开为指定地区的节点 tag

`XX` 是两位地区代码（大写）。若该地区无节点，展开为空列表。

```json
{ "type": "selector", "tag": "🇭🇰 香港", "outbounds": ["$nodes:HK"] },
{ "type": "selector", "tag": "🇯🇵 日本", "outbounds": ["$nodes:JP"] },
{ "type": "selector", "tag": "🇺🇸 美国", "outbounds": ["$nodes:US"] }
```

展开后：

```json
{ "type": "selector", "tag": "🇭🇰 香港", "outbounds": ["香港 01", "香港 02"] },
{ "type": "selector", "tag": "🇯🇵 日本", "outbounds": ["日本 01"] },
{ "type": "selector", "tag": "🇺🇸 美国", "outbounds": [] }
```

---

## 地区代码完整列表

支持 23 个地区，节点名匹配中英文、缩写、城市名：

| 代码 | 地区 | 识别关键词（示例） |
|------|------|-----------------|
| `HK` | 🇭🇰 香港 | 香港、港、HK、HongKong |
| `JP` | 🇯🇵 日本 | 日本、东京、大阪、JP、Japan、Tokyo |
| `US` | 🇺🇸 美国 | 美国、洛杉矶、纽约、US、America |
| `SG` | 🇸🇬 新加坡 | 新加坡、狮城、SG、Singapore |
| `TW` | 🇹🇼 台湾 | 台湾、TW、Taiwan |
| `KR` | 🇰🇷 韩国 | 韩国、首尔、KR、Korea |
| `DE` | 🇩🇪 德国 | 德国、法兰克福、DE、Germany |
| `GB` | 🇬🇧 英国 | 英国、伦敦、GB、UK、Britain |
| `FR` | 🇫🇷 法国 | 法国、巴黎、FR、France |
| `NL` | 🇳🇱 荷兰 | 荷兰、阿姆斯特丹、NL、Netherlands |
| `RU` | 🇷🇺 俄罗斯 | 俄罗斯、莫斯科、RU、Russia |
| `AU` | 🇦🇺 澳大利亚 | 澳洲、悉尼、AU、Australia |
| `CA` | 🇨🇦 加拿大 | 加拿大、多伦多、温哥华、CA、Canada |
| `IN` | 🇮🇳 印度 | 印度、孟买、IN、India |
| `TR` | 🇹🇷 土耳其 | 土耳其、TR、Turkey |
| `AR` | 🇦🇷 阿根廷 | 阿根廷、AR、Argentina |
| `BR` | 🇧🇷 巴西 | 巴西、BR、Brazil |
| `MX` | 🇲🇽 墨西哥 | 墨西哥、MX、Mexico |
| `PH` | 🇵🇭 菲律宾 | 菲律宾、马尼拉、PH、Philippines |
| `ID` | 🇮🇩 印度尼西亚 | 印尼、雅加达、ID、Indonesia |
| `TH` | 🇹🇭 泰国 | 泰国、曼谷、TH、Thailand |
| `VN` | 🇻🇳 越南 | 越南、VN、Vietnam |
| `MY` | 🇲🇾 马来西亚 | 马来西亚、吉隆坡、MY、Malaysia |

未匹配到任何地区的节点归入 `OTHER`（不生成 country_groups，但出现在 `$nodes` 中）。

---

## 常见模板配方

### 最简模板（仅注入节点，无路由规则）

```json
{
  "outbounds": [
    { "type": "selector", "tag": "proxy", "outbounds": ["$nodes"] },
    { "$subbridge": "nodes" },
    { "type": "direct", "tag": "direct" }
  ],
  "route": {
    "final": "proxy"
  }
}
```

### 手动指定国家分组（不用自动展开）

适合只想要特定几个国家的用户：

```json
{
  "outbounds": [
    { "type": "selector", "tag": "🚀 节点",   "outbounds": ["🇭🇰 香港", "🇯🇵 日本", "🇺🇸 美国", "$nodes"] },
    { "type": "selector", "tag": "🇭🇰 香港",  "outbounds": ["$nodes:HK"] },
    { "type": "selector", "tag": "🇯🇵 日本",  "outbounds": ["$nodes:JP"] },
    { "type": "selector", "tag": "🇺🇸 美国",  "outbounds": ["$nodes:US"] },
    { "$subbridge": "nodes" },
    { "type": "direct", "tag": "direct" }
  ]
}
```

### 自动展开全部国家 + urltest（内置默认模板的结构）

```json
{
  "outbounds": [
    { "type": "selector", "tag": "🚀 节点", "outbounds": ["♻️ 自动", "$nodes"] },
    { "type": "urltest",  "tag": "♻️ 自动", "outbounds": ["$nodes"], "interval": "5m", "tolerance": 50 },
    { "$subbridge": "country_groups" },
    { "$subbridge": "nodes" },
    { "type": "direct", "tag": "direct" },
    { "type": "block",  "tag": "block" }
  ]
}
```

---

## 内置默认模板说明

运行 `subbridge init -o my-template.json` 可取得副本。内置模板特点：

| 配置项 | 内容 |
|--------|------|
| **入站** | TUN（全局代理，支持 IPv4/IPv6） |
| **DNS** | 国内域名 → 223.5.5.5（阿里云）；其余 → 8.8.8.8 via 代理 |
| **路由规则** | 广告 → block；国内域名/IP → direct；其余 → 🚀 节点 |
| **rule_set 来源** | MetaCubeX/meta-rules-dat（GitHub，`download_detour: direct` 直连下载） |
| **国家分组** | 自动展开（`{ "$subbridge": "country_groups" }`） |

**国内网络使用 rule_set 提示**：默认 rule_set URL 指向 GitHub，国内首次启动可能下载失败。可在模板中将 URL 替换为 CDN 加速地址，或使用 [jsDelivr](https://cdn.jsdelivr.net) 等镜像。

---

## 常见问题

### 订阅里有节点但某个国家分组是空的，怎么回事？

该国家没有被识别到的节点。可检查节点名是否符合识别规则（见上方"地区代码完整列表"），或改用 `"$nodes"` 把所有节点放到同一个组。

### 如何在国家分组里加 urltest 自动测速？

使用 `{ "$subbridge": "country_groups" }` 时，工具会为每个国家自动生成 `selector` 和 `urltest`（tag 为 `🇭🇰 香港 auto` 格式）。如果不需要 urltest，请改用 `"$nodes:HK"` 手动控制。

### 模板里的 outbounds 引用了不存在的 tag，会怎样？

`subbridge build` 完成后会在 stderr 输出"outbound 引用未闭合"警告，并列出问题 tag。生成的配置仍然输出，但 sing-box 可能拒绝加载。

### 模板不传 `-t` 时用的是什么？

内置默认模板，即 `subbridge init` 复制出来的那个文件。两者完全一致。

---

## 参考阅读

- [如何将 Clash 转换为 sing-box](./how-to-convert-clash-to-sing-box.md)
- [自动化验证工具](./verification.md)
- [回到 README](../README.md)
