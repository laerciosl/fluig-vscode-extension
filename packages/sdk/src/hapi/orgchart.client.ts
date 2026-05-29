import { ServerDTO } from '../types/server.types';
import { fetchWithAuth } from './login.client';
import { getRestUrl } from './http.client';
import { getHttpLogger } from '../sdk-logger';

const BASE = '/admin/api/v1/';
const PAGE_SIZE = 1000;

export interface OrgGroupDTO {
    groupId: string;
    groupDescription: string;
}

export interface OrgRoleDTO {
    roleId: string;
    roleDescription: string;
}

interface AdminFindItem {
    code: string;
    description?: string;
}

export async function apiFindGroups(server: ServerDTO, filter = ''): Promise<OrgGroupDTO[]> {
    const items = await fetchAllPages(server, 'groups', filter);
    return items.map(i => ({ groupId: i.code, groupDescription: i.description ?? i.code }));
}

export async function apiFindRoles(server: ServerDTO, filter = ''): Promise<OrgRoleDTO[]> {
    const items = await fetchAllPages(server, 'roles', filter);
    return items.map(i => ({ roleId: i.code, roleDescription: i.description ?? i.code }));
}

// API de Administração do Fluig: GET /admin/api/v1/{groups|roles}, paginada via hasNext.
async function fetchAllPages(server: ServerDTO, resource: string, filter: string): Promise<AdminFindItem[]> {
    const all: AdminFindItem[] = [];
    let page = 1;
    // Cap evita loop infinito caso a API nunca retorne hasNext=false.
    for (let guard = 0; guard < 100; guard++) {
        const params: Record<string, string> = { page: String(page), pageSize: String(PAGE_SIZE) };
        if (filter) { params.description = filter; }
        const url = getRestUrl(server, BASE, resource, params);
        const response = await fetchWithAuth(server, url, { headers: { Accept: 'application/json' } });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} em ${resource} (${url.pathname})`);
        }
        const data = await response.json() as { items?: AdminFindItem[]; hasNext?: boolean };
        const items = data.items ?? [];
        all.push(...items);
        if (!data.hasNext || items.length === 0) { break; }
        page++;
    }
    getHttpLogger().debug(`Admin ${resource}: ${all.length} itens carregados`);
    return all;
}
