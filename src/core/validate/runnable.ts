import { MigrationErrorCode, type MigrationIssue } from '../types/migration';
import type { MigrationPlan } from '../types/migration-plan';
import type { SingBoxConfig } from '../types/singbox';

export function validateRunnableConfig(
    config: SingBoxConfig,
    plan: MigrationPlan
): {
    valid: boolean;
    issues: MigrationIssue[];
} {
    const issues: MigrationIssue[] = [];

    if (!config.outbounds || config.outbounds.length === 0) {
        issues.push(
            createRuntimeIssue(
                'No outbounds were generated',
                'The emitted configuration is not runnable'
            )
        );
    }

    if (!config.route?.final) {
        issues.push(
            createRuntimeIssue(
                'route.final is missing',
                'The emitted configuration has no fallback route target.'
            )
        );
    }

    if (plan.profile !== 'proxy-only' && (!config.inbounds || config.inbounds.length === 0)) {
        issues.push(
            createRuntimeIssue(
                `No inbounds were generated for profile "${plan.profile}"`,
                'Local client profiles need at least one inbound listener.'
            )
        );
    }

    if (
        plan.profile === 'tun-client' &&
        !config.inbounds?.some((inbound) => inbound.type === 'tun')
    ) {
        issues.push(
            createRuntimeIssue(
                'tun-client profile is missing a tun inbound',
                'The emitted configuration cannot act as a tun client.'
            )
        );
    }

    if (
        plan.profile === 'mixed-client' &&
        !config.inbounds?.some((inbound) => inbound.type === 'mixed')
    ) {
        issues.push(
            createRuntimeIssue(
                'mixed-client profile is missing a mixed inbound',
                'The emitted configuration cannot expose the expected local client port.'
            )
        );
    }

    if (config.dns && (!config.dns.servers || config.dns.servers.length === 0)) {
        issues.push(
            createRuntimeIssue(
                'dns section is present but no DNS servers were generated',
                'DNS-enabled profiles need at least one upstream server.'
            )
        );
    }

    return { valid: issues.length === 0, issues };
}

function createRuntimeIssue(message: string, impact: string): MigrationIssue {
    return {
        id: crypto.randomUUID(),
        level: 'fatal',
        code: MigrationErrorCode.INCOMPLETE_CONFIG,
        module: 'runtime',
        message,
        impact,
    };
}
