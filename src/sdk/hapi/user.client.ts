import { ServerDTO } from '../../types/server.types';
import { loginAndGetCookies } from './login.client';
import { getRestUrl, fillServerFromJwtCookies } from './http.client';

export async function getUser(server: ServerDTO): Promise<any> {
    const cookies = await loginAndGetCookies(server);

    fillServerFromJwtCookies(cookies, server);

    const url = getRestUrl(
        server,
        '/portal/api/rest/wcmservice/rest/user/',
        'findUserByLogin',
        { login: server.username }
    );

    return fetch(url, {
        headers: { Cookie: cookies },
    }).then(r => r.json());
}
