import { ServerDTO } from '../types/server.types';
import { DatasetDTO, DatasetStructureDTO } from './dataset.types';
import { createAuthenticatedClientAsync, loginAndGetCookies } from '../hapi/login.client';
import { getHost, getRestUrl } from '../hapi/http.client';

const BASE_PATH = '/ecm/api/rest/ecm/dataset/';

const jsonHeaders = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
});

export async function apiFindAllDatasets(server: ServerDTO): Promise<DatasetDTO[]> {
    const uri = `${getHost(server)}/webdesk/ECMDatasetService?wsdl`;
    const params = {
        companyId: server.companyId,
        username: server.username,
        password: server.password,
    };

    return createAuthenticatedClientAsync(server, uri)
        .then(client => client.findAllFormulariesDatasetsAsync(params))
        .then(response => response[0].dataset?.item || []);
}

export async function apiLoadDataset(server: ServerDTO, datasetId: string): Promise<any> {
    jsonHeaders.set('Cookie', await loginAndGetCookies(server));
    return fetch(
        getRestUrl(server, BASE_PATH, 'loadDataset', { datasetId }),
        { headers: jsonHeaders }
    ).then(r => r.json());
}

export async function apiGetDatasetResult(
    server: ServerDTO,
    datasetId: string,
    fields: string[],
    constraints: [],
    order: string[]
): Promise<any> {
    const uri = `${getHost(server)}/webdesk/ECMDatasetService?wsdl`;
    const params = {
        companyId: server.companyId,
        username: server.username,
        password: server.password,
        name: datasetId,
        fields: { item: fields },
        constraints: { item: constraints },
        order: { item: order },
    };

    const client = await createAuthenticatedClientAsync(server, uri, {
        handleNilAsNull: true,
        disableCache: true,
    });
    return client.getDatasetAsync(params).then((response: any) => response[0].dataset);
}

export async function apiCreateDataset(
    server: ServerDTO,
    dataset: DatasetStructureDTO
): Promise<any> {
    jsonHeaders.set('Cookie', await loginAndGetCookies(server));
    return fetch(getRestUrl(server, BASE_PATH, 'createDataset'), {
        headers: jsonHeaders,
        method: 'POST',
        body: JSON.stringify(dataset),
    }).then(r => r.json());
}

export async function apiUpdateDataset(
    server: ServerDTO,
    dataset: DatasetStructureDTO
): Promise<any> {
    jsonHeaders.set('Cookie', await loginAndGetCookies(server));
    return fetch(
        getRestUrl(server, BASE_PATH, 'editDataset', { confirmnewstructure: 'false' }),
        {
            headers: jsonHeaders,
            method: 'POST',
            body: JSON.stringify(dataset),
        }
    ).then(r => r.json());
}
