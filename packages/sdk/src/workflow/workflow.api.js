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
exports.apiGetLastWorkflowVersion = apiGetLastWorkflowVersion;
exports.apiUpdateWorkflowEvents = apiUpdateWorkflowEvents;
const login_client_1 = require("../hapi/login.client");
const http_client_1 = require("../hapi/http.client");
function apiGetLastWorkflowVersion(server, processId) {
    return __awaiter(this, void 0, void 0, function* () {
        return fetch(`${(0, http_client_1.getHost)(server)}/fluiggersWidget/api/workflows/${encodeURIComponent(processId)}/version`, {
            method: 'GET',
            headers: { Cookie: yield (0, login_client_1.loginAndGetCookies)(server) },
        }).then((r) => __awaiter(this, void 0, void 0, function* () {
            if (!r.ok) {
                return 0;
            }
            return parseInt(yield r.text());
        }));
    });
}
function apiUpdateWorkflowEvents(server, processId, version, events) {
    return __awaiter(this, void 0, void 0, function* () {
        return fetch(`${(0, http_client_1.getHost)(server)}/fluiggersWidget/api/workflows/${encodeURIComponent(processId)}/${version}/events`, {
            method: 'PUT',
            headers: {
                Cookie: yield (0, login_client_1.loginAndGetCookies)(server),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(events),
        }).then(r => {
            if (!r.ok) {
                throw `Não foi possível atualizar os eventos. ${r.statusText}`;
            }
            return r.json();
        });
    });
}
//# sourceMappingURL=workflow.api.js.map