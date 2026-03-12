import { describe, expect, test } from 'bun:test';
import {
    assertSafeRemoteUrl,
    assertSafeRemoteUrlWithDns,
    UnsafeRemoteUrlError,
} from '../../src/utils/url-safety';

describe('URL Safety Utility', () => {
    test('allows https urls', () => {
        expect(() => assertSafeRemoteUrl('https://example.com/config.yaml')).not.toThrow();
    });

    test('allows data urls only when explicitly enabled', () => {
        expect(() =>
            assertSafeRemoteUrl('data:text/plain,hello', { allowDataUrl: true })
        ).not.toThrow();
        expect(() => assertSafeRemoteUrl('data:text/plain,hello')).toThrow(UnsafeRemoteUrlError);
    });

    test('rejects localhost urls', () => {
        expect(() => assertSafeRemoteUrl('http://localhost:9090')).toThrow(UnsafeRemoteUrlError);
        expect(() => assertSafeRemoteUrl('http://a.localhost:9090')).toThrow(
            UnsafeRemoteUrlError
        );
    });

    test('rejects private and reserved ip literals', () => {
        expect(() => assertSafeRemoteUrl('http://127.0.0.1:9090')).toThrow(UnsafeRemoteUrlError);
        expect(() => assertSafeRemoteUrl('http://10.0.0.1')).toThrow(UnsafeRemoteUrlError);
        expect(() => assertSafeRemoteUrl('http://192.168.1.2')).toThrow(UnsafeRemoteUrlError);
        expect(() => assertSafeRemoteUrl('http://[::1]:9090')).toThrow(UnsafeRemoteUrlError);
    });

    test('allows domain when DNS resolves to public addresses', async () => {
        await expect(
            assertSafeRemoteUrlWithDns(
                'https://example.com/config.yaml',
                {},
                async () => ['93.184.216.34']
            )
        ).resolves.toBeUndefined();
    });

    test('rejects domain when DNS resolves to private or reserved addresses', async () => {
        await expect(
            assertSafeRemoteUrlWithDns(
                'https://example.com/config.yaml',
                {},
                async () => ['127.0.0.1']
            )
        ).rejects.toBeInstanceOf(UnsafeRemoteUrlError);
    });

    test('rejects domain when DNS resolve fails', async () => {
        await expect(
            assertSafeRemoteUrlWithDns(
                'https://example.com/config.yaml',
                {},
                async () => Promise.reject(new Error('ENOTFOUND'))
            )
        ).rejects.toBeInstanceOf(UnsafeRemoteUrlError);
    });
});
