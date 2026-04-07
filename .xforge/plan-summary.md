# PLAN 方案摘要
**任务**：根据我们设计的开发计划对项目进行重构
**时间**：2026-04-07T10:05:00Z

## 评估的方案
1. **先建新体系，后删旧体系** — ✅ 风险低，任意时间点可回退，中间状态稳定
2. **边建边删（增量替换）** — ⚠️ 中间状态破碎，回退复杂
3. **先删后建** — ❌ 风险极高，中间项目不可运行

## 选定方案
**先建新体系，后清理** — 逐步构建 6 个子任务，保证每步可独立验证；最后一步统一清理旧模块和重写测试。

## 子任务列表
1. 类型定义 + Fetch 层（types/node.ts, fetch/clash.ts, fetch/providers.ts）
2. 协议转换层（convert/outbounds.ts，移植自 plan/proxies.ts）
3. 国家分组（group/patterns.ts, group/countries.ts）
4. 内置模板 + 占位符注入（template/*, inject/*）
5. 警告收集 + 主流水线（observe/warnings.ts, build/pipeline.ts）
6. CLI 重写 + 旧代码清理（cli/commands/build.ts, init.ts，删除旧模块，重写测试）
