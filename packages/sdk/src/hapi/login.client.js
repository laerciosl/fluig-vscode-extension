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
exports.setBrowserPathProvider = setBrowserPathProvider;
exports.loginAndGetCookies = loginAndGetCookies;
exports.createAuthenticatedClientAsync = createAuthenticatedClientAsync;
exports.clearCookies = clearCookies;
const soap_1 = require("soap");
const http_client_1 = require("./http.client");
const puppeteer = require("puppeteer-core");
let browserPathProvider = () => __awaiter(void 0, void 0, void 0, function* () { return ''; });
function setBrowserPathProvider(fn) {
    browserPathProvider = fn;
}
// ── Cookie cache ─────────────────────────────────────────────────────────────
const cachedCookies = {};
function loginAndGetCookies(server) {
    return __awaiter(this, void 0, void 0, function* () {
        const key = getCookiesKey(server);
        let cookies = cachedCookies[key];
        if (cookies) {
            if (yield isValidCookies(cookies, server)) {
                return cookies;
            }
            delete cachedCookies[key];
        }
        cookies = server.hasBrowser
            ? yield tryBrowserAuthenticate(server)
            : yield tryAuthenticate(server);
        if (isAuthenticated(cookies) && !(yield isValidCookies(cookies, server))) {
            yield setDemoMode(server);
            cookies = server.hasBrowser
                ? yield tryBrowserAuthenticate(server)
                : yield tryAuthenticate(server);
        }
        cachedCookies[key] = cookies;
        return cookies;
    });
}
function createAuthenticatedClientAsync(server, uri, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const cookies = yield loginAndGetCookies(server);
        const client = yield (0, soap_1.createClientAsync)(uri, options);
        if (cookies) {
            client.addHttpHeader('Cookie', cookies);
        }
        return client;
    });
}
function clearCookies(server) {
    delete cachedCookies[getCookiesKey(server)];
}
// ── Internals ─────────────────────────────────────────────────────────────────
function getCookiesKey(server) {
    let key = String(server.hasBrowser) + server.host + server.port;
    key += server.hasBrowser ? server.companyId : server.username;
    return key;
}
function isAuthenticated(cookies) {
    return cookies.includes('JSESSIONIDSSO') || cookies.includes('jwt.token');
}
function isValidCookies(cookiesCached, server) {
    return __awaiter(this, void 0, void 0, function* () {
        const pingUrl = `${(0, http_client_1.getHost)(server)}/portal/p/api/servlet/ping`;
        const response = yield fetch(pingUrl, {
            method: 'POST',
            headers: { Cookie: cookiesCached },
        });
        if (response.ok) {
            const body = yield response.text();
            if (body.startsWith('{') && body.includes('pong')) {
                return true;
            }
        }
        return false;
    });
}
function setDemoMode(server) {
    return __awaiter(this, void 0, void 0, function* () {
        const pingUrl = `${(0, http_client_1.getHost)(server)}/portal/api/servlet/license.do?demo=true`;
        yield fetch(pingUrl, { method: 'POST' });
    });
}
function tryAuthenticate(server) {
    return __awaiter(this, void 0, void 0, function* () {
        const loginUrl = `${(0, http_client_1.getHost)(server)}/portal/api/servlet/login.do`;
        const loginData = `j_username=${server.username}&j_password=${server.password}`;
        const response = yield fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: loginData,
        });
        return (response.headers.get('set-cookie') || '')
            .split(',')
            .map(cookie => cookie.split(';')[0])
            .join('; ');
    });
}
function tryBrowserAuthenticate(server) {
    return __awaiter(this, void 0, void 0, function* () {
        const customPath = yield browserPathProvider();
        if (!customPath) {
            return '';
        }
        let browser = null;
        try {
            browser = yield puppeteer.launch({
                headless: false,
                executablePath: customPath,
                browser: /firefox/i.test(customPath) ? 'firefox' : 'chrome',
            });
            const pages = yield browser.pages();
            const page = pages[0];
            const viewport = page.viewport();
            if (viewport) {
                yield page.setViewport({ width: viewport.width, height: viewport.height });
            }
            yield page.goto(`${(0, http_client_1.getHost)(server)}/portal/p/${server.companyId}/home`);
            const cookiesPromise = new Promise((resolve, reject) => {
                const checkCookie = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                    try {
                        if (!browser) {
                            throw new Error('Não foi possível carregar o navegador');
                        }
                        const cookies = yield browser.cookies();
                        const sessionCookie = cookies.find(c => c.name === 'JSESSIONIDSSO' || c.name === 'jwt.token');
                        if (sessionCookie) {
                            clearInterval(checkCookie);
                            clearTimeout(timeout);
                            resolve(cookies.map(c => `${c.name}=${c.value}`).join('; '));
                        }
                    }
                    catch (e) {
                        clearInterval(checkCookie);
                        clearTimeout(timeout);
                        reject(e);
                    }
                }), 1000);
                page.once('close', () => {
                    clearInterval(checkCookie);
                    clearTimeout(timeout);
                    reject();
                });
                const timeout = setTimeout(() => {
                    clearInterval(checkCookie);
                    reject();
                }, 5 * 60 * 1000);
            });
            const cookies = yield cookiesPromise;
            yield browser.close();
            return cookies;
        }
        catch (_a) {
            if (browser) {
                yield browser.close();
            }
        }
        return '';
    });
}
//# sourceMappingURL=login.client.js.map