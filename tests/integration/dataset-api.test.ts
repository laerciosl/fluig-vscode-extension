import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiCreateDataset, apiUpdateDataset } from '../../packages/sdk/src/dataset/dataset.api';
import datasetList from '../fixtures/api/dataset-list.json';

/**
 * Testa as funções REST do dataset.api (create/update) com fetch mockado.
 * apiFindAllDatasets usa SOAP e é coberto pelos testes de extensão VS Code.
 *
 * Sequência real do Fluig:
 *   1. POST login.do          → cookies
 *   2. GET  /ping             → valida cookies (retorna 200)
 *   3. POST createDataset     → { content: 'OK' }
 */

// host SEM protocolo — getHost() adiciona 'https://'
const server = {
    name: 'Fluig DEV',
    host: 'fluig.local',
    port: 443,
    ssl: true,
    companyId: 1,
    username: 'adm',
    password: 'senha',
    userCode: 'adm',
    hasBrowser: false,
    confirmExporting: false,
};

const datasetStructure = {
    datasetPK: { companyId: 1, datasetId: 'dsNovo' },
    datasetDescription: 'Novo Dataset',
    datasetImpl: 'function createDataset() {}',
    datasetBuilder: 'com.datasul.technology.webdesk.dataset.CustomizedDatasetBuilder',
    serverOffline: false, mobileCache: false,
    lastReset: 0, lastRemoteSync: 0,
    type: 'CUSTOM', mobileOffline: false, updateIntervalTimestamp: 0,
};

/** Monta um fetch spy que roteia URLs por substring. */
function buildFetchMock(routes: Record<string, () => Partial<Response>>) {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(typeof input === 'string' ? input
                         : 'href' in input ? input.href
                         : (input as Request).url);

        const match = Object.entries(routes).find(([pattern]) => url.includes(pattern));
        if (match) {
            return match[1]() as Response;
        }
        throw new Error(`fetch não mockado: ${url}`);
    });
}

describe('Dataset API (REST) — integração', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.resetModules();
        fetchSpy = vi.spyOn(global, 'fetch');
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it('apiCreateDataset faz login → valida cookie → POST createDataset', async () => {
        fetchSpy.mockImplementation(buildFetchMock({
            'login.do': () => ({
                headers: new Headers({ 'set-cookie': 'JSESSIONID=abc123; Path=/' }),
            }),
            '/ping': () => ({ ok: true, status: 200, text: async () => 'pong' }),
            'createDataset': () => ({
                ok: true,
                json: async () => ({ content: 'OK' }),
            }),
        }));

        const result = await apiCreateDataset(server as any, datasetStructure as any);

        expect(result).toMatchObject({ content: 'OK' });

        const urls = fetchSpy.mock.calls.map(c => String(c[0]));
        expect(urls.some(u => u.includes('login.do'))).toBe(true);
        expect(urls.some(u => u.includes('createDataset'))).toBe(true);

        const createCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('createDataset'))!;
        expect((createCall[1] as RequestInit).method).toBe('POST');
        const body = JSON.parse((createCall[1] as RequestInit).body as string);
        expect(body.datasetPK.datasetId).toBe('dsNovo');
    });

    it('apiUpdateDataset envia PUT para editDataset', async () => {
        fetchSpy.mockImplementation(buildFetchMock({
            'login.do': () => ({
                headers: new Headers({ 'set-cookie': 'JSESSIONID=xyz; Path=/' }),
            }),
            '/ping': () => ({ ok: true, status: 200, text: async () => 'pong' }),
            'editDataset': () => ({
                ok: true,
                json: async () => ({ content: 'OK' }),
            }),
        }));

        const result = await apiUpdateDataset(server as any, { ...datasetStructure, datasetImpl: 'v2' } as any);

        expect(result).toMatchObject({ content: 'OK' });
        const editCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('editDataset'))!;
        expect((editCall[1] as RequestInit).method).toBe('POST');
    });

    it('apiCreateDataset relança erro quando fetch falha', async () => {
        fetchSpy.mockImplementation(buildFetchMock({
            'login.do': () => ({
                headers: new Headers({ 'set-cookie': 'JSESSIONID=abc; Path=/' }),
            }),
            '/ping': () => ({ ok: true, status: 200, text: async () => 'pong' }),
            'createDataset': () => {
                throw new Error('Network error');
            },
        }));

        await expect(apiCreateDataset(server as any, datasetStructure as any))
            .rejects.toThrow('Network error');
    });
});
