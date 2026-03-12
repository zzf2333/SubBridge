import { isIP } from 'net';
import { lookup } from 'dns/promises';

export class UnsafeRemoteUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsafeRemoteUrlError';
    }
}

interface UrlSafetyOptions {
    allowDataUrl?: boolean;
}

const DEFAULT_OPTIONS: Required<UrlSafetyOptions> = {
    allowDataUrl: false,
};

export function assertSafeRemoteUrl(rawUrl: string, options: UrlSafetyOptions = {}): void {
    const resolved = { ...DEFAULT_OPTIONS, ...options };
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new UnsafeRemoteUrlError('Invalid URL');
    }

    if (parsed.protocol === 'data:') {
        if (resolved.allowDataUrl) {
            return;
        }
        throw new UnsafeRemoteUrlError('Unsafe URL protocol: data');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new UnsafeRemoteUrlError(`Unsafe URL protocol: ${parsed.protocol.replace(':', '')}`);
    }

    const hostname = parsed.hostname.toLowerCase();
    const normalizedHostname = stripIpv6Brackets(hostname);
    if (!hostname) {
        throw new UnsafeRemoteUrlError('URL host is required');
    }

    if (normalizedHostname === 'localhost' || normalizedHostname.endsWith('.localhost')) {
        throw new UnsafeRemoteUrlError('Unsafe URL host: localhost');
    }

    if (isPrivateOrReservedIp(normalizedHostname)) {
        throw new UnsafeRemoteUrlError('Unsafe URL host: private or reserved IP');
    }
}

export type ResolveHostAddresses = (hostname: string) => Promise<string[]>;

export async function assertSafeRemoteUrlWithDns(
    rawUrl: string,
    options: UrlSafetyOptions = {},
    resolveHostAddresses: ResolveHostAddresses = defaultResolveHostAddresses
): Promise<void> {
    assertSafeRemoteUrl(rawUrl, options);

    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'data:') {
        return;
    }

    const hostname = stripIpv6Brackets(parsed.hostname.toLowerCase());
    if (!hostname) {
        throw new UnsafeRemoteUrlError('URL host is required');
    }

    if (isIP(hostname) !== 0) {
        // IP literals are already checked in assertSafeRemoteUrl.
        return;
    }

    let addresses: string[];
    try {
        addresses = await resolveHostAddresses(hostname);
    } catch {
        throw new UnsafeRemoteUrlError(`Unable to resolve URL host: ${hostname}`);
    }

    if (addresses.length === 0) {
        throw new UnsafeRemoteUrlError(`Unable to resolve URL host: ${hostname}`);
    }

    for (const address of addresses) {
        const normalizedAddress = stripIpv6Brackets(address.toLowerCase());
        if (isPrivateOrReservedIp(normalizedAddress)) {
            throw new UnsafeRemoteUrlError('Unsafe URL host: resolved to private or reserved IP');
        }
    }
}

async function defaultResolveHostAddresses(hostname: string): Promise<string[]> {
    const records = await lookup(hostname, { all: true, verbatim: true });
    const addresses = records.map((record) => record.address);
    return Array.from(new Set(addresses));
}

function stripIpv6Brackets(hostname: string): string {
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        return hostname.slice(1, -1);
    }
    return hostname;
}

function isPrivateOrReservedIp(hostname: string): boolean {
    const ipType = isIP(hostname);
    if (ipType === 4) {
        return isPrivateOrReservedIpv4(hostname);
    }
    if (ipType === 6) {
        return isPrivateOrReservedIpv6(hostname);
    }
    return false;
}

function isPrivateOrReservedIpv4(ipv4: string): boolean {
    const octets = ipv4.split('.').map((part) => Number(part));
    if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) {
        return true;
    }

    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127) {
        return true;
    }
    if (a === 169 && b === 254) {
        return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
        return true;
    }
    if (a === 192 && b === 168) {
        return true;
    }
    if (a === 100 && b >= 64 && b <= 127) {
        return true;
    }
    if (a === 198 && (b === 18 || b === 19)) {
        return true;
    }
    if (a >= 224) {
        return true;
    }
    return false;
}

function isPrivateOrReservedIpv6(ipv6: string): boolean {
    const lowered = ipv6.toLowerCase();
    if (lowered === '::' || lowered === '::1') {
        return true;
    }
    if (lowered.startsWith('fc') || lowered.startsWith('fd')) {
        return true;
    }
    if (
        lowered.startsWith('fe8') ||
        lowered.startsWith('fe9') ||
        lowered.startsWith('fea') ||
        lowered.startsWith('feb')
    ) {
        return true;
    }
    if (lowered.startsWith('ff')) {
        return true;
    }

    const mapped = lowered.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) {
        return isPrivateOrReservedIpv4(mapped[1]);
    }

    return false;
}
