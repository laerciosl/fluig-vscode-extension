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
exports.getUser = getUser;
const login_client_1 = require("./login.client");
const http_client_1 = require("./http.client");
function getUser(server) {
    return __awaiter(this, void 0, void 0, function* () {
        const cookies = yield (0, login_client_1.loginAndGetCookies)(server);
        (0, http_client_1.fillServerFromJwtCookies)(cookies, server);
        const url = (0, http_client_1.getRestUrl)(server, '/portal/api/rest/wcmservice/rest/user/', 'findUserByLogin', { login: server.username });
        return fetch(url, {
            headers: { Cookie: cookies },
        }).then(r => r.json());
    });
}
//# sourceMappingURL=user.client.js.map