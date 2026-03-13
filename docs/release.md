# SubBridge 发布流程（v0.2.1）

## 1. 版本策略

- 使用 `0.x.y`（SemVer 预稳定阶段）
- 推荐规则：
  - 行为新增：`minor`
  - 问题修复：`patch`
  - 破坏性改动：仍走 `minor`，并在 Release Note 明确标注

## 2. 发布前检查

统一执行：

```bash
bun run release:check
```

受限本地环境（例如无法绑定端口）可临时使用：

```bash
REQUIRE_WEB_SMOKE=0 bun run release:check
```

注意：正式发布前仍应在 CI 或可用环境以 `REQUIRE_WEB_SMOKE=1` 完整通过。

该命令会依次执行：

1. `lint`
2. `test`
3. `build`
4. `bun run release:notes`
5. `bun run seo:check`
6. `bun run verify:fixtures`
7. `REQUIRE_WEB_SMOKE=1 bun run smoke`
8. `npm pack --dry-run`

CI 目前固定安装 `sing-box 1.13.1` 作为发布门禁运行版本。  
本地预发版验证建议使用同版本，避免因二进制差异导致误判。

## 3. 发版步骤（GitHub）

1. 确认当前改动已合入目标分支
2. 更新 `package.json` 版本号
3. 在 [`docs/release-notes.md`](./release-notes.md) 中补充当前版本条目
   - `提交文案` 必须使用英文编写
   - `开发说明` 保持中文即可
4. 执行发布前检查
5. 提取当前版本提交文案：

```bash
bun run release:notes > /tmp/subbridge-release-notes.md
```

6. 提交版本变更
7. 打 tag（示例：`v0.2.1`）
8. 推送 commit 与 tag
9. 在 GitHub 创建 Release，使用当前版本文案：

```bash
gh release create "v0.2.1" --notes-file /tmp/subbridge-release-notes.md
```

如果使用网页创建 Release，可先执行 `bun run release:notes` 并粘贴输出内容。

10. 手动更新 GitHub 仓库 SEO 元信息：
   - About Description：使用中文主描述或中英结合短句
   - Topics：补齐 `clash`, `clash-meta`, `sing-box`, `converter`, `subscription`, `proxy`
   - Website：若没有公开站点，可暂时留空

## 3.1 本地开发文档约定

- `docs/` 只放会提交到 Git 的公开文档
- 本地开发者使用的设计草案、架构推演、修改记录请放到 `docs/local/`
- `docs/local/` 默认不提交到 Git

## 4. 发布后检查

1. 从发布包安装并验证 CLI：
   - `subbridge --version`
   - `subbridge convert -i <input> -o <output>`
2. 检查 Web 入口健康探针：
   - `GET /health`
3. 抽样验证 `api/convert` 与 `api/subscribe`
4. 确认 GitHub 仓库首页 README 首屏和 About 信息已经使用最新 SEO 文案

## 5. 回滚策略

- 如果发布后发现严重问题：
  1. 立刻发布修复版本（推荐）
  2. 或下架问题版本并回滚到上一个可用 tag
- 回滚后必须补充回归测试，防止问题再次出现
