import type { SingBoxConfig } from '../types/singbox';
import type { MigrationPlan } from '../types/migration-plan';

export function emitSingBoxConfig(plan: MigrationPlan): SingBoxConfig {
    return {
        inbounds: plan.inbounds.map((inbound) => ({
            type: inbound.type,
            tag: inbound.tag,
            listen: inbound.listen,
            listen_port: inbound.listenPort,
            ...inbound.options,
        })),
        outbounds: plan.outbounds.map((outbound) => ({
            type: outbound.type,
            tag: outbound.tag,
            ...outbound.payload,
        })) as SingBoxConfig['outbounds'],
        dns: plan.dns
            ? {
                  servers: plan.dns.servers.map((server) => ({
                      tag: server.tag,
                      ...server.payload,
                  })) as never,
                  rules: plan.dns.rules.map((rule) => rule.payload as never),
                  final: plan.dns.final,
                  strategy: plan.dns.strategy,
                  independent_cache: plan.dns.independentCache,
                  reverse_mapping: plan.dns.reverseMapping,
                  fakeip: plan.dns.fakeip
                      ? {
                            enabled: plan.dns.fakeip.enabled,
                            inet4_range: plan.dns.fakeip.inet4Range,
                            inet6_range: plan.dns.fakeip.inet6Range,
                        }
                      : undefined,
              }
            : undefined,
        route: {
            rules: plan.route.rules.map((rule) => rule.payload as never),
            rule_set: plan.route.ruleSets.map((ruleSet) => ruleSet.payload as never),
            final: plan.route.final,
            auto_detect_interface: plan.route.autoDetectInterface,
            default_domain_resolver: plan.dns?.defaultDomainResolver,
            geoip: plan.route.geoip
                ? {
                      download_detour: plan.route.geoip.downloadDetour,
                  }
                : undefined,
            geosite: plan.route.geosite
                ? {
                      download_detour: plan.route.geosite.downloadDetour,
                  }
                : undefined,
        },
    };
}
