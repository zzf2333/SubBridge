import type { MigrationIssue } from '../types/migration';
import type { RuntimeIntent } from '../types/migration-analysis';
import type { PlanningDecision, PlannedInbound } from '../types/migration-plan';
import type { ClashGeneral, NormalizedTun } from '../types/normalized-clash';

const DEFAULT_TUN_ADDRESSES = ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'] as const;

export function planInbounds(
    general: ClashGeneral,
    tun: NormalizedTun | undefined,
    runtime: RuntimeIntent
): {
    inbounds: PlannedInbound[];
    issues: MigrationIssue[];
    decisions: PlanningDecision[];
} {
    const inbounds: PlannedInbound[] = [];
    const decisions: PlanningDecision[] = [];

    if (runtime.profile === 'mixed-client') {
        inbounds.push({
            id: crypto.randomUUID(),
            sourcePaths: [],
            status: 'exact',
            decision: 'normalized-map',
            notes: [],
            type: 'mixed',
            tag: 'mixed-in',
            listen: '127.0.0.1',
            listenPort: general.ports.mixed ?? general.ports.http ?? 7890,
            options: {
                set_system_proxy: false,
            },
        });
        decisions.push({
            id: crypto.randomUUID(),
            kind: 'normalized-map',
            targetModule: 'inbound',
            summary: 'Plan mixed inbound',
            reason: 'Local client profile requires a mixed inbound listener',
            sourcePaths: [],
        });
    }

    if (runtime.profile === 'tun-client') {
        inbounds.push({
            id: crypto.randomUUID(),
            sourcePaths: tun ? [tun.sourcePath] : [],
            status: tun ? 'exact' : 'degraded',
            decision: tun ? 'normalized-map' : 'default-fill',
            notes: tun?.stack ? [`stack:${tun.stack}`] : [],
            type: 'tun',
            tag: 'tun-in',
            options: {
                address: [...DEFAULT_TUN_ADDRESSES],
                stack: tun?.stack,
                auto_route: tun?.autoRoute ?? true,
                auto_detect_interface: tun?.autoDetectInterface,
                strict_route: tun?.strictRoute,
                mtu: tun?.mtu,
                dns_hijack: tun?.dnsHijack,
                // 嗅探 TLS/HTTP 流量以提取域名，使域名规则生效
                sniff: true,
                sniff_override_destination: true,
            },
        });
        decisions.push({
            id: crypto.randomUUID(),
            kind: tun ? 'normalized-map' : 'default-fill',
            targetModule: 'inbound',
            summary: 'Plan tun inbound',
            reason: tun
                ? 'Tun profile detected and source config includes tun settings'
                : 'Tun profile detected without tun block, insert default tun inbound',
            sourcePaths: tun ? [tun.sourcePath] : [],
        });
        inbounds.push({
            id: crypto.randomUUID(),
            sourcePaths: [],
            status: 'degraded',
            decision: 'default-fill',
            notes: ['Provide a mixed inbound alongside tun for local debugging'],
            type: 'mixed',
            tag: 'mixed-in',
            listen: '127.0.0.1',
            listenPort: general.ports.mixed ?? 7890,
            options: {
                set_system_proxy: false,
            },
        });
        decisions.push({
            id: crypto.randomUUID(),
            kind: 'default-fill',
            targetModule: 'inbound',
            summary: 'Add companion mixed inbound',
            reason: 'Tun profile keeps a mixed inbound for local debugging and compatibility',
            sourcePaths: [],
        });
    }

    return { inbounds, issues: [], decisions };
}
