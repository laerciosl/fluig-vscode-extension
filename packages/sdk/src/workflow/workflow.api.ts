import { ServerDTO } from '../types/server.types';
import { loginAndGetCookies } from '../hapi/login.client';
import { getHost } from '../hapi/http.client';

export async function apiGetLastWorkflowVersion(
    server: ServerDTO,
    processId: string
): Promise<number> {
    return fetch(
        `${getHost(server)}/fluiggersWidget/api/workflows/${encodeURIComponent(processId)}/version`,
        {
            method: 'GET',
            headers: { Cookie: await loginAndGetCookies(server) },
        }
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
    return fetch(
        `${getHost(server)}/fluiggersWidget/api/workflows/${encodeURIComponent(processId)}/${version}/events`,
        {
            method: 'PUT',
            headers: {
                Cookie: await loginAndGetCookies(server),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(events),
        }
    ).then(r => {
        if (!r.ok) {
            throw `Não foi possível atualizar os eventos. ${r.statusText}`;
        }
        return r.json();
    });
}
