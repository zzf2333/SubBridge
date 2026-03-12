import { MigrationErrorCode, type MigrationIssue } from '../types/migration';
import type { SingBoxConfig } from '../types/singbox';

export function validateLogicalReferences(config: SingBoxConfig): {
    valid: boolean;
    issues: MigrationIssue[];
} {
    const issues: MigrationIssue[] = [];
    const outboundTags = new Set((config.outbounds ?? []).map((outbound) => outbound.tag));
    const dnsServerTags = new Set((config.dns?.servers ?? []).map((server) => server.tag));
    const ruleSetTags = new Set((config.route?.rule_set ?? []).map((ruleSet) => ruleSet.tag));

    for (const outbound of config.outbounds ?? []) {
        if (outbound.type === 'selector' || outbound.type === 'urltest') {
            const members = Array.isArray((outbound as { outbounds?: unknown }).outbounds)
                ? ((outbound as { outbounds: unknown[] }).outbounds as unknown[])
                : [];

            for (const member of members) {
                if (typeof member !== 'string' || !outboundTags.has(member)) {
                    issues.push(
                        createIssue(
                            'route',
                            MigrationErrorCode.MISSING_REFERENCE,
                            `Outbound "${outbound.tag}" references missing outbound "${String(member)}"`,
                            'Selector or urltest outbound cannot resolve one of its members.',
                            outbound.tag
                        )
                    );
                }
            }

            const defaultTag = (outbound as { default?: unknown }).default;
            if (typeof defaultTag === 'string' && !outboundTags.has(defaultTag)) {
                issues.push(
                    createIssue(
                        'route',
                        MigrationErrorCode.MISSING_REFERENCE,
                        `Outbound "${outbound.tag}" default target "${defaultTag}" does not exist`,
                        'Selector outbound default target is invalid.',
                        outbound.tag
                    )
                );
            }
        }
    }

    for (const rule of config.route?.rules ?? []) {
        if (typeof rule.outbound === 'string' && !outboundTags.has(rule.outbound)) {
            issues.push(
                createIssue(
                    'route',
                    MigrationErrorCode.INVALID_RULE_TARGET,
                    `Route rule references missing outbound "${rule.outbound}"`,
                    'Traffic matched by this rule cannot be forwarded.',
                    rule.outbound
                )
            );
        }

        const ruleSetRefs = Array.isArray(rule.rule_set)
            ? rule.rule_set
            : typeof rule.rule_set === 'string'
              ? [rule.rule_set]
              : [];

        for (const ref of ruleSetRefs) {
            if (!ruleSetTags.has(ref)) {
                issues.push(
                    createIssue(
                        'route',
                        MigrationErrorCode.MISSING_REFERENCE,
                        `Route rule references missing rule_set "${ref}"`,
                        'Traffic matched by this route rule cannot resolve the intended rule-set placeholder.',
                        ref
                    )
                );
            }
        }
    }

    if (config.route?.final && !outboundTags.has(config.route.final)) {
        issues.push(
            createIssue(
                'route',
                MigrationErrorCode.MISSING_REFERENCE,
                `route.final references missing outbound "${config.route.final}"`,
                'The fallback route target is invalid.',
                config.route.final
            )
        );
    }

    for (const server of config.dns?.servers ?? []) {
        if (server.detour && !outboundTags.has(server.detour)) {
            issues.push(
                createIssue(
                    'dns',
                    MigrationErrorCode.MISSING_REFERENCE,
                    `DNS server "${server.tag}" detour "${server.detour}" does not exist`,
                    'DNS queries routed through this server cannot be forwarded.',
                    server.tag
                )
            );
        }
    }

    for (const rule of config.dns?.rules ?? []) {
        if (!dnsServerTags.has(rule.server)) {
            issues.push(
                createIssue(
                    'dns',
                    MigrationErrorCode.MISSING_REFERENCE,
                    `DNS rule references missing server "${rule.server}"`,
                    'Matched DNS requests cannot select a valid upstream server.',
                    rule.server
                )
            );
        }

        const outbound = rule.outbound;
        const outboundRefs = Array.isArray(outbound)
            ? outbound
            : typeof outbound === 'string'
              ? [outbound]
              : [];

        for (const ref of outboundRefs) {
            // "any" 是 sing-box DNS 规则的特殊关键字，匹配任意出站连接的 DNS 查询
            if (ref === 'any') {
                continue;
            }
            if (!outboundTags.has(ref)) {
                issues.push(
                    createIssue(
                        'dns',
                        MigrationErrorCode.MISSING_REFERENCE,
                        `DNS rule references missing outbound "${ref}"`,
                        'DNS routing condition cannot match the intended outbound.',
                        ref
                    )
                );
            }
        }
    }

    if (config.dns?.final && !dnsServerTags.has(config.dns.final)) {
        issues.push(
            createIssue(
                'dns',
                MigrationErrorCode.MISSING_REFERENCE,
                `dns.final references missing server "${config.dns.final}"`,
                'The fallback DNS upstream is invalid.',
                config.dns.final
            )
        );
    }

    if (
        typeof config.route?.default_domain_resolver === 'string' &&
        !dnsServerTags.has(config.route.default_domain_resolver)
    ) {
        issues.push(
            createIssue(
                'route',
                MigrationErrorCode.MISSING_REFERENCE,
                `route.default_domain_resolver references missing server "${config.route.default_domain_resolver}"`,
                'Default domain resolver target is invalid.',
                config.route.default_domain_resolver
            )
        );
    }

    const cycles = detectOutboundCycles(config);
    for (const cycle of cycles) {
        issues.push(
            createIssue(
                'route',
                MigrationErrorCode.CIRCULAR_REFERENCE,
                `Circular outbound reference detected: ${cycle.join(' -> ')}`,
                'Selector or urltest outbounds form a cycle and cannot be resolved safely.',
                cycle[0]
            )
        );
    }

    return {
        valid: issues.length === 0,
        issues,
    };
}

function createIssue(
    module: MigrationIssue['module'],
    code: MigrationIssue['code'],
    message: string,
    impact: string,
    objectName?: string
): MigrationIssue {
    return {
        id: crypto.randomUUID(),
        level: 'fatal',
        code,
        module,
        objectName,
        message,
        impact,
    };
}

function detectOutboundCycles(config: SingBoxConfig): string[][] {
    const graph = new Map<string, string[]>();

    for (const outbound of config.outbounds ?? []) {
        if (outbound.type !== 'selector' && outbound.type !== 'urltest') {
            continue;
        }

        const members = Array.isArray((outbound as { outbounds?: unknown }).outbounds)
            ? ((outbound as { outbounds: unknown[] }).outbounds as unknown[]).filter(
                  (value): value is string => typeof value === 'string'
              )
            : [];

        graph.set(outbound.tag, members);
    }

    const visited = new Set<string>();
    const active = new Set<string>();
    const cycles: string[][] = [];

    function visit(node: string, path: string[]): void {
        if (active.has(node)) {
            const start = path.indexOf(node);
            cycles.push([...path.slice(start), node]);
            return;
        }

        if (visited.has(node)) {
            return;
        }

        visited.add(node);
        active.add(node);

        for (const next of graph.get(node) ?? []) {
            if (graph.has(next)) {
                visit(next, [...path, node]);
            }
        }

        active.delete(node);
    }

    for (const node of graph.keys()) {
        visit(node, []);
    }

    return cycles;
}
