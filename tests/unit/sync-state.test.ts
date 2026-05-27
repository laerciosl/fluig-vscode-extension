import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
    readFileSync: vi.fn(() => Buffer.from('conteudo inicial')),
}));

import { readFileSync } from 'fs';
import { RuntimeState } from '../../src/core/runtime-state';

describe('sync-state', () => {
    let rt: RuntimeState;

    beforeEach(() => {
        rt = new RuntimeState();
        vi.mocked(readFileSync).mockReturnValue(Buffer.from('conteudo inicial'));
    });

    const makeUri = (path: string) => ({ fsPath: path, path });

    it('getStatus retorna undefined para arquivo desconhecido', () => {
        expect(rt.getStatus(makeUri('/never/seen.js') as any)).toBeUndefined();
    });

    it('markSynced define status synced e dispara evento', () => {
        const fired: any[] = [];
        rt.onDidChangeSyncState(u => fired.push(u));

        const uri = makeUri('/tmp/ds.js');
        rt.markSynced(uri as any);

        expect(rt.getStatus(uri as any)).toBe('synced');
        expect(fired).toHaveLength(1);
        expect(fired[0]).toBe(uri);
    });

    it('markError define status error mantendo hash anterior', () => {
        const uri = makeUri('/tmp/event.js');

        rt.markSynced(uri as any);
        rt.markError(uri as any);

        expect(rt.getStatus(uri as any)).toBe('error');
    });

    it('checkModified detecta alteração de conteúdo → modified', () => {
        const uri = makeUri('/tmp/form.js');

        vi.mocked(readFileSync).mockReturnValue(Buffer.from('versão 1'));
        rt.markSynced(uri as any);

        vi.mocked(readFileSync).mockReturnValue(Buffer.from('versão 2 alterada'));
        rt.checkModified(uri as any);

        expect(rt.getStatus(uri as any)).toBe('modified');
    });

    it('checkModified não dispara evento quando conteúdo não mudou', () => {
        const uri = makeUri('/tmp/same.js');
        rt.markSynced(uri as any);

        const fired: any[] = [];
        rt.onDidChangeSyncState(u => fired.push(u));
        rt.checkModified(uri as any); // mesmo conteúdo

        expect(fired).toHaveLength(0);
    });

    it('checkModified ignora arquivo sem histórico', () => {
        const uri = makeUri('/tmp/unknown.js');
        rt.checkModified(uri as any); // não deve lançar
        expect(rt.getStatus(uri as any)).toBeUndefined();
    });
});
