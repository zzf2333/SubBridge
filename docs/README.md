# SubBridge 公开文档索引（v0.2.1）

这里的 `docs/` 只放会提交到 Git 仓库、面向外部读者的公开文档。  

本地开发者使用的设计文档、架构推演、修改草案请放到：

- `docs/local/`

该目录默认不提交到 Git，只作为本地开发参考。

## 文档列表

1. [how-to-convert-clash-to-sing-box.md](./how-to-convert-clash-to-sing-box.md)  
   面向搜索用户的专题指南，回答如何将 Clash / Clash.Meta YAML 转换为 sing-box 配置。
2. [verification.md](./verification.md)  
   生成配置后的自动化验证工具说明（`schema -> sing-box check -> proxy:smoke`）。
3. [release.md](./release.md)  
   首发与后续版本发布的标准操作流程与模板。
4. [release-notes.md](./release-notes.md)  
   版本开发说明与提交文案的单一来源，发版时按当前版本自动提取。

## 推荐阅读顺序

1. 先看专题指南，确认搜索用户最关心的使用路径。
2. 需要执行生成后验证时看验证工具文档。
3. 需要准备发版时看发布流程和版本文案。
