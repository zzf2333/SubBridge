import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { extractReleaseNotesSection, listReleaseNoteVersions } from '../src/utils/release-notes';

interface PackageJsonLike {
    version?: string;
}

function parseArgs(argv: string[]): {
    version?: string;
    subsection: string;
    output?: string;
    list: boolean;
} {
    const result = {
        version: undefined as string | undefined,
        subsection: '提交文案',
        output: undefined as string | undefined,
        list: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--version') {
            result.version = argv[index + 1];
            index += 1;
            continue;
        }
        if (arg === '--section') {
            result.subsection = argv[index + 1] || result.subsection;
            index += 1;
            continue;
        }
        if (arg === '--output') {
            result.output = argv[index + 1];
            index += 1;
            continue;
        }
        if (arg === '--list') {
            result.list = true;
        }
    }

    return result;
}

function readCurrentVersion(rootDir: string): string {
    const packageJson = JSON.parse(
        readFileSync(join(rootDir, 'package.json'), 'utf-8')
    ) as PackageJsonLike;

    if (!packageJson.version) {
        throw new Error('package.json version is missing');
    }

    return packageJson.version;
}

const rootDir = resolve(import.meta.dir, '..');
const notesPath = join(rootDir, 'docs', 'release-notes.md');
const markdown = readFileSync(notesPath, 'utf-8');
const args = parseArgs(process.argv.slice(2));

if (args.list) {
    console.log(listReleaseNoteVersions(markdown).map((version) => `v${version}`).join('\n'));
    process.exit(0);
}

const version = args.version || readCurrentVersion(rootDir);
const section = extractReleaseNotesSection(markdown, version, args.subsection);

if (args.output) {
    const outputPath = resolve(rootDir, args.output);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, section.body + '\n', 'utf-8');
}

process.stdout.write(section.body + '\n');
