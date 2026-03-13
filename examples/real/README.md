# examples/real 说明

本目录同时包含两类样例：

- 仓库自维护的真实场景样例：用于覆盖分组、规则、DNS、Provider、TUN 等结构
- 基于公开来源整理的协议子集样例：用于做第二层 `Clash YAML -> sing-box` 回归

## 公开样例使用规则

- 只保留当前版本目标协议：`ss`、`vmess`、`trojan`、`vless`、`hysteria2`、`http`
- 不把上游公开配置中的非目标协议一并带入仓库
- 每个文件都保留来源 URL 和抓取日期
- 这些样例默认用于：
  - `convert`
  - `schema`
  - `sing-box check`
- 不把公网节点可用性作为发布门禁；真实连通性仍以仓库内本地闭环 fixture 为准

## 当前公开样例

| 文件 | 来源 | 覆盖点 |
| --- | --- | --- |
| `6-public-ss-subset.yaml` | `asgharkapk/Sub-Config-Extractor` | 公开 SS 聚合配置子集 |
| `7-public-vmess-trojan-vless-subset.yaml` | `hossein-shayesteh/v2ray-config` | 公开多协议 Clash 配置子集 |
| `8-public-vless-reality-subset.yaml` | `asgharkapk/Sub-Config-Extractor` | 公开 VLESS Reality 配置子集 |
| `9-public-hysteria2-subset.yaml` | `zhy121212` gist | 公开 Hysteria2 配置子集 |
| `10-public-http-subset.yaml` | `iso8434` gist | 公开 HTTP 上游配置子集 |
| `11-public-vless-grpc-subset.yaml` | `asgharkapk/Sub-Config-Extractor` | 公开 VLESS gRPC 与 gRPC + Reality 子集 |
| `12-public-vmess-variants-subset.yaml` | `hossein-shayesteh/v2ray-config` + `iso8434` gist | 公开 VMess `ws + tls` / `tcp` 变体子集 |
| `13-public-vmess-grpc-subset.yaml` | `liliangyin` gist | 公开 VMess gRPC 配置子集 |
| `14-public-trojan-tls-subset.yaml` | `zhangkaiitugithub/passcro` | 公开 Trojan TLS 配置子集 |
| `15-public-vless-ws-subset.yaml` | `zhangkaiitugithub/passcro` | 公开 VLESS WebSocket 配置子集 |

## 批量检查

可直接执行：

```bash
bun run check:public-real
```

该命令会对当前目录下公开样例逐个执行：

1. `convert`
2. `schema`
3. `sing-box check`

默认不执行公网 `proxy:smoke`。
