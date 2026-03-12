export function normalizeScriptShortcuts(
    rawScript: Record<string, unknown> | undefined
): Record<string, string> {
    if (!rawScript || typeof rawScript !== 'object') {
        return {};
    }

    const shortcuts = rawScript.shortcuts;
    if (!shortcuts || typeof shortcuts !== 'object' || Array.isArray(shortcuts)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(shortcuts)
            .filter(([, value]) => typeof value === 'string')
            .map(([name, value]) => [name, value as string])
    );
}
