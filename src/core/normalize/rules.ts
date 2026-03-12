import { MigrationErrorCode, type MigrationIssue } from '../types/migration';
import type { NormalizedRule, RuleMatcher, RuleTargetRef } from '../types/normalized-clash';

export function normalizeRules(rawRules: string[] = []): {
    rules: NormalizedRule[];
    issues: MigrationIssue[];
} {
    const rules: NormalizedRule[] = [];
    const issues: MigrationIssue[] = [];

    rawRules.forEach((rawRule, index) => {
        const sourcePath = `rules[${index}]`;
        const normalized = parseRule(rawRule, sourcePath);
        if (normalized) {
            rules.push(normalized);
        } else {
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.INVALID_RULE_SYNTAX,
                module: 'rule',
                sourcePath,
                message: `Unable to parse rule: ${rawRule}`,
                impact: 'The rule will be ignored in downstream planning',
            });
        }
    });

    return { rules, issues };
}

function parseRule(rawRule: string, sourcePath: string): NormalizedRule | null {
    const parts = rawRule.split(',').map((part) => part.trim());
    if (parts.length < 2) {
        return null;
    }

    const type = parts[0]?.toUpperCase();
    const parsed = parseMatcherAndTarget(type, parts);
    if (!parsed) {
        return null;
    }

    const { matcher, target, options } = parsed;
    if (!matcher) {
        return null;
    }

    return {
        id: crypto.randomUUID(),
        stableKey: `rule:${sourcePath}:${rawRule}`,
        raw: rawRule,
        sourcePath,
        matcher,
        target,
        options,
    };
}

function parseMatcherAndTarget(
    type: string | undefined,
    parts: string[]
): {
    matcher: RuleMatcher;
    target: RuleTargetRef;
    options: NormalizedRule['options'];
} | null {
    if (!type) {
        return null;
    }

    switch (type) {
        case 'MATCH':
            return {
                matcher: { type: 'match' },
                target: parseTarget(parts[1] ?? 'DIRECT'),
                options: { extra: {} },
            };
        case 'DOMAIN':
            return buildMatcherRule({ type: 'domain', value: parts[1] }, parts[2], parts.slice(3));
        case 'DOMAIN-SUFFIX':
            return buildMatcherRule(
                { type: 'domain_suffix', value: parts[1] },
                parts[2],
                parts.slice(3)
            );
        case 'DOMAIN-KEYWORD':
            return buildMatcherRule(
                { type: 'domain_keyword', value: parts[1] },
                parts[2],
                parts.slice(3)
            );
        case 'DOMAIN-REGEX':
            return buildMatcherRule(
                { type: 'domain_regex', value: parts[1] },
                parts[2],
                parts.slice(3)
            );
        case 'RULE-SET':
            return buildMatcherRule(
                { type: 'rule_set', value: parts[1] },
                parts[2],
                parts.slice(3)
            );
        case 'SCRIPT':
            return buildMatcherRule({ type: 'script', value: parts[1] }, parts[2], parts.slice(3));
        case 'IP-CIDR':
            return buildMatcherRule(
                { type: 'ip_cidr', value: parts[1], noResolve: hasNoResolve(parts.slice(3)) },
                parts[2],
                parts.slice(3)
            );
        case 'SRC-IP-CIDR':
            return buildMatcherRule(
                { type: 'src_ip_cidr', value: parts[1] },
                parts[2],
                parts.slice(3)
            );
        case 'GEOIP':
            return buildMatcherRule({ type: 'geoip', value: parts[1] }, parts[2], parts.slice(3));
        case 'GEOSITE':
            return buildMatcherRule({ type: 'geosite', value: parts[1] }, parts[2], parts.slice(3));
        case 'DST-PORT':
            return buildMatcherRule(parsePortMatcher('port', parts[1]), parts[2], parts.slice(3));
        case 'SRC-PORT':
            return buildMatcherRule(
                parsePortMatcher('src_port', parts[1]),
                parts[2],
                parts.slice(3)
            );
        case 'PROCESS-NAME':
            return buildMatcherRule(
                { type: 'process_name', value: parts[1] },
                parts[2],
                parts.slice(3)
            );
        case 'PROCESS-PATH':
            return buildMatcherRule(
                { type: 'process_path', value: parts[1] },
                parts[2],
                parts.slice(3)
            );
        case 'NETWORK':
            return buildMatcherRule(
                { type: 'network', value: normalizeNetwork(parts[1]) },
                parts[2],
                parts.slice(3)
            );
        default:
            return null;
    }
}

function buildMatcherRule(
    matcher: RuleMatcher | null,
    target: string | undefined,
    extraOptions: string[]
): {
    matcher: RuleMatcher;
    target: RuleTargetRef;
    options: NormalizedRule['options'];
} | null {
    if (!matcher) {
        return null;
    }

    return {
        matcher,
        target: parseTarget(target ?? 'DIRECT'),
        options: {
            disableResolve: hasNoResolve(extraOptions),
            extra: collectExtraRuleOptions(extraOptions),
        },
    };
}

function parsePortMatcher(prefix: 'port' | 'src_port', value?: string): RuleMatcher | null {
    if (!value) {
        return null;
    }
    const range = value.split('-').map((part) => Number(part.trim()));
    if (range.length === 2 && range.every(Number.isFinite)) {
        return prefix === 'port'
            ? { type: 'port_range', start: range[0], end: range[1] }
            : { type: 'src_port_range', start: range[0], end: range[1] };
    }

    const port = Number(value);
    if (!Number.isFinite(port)) {
        return null;
    }

    return prefix === 'port' ? { type: 'port', value: port } : { type: 'src_port', value: port };
}

function hasNoResolve(values: string[]): boolean {
    return values.some((value) => value.toUpperCase() === 'NO-RESOLVE');
}

function collectExtraRuleOptions(values: string[]): Record<string, unknown> {
    const extra = values.filter((value) => value.toUpperCase() !== 'NO-RESOLVE');
    return extra.length > 0 ? { flags: extra } : {};
}

function normalizeNetwork(value?: string): 'tcp' | 'udp' | 'both' {
    if (value === 'tcp' || value === 'udp') {
        return value;
    }
    return 'both';
}

function parseTarget(target: string): RuleTargetRef {
    if (target === 'DIRECT' || target === 'REJECT' || target === 'GLOBAL' || target === 'PASS') {
        return { kind: 'special', name: target };
    }
    if (!target) {
        return { kind: 'special', name: 'DIRECT' };
    }
    return { kind: 'unknown', name: target };
}
