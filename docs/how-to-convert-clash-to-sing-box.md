# 如何将 Clash / Clash.Meta YAML 转换为 sing-box 配置

如果你的目标是把 `Clash` 或 `Clash.Meta YAML` 迁移到 `sing-box`，并且不想手工逐条改节点、分组、规则、DNS、TUN，那么 `SubBridge` 就是为这个场景设计的。

本文档面向这些问题：

- 如何做 `Clash 转 sing-box`
- 如何做 `Clash 订阅转换`
- 如何做 `Clash 配置迁移`
- 如何验证生成后的 `sing-box` 配置是否真的可用

## 1. 适用场景

你适合直接使用 `SubBridge`，如果你正在做以下事情：

- 手头有一份 `Clash / Clash.Meta YAML`，希望生成 `sing-box` 配置
- 需要把机场提供的 `Clash` 订阅接入 `sing-box`
- 想保留分组、规则、DNS、TUN 的主要结构，而不是只导出节点列表
- 想要迁移后能继续执行 `sing-box check` 和代理连通性验证

## 2. SubBridge 解决什么问题

`SubBridge` 不是一个“只把格式改一下”的脚本，而是一个围绕 `Clash / Clash.Meta YAML -> sing-box` 的迁移工具链。

它解决的是三类问题：

1. **生成可运行配置**
   - 目标不是看起来像 `sing-box`，而是尽量可运行。

2. **解释迁移过程**
   - 输出结构化报告，说明哪些字段被保留、近似、修复或降级。

3. **验证迁移结果**
   - 通过 `verify` 继续跑 `schema -> sing-box check -> proxy:smoke`。

## 3. 输入与输出

输入：

- `Clash / Clash.Meta YAML` 文本
- 本地 YAML 文件
- 远程 Clash 订阅 URL

输出：

- `sing-box` JSON 配置
- 迁移报告（可选）
- 验证报告（可选）

## 4. 使用命令

### 4.1 本地文件转换

```bash
subbridge convert -i clash.yaml -o singbox.json
```

### 4.2 远程订阅转换

```bash
subbridge convert -u https://example.com/clash -o singbox.json
```

### 4.3 输出迁移报告

```bash
subbridge convert -i clash.yaml -o singbox.json -r report.json --report-display report-display.json
```

### 4.4 预拉取 provider 后再迁移

```bash
subbridge convert -i clash.yaml -o singbox.json --provider-fetch-scope all --provider-fetch-timeout 4000
```

## 5. 转换后验证步骤

完成转换后，建议不要直接结束，而是继续执行：

```bash
subbridge verify -i singbox.json
```

默认验证链路：

1. schema 校验
2. `sing-box check`
3. `proxy:smoke`

如果你只想看静态合法性，也可以使用：

```bash
subbridge validate -i singbox.json --with-singbox
```

## 6. 常见问题

### Clash 订阅和 Clash.Meta YAML 都支持吗？

支持。当前公开承诺的输入范围就是 `Clash / Clash.Meta YAML`。

### 为什么不建议手工改？

因为 `Clash` 和 `sing-box` 的结构差异不只在字段名，还有分组、规则、DNS、TUN、Provider 等行为差异。手工迁移很容易出现“看起来能用，实际运行出错”的情况。

### 生成之后一定可用吗？

`SubBridge` 的目标是“尽量生成可运行配置”，但最终是否可用仍然受源配置质量、节点状态、网络环境影响。所以推荐始终执行 `verify`。

### 这个项目是不是在线转换平台？

不是。当前定位是一个公开仓库和工具链，用于稳定完成 `Clash / Clash.Meta YAML -> sing-box` 的迁移与验证。

## 7. 下一步阅读

- [返回 README 快速开始](../README.md)
- [查看文档索引](./README.md)
- [查看自动化验证工具说明](./verification.md)
