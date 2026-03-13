# SubBridge 自动化验证工具

## 1. 目标

`verify` 命令用于验证已经生成的 `sing-box` 配置是否真正达到“可用”状态。  
它不是替代 `convert`，而是补上生成后的运行时验证闭环。

默认验证链路：

1. JSON Schema 校验
2. `sing-box check`
3. `proxy:smoke`

只要任一步失败，命令退出码就是非 `0`。

## 2. 基本用法

```bash
bun src/cli/index.ts verify -i singbox.json
```

默认行为：

- 先校验配置结构
- 再执行 `sing-box check`
- 最后启动临时验证进程并做代理连通性探测

成功时会输出：

- `gstatic` 探测结果
- `YouTube` 探测结果
- 出口 IP

## 3. 常用参数

```bash
bun src/cli/index.ts verify -i singbox.json -r verify-report.json
```

支持参数：

- `-i, --input <file>`：待验证的 `sing-box` JSON 配置
- `-r, --report <file>`：写出结构化验证报告
- `--no-singbox-check`：跳过 `sing-box check`
- `--no-smoke`：跳过 `proxy:smoke`
- `--proxy <url>`：指定 smoke 使用的本地代理地址，默认 `http://127.0.0.1:7893`
- `--bin <path>`：指定 `sing-box` 二进制路径
- `--keep-tun`：smoke 时保留原始 `tun` 入站
- `--keep-tmp`：保留 smoke 临时目录和日志

## 4. 推荐使用方式

### 本地开发快速检查

```bash
bun src/cli/index.ts verify -i singbox.json --no-smoke
```

适合先确认：

- 结构正确
- `sing-box check` 可过

### 发布前完整检查

```bash
bun src/cli/index.ts verify -i singbox.json -r verify-report.json
```

适合做正式验收，因为它会覆盖：

1. 配置能否被接受
2. 配置能否被 `sing-box` 正常加载
3. 配置能否实际代理流量

## 5. 退出语义

- 退出码 `0`：全部选定验证项通过
- 退出码非 `0`：至少有一个验证项失败

这意味着 `verify` 可以直接接进：

- 本地发布前脚本
- CI
- 批量回归任务

发布门禁使用固定代表性样例，不依赖随机公网节点。

## 6. 报告结构

`--report` 输出包含三类步骤状态：

- `schema`
- `singboxCheck`
- `proxySmoke`

每一步都会记录：

- `status`：`passed | failed | skipped`
- `errors`
- 可选的 `details`

适合后续做：

- 自动回归基线
- 发布前门禁
- Web / CLI 统一验证展示
