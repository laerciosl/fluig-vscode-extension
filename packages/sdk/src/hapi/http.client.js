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
exports.getHost = getHost;
exports.getRestUrl = getRestUrl;
exports.fillServerFromJwtCookies = fillServerFromJwtCookies;
exports.validateServerHasFluiggersWidget = validateServerHasFluiggersWidget;
function getHost(server) {
    const schema = server.ssl ? 'https' : 'http';
    const port = [80, 443].includes(server.port) ? '' : `:${server.port}`;
    return `${schema}://${server.host}${port}`;
}
function getRestUrl(server, basePath, resource, params) {
    const url = new URL(`${getHost(server)}${basePath}${resource}`);
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.append(key, value);
        }
    }
    return url;
}
function fillServerFromJwtCookies(cookies, server) {
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
    let payload;
    try {
        payload = JSON.parse(base64UrlDecode(parts[1]));
    }
    catch (_a) {
        return;
    }
    if (payload === null || payload === void 0 ? void 0 : payload.tenant) {
        if (server.companyId && server.companyId !== payload.tenant) {
            throw new Error('O servidor retornou um Código da empresa diferente do Código informado.');
        }
        server.companyId = payload.tenant;
        if (payload.sub) {
            server.username = payload.sub;
        }
    }
}
function validateServerHasFluiggersWidget(server, cookies) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = new URL(`${getHost(server)}/fluiggersWidget/api/ping`);
        const hasWidget = yield fetch(url, {
            method: 'GET',
            headers: { Cookie: cookies },
        }).then((r) => __awaiter(this, void 0, void 0, function* () {
            if (r.status !== 200) {
                return false;
            }
            return 'pong' === (yield r.text());
        }));
        if (!hasWidget) {
            throw new Error('Você precisa instalar a FluiggersWidget nesse servidor para executar essa operação.');
        }
    });
}
function base64UrlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
        str += '=';
    }
    return Buffer.from(str, 'base64').toString('utf8');
}
//# sourceMappingURL=http.client.js.map