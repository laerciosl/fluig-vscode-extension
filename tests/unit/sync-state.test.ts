import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
    readFileSync: vi.fn(() => Buffer.from('conteudo inicial')),
}));

import { readFileSync } from 'fs';

describe('sync-state', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.mocked(readFileSync).mockReturnValue(Buffer.from('conteudo inicial'));
    });

    const makeUri = (path: string) => ({ fsPath: path, path });

    it('getStatus retorna undefined para arquivo desconhecido', async () => {
        const { getStatus } = await import('../../src/core/sync-state');
        expect(getStatus(makeUri('/never/seen.js') as any)).toBeUndefined();
    });

    it('markSynced define status synced e dispara evento', async () => {
        const { markSynced, getStatus, onDidChangeSyncState } = await import('../../src/core/sync-state');
        const fired: any[] = [];
        onDidChangeSyncState(u => fired.push(u));

        const uri = makeUri('/tmp/ds.js');
        markSynced(uri as any);

        expect(getStatus(uri as any)).toBe('synced');
        expect(fired).toHaveLength(1);
        expect(fired[0]).toBe(uri);
    });

    it('markError define status error mantendo hash anterior', async () => {
        const { markSynced, markError, getStatus } = await import('../../src/core/sync-state');
        const uri = makeUri('/tmp/event.js');

        markSynced(uri as any);
        markError(uri as any);

        expect(getStatus(uri as any)).toBe('error');
    });

    it('checkModified detecta alteração de conteúdo → modified', async () => {
        const { markSynced, checkModified, getStatus } = await import('../../src/core/sync-state');
        const uri = makeUri('/tmp/form.js');

        vi.mocked(readFileSync).mockReturnValue(Buffer.from('versão 1'));
        markSynced(uri as any);

        vi.mocked(readFileSync).mockReturnValue(Buffer.from('versão 2 alterada'));
        checkModified(uri as any);

        expect(getStatus(uri as any)).toBe('modified');
    });

    it('checkModified não dispara evento quando conteúdo não mudou', async () => {
        const { markSynced, checkModified, onDidChangeSyncState } = await import('../../src/core/sync-state');
        const uri = makeUri('/tmp/same.js');
        markSynced(uri as any);

        const fired: any[] = [];
        onDidChangeSyncState(u => fired.push(u));
        checkModified(uri as any); // mesmo conteúdo

        expect(fired).toHaveLength(0);
    });

    it('checkModified ignora arquivo sem histórico', async () => {
        const { checkModified, getStatus } = await import('../../src/core/sync-state');
        const uri = makeUri('/tmp/unknown.js');
        checkModified(uri as any); // não deve lançar
        expect(getStatus(uri as any)).toBeUndefined();
    });
});
