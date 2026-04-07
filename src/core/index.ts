// 核心转换 API
export { runPipeline } from './build/pipeline';
export type { PipelineOptions, PipelineResult } from './build/pipeline';

// 警告收集器
export { WarningCollector } from './observe/warnings';

// Schema 验证
export { validateSingboxConfig } from './validator/index';
export type { ValidationResult } from './validator/index';

// 节点类型
export type { SubBridgeNode } from './types/node';
