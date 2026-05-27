import { ServerDTO } from '../types/server.types';
import { fetchWithAuth } from '../hapi/login.client';
import { getHost } from '../hapi/http.client';

const WORKFLOW_TIMEOUT_MS = 120_000;

export async function apiGetLastWorkflowVersion(
    server: ServerDTO,
    processId: string
): Promise<number> {
    return fetchWithAuth(
        server,
        `${getHost(server)}/fluiggersWidget/api/workflows/${encodeURIComponent(processId)}/version`,
        { method: 'GET' },
        WORKFLOW_TIMEOUT_MS
    ).then(async r => {
        if (!r.ok) {
            return 0;
        }
        return parseInt(await r.text());
    });
}

export async function apiUpdateWorkflowEvents(
    server: ServerDTO,
    processId: string,
    version: number,
    events: { name: string; contents: string }[]
): Promise<any> {
    return fetchWithAuth(
        server,
        `${getHost(server)}/fluiggersWidget/api/workflows/${encodeURIComponent(processId)}/${version}/events`,
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(events),
        },
        WORKFLOW_TIMEOUT_MS
    ).then(r => {
        if (!r.ok) {
            throw `Não foi possível atualizar os eventos. ${r.statusText}`;
        }
        return r.json();
    });
}
