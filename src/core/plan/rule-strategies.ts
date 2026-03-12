import { MigrationErrorCode } from '../types/migration';
import type { RuleMatcher } from '../types/normalized-clash';

export interface RuleStrategyResult {
    payload: Record<string, unknown>;
    notes: string[];
    reason: string;
    issue?: {
        code: MigrationErrorCode;
        message: string;
        impact: string;
        fallback: string;
    };
}

type RuleStrategy = (matcher: RuleMatcher, outbound: string) => RuleStrategyResult | null;

const DIRECT_STRATEGIES: Partial<Record<RuleMatcher['type'], RuleStrategy>> = {
    domain: (matcher, outbound) => ({
        payload: {
            domain: [(matcher as Extract<RuleMatcher, { type: 'domain' }>).value],
            outbound,
        },
        notes: [],
        reason: 'Matcher domain is lowered directly into sing-box route fields',
    }),
    domain_suffix: (matcher, outbound) => ({
        payload: {
            domain_suffix: [(matcher as Extract<RuleMatcher, { type: 'domain_suffix' }>).value],
            outbound,
        },
        notes: [],
        reason: 'Matcher domain_suffix is lowered directly into sing-box route fields',
    }),
    domain_keyword: (matcher, outbound) => ({
        payload: {
            domain_keyword: [(matcher as Extract<RuleMatcher, { type: 'domain_keyword' }>).value],
            outbound,
        },
        notes: [],
        reason: 'Matcher domain_keyword is lowered directly into sing-box route fields',
    }),
    src_ip_cidr: (matcher, outbound) => ({
        payload: {
            source_ip_cidr: [(matcher as Extract<RuleMatcher, { type: 'src_ip_cidr' }>).value],
            outbound,
        },
        notes: [],
        reason: 'Matcher src_ip_cidr is lowered directly into sing-box route fields',
    }),
    port: (matcher, outbound) => ({
        payload: { port: (matcher as Extract<RuleMatcher, { type: 'port' }>).value, outbound },
        notes: [],
        reason: 'Matcher port is lowered directly into sing-box route fields',
    }),
    port_range: (matcher, outbound) => {
        const typed = matcher as Extract<RuleMatcher, { type: 'port_range' }>;
        return {
            payload: { port_range: `${typed.start}:${typed.end}`, outbound },
            notes: [],
            reason: 'Matcher port_range is lowered directly into sing-box route fields',
        };
    },
    src_port: (matcher, outbound) => ({
        payload: {
            source_port: (matcher as Extract<RuleMatcher, { type: 'src_port' }>).value,
            outbound,
        },
        notes: [],
        reason: 'Matcher src_port is lowered directly into sing-box route fields',
    }),
    src_port_range: (matcher, outbound) => {
        const typed = matcher as Extract<RuleMatcher, { type: 'src_port_range' }>;
        return {
            payload: { source_port_range: `${typed.start}:${typed.end}`, outbound },
            notes: [],
            reason: 'Matcher src_port_range is lowered directly into sing-box route fields',
        };
    },
    process_name: (matcher, outbound) => ({
        payload: {
            process_name: (matcher as Extract<RuleMatcher, { type: 'process_name' }>).value,
            outbound,
        },
        notes: [],
        reason: 'Matcher process_name is lowered directly into sing-box route fields',
    }),
};

export function buildRuleStrategyFromMatcher(
    matcher: RuleMatcher,
    outbound: string
): RuleStrategyResult | null {
    const direct = DIRECT_STRATEGIES[matcher.type];
    if (direct) {
        return direct(matcher, outbound);
    }

    switch (matcher.type) {
        case 'ip_cidr':
            return buildIpCidrStrategy(matcher, outbound);
        case 'network':
            return buildNetworkStrategy(matcher, outbound);
        case 'geoip':
        case 'geosite':
            return null;
        case 'domain_regex':
            return buildDomainRegexStrategy(matcher.value, outbound);
        case 'process_path':
            return buildProcessPathStrategy(matcher.value, outbound);
        default:
            return null;
    }
}

export function describeRuleMatcher(matcher: RuleMatcher): string {
    switch (matcher.type) {
        case 'domain_regex':
            return `domain_regex:${matcher.value}`;
        case 'process_path':
            return `process_path:${Array.isArray(matcher.value) ? matcher.value.join(',') : matcher.value}`;
        case 'ip_cidr':
            return matcher.noResolve
                ? `ip_cidr:${matcher.value} + NO-RESOLVE`
                : `ip_cidr:${matcher.value}`;
        case 'network':
            return `network:${matcher.value}`;
        case 'geoip':
        case 'geosite':
            return `${matcher.type}:${matcher.value}`;
        default:
            return matcher.type;
    }
}

function buildIpCidrStrategy(
    matcher: Extract<RuleMatcher, { type: 'ip_cidr' }>,
    outbound: string
): RuleStrategyResult {
    return {
        payload: { ip_cidr: [matcher.value], outbound },
        notes: matcher.noResolve ? ['drop:no-resolve option'] : [],
        reason: matcher.noResolve
            ? 'ip_cidr rule is lowered but NO-RESOLVE has no dedicated target field in V1 planner'
            : 'Matcher ip_cidr is lowered directly into sing-box route fields',
        issue: matcher.noResolve
            ? {
                  code: MigrationErrorCode.UNSUPPORTED_FIELD,
                  message: `Rule option NO-RESOLVE is ignored for "${matcher.value}"`,
                  impact: 'Route matching is preserved but resolver behavior may differ.',
                  fallback: 'Emit ip_cidr rule without the NO-RESOLVE option',
              }
            : undefined,
    };
}

function buildNetworkStrategy(
    matcher: Extract<RuleMatcher, { type: 'network' }>,
    outbound: string
): RuleStrategyResult {
    return {
        payload: { network: matcher.value === 'both' ? ['tcp', 'udp'] : [matcher.value], outbound },
        notes: matcher.value === 'both' ? ['expand:both->tcp,udp'] : [],
        reason:
            matcher.value === 'both'
                ? 'Network matcher "both" is expanded to tcp+udp for sing-box'
                : 'Matcher network is lowered directly into sing-box route fields',
    };
}

function buildDomainRegexStrategy(pattern: string, outbound: string): RuleStrategyResult | null {
    const exact = pattern.match(/^\^([a-zA-Z0-9.-]+)\$$/);
    if (exact) {
        return {
            payload: { domain: [unescapeDomainPattern(exact[1])], outbound },
            notes: ['degraded:domain-regex->domain'],
            reason: 'A simple anchored domain regex can be approximated as an exact domain match',
            issue: {
                code: MigrationErrorCode.UNSUPPORTED_FIELD,
                message: `Domain regex "${pattern}" was approximated as an exact domain rule`,
                impact: 'Regex semantics are simplified to an exact domain match.',
                fallback: 'Emit a domain matcher using the unescaped anchored hostname',
            },
        };
    }

    const suffix = pattern.match(/^\^(?:\(\.\+\\\.\)\?|.\*\\\.)?([a-zA-Z0-9.-]+)\$$/);
    if (suffix) {
        return {
            payload: { domain_suffix: [unescapeDomainPattern(suffix[1])], outbound },
            notes: ['degraded:domain-regex->domain_suffix'],
            reason: 'A hostname suffix regex can be approximated as a domain suffix match',
            issue: {
                code: MigrationErrorCode.UNSUPPORTED_FIELD,
                message: `Domain regex "${pattern}" was approximated as a domain suffix rule`,
                impact: 'Regex semantics are simplified to a suffix match.',
                fallback: 'Emit a domain_suffix matcher using the extracted hostname suffix',
            },
        };
    }

    const keyword = extractPlainKeyword(pattern);
    if (keyword) {
        return {
            payload: { domain_keyword: [keyword], outbound },
            notes: ['degraded:domain-regex->domain_keyword'],
            reason: 'A contains-style regex can be approximated as a domain keyword match',
            issue: {
                code: MigrationErrorCode.UNSUPPORTED_FIELD,
                message: `Domain regex "${pattern}" was approximated as a domain keyword rule`,
                impact: 'Regex semantics are simplified to a substring match.',
                fallback: 'Emit a domain_keyword matcher using the extracted plain text fragment',
            },
        };
    }

    return null;
}

function buildProcessPathStrategy(
    value: string | string[],
    outbound: string
): RuleStrategyResult | null {
    const values = Array.isArray(value) ? value : [value];
    const processNames = values
        .map(extractProcessName)
        .filter((item): item is string => Boolean(item));

    if (processNames.length === 0) {
        return null;
    }

    return {
        payload: {
            process_name: processNames.length === 1 ? processNames[0] : processNames,
            outbound,
        },
        notes: ['degraded:process-path->process-name'],
        reason: 'process_path rule is approximated using the executable basename',
        issue: {
            code: MigrationErrorCode.UNSUPPORTED_FIELD,
            message: `Process path rule was approximated as process_name: ${processNames.join(', ')}`,
            impact: 'Full path matching is simplified to executable name matching.',
            fallback: 'Emit a process_name matcher using extracted executable basenames',
        },
    };
}

function unescapeDomainPattern(value: string): string {
    return value.replace(/\\\./g, '.');
}

function extractPlainKeyword(pattern: string): string | null {
    const match = pattern.match(/^\^\.\*([a-zA-Z0-9-]+)\.\*\$$/);
    if (!match) {
        return null;
    }

    return match[1] ?? null;
}

function extractProcessName(value: string): string | null {
    const parts = value.split(/[\\/]/).filter(Boolean);
    const last = parts[parts.length - 1];
    if (!last) {
        return null;
    }

    return last.replace(/\.(exe|app)$/i, '') || null;
}
