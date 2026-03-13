import { describe, expect, test } from 'bun:test';
import { extractReleaseNotesSection, listReleaseNoteVersions } from '../../src/utils/release-notes';

const SAMPLE_NOTES = `# Versions

## v0.1.0

### 提交文案

old body

### 开发说明

old dev

## v0.2.0

### 提交文案

new body line 1
new body line 2

### 开发说明

- item 1
- item 2
`;

describe('release notes utils', () => {
    test('lists available versions from release note index', () => {
        expect(listReleaseNoteVersions(SAMPLE_NOTES)).toEqual(['0.1.0', '0.2.0']);
    });

    test('extracts the requested subsection for a version', () => {
        expect(extractReleaseNotesSection(SAMPLE_NOTES, '0.2.0').body).toBe(
            'new body line 1\nnew body line 2'
        );
        expect(extractReleaseNotesSection(SAMPLE_NOTES, '0.2.0', '开发说明').body).toBe(
            '- item 1\n- item 2'
        );
    });

    test('throws when version is missing', () => {
        expect(() => extractReleaseNotesSection(SAMPLE_NOTES, '0.3.0')).toThrow(
            'Release notes for version v0.3.0 not found'
        );
    });

    test('throws when subsection is missing', () => {
        expect(() => extractReleaseNotesSection(SAMPLE_NOTES, '0.2.0', '不存在')).toThrow(
            'Section "不存在" for version v0.2.0 not found'
        );
    });
});
