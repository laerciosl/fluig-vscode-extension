import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
    getProcessDefinition,
    invalidateProcessCache,
    clearProcessCache,
} from '../../../src/fluig/workflow/process/process.cache';

const xml = readFileSync(
    join(__dirname, '../../fixtures/process/repair_shop.process'),
    'utf-8'
);

function makeDoc(uri: string, version: number, text: string): any {
    return {
        uri: { toString: () => uri },
        version,
        getText: () => text,
    };
}

describe('process.cache', () => {
    beforeEach(() => {
        clearProcessCache();
    });

    it('returns parsed definition on first call', () => {
        const doc = makeDoc('file:///a.process', 1, xml);
        const def = getProcessDefinition(doc);
        expect(def?.metadata.id).toBe('repair_shop');
    });

    it('returns the same instance when document version is unchanged', () => {
        const doc = makeDoc('file:///a.process', 1, xml);
        const first = getProcessDefinition(doc);
        const second = getProcessDefinition(doc);
        expect(second).toBe(first);
    });

    it('re-parses when document version changes', () => {
        const doc1 = makeDoc('file:///a.process', 1, xml);
        const doc2 = makeDoc('file:///a.process', 2, xml);
        const first = getProcessDefinition(doc1);
        const second = getProcessDefinition(doc2);
        expect(second).not.toBe(first);
        expect(second?.metadata.id).toBe('repair_shop');
    });

    it('returns undefined on malformed XML and recovers afterwards', () => {
        const bad = makeDoc('file:///a.process', 1, '<not valid');
        expect(getProcessDefinition(bad)).toBeUndefined();
        const good = makeDoc('file:///a.process', 2, xml);
        expect(getProcessDefinition(good)?.metadata.id).toBe('repair_shop');
    });

    it('invalidates a specific entry without affecting others', () => {
        const a = makeDoc('file:///a.process', 1, xml);
        const b = makeDoc('file:///b.process', 1, xml);
        const firstA = getProcessDefinition(a);
        const firstB = getProcessDefinition(b);
        invalidateProcessCache({ toString: () => 'file:///a.process' } as any);
        const secondA = getProcessDefinition(a);
        const secondB = getProcessDefinition(b);
        expect(secondA).not.toBe(firstA);
        expect(secondB).toBe(firstB);
    });
});
