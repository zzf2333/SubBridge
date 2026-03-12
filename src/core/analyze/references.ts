import { MigrationErrorCode, type MigrationIssue } from '../types/migration';
import type { CircularReference, GraphEdge, ReferenceGraph } from '../types/migration-analysis';
import type { NormalizedClashConfig } from '../types/normalized-clash';

export function analyzeReferences(config: NormalizedClashConfig): {
    graph: ReferenceGraph;
    issues: MigrationIssue[];
} {
    const proxyNames = config.proxies.map((proxy) => proxy.name);
    const groupNames = config.groups.map((group) => group.name);
    const proxyProviderNames = config.providers.proxyProviders.map((provider) => provider.name);
    const ruleProviderNames = config.providers.ruleProviders.map((provider) => provider.name);
    const proxyNameSet = new Set(proxyNames);
    const groupNameSet = new Set(groupNames);
    const proxyProviderSet = new Set(proxyProviderNames);
    const ruleProviderSet = new Set(ruleProviderNames);
    const validTargets = new Set([
        ...proxyNames,
        ...groupNames,
        'DIRECT',
        'REJECT',
        'GLOBAL',
        'PASS',
    ]);

    const groupDependencies: GraphEdge[] = [];
    const routeDependencies: GraphEdge[] = [];
    const missingReferences: ReferenceGraph['missingReferences'] = [];
    const issues: MigrationIssue[] = [];

    for (const group of config.groups) {
        for (const member of group.members) {
            groupDependencies.push({ from: group.name, to: member.name, kind: 'group-member' });
            if (member.kind === 'provider') {
                if (!proxyProviderSet.has(member.name)) {
                    missingReferences.push({
                        source: group.name,
                        target: member.name,
                        kind: 'provider-member',
                        sourcePath: group.sourcePath,
                    });
                }
                continue;
            }

            if (!validTargets.has(member.name)) {
                missingReferences.push({
                    source: group.name,
                    target: member.name,
                    kind: 'group-member',
                    sourcePath: group.sourcePath,
                });
            }
        }
    }

    for (const rule of config.rules) {
        routeDependencies.push({ from: rule.raw, to: rule.target.name, kind: 'rule-target' });
        if (rule.target.kind !== 'special' && !validTargets.has(rule.target.name)) {
            missingReferences.push({
                source: rule.raw,
                target: rule.target.name,
                kind: 'rule-target',
                sourcePath: rule.sourcePath,
            });
        }

        if (rule.matcher.type === 'rule_set' && !ruleProviderSet.has(rule.matcher.value)) {
            missingReferences.push({
                source: rule.raw,
                target: rule.matcher.value,
                kind: 'rule-provider',
                sourcePath: rule.sourcePath,
            });
        }
    }

    const circularReferences = detectGroupCycles(
        config.groups.map((group) => ({
            name: group.name,
            members: group.members
                .filter(
                    (member) =>
                        resolveMemberKind(member.name, proxyNameSet, groupNameSet) === 'group'
                )
                .map((member) => member.name),
        }))
    );

    for (const ref of missingReferences) {
        issues.push({
            id: crypto.randomUUID(),
            level: 'warning',
            code: MigrationErrorCode.MISSING_REFERENCE,
            module: ref.kind === 'rule-target' || ref.kind === 'rule-provider' ? 'rule' : 'group',
            sourcePath: ref.sourcePath,
            objectName: ref.target,
            message: `Missing reference: ${ref.target}`,
            impact: 'Planner may need to drop or rewrite the broken reference',
        });
    }

    for (const ref of circularReferences) {
        issues.push({
            id: crypto.randomUUID(),
            level: 'warning',
            code: MigrationErrorCode.CIRCULAR_REFERENCE,
            module: 'group',
            message: `Circular group reference detected: ${ref.cycle.join(' -> ')}`,
            impact: 'Planner will need to break the cycle or drop the affected groups',
        });
    }

    return {
        graph: {
            proxyNames,
            groupNames,
            proxyProviderNames,
            ruleProviderNames,
            ruleTargets: config.rules.map((rule) => rule.target.name),
            groupDependencies,
            routeDependencies,
            missingReferences,
            circularReferences,
        },
        issues,
    };
}

function resolveMemberKind(
    name: string,
    proxyNames: Set<string>,
    groupNames: Set<string>
): 'proxy' | 'group' | 'unknown' {
    if (proxyNames.has(name)) {
        return 'proxy';
    }
    if (groupNames.has(name)) {
        return 'group';
    }
    return 'unknown';
}

function detectGroupCycles(
    groups: Array<{ name: string; members: string[] }>
): CircularReference[] {
    const graph = new Map(groups.map((group) => [group.name, group.members]));
    const visited = new Set<string>();
    const stack = new Set<string>();
    const refs: CircularReference[] = [];

    function visit(node: string, path: string[]): void {
        if (stack.has(node)) {
            const start = path.indexOf(node);
            refs.push({ cycle: [...path.slice(start), node], kind: 'group' });
            return;
        }
        if (visited.has(node)) {
            return;
        }

        visited.add(node);
        stack.add(node);

        for (const next of graph.get(node) ?? []) {
            if (graph.has(next)) {
                visit(next, [...path, node]);
            }
        }

        stack.delete(node);
    }

    for (const node of graph.keys()) {
        visit(node, []);
    }

    return refs;
}
