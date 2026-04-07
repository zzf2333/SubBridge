/**
 * observe/warnings.ts — 流水线警告收集器
 *
 * 负责在流水线执行过程中收集各类警告，并在最终阶段输出摘要。
 * 不抛出异常，只记录警告，遵循"降级而非失败"原则。
 */

export class WarningCollector {
    private _protocolUnsupported: { tag: string; type: string }[] = [];
    private _fieldMissing: { tag: string; fields: string[] }[] = [];
    private _fetchFailed: { source: string; reason: string }[] = [];
    private _validationWarnings: string[] = [];

    addProtocolUnsupported(tag: string, type: string): void {
        this._protocolUnsupported.push({ tag, type });
    }

    addFieldMissing(tag: string, fields: string[]): void {
        this._fieldMissing.push({ tag, fields });
    }

    addFetchFailed(source: string, reason: string): void {
        this._fetchFailed.push({ source, reason });
    }

    addValidationWarning(reason: string): void {
        this._validationWarnings.push(reason);
    }

    get hasWarnings(): boolean {
        return (
            this._protocolUnsupported.length > 0 ||
            this._fieldMissing.length > 0 ||
            this._fetchFailed.length > 0 ||
            this._validationWarnings.length > 0
        );
    }

    /**
     * 输出警告摘要到 stderr，格式：
     * [SubBridge] 已转换 N 个节点，跳过 M 个
     *   - "NodeA" 协议不支持: vless-reality
     *   - "NodeB" 缺失字段: uuid, server
     *   - 订阅源 https://xxx 拉取失败: timeout
     */
    printToStderr(convertedCount: number): void {
        const skippedCount = this._protocolUnsupported.length + this._fieldMissing.length;
        const lines: string[] = [];

        lines.push(`[SubBridge] 已转换 ${convertedCount} 个节点，跳过 ${skippedCount} 个`);

        for (const item of this._protocolUnsupported) {
            lines.push(`  - "${item.tag}" 协议不支持: ${item.type}`);
        }

        for (const item of this._fieldMissing) {
            lines.push(`  - "${item.tag}" 缺失字段: ${item.fields.join(', ')}`);
        }

        for (const item of this._fetchFailed) {
            lines.push(`  - 订阅源 ${item.source} 拉取失败: ${item.reason}`);
        }

        for (const reason of this._validationWarnings) {
            lines.push(`[SubBridge] 验证警告: ${reason}`);
        }

        process.stderr.write(lines.join('\n') + '\n');
    }
}
