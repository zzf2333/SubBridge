#!/usr/bin/env bun
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { auditSeoContent } from '../src/utils/seo-check';

const rootDir = resolve(import.meta.dir, '..');

const readUtf8 = (path: string) => readFileSync(path, 'utf-8');
const readJson = <T>(path: string) => JSON.parse(readUtf8(path)) as T;

const errors = auditSeoContent({
    readme: readUtf8(join(rootDir, 'README.md')),
    docsIndex: readUtf8(join(rootDir, 'docs', 'README.md')),
    topicDoc: readUtf8(join(rootDir, 'docs', 'how-to-convert-clash-to-sing-box.md')),
    webIndex: readUtf8(join(rootDir, 'src', 'web', 'routes', 'index.ts')),
    packageJson: readJson(join(rootDir, 'package.json')),
});

if (errors.length > 0) {
    console.error('SEO check failed:');
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exit(1);
}

console.log('SEO check passed.');
