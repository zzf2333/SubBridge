export interface ReleaseNotesSection {
    version: string;
    title: string;
    body: string;
}

const VERSION_HEADING_RE = /^##\s+v(\d+\.\d+\.\d+)\s*$/;
const SUBSECTION_HEADING_RE = /^###\s+(.+)\s*$/;

export function listReleaseNoteVersions(markdown: string): string[] {
    const versions: string[] = [];
    for (const line of markdown.split(/\r?\n/)) {
        const match = line.match(VERSION_HEADING_RE);
        if (match) {
            versions.push(match[1]);
        }
    }
    return versions;
}

export function extractReleaseNotesSection(
    markdown: string,
    version: string,
    subsection = '提交文案'
): ReleaseNotesSection {
    const lines = markdown.split(/\r?\n/);
    const versionHeading = `## v${version}`;
    const versionStart = lines.findIndex((line) => line.trim() === versionHeading);

    if (versionStart === -1) {
        throw new Error(`Release notes for version v${version} not found`);
    }

    let versionEnd = lines.length;
    for (let index = versionStart + 1; index < lines.length; index += 1) {
        if (VERSION_HEADING_RE.test(lines[index])) {
            versionEnd = index;
            break;
        }
    }

    const versionLines = lines.slice(versionStart, versionEnd);
    const subsectionHeading = `### ${subsection}`;
    const subsectionStart = versionLines.findIndex((line) => line.trim() === subsectionHeading);

    if (subsectionStart === -1) {
        throw new Error(`Section "${subsection}" for version v${version} not found`);
    }

    let subsectionEnd = versionLines.length;
    for (let index = subsectionStart + 1; index < versionLines.length; index += 1) {
        if (SUBSECTION_HEADING_RE.test(versionLines[index])) {
            subsectionEnd = index;
            break;
        }
    }

    const body = versionLines.slice(subsectionStart + 1, subsectionEnd).join('\n').trim();

    if (!body) {
        throw new Error(`Section "${subsection}" for version v${version} is empty`);
    }

    return {
        version,
        title: subsection,
        body,
    };
}
