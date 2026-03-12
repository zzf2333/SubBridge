import { MigrationErrorCode, type MigrationIssue } from '../types/migration';
import type { GroupMemberRef, NormalizedGroup, GroupStrategy } from '../types/normalized-clash';
import type { RawProxyGroup } from '../types/raw-clash';

export function normalizeGroups(rawGroups: RawProxyGroup[] = []): {
    groups: NormalizedGroup[];
    issues: MigrationIssue[];
} {
    const groups: NormalizedGroup[] = [];
    const issues: MigrationIssue[] = [];

    rawGroups.forEach((group, index) => {
        const sourcePath = `proxy-groups[${index}]`;
        const name =
            typeof group.name === 'string' && group.name.length > 0 ? group.name : `group-${index}`;
        const type = parseGroupType(group.type);
        const id = crypto.randomUUID();
        const stableKey = `group:${sourcePath}:${name}`;

        if (type === 'unknown') {
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.UNSUPPORTED_GROUP_TYPE,
                module: 'group',
                sourcePath,
                objectId: id,
                objectStableKey: stableKey,
                objectName: name,
                message: `Unsupported group type: ${String(group.type ?? 'unknown')}`,
                impact: 'The group may be degraded or dropped during planning',
            });
        }

        groups.push({
            id,
            stableKey,
            name,
            type,
            members: normalizeMembers(group),
            strategy: normalizeStrategy(group),
            sourcePath,
            raw: group,
        });
    });

    return { groups, issues };
}

function parseGroupType(value: unknown): NormalizedGroup['type'] {
    if (
        value === 'select' ||
        value === 'url-test' ||
        value === 'fallback' ||
        value === 'load-balance' ||
        value === 'relay'
    ) {
        return value;
    }
    return 'unknown';
}

function normalizeMembers(group: RawProxyGroup): GroupMemberRef[] {
    const proxyMembers = Array.isArray(group.proxies) ? group.proxies : [];
    const providerMembers = Array.isArray(group.use) ? group.use : [];

    return [
        ...proxyMembers
            .filter((name): name is string => typeof name === 'string')
            .map((name) => ({ kind: 'unknown', name }) as GroupMemberRef),
        ...providerMembers
            .filter((name): name is string => typeof name === 'string')
            .map((name) => ({ kind: 'provider', name }) as GroupMemberRef),
    ];
}

function normalizeStrategy(group: RawProxyGroup): GroupStrategy | undefined {
    if (
        !group.url &&
        group.interval === undefined &&
        group.tolerance === undefined &&
        group.lazy === undefined
    ) {
        return undefined;
    }

    return {
        testUrl: typeof group.url === 'string' ? group.url : undefined,
        intervalSeconds: typeof group.interval === 'number' ? group.interval : undefined,
        tolerance: typeof group.tolerance === 'number' ? group.tolerance : undefined,
        lazy: typeof group.lazy === 'boolean' ? group.lazy : undefined,
        expectedBehavior: mapExpectedBehavior(group.type),
    };
}

function mapExpectedBehavior(value: unknown): GroupStrategy['expectedBehavior'] {
    switch (value) {
        case 'select':
            return 'manual';
        case 'url-test':
            return 'latency-test';
        case 'fallback':
            return 'fallback';
        case 'load-balance':
            return 'load-balance';
        case 'relay':
            return 'relay';
        default:
            return undefined;
    }
}
