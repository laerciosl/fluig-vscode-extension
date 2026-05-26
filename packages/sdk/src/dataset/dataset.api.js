"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiFindAllDatasets = apiFindAllDatasets;
exports.apiLoadDataset = apiLoadDataset;
exports.apiGetDatasetResult = apiGetDatasetResult;
exports.apiCreateDataset = apiCreateDataset;
exports.apiUpdateDataset = apiUpdateDataset;
const login_client_1 = require("../hapi/login.client");
const http_client_1 = require("../hapi/http.client");
const BASE_PATH = '/ecm/api/rest/ecm/dataset/';
const jsonHeaders = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
});
function apiFindAllDatasets(server) {
    return __awaiter(this, void 0, void 0, function* () {
        const uri = `${(0, http_client_1.getHost)(server)}/webdesk/ECMDatasetService?wsdl`;
        const params = {
            companyId: server.companyId,
            username: server.username,
            password: server.password,
        };
        return (0, login_client_1.createAuthenticatedClientAsync)(server, uri)
            .then(client => client.findAllFormulariesDatasetsAsync(params))
            .then(response => { var _a; return ((_a = response[0].dataset) === null || _a === void 0 ? void 0 : _a.item) || []; });
    });
}
function apiLoadDataset(server, datasetId) {
    return __awaiter(this, void 0, void 0, function* () {
        jsonHeaders.set('Cookie', yield (0, login_client_1.loginAndGetCookies)(server));
        return fetch((0, http_client_1.getRestUrl)(server, BASE_PATH, 'loadDataset', { datasetId }), { headers: jsonHeaders }).then(r => r.json());
    });
}
function apiGetDatasetResult(server, datasetId, fields, constraints, order) {
    return __awaiter(this, void 0, void 0, function* () {
        const uri = `${(0, http_client_1.getHost)(server)}/webdesk/ECMDatasetService?wsdl`;
        const params = {
            companyId: server.companyId,
            username: server.username,
            password: server.password,
            name: datasetId,
            fields: { item: fields },
            constraints: { item: constraints },
            order: { item: order },
        };
        const client = yield (0, login_client_1.createAuthenticatedClientAsync)(server, uri, {
            handleNilAsNull: true,
            disableCache: true,
        });
        return client.getDatasetAsync(params).then((response) => response[0].dataset);
    });
}
function apiCreateDataset(server, dataset) {
    return __awaiter(this, void 0, void 0, function* () {
        jsonHeaders.set('Cookie', yield (0, login_client_1.loginAndGetCookies)(server));
        return fetch((0, http_client_1.getRestUrl)(server, BASE_PATH, 'createDataset'), {
            headers: jsonHeaders,
            method: 'POST',
            body: JSON.stringify(dataset),
        }).then(r => r.json());
    });
}
function apiUpdateDataset(server, dataset) {
    return __awaiter(this, void 0, void 0, function* () {
        jsonHeaders.set('Cookie', yield (0, login_client_1.loginAndGetCookies)(server));
        return fetch((0, http_client_1.getRestUrl)(server, BASE_PATH, 'editDataset', { confirmnewstructure: 'false' }), {
            headers: jsonHeaders,
            method: 'POST',
            body: JSON.stringify(dataset),
        }).then(r => r.json());
    });
}
//# sourceMappingURL=dataset.api.js.map