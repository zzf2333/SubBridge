import { PatchKind } from '../types/migration';
import type { PlannedPatch, MigrationPlan } from '../types/migration-plan';
import { createRepair } from './repair';

const AUTO_URLTEST_TAG = 'Auto';
const AUTO_URLTEST_URL = 'https://www.gstatic.com/generate_204';
const AUTO_URLTEST_INTERVAL = '300s';
const AUTO_URLTEST_MIN_MEMBERS = 8;

export function applyPlanPatches(plan: MigrationPlan): MigrationPlan {
    const patches: PlannedPatch[] = [...plan.patches];
    const repairs = [...plan.repairs];
    const outbounds = [...plan.outbounds];
    const route = {
        ...plan.route,
        rules: [...plan.route.rules],
    };
    const dns = plan.dns
        ? {
              ...plan.dns,
              servers: plan.dns.servers.map((server) => ({
                  ...server,
                  payload: { ...server.payload },
              })),
              rules: [...plan.dns.rules],
          }
        : undefined;
    const proxyCandidateTags = outbounds
        .filter(
            (outbound) =>
                !['selector', 'urltest', 'direct', 'block', 'dns'].includes(outbound.type) &&
                !outbound.tag.includes('::relay::')
        )
        .map((outbound) => outbound.tag);

    if (proxyCandidateTags.length > 0 && !outbounds.some((outbound) => outbound.tag === 'proxy')) {
        outbounds.unshift({
            id: crypto.randomUUID(),
            sourcePaths: [],
            status: 'degraded',
            decision: 'runtime-completion',
            notes: ['Inserted default proxy selector'],
            type: 'selector',
            tag: 'proxy',
            payload: {
                outbounds: proxyCandidateTags,
                default: proxyCandidateTags[0],
            },
        });
        patches.push({
            id: crypto.randomUUID(),
            kind: PatchKind.ADD_DEFAULT_SELECTOR,
            summary: 'Add default proxy selector',
            reason: 'Provide a stable route.final target for runnable configs',
        });
        repairs.push(
            createRepair({
                kind: 'runtime-patch',
                targetModule: 'runtime',
                summary: 'Insert default proxy selector',
                before: 'No stable proxy selector existed',
                after: 'A default proxy selector outbound was inserted',
                reason: 'Provide a stable route.final target for runnable configs',
            })
        );
    }

    if (!outbounds.some((outbound) => outbound.tag === 'direct')) {
        outbounds.push({
            id: crypto.randomUUID(),
            sourcePaths: [],
            status: 'exact',
            decision: 'runtime-completion',
            notes: ['Inserted default direct outbound'],
            type: 'direct',
            tag: 'direct',
            payload: {},
        });
        patches.push({
            id: crypto.randomUUID(),
            kind: PatchKind.ADD_DIRECT_OUTBOUND,
            summary: 'Add default direct outbound',
            reason: 'Provide a safe fallback outbound',
        });
        repairs.push(
            createRepair({
                kind: 'runtime-patch',
                targetModule: 'runtime',
                summary: 'Insert default direct outbound',
                before: 'No explicit direct outbound was available',
                after: 'A default direct outbound was inserted',
                reason: 'Provide a safe fallback outbound',
            })
        );
    }

    if (!outbounds.some((outbound) => outbound.tag === 'block')) {
        outbounds.push({
            id: crypto.randomUUID(),
            sourcePaths: [],
            status: 'exact',
            decision: 'runtime-completion',
            notes: ['Inserted default block outbound'],
            type: 'block',
            tag: 'block',
            payload: {},
        });
        patches.push({
            id: crypto.randomUUID(),
            kind: PatchKind.ADD_BLOCK_OUTBOUND,
            summary: 'Add default block outbound',
            reason: 'Provide a reject target for lowered rule actions',
        });
        repairs.push(
            createRepair({
                kind: 'runtime-patch',
                targetModule: 'runtime',
                summary: 'Insert default block outbound',
                before: 'No explicit reject/block outbound was available',
                after: 'A default block outbound was inserted',
                reason: 'Provide a reject target for lowered rule actions',
            })
        );
    }

    let autoUrltestTag: string | undefined;
    if (
        proxyCandidateTags.length >= AUTO_URLTEST_MIN_MEMBERS &&
        !outbounds.some((outbound) => outbound.type === 'urltest')
    ) {
        autoUrltestTag = pickUniqueOutboundTag(outbounds, AUTO_URLTEST_TAG);
        outbounds.push({
            id: crypto.randomUUID(),
            sourcePaths: [],
            status: 'degraded',
            decision: 'runtime-completion',
            notes: ['Inserted default urltest outbound for automatic latency probing'],
            type: 'urltest',
            tag: autoUrltestTag,
            payload: {
                outbounds: proxyCandidateTags,
                url: AUTO_URLTEST_URL,
                interval: AUTO_URLTEST_INTERVAL,
            },
        });
        patches.push({
            id: crypto.randomUUID(),
            kind: PatchKind.ADD_AUTO_URLTEST_OUTBOUND,
            summary: 'Add default urltest outbound',
            reason: 'Provide automatic node testing when source config has no url-test groups',
        });
        repairs.push(
            createRepair({
                kind: 'runtime-patch',
                targetModule: 'runtime',
                summary: 'Insert default urltest outbound',
                before: 'No urltest outbound existed',
                after: `Inserted ${autoUrltestTag} with ${proxyCandidateTags.length} candidates`,
                reason: 'Expose automatic node testing in compatible clients',
            })
        );
    }

    if (autoUrltestTag) {
        const routeReferencedOutbounds = collectRouteReferencedOutbounds(route);
        const proxyCandidateSet = new Set(proxyCandidateTags);

        for (const selector of outbounds) {
            if (selector.type !== 'selector') {
                continue;
            }
            if (
                selector.tag !== 'proxy' &&
                !routeReferencedOutbounds.has(selector.tag)
            ) {
                continue;
            }

            const members = selector.payload.outbounds;
            if (!Array.isArray(members) || members.some((member) => typeof member !== 'string')) {
                continue;
            }
            if (members.includes(autoUrltestTag)) {
                continue;
            }

            const hasProxyMember = members.some((member) => proxyCandidateSet.has(member));
            if (!hasProxyMember) {
                continue;
            }

            selector.payload.outbounds = [autoUrltestTag, ...members];
            if (typeof selector.payload.default === 'string') {
                selector.payload.default = autoUrltestTag;
            }
        }
    }

    const outboundTags = new Set(outbounds.map((outbound) => outbound.tag));
    if (!route.final || !outboundTags.has(route.final)) {
        const previousFinal = route.final;
        route.final = outbounds.find((outbound) => outbound.tag === 'proxy')?.tag ?? 'direct';
        patches.push({
            id: crypto.randomUUID(),
            kind: PatchKind.REPAIR_ROUTE_FINAL,
            summary: previousFinal
                ? `Repair invalid route.final "${previousFinal}"`
                : 'Repair missing route.final',
            reason: previousFinal
                ? `route.final "${previousFinal}" does not exist in planned outbounds`
                : 'A runnable config needs a route.final fallback',
        });
        repairs.push(
            createRepair({
                kind: 'runtime-patch',
                targetModule: 'route',
                summary: previousFinal
                    ? `Repair invalid route.final "${previousFinal}"`
                    : 'Repair missing route.final',
                before: previousFinal
                    ? `route.final=${previousFinal}`
                    : 'route.final was missing or unresolved',
                after: `route.final=${route.final}`,
                reason: previousFinal
                    ? `route.final "${previousFinal}" does not exist in planned outbounds`
                    : 'A runnable config needs a route.final fallback',
                sourcePaths: route.sourcePaths,
            })
        );
    }

    if (dns) {
        const repairedDetour = route.final ?? 'direct';

        for (const server of dns.servers) {
            const detour = server.payload.detour;
            if (typeof detour === 'string' && !outboundTags.has(detour)) {
                server.payload.detour = repairedDetour;
                patches.push({
                    id: crypto.randomUUID(),
                    kind: PatchKind.REPAIR_DNS_DETOUR,
                    summary: `Repair DNS detour for server ${server.tag}`,
                    reason: `Detour ${detour} was missing; reroute DNS via ${repairedDetour}`,
                });
                repairs.push(
                    createRepair({
                        kind: 'runtime-patch',
                        targetModule: 'dns',
                        summary: `Repair DNS detour for server ${server.tag}`,
                        before: `detour=${detour}`,
                        after: `detour=${repairedDetour}`,
                        reason: `Detour ${detour} was missing; reroute DNS via ${repairedDetour}`,
                        sourcePaths: server.sourcePaths,
                    })
                );
            }
        }

        if (!hasDnsHijackRouteRule(route.rules)) {
            route.rules.unshift({
                id: crypto.randomUUID(),
                sourcePaths: dns.sourcePaths,
                status: 'degraded',
                notes: ['Inserted protocol=dns guard rule before generic route rules'],
                payload: {
                    protocol: 'dns',
                    action: 'hijack-dns',
                },
            });
            patches.push({
                id: crypto.randomUUID(),
                kind: PatchKind.ADD_DNS_ROUTE_RULE,
                summary: 'Add DNS route guard rule',
                reason: 'Prevent DNS traffic from being captured by generic IP-CIDR direct rules',
            });
            repairs.push(
                createRepair({
                    kind: 'runtime-patch',
                    targetModule: 'route',
                    summary: 'Insert protocol=dns route guard rule',
                    before: 'No explicit protocol=dns route rule existed',
                    after: 'route.rules[0]={protocol:dns,action:hijack-dns}',
                    reason: 'Ensure DNS traffic is explicitly hijacked to the DNS pipeline before generic routing',
                    sourcePaths: dns.sourcePaths,
                })
            );
        }
    }

    const globalOutboundTag = pickGlobalModeOutboundTag(outbounds);
    if (
        globalOutboundTag &&
        outbounds.some((outbound) => outbound.tag === 'direct') &&
        !hasClashModeRouteRules(route.rules)
    ) {
        const modeRules = [
            {
                id: crypto.randomUUID(),
                sourcePaths: [],
                status: 'degraded' as const,
                notes: ['Inserted clash_mode direct guard rule'],
                payload: {
                    clash_mode: 'direct',
                    action: 'route',
                    outbound: 'direct',
                },
            },
            {
                id: crypto.randomUUID(),
                sourcePaths: [],
                status: 'degraded' as const,
                notes: ['Inserted clash_mode global guard rule'],
                payload: {
                    clash_mode: 'global',
                    action: 'route',
                    outbound: globalOutboundTag,
                },
            },
        ];
        const dnsHijackIndex = route.rules.findIndex((rule) => isDnsHijackRule(rule.payload));
        const insertIndex = dnsHijackIndex >= 0 ? dnsHijackIndex + 1 : 0;
        route.rules.splice(insertIndex, 0, ...modeRules);
        patches.push({
            id: crypto.randomUUID(),
            kind: PatchKind.ADD_CLASH_MODE_RULES,
            summary: 'Add clash mode guard rules',
            reason: 'Expose direct/global mode switching in Clash-compatible clients',
        });
        repairs.push(
            createRepair({
                kind: 'runtime-patch',
                targetModule: 'route',
                summary: 'Insert clash_mode route guard rules',
                before: 'No clash_mode route rules existed',
                after: `Inserted clash_mode direct/global rules with global -> ${globalOutboundTag}`,
                reason: 'Enable runtime mode switching without changing core route semantics',
                sourcePaths: route.sourcePaths,
            })
        );
    }

    const validRouteRules = [];
    for (const rule of route.rules) {
        const outbound = rule.payload.outbound;
        if (typeof outbound === 'string' && !outboundTags.has(outbound)) {
            patches.push({
                id: crypto.randomUUID(),
                kind: PatchKind.PRUNE_INVALID_ROUTE_RULE,
                summary: `Drop route rule with missing outbound "${outbound}"`,
                reason: `The target outbound "${outbound}" was not emitted in the final plan`,
            });
            repairs.push(
                createRepair({
                    kind: 'runtime-patch',
                    targetModule: 'route',
                    targetId: rule.id,
                    summary: `Drop route rule with missing outbound "${outbound}"`,
                    before: JSON.stringify(rule.payload),
                    after: 'Route rule removed',
                    reason: `The target outbound "${outbound}" was not emitted in the final plan`,
                    sourcePaths: rule.sourcePaths,
                })
            );
            continue;
        }

        validRouteRules.push(rule);
    }
    route.rules = validRouteRules;

    return {
        ...plan,
        outbounds,
        dns,
        route,
        patches,
        repairs,
    };
}

function hasDnsHijackRouteRule(rules: MigrationPlan['route']['rules']): boolean {
    return rules.some((rule) => {
        const action = rule.payload.action;
        if (action !== 'hijack-dns') {
            return false;
        }

        const protocol = rule.payload.protocol;
        if (typeof protocol === 'string') {
            return protocol === 'dns';
        }
        if (Array.isArray(protocol)) {
            return protocol.some((item) => item === 'dns');
        }

        return false;
    });
}

function pickUniqueOutboundTag(
    outbounds: MigrationPlan['outbounds'],
    baseTag: string
): string {
    const existing = new Set(outbounds.map((outbound) => outbound.tag));
    if (!existing.has(baseTag)) {
        return baseTag;
    }

    let suffix = 1;
    let candidate = `${baseTag}-${suffix}`;
    while (existing.has(candidate)) {
        suffix += 1;
        candidate = `${baseTag}-${suffix}`;
    }

    return candidate;
}

function pickGlobalModeOutboundTag(outbounds: MigrationPlan['outbounds']): string | undefined {
    const proxySelector = outbounds.find(
        (outbound) => outbound.tag === 'proxy' && outbound.type === 'selector'
    );
    if (proxySelector) {
        return proxySelector.tag;
    }

    const candidate = outbounds.find(
        (outbound) => !['direct', 'block', 'dns'].includes(outbound.type)
    );
    return candidate?.tag;
}

function hasClashModeRouteRules(rules: MigrationPlan['route']['rules']): boolean {
    const modes = new Set<string>();
    for (const rule of rules) {
        const value = rule.payload.clash_mode;
        if (typeof value === 'string') {
            modes.add(value);
        }
    }
    return modes.has('direct') && modes.has('global');
}

function isDnsHijackRule(payload: Record<string, unknown>): boolean {
    const protocol = payload.protocol;
    if (payload.action !== 'hijack-dns') {
        return false;
    }

    if (typeof protocol === 'string') {
        return protocol === 'dns';
    }
    if (Array.isArray(protocol)) {
        return protocol.some((item) => item === 'dns');
    }

    return false;
}

function collectRouteReferencedOutbounds(route: MigrationPlan['route']): Set<string> {
    const referenced = new Set<string>();

    for (const rule of route.rules) {
        const outbound = rule.payload.outbound;
        if (typeof outbound === 'string') {
            referenced.add(outbound);
        }
    }
    if (typeof route.final === 'string') {
        referenced.add(route.final);
    }

    return referenced;
}
