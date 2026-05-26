import { ServerDTO } from '../../types/server.types';
import { JwtPayload } from '../../types/auth.types';

export function getHost(server: ServerDTO): string {
    const schema = server.ssl ? 'https' : 'http';
    const port = [80, 443].includes(server.port) ? '' : `:${server.port}`;
    return `${schema}://${server.host}${port}`;
}

export function getRestUrl(
    server: ServerDTO,
    basePath: string,
    resource: string,
    params?: Record<string, string>
): URL {
    const url = new URL(`${getHost(server)}${basePath}${resource}`);

    if (params) {
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.append(key, value);
        }
    }

    return url;
}

/**
 * Preenche companyId e username do servidor a partir do payload JWT encontrado nos cookies.
 * Lança erro se o companyId divergir do valor já configurado.
 */
export function fillServerFromJwtCookies(cookies: string, server: ServerDTO): void {
    if (!cookies) {
        return;
    }

    const jwtCookie = cookies.split(/; ?/).find(c => c.startsWith('jwt.token='));
    if (!jwtCookie) {
        return;
    }

    const token = jwtCookie.split('=')[1];
    const parts = token.split('.');
    if (parts.length < 2) {
        return;
    }

    let payload: JwtPayload;
    try {
        payload = JSON.parse(base64UrlDecode(parts[1]));
    } catch {
        return;
    }

    if (payload?.tenant) {
        if (server.companyId && server.companyId !== payload.tenant) {
            throw new Error('O servidor retornou um Código da empresa diferente do Código informado.');
        }
        server.companyId = payload.tenant;

        if (payload.sub) {
            server.username = payload.sub;
        }
    }
}

export async function validateServerHasFluiggersWidget(server: ServerDTO, cookies: string): Promise<void> {
    const url = new URL(`${getHost(server)}/fluiggersWidget/api/ping`);

    const hasWidget = await fetch(url, {
        method: 'GET',
        headers: { Cookie: cookies },
    }).then(async r => {
        if (r.status !== 200) {
            return false;
        }
        return 'pong' === await r.text();
    });

    if (!hasWidget) {
        throw new Error('Você precisa instalar a FluiggersWidget nesse servidor para executar essa operação.');
    }
}

function base64UrlDecode(str: string): string {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
        str += '=';
    }
    return Buffer.from(str, 'base64').toString('utf8');
}
