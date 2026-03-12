import { MigrationErrorCode, type MigrationIssue } from '../types/migration';
import { existsSync } from 'fs';
import { readFileSync } from 'fs';
import type {
    PlanningDecision,
    PlannedRepair,
    PlannedRouteRule,
    PlannedRuleSet,
} from '../types/migration-plan';
import type { MigrationAnalysis } from '../types/migration-analysis';
import type {
    NormalizedProviderRef,
    NormalizedRule,
    RuleTargetRef,
} from '../types/normalized-clash';
import { normalizeRules } from '../normalize/rules';
import { parseYamlInput } from '../parse/yaml';
import { createRepair } from './repair';
import { buildRuleStrategyFromMatcher, describeRuleMatcher } from './rule-strategies';

export function planRouteRules(
    rules: NormalizedRule[],
    ruleProviders: NormalizedProviderRef[],
    scriptShortcuts: Record<string, string>,
    analysis: MigrationAnalysis
): {
    rules: PlannedRouteRule[];
    ruleSets: PlannedRuleSet[];
    final?: string;
    issues: MigrationIssue[];
    decisions: PlanningDecision[];
    repairs: PlannedRepair[];
} {
    let final: string | undefined;
    const plannedRules: PlannedRouteRule[] = [];
    const plannedRuleSets: PlannedRuleSet[] = [];
    const issues: MigrationIssue[] = [];
    const decisions: PlanningDecision[] = [];
    const repairs: PlannedRepair[] = [];
    const emittedRuleSets = new Set<string>();
    const validTargets = new Set([
        ...analysis.graph.proxyNames,
        ...analysis.graph.groupNames,
        'direct',
        'block',
        'global',
    ]);
    const ruleProviderMap = new Map(ruleProviders.map((provider) => [provider.name, provider]));

    for (const rule of rules) {
        if (rule.matcher.type === 'match') {
            final = lowerTarget(rule.target);
            decisions.push({
                id: crypto.randomUUID(),
                kind:
                    analysis.objectStatuses.rules[rule.id] === 'degraded'
                        ? 'fallback-map'
                        : 'normalized-map',
                targetModule: 'route',
                targetId: rule.id,
                summary: `Use rule ${rule.raw} as route.final`,
                reason: 'MATCH rule is lowered to route.final in sing-box',
                sourcePaths: [rule.sourcePath],
            });
            repairs.push(
                createRepair({
                    kind: 'rewrite',
                    targetModule: 'route',
                    targetId: rule.id,
                    summary: `Rewrite MATCH target for ${rule.raw}`,
                    before: `Target ${describeTarget(rule.target)}`,
                    after: `route.final=${final}`,
                    reason: 'MATCH is emitted as route.final in sing-box',
                    sourcePaths: [rule.sourcePath],
                })
            );
            continue;
        }

        if (rule.matcher.type === 'rule_set') {
            const isKnownRuleProvider = analysis.graph.ruleProviderNames.includes(
                rule.matcher.value
            );
            const loweredTarget = lowerTarget(rule.target);
            if (!validTargets.has(loweredTarget)) {
                issues.push({
                    id: crypto.randomUUID(),
                    level: 'warning',
                    code: MigrationErrorCode.INVALID_RULE_TARGET,
                    module: 'rule',
                    sourcePath: rule.sourcePath,
                    objectId: rule.id,
                    objectStableKey: rule.stableKey,
                    objectName: rule.raw,
                    message: `Rule "${rule.raw}" references missing target "${loweredTarget}"`,
                    impact: 'The RULE-SET rule is dropped from planned route rules',
                    fallback: 'Skip emission for RULE-SET rules whose target cannot be resolved',
                });
                decisions.push({
                    id: crypto.randomUUID(),
                    kind: 'drop-unsupported',
                    targetModule: 'rule',
                    targetId: rule.id,
                    summary: `Drop RULE-SET ${rule.matcher.value}`,
                    reason: `Target ${loweredTarget} cannot be resolved to a planned outbound`,
                    sourcePaths: [rule.sourcePath],
                });
                repairs.push(
                    createRepair({
                        kind: 'drop',
                        targetModule: 'rule',
                        targetId: rule.id,
                        summary: `Drop RULE-SET ${rule.matcher.value}`,
                        before: rule.raw,
                        after: 'RULE-SET removed from planned route rules',
                        reason: `Target ${loweredTarget} cannot be resolved to a planned outbound`,
                        sourcePaths: [rule.sourcePath],
                    })
                );
                continue;
            }

            const provider = ruleProviderMap.get(rule.matcher.value);
            if (!isKnownRuleProvider) {
                issues.push({
                    id: crypto.randomUUID(),
                    level: 'warning',
                    code: MigrationErrorCode.MISSING_REFERENCE,
                    module: 'rule',
                    sourcePath: rule.sourcePath,
                    objectId: rule.id,
                    objectStableKey: rule.stableKey,
                    objectName: rule.raw,
                    message: `RULE-SET "${rule.matcher.value}" references a missing rule-provider`,
                    impact: 'The RULE-SET placeholder is not emitted as a route rule in V1.',
                    fallback: 'Drop the RULE-SET because its rule-provider cannot be resolved',
                });
                decisions.push({
                    id: crypto.randomUUID(),
                    kind: 'drop-unsupported',
                    targetModule: 'rule',
                    targetId: rule.id,
                    summary: `Drop RULE-SET ${rule.matcher.value}`,
                    reason: 'The referenced rule-provider cannot be resolved',
                    sourcePaths: [rule.sourcePath],
                });
                repairs.push(
                    createRepair({
                        kind: 'drop',
                        targetModule: 'rule',
                        targetId: rule.id,
                        summary: `Drop RULE-SET ${rule.matcher.value}`,
                        before: rule.raw,
                        after: 'RULE-SET removed from planned route rules',
                        reason: 'The referenced rule-provider cannot be resolved',
                        sourcePaths: [rule.sourcePath],
                    })
                );
                continue;
            }

            if (!emittedRuleSets.has(rule.matcher.value)) {
                const builtRuleSet = buildRuleSet(rule.matcher.value, provider);
                plannedRuleSets.push(builtRuleSet.ruleSet);
                issues.push(...builtRuleSet.issues);
                repairs.push(...builtRuleSet.repairs);
                emittedRuleSets.add(rule.matcher.value);
            }

            plannedRules.push({
                id: crypto.randomUUID(),
                sourcePaths: [rule.sourcePath],
                status: analysis.objectStatuses.rules[rule.id] ?? 'exact',
                notes: providerRuleNotes(provider),
                payload: {
                    rule_set: rule.matcher.value,
                    outbound: loweredTarget,
                },
            });
            decisions.push({
                id: crypto.randomUUID(),
                kind:
                    (analysis.objectStatuses.rules[rule.id] ?? 'exact') === 'degraded'
                        ? 'fallback-map'
                        : 'normalized-map',
                targetModule: 'rule',
                targetId: rule.id,
                summary: `Emit RULE-SET ${rule.matcher.value} as route rule`,
                reason: provider
                    ? `Map Clash rule-provider ${rule.matcher.value} to sing-box ${provider.vehicle === 'file' ? 'local' : provider.vehicle === 'http' ? 'remote' : 'inline'} rule_set`
                    : 'Map Clash rule-provider to sing-box rule_set',
                sourcePaths: [rule.sourcePath],
            });
            continue;
        }

        if (rule.matcher.type === 'script') {
            const loweredTarget = lowerTarget(rule.target);
            const shortcutStrategy = buildScriptShortcutRule(
                rule.matcher.value,
                loweredTarget,
                scriptShortcuts
            );
            if (!validTargets.has(loweredTarget)) {
                issues.push({
                    id: crypto.randomUUID(),
                    level: 'warning',
                    code: MigrationErrorCode.INVALID_RULE_TARGET,
                    module: 'rule',
                    sourcePath: rule.sourcePath,
                    objectId: rule.id,
                    objectStableKey: rule.stableKey,
                    objectName: rule.raw,
                    message: `Rule "${rule.raw}" references missing target "${loweredTarget}"`,
                    impact: 'The SCRIPT placeholder rule is dropped from planned route rules',
                    fallback: 'Skip emission for SCRIPT rules whose target cannot be resolved',
                });
                decisions.push({
                    id: crypto.randomUUID(),
                    kind: 'drop-unsupported',
                    targetModule: 'rule',
                    targetId: rule.id,
                    summary: `Drop SCRIPT rule ${rule.matcher.value}`,
                    reason: `Target ${loweredTarget} cannot be resolved to a planned outbound`,
                    sourcePaths: [rule.sourcePath],
                });
                repairs.push(
                    createRepair({
                        kind: 'drop',
                        targetModule: 'rule',
                        targetId: rule.id,
                        summary: `Drop SCRIPT rule ${rule.matcher.value}`,
                        before: rule.raw,
                        after: 'SCRIPT rule removed from planned route rules',
                        reason: `Target ${loweredTarget} cannot be resolved to a planned outbound`,
                        sourcePaths: [rule.sourcePath],
                    })
                );
                continue;
            }

            if (shortcutStrategy) {
                plannedRules.push({
                    id: crypto.randomUUID(),
                    sourcePaths: [rule.sourcePath],
                    status: 'degraded',
                    notes: shortcutStrategy.notes,
                    payload: shortcutStrategy.payload,
                });
                issues.push({
                    id: crypto.randomUUID(),
                    level: 'warning',
                    code: MigrationErrorCode.UNSUPPORTED_RULE_TYPE,
                    module: 'rule',
                    sourcePath: rule.sourcePath,
                    objectId: rule.id,
                    objectStableKey: rule.stableKey,
                    objectName: rule.raw,
                    message: `SCRIPT rule "${rule.matcher.value}" was statically lowered from script.shortcuts in V1`,
                    impact: 'The script shortcut is not executed dynamically, but a runnable approximation was emitted.',
                    fallback:
                        'Emit a static route rule approximation for the supported subset of script shortcut expressions',
                });
                decisions.push({
                    id: crypto.randomUUID(),
                    kind: 'fallback-map',
                    targetModule: 'rule',
                    targetId: rule.id,
                    summary: `Statically lower SCRIPT rule ${rule.matcher.value}`,
                    reason: 'The referenced script shortcut uses a simple expression that can be approximated as a sing-box route rule',
                    sourcePaths: [rule.sourcePath],
                });
                repairs.push(
                    createRepair({
                        kind: 'rewrite',
                        targetModule: 'rule',
                        targetId: rule.id,
                        summary: `Rewrite SCRIPT rule ${rule.matcher.value} as static route rule`,
                        before: rule.raw,
                        after: JSON.stringify(shortcutStrategy.payload),
                        reason: 'Preserve the supported subset of script shortcut semantics without executing a script engine',
                        sourcePaths: [rule.sourcePath],
                    })
                );
                continue;
            }

            const scriptTag = buildScriptPlaceholderTag(rule.matcher.value);
            if (!emittedRuleSets.has(scriptTag)) {
                plannedRuleSets.push({
                    id: crypto.randomUUID(),
                    tag: scriptTag,
                    sourcePaths: [rule.sourcePath],
                    status: 'degraded',
                    notes: [
                        'vehicle:inline',
                        'placeholder:empty-inline',
                        'script shortcut is not executed in V1',
                    ],
                    payload: {
                        type: 'inline',
                        tag: scriptTag,
                        rules: [],
                    },
                });
                emittedRuleSets.add(scriptTag);
            }

            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.UNSUPPORTED_RULE_TYPE,
                module: 'rule',
                sourcePath: rule.sourcePath,
                objectId: rule.id,
                objectStableKey: rule.stableKey,
                objectName: rule.raw,
                message: `SCRIPT rule "${rule.matcher.value}" is emitted as an empty rule-set placeholder in V1`,
                impact: 'The route rule is preserved, but the script shortcut is not executed in V1.',
                fallback:
                    'Emit an empty inline rule_set placeholder and preserve the route rule target',
            });
            plannedRules.push({
                id: crypto.randomUUID(),
                sourcePaths: [rule.sourcePath],
                status: 'degraded',
                notes: ['script placeholder emitted', 'script shortcut is not executed in V1'],
                payload: {
                    rule_set: scriptTag,
                    outbound: loweredTarget,
                },
            });
            decisions.push({
                id: crypto.randomUUID(),
                kind: 'fallback-map',
                targetModule: 'rule',
                targetId: rule.id,
                summary: `Emit SCRIPT rule ${rule.matcher.value} as placeholder route rule`,
                reason: 'V1 preserves Clash script rule positions by emitting empty inline rule_set placeholders instead of dropping the route rule',
                sourcePaths: [rule.sourcePath],
            });
            repairs.push(
                createRepair({
                    kind: 'rewrite',
                    targetModule: 'rule',
                    targetId: rule.id,
                    summary: `Rewrite SCRIPT rule ${rule.matcher.value} as placeholder route rule`,
                    before: rule.raw,
                    after: `route.rule_set=${scriptTag}; outbound=${loweredTarget}; placeholder=empty-inline`,
                    reason: 'Preserve route structure while deferring script shortcut execution to a future version',
                    sourcePaths: [rule.sourcePath],
                })
            );
            continue;
        }

        const loweredTarget = lowerTarget(rule.target);
        if (!validTargets.has(loweredTarget)) {
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.INVALID_RULE_TARGET,
                module: 'rule',
                sourcePath: rule.sourcePath,
                objectId: rule.id,
                objectStableKey: rule.stableKey,
                objectName: rule.raw,
                message: `Rule "${rule.raw}" references missing target "${loweredTarget}"`,
                impact: 'The rule is dropped from planned route rules',
                fallback: 'Skip emission for rules whose target cannot be resolved',
            });
            decisions.push({
                id: crypto.randomUUID(),
                kind: 'drop-unsupported',
                targetModule: 'rule',
                targetId: rule.id,
                summary: `Drop rule ${rule.raw}`,
                reason: `Target ${loweredTarget} cannot be resolved to a planned outbound`,
                sourcePaths: [rule.sourcePath],
            });
            repairs.push(
                createRepair({
                    kind: 'drop',
                    targetModule: 'rule',
                    targetId: rule.id,
                    summary: `Drop rule ${rule.raw}`,
                    before: `Route rule targeting ${loweredTarget}`,
                    after: 'Rule removed from planned route rules',
                    reason: `Target ${loweredTarget} cannot be resolved to a planned outbound`,
                    sourcePaths: [rule.sourcePath],
                })
            );
            continue;
        }

        if (rule.matcher.type === 'geoip' || rule.matcher.type === 'geosite') {
            const matcherType = rule.matcher.type.toUpperCase();
            const matcherValue = rule.matcher.value;
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.UNSUPPORTED_RULE_TYPE,
                module: 'rule',
                sourcePath: rule.sourcePath,
                objectId: rule.id,
                objectStableKey: rule.stableKey,
                objectName: rule.raw,
                message: `${matcherType} rule "${matcherValue}" was dropped because sing-box 1.12 removed ${rule.matcher.type} database route matching`,
                impact: `${matcherType} database matching is not emitted, so traffic falls through to later route rules or route.final.`,
                fallback:
                    'Drop the rule to keep the generated config runnable on sing-box 1.12+; replace with RULE-SET/IP-CIDR/DOMAIN rules if needed.',
            });
            decisions.push({
                id: crypto.randomUUID(),
                kind: 'drop-unsupported',
                targetModule: 'rule',
                targetId: rule.id,
                summary: `Drop ${matcherType} rule ${matcherValue}`,
                reason: `sing-box 1.12 removed ${rule.matcher.type} database route matching and V1 targets runnable output first`,
                sourcePaths: [rule.sourcePath],
            });
            repairs.push(
                createRepair({
                    kind: 'drop',
                    targetModule: 'rule',
                    targetId: rule.id,
                    summary: `Drop ${matcherType} rule ${matcherValue}`,
                    before: describeRuleMatcher(rule.matcher),
                    after: 'Rule removed from planned route rules',
                    reason: `sing-box 1.12 removed ${rule.matcher.type} database route matching`,
                    sourcePaths: [rule.sourcePath],
                })
            );
            continue;
        }

        const strategy = buildRuleStrategyFromMatcher(rule.matcher, loweredTarget);
        if (!strategy) {
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.UNSUPPORTED_RULE_TYPE,
                module: 'rule',
                sourcePath: rule.sourcePath,
                objectId: rule.id,
                objectStableKey: rule.stableKey,
                message: `Rule "${rule.raw}" cannot be lowered in V1 planner`,
                impact: 'The rule is dropped from planned route rules',
                fallback: 'Keep behavior change in report and skip emission',
            });
            decisions.push({
                id: crypto.randomUUID(),
                kind: 'drop-unsupported',
                targetModule: 'rule',
                targetId: rule.id,
                summary: `Drop unsupported rule ${rule.raw}`,
                reason: `Matcher ${rule.matcher.type} is not lowered in V1 planner`,
                sourcePaths: [rule.sourcePath],
            });
            repairs.push(
                createRepair({
                    kind: 'drop',
                    targetModule: 'rule',
                    targetId: rule.id,
                    summary: `Drop unsupported rule ${rule.raw}`,
                    before: `Matcher ${rule.matcher.type}`,
                    after: 'Rule removed from planned route rules',
                    reason: `Matcher ${rule.matcher.type} is not lowered in V1 planner`,
                    sourcePaths: [rule.sourcePath],
                })
            );
            continue;
        }

        if (strategy.issue) {
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: strategy.issue.code,
                module: 'rule',
                sourcePath: rule.sourcePath,
                objectId: rule.id,
                objectStableKey: rule.stableKey,
                objectName: rule.raw,
                message: strategy.issue.message,
                impact: strategy.issue.impact,
                fallback: strategy.issue.fallback,
            });
        }

        if (strategy.notes.length > 0) {
            repairs.push(
                createRepair({
                    kind: 'rewrite',
                    targetModule: 'rule',
                    targetId: rule.id,
                    summary: `Rewrite rule ${rule.raw}`,
                    before: describeRuleMatcher(rule.matcher),
                    after: strategy.notes.join('; '),
                    reason: strategy.reason,
                    sourcePaths: [rule.sourcePath],
                })
            );
        }

        plannedRules.push({
            id: crypto.randomUUID(),
            sourcePaths: [rule.sourcePath],
            status: analysis.objectStatuses.rules[rule.id] ?? 'exact',
            notes: strategy.notes,
            payload: strategy.payload,
        });
        decisions.push({
            id: crypto.randomUUID(),
            kind:
                (analysis.objectStatuses.rules[rule.id] ?? 'exact') === 'degraded'
                    ? 'fallback-map'
                    : 'normalized-map',
            targetModule: 'rule',
            targetId: rule.id,
            summary: `Lower route rule ${rule.raw}`,
            reason: strategy.reason,
                sourcePaths: [rule.sourcePath],
        });
    }

    return {
        rules: plannedRules,
        ruleSets: plannedRuleSets,
        final,
        issues,
        decisions,
        repairs,
    };
}

function buildRuleSet(
    tag: string,
    provider: NormalizedProviderRef | undefined
): {
    ruleSet: PlannedRuleSet;
    issues: MigrationIssue[];
    repairs: PlannedRepair[];
} {
    const localRuleSetPath = resolveProviderRuleSetPath(provider);

    if (localRuleSetPath) {
        const expandedRuleSet = expandRuleProviderAsInlineRuleSet(tag, provider, localRuleSetPath);
        if (expandedRuleSet) {
            return expandedRuleSet;
        }

        return {
            ruleSet: {
                id: crypto.randomUUID(),
                tag,
                sourcePaths: [provider?.sourcePath ?? ''],
                status: 'exact',
                notes: providerRuleNotes(provider),
                payload: {
                    type: 'local',
                    tag,
                    format: 'source',
                    path: localRuleSetPath,
                },
            },
            issues: [],
            repairs: [],
        };
    }

    if (provider?.vehicle === 'http' && provider.url) {
        return {
            ruleSet: {
                id: crypto.randomUUID(),
                tag,
                sourcePaths: [provider.sourcePath],
                status: 'exact',
                notes: providerRuleNotes(provider),
                payload: {
                    type: 'remote',
                    tag,
                    format: 'source',
                    url: provider.url,
                    update_interval: provider.intervalSeconds
                        ? `${provider.intervalSeconds}s`
                        : undefined,
                },
            },
            issues: [],
            repairs: [],
        };
    }

    return {
        ruleSet: {
            id: crypto.randomUUID(),
            tag,
            sourcePaths: provider ? [provider.sourcePath] : [],
            status: 'degraded',
            notes: [
                `vehicle:${provider?.vehicle ?? 'unknown'}`,
                'placeholder:empty-inline',
                'rule-provider contents are not expanded in V1',
            ],
            payload: {
                type: 'inline',
                tag,
                rules: [],
            },
        },
        issues: [],
        repairs: [],
    };
}

function expandRuleProviderAsInlineRuleSet(
    tag: string,
    provider: NormalizedProviderRef | undefined,
    localRuleSetPath: string
):
    | {
          ruleSet: PlannedRuleSet;
          issues: MigrationIssue[];
          repairs: PlannedRepair[];
      }
    | undefined {
    try {
        const content = readFileSync(localRuleSetPath, 'utf-8');
        const entries = parseRuleProviderEntries(content);
        if (entries.length === 0) {
            return undefined;
        }

        const expansion = expandRuleProviderEntries(entries, provider?.behavior);
        if (expansion.rules.length === 0) {
            return undefined;
        }

        const issues: MigrationIssue[] = [];
        const repairs: PlannedRepair[] = [];
        const degraded = expansion.droppedEntries.length > 0 || expansion.approximatedCount > 0;

        if (expansion.droppedEntries.length > 0) {
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.UNSUPPORTED_RULE_TYPE,
                module: 'rule',
                sourcePath: provider?.sourcePath,
                objectId: provider?.id,
                objectStableKey: provider?.stableKey,
                objectName: provider?.name ?? tag,
                message: `Rule-provider "${provider?.name ?? tag}" dropped ${expansion.droppedEntries.length} unsupported entries during inline expansion`,
                impact: 'Unsupported provider entries are skipped from emitted inline rule_set.',
                fallback:
                    'Keep migration runnable by emitting only supported provider entries as inline rules',
            });
            repairs.push(
                createRepair({
                    kind: 'drop',
                    targetModule: 'rule',
                    targetId: provider?.id,
                    summary: `Drop unsupported entries from rule-provider ${provider?.name ?? tag}`,
                    before: `rule-provider entries: ${expansion.totalEntries}`,
                    after: `emitted inline entries: ${expansion.rules.length}`,
                    reason: 'Only supported rule-provider entries can be lowered into sing-box inline rule_set',
                    sourcePaths: provider ? [provider.sourcePath] : [],
                })
            );
        }

        if (expansion.approximatedCount > 0) {
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.UNSUPPORTED_FIELD,
                module: 'rule',
                sourcePath: provider?.sourcePath,
                objectId: provider?.id,
                objectStableKey: provider?.stableKey,
                objectName: provider?.name ?? tag,
                message: `Rule-provider "${provider?.name ?? tag}" approximated ${expansion.approximatedCount} entries during inline expansion`,
                impact: 'Some provider entries keep runnable semantics with approximated lowering.',
                fallback:
                    'Use direct matcher lowering while preserving unsupported parts in report issues',
            });
        }

        return {
            ruleSet: {
                id: crypto.randomUUID(),
                tag,
                sourcePaths: [provider?.sourcePath ?? ''],
                status: degraded ? 'degraded' : 'exact',
                notes: [
                    ...providerRuleNotes(provider),
                    `expanded:inline-rules:${expansion.rules.length}`,
                    `expanded:source-entries:${expansion.totalEntries}`,
                ],
                payload: {
                    type: 'inline',
                    tag,
                    rules: expansion.rules,
                },
            },
            issues,
            repairs,
        };
    } catch {
        return undefined;
    }
}

function expandRuleProviderEntries(
    entries: string[],
    behavior: string | undefined
): {
    rules: Record<string, unknown>[];
    totalEntries: number;
    droppedEntries: string[];
    approximatedCount: number;
} {
    const canonicalRules: string[] = [];
    const droppedEntries: string[] = [];
    const behaviorKey = (behavior ?? 'domain').toLowerCase();

    for (const entry of entries) {
        const canonical = normalizeProviderEntryAsRule(entry, behaviorKey);
        if (!canonical) {
            droppedEntries.push(entry);
            continue;
        }
        canonicalRules.push(canonical);
    }

    if (canonicalRules.length === 0) {
        return {
            rules: [],
            totalEntries: entries.length,
            droppedEntries,
            approximatedCount: 0,
        };
    }

    const normalized = normalizeRules(canonicalRules);
    const rules: Record<string, unknown>[] = [];
    let approximatedCount = normalized.issues.length;

    for (const rule of normalized.rules) {
        if (rule.matcher.type === 'match') {
            droppedEntries.push(rule.raw);
            continue;
        }

        const strategy = buildRuleStrategyFromMatcher(rule.matcher, 'direct');
        if (!strategy) {
            droppedEntries.push(rule.raw);
            continue;
        }

        if (strategy.notes.length > 0 || strategy.issue) {
            approximatedCount += 1;
        }

        const payload = { ...strategy.payload };
        delete payload.outbound;
        if (Object.keys(payload).length === 0) {
            droppedEntries.push(rule.raw);
            continue;
        }

        rules.push(payload);
    }

    return {
        rules,
        totalEntries: entries.length,
        droppedEntries,
        approximatedCount,
    };
}

function normalizeProviderEntryAsRule(entry: string, behavior: string): string | undefined {
    const trimmed = entry.trim();
    if (!trimmed) {
        return undefined;
    }

    const firstToken = trimmed.split(',')[0]?.trim().toUpperCase() ?? '';
    if (isRuleMatcherToken(firstToken)) {
        return ensureProviderRuleHasTarget(trimmed);
    }

    if (behavior === 'classical') {
        return undefined;
    }

    if (behavior === 'ipcidr') {
        return `IP-CIDR,${trimmed},DIRECT`;
    }

    let domain = trimmed;
    if (domain.startsWith('+.')) {
        domain = domain.slice(2);
    } else if (domain.startsWith('*.')) {
        domain = domain.slice(2);
    } else if (domain.startsWith('.')) {
        domain = domain.slice(1);
    }

    return domain ? `DOMAIN-SUFFIX,${domain},DIRECT` : undefined;
}

function ensureProviderRuleHasTarget(ruleLine: string): string {
    const parts = ruleLine.split(',').map((part) => part.trim());
    const type = parts[0]?.toUpperCase();
    if (!type) {
        return ruleLine;
    }

    if (type === 'MATCH') {
        return parts.length >= 2 ? ruleLine : `${ruleLine},DIRECT`;
    }

    if (parts.length >= 3) {
        return ruleLine;
    }

    return `${ruleLine},DIRECT`;
}

function isRuleMatcherToken(token: string): boolean {
    return new Set([
        'MATCH',
        'DOMAIN',
        'DOMAIN-SUFFIX',
        'DOMAIN-KEYWORD',
        'DOMAIN-REGEX',
        'RULE-SET',
        'SCRIPT',
        'IP-CIDR',
        'SRC-IP-CIDR',
        'GEOIP',
        'GEOSITE',
        'DST-PORT',
        'SRC-PORT',
        'PROCESS-NAME',
        'PROCESS-PATH',
        'NETWORK',
    ]).has(token);
}

function parseRuleProviderEntries(content: string): string[] {
    const fallback = parseRuleProviderEntriesFromText(content);
    try {
        const parsed = parseYamlInput(content);
        if (Array.isArray(parsed)) {
            return normalizeProviderEntryList(parsed, fallback);
        }

        if (!parsed || typeof parsed !== 'object') {
            return fallback;
        }

        const record = parsed as Record<string, unknown>;
        if (Array.isArray(record.payload)) {
            return normalizeProviderEntryList(record.payload, fallback);
        }
        if (Array.isArray(record.rules)) {
            return normalizeProviderEntryList(record.rules, fallback);
        }
        return fallback;
    } catch {
        return fallback;
    }
}

function normalizeProviderEntryList(values: unknown[], fallback: string[]): string[] {
    const entries = values
        .map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item) : ''))
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    return entries.length > 0 ? entries : fallback;
}

function parseRuleProviderEntriesFromText(content: string): string[] {
    return content
        .split(/\r?\n/g)
        .map((line) =>
            line
                .replace(/^\s*-\s*/, '')
                .replace(/\s+#.*$/, '')
                .trim()
        )
        .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function providerRuleNotes(provider: NormalizedProviderRef | undefined): string[] {
    const notes = [`vehicle:${provider?.vehicle ?? 'unknown'}`];
    if (provider?.behavior) {
        notes.push(`behavior:${provider.behavior}`);
    }
    if (resolveProviderRuleSetPath(provider)) {
        notes.push('rule-provider mapped to local cached rule_set');
    } else if (provider?.vehicle === 'http' && provider.url) {
        notes.push('rule-provider mapped to remote rule_set');
    } else {
        notes.push('rule-provider mapped to placeholder inline rule_set');
    }
    return notes;
}

function resolveProviderRuleSetPath(
    provider: NormalizedProviderRef | undefined
): string | undefined {
    if (!provider) {
        return undefined;
    }

    const candidate = provider.resolvedPath ?? provider.path;
    if (!candidate) {
        return undefined;
    }

    if (existsSync(candidate)) {
        return candidate;
    }

    return provider.vehicle === 'file' ? candidate : undefined;
}

function buildScriptPlaceholderTag(name: string): string {
    return `script:${name}`;
}

function buildScriptShortcutRule(
    shortcutName: string,
    outbound: string,
    shortcuts: Record<string, string>
): {
    payload: Record<string, unknown>;
    notes: string[];
} | null {
    const expression = shortcuts[shortcutName];
    if (!expression) {
        return null;
    }

    const normalized = expression.trim();
    const udp443Patterns = [
        /^network\s*==\s*['"]udp['"]\s+and\s+dst_port\s*==\s*443$/i,
        /^dst_port\s*==\s*443\s+and\s+network\s*==\s*['"]udp['"]$/i,
    ];

    if (udp443Patterns.some((pattern) => pattern.test(normalized))) {
        return {
            payload: {
                network: ['udp'],
                port: 443,
                outbound,
            },
            notes: ['degraded:script-shortcut->static-route', 'script:network==udp&&dst_port==443'],
        };
    }

    return null;
}

function describeTarget(target: RuleTargetRef): string {
    return target.kind === 'special' ? target.name : target.name;
}

function lowerTarget(target: RuleTargetRef): string {
    if (target.kind === 'special') {
        switch (target.name) {
            case 'DIRECT':
                return 'direct';
            case 'REJECT':
                return 'block';
            case 'GLOBAL':
                return 'global';
            case 'PASS':
                return 'direct';
        }
    }

    return target.name;
}
