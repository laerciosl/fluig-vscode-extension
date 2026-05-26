import { Client, createClientAsync, IOptions } from 'soap';
import { ServerDTO } from '../types/server.types';
import { CookieCache } from '../types/auth.types';
import { getHost } from './http.client';
import * as puppeteer from 'puppeteer-core';

// ── Browser path injection ────────────────────────────────────────────────────
// The SDK has no dependency on VS Code. Callers (e.g. the VS Code extension)
// inject how to resolve the browser executable path.

type BrowserPathProvider = () => Promise<string>;
let browserPathProvider: BrowserPathProvider = async () => '';

export function setBrowserPathProvider(fn: BrowserPathProvider): void {
    browserPathProvider = fn;
}

// ── Cookie cache ─────────────────────────────────────────────────────────────

const cachedCookies: CookieCache = {};

export async function loginAndGetCookies(server: ServerDTO): Promise<string> {
    const key = getCookiesKey(server);
    let cookies = cachedCookies[key];

    if (cookies) {
        if (await isValidCookies(cookies, server)) {
            return cookies;
        }
        delete cachedCookies[key];
    }

    cookies = server.hasBrowser
        ? await tryBrowserAuthenticate(server)
        : await tryAuthenticate(server);

    if (isAuthenticated(cookies) && !await isValidCookies(cookies, server)) {
        await setDemoMode(server);
        cookies = server.hasBrowser
            ? await tryBrowserAuthenticate(server)
            : await tryAuthenticate(server);
    }

    cachedCookies[key] = cookies;
    return cookies;
}

export async function createAuthenticatedClientAsync(
    server: ServerDTO,
    uri: string,
    options?: IOptions
): Promise<Client> {
    const cookies = await loginAndGetCookies(server);
    const client: any = await createClientAsync(uri, options);
    if (cookies) {
        client.addHttpHeader('Cookie', cookies);
    }
    return client;
}

export function clearCookies(server: ServerDTO): void {
    delete cachedCookies[getCookiesKey(server)];
}

// ── Internals ─────────────────────────────────────────────────────────────────

function getCookiesKey(server: ServerDTO): string {
    let key = String(server.hasBrowser) + server.host + server.port;
    key += server.hasBrowser ? server.companyId : server.username;
    return key;
}

function isAuthenticated(cookies: string): boolean {
    return cookies.includes('JSESSIONIDSSO') || cookies.includes('jwt.token');
}

async function isValidCookies(cookiesCached: string, server: ServerDTO): Promise<boolean> {
    const pingUrl = `${getHost(server)}/portal/p/api/servlet/ping`;

    const response = await fetch(pingUrl, {
        method: 'POST',
        headers: { Cookie: cookiesCached },
    });

    if (response.ok) {
        const body = await response.text();
        if (body.startsWith('{') && body.includes('pong')) {
            return true;
        }
    }

    return false;
}

async function setDemoMode(server: ServerDTO): Promise<void> {
    const pingUrl = `${getHost(server)}/portal/api/servlet/license.do?demo=true`;
    await fetch(pingUrl, { method: 'POST' });
}

async function tryAuthenticate(server: ServerDTO): Promise<string> {
    const loginUrl = `${getHost(server)}/portal/api/servlet/login.do`;
    const loginData = `j_username=${server.username}&j_password=${server.password}`;

    const response = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: loginData,
    });

    return (response.headers.get('set-cookie') || '')
        .split(',')
        .map(cookie => cookie.split(';')[0])
        .join('; ');
}

async function tryBrowserAuthenticate(server: ServerDTO): Promise<string> {
    const customPath = await browserPathProvider();
    if (!customPath) {
        return '';
    }

    let browser: puppeteer.Browser | null = null;

    try {
        browser = await puppeteer.launch({
            headless: false,
            executablePath: customPath,
            browser: /firefox/i.test(customPath) ? 'firefox' : 'chrome',
        });

        const pages = await browser.pages();
        const page = pages[0];
        const viewport = page.viewport();

        if (viewport) {
            await page.setViewport({ width: viewport.width, height: viewport.height });
        }

        await page.goto(`${getHost(server)}/portal/p/${server.companyId}/home`);

        const cookiesPromise = new Promise<string>((resolve, reject) => {
            const checkCookie = setInterval(async () => {
                try {
                    if (!browser) {
                        throw new Error('Não foi possível carregar o navegador');
                    }

                    const cookies = await browser.cookies();
                    const sessionCookie = cookies.find(
                        c => c.name === 'JSESSIONIDSSO' || c.name === 'jwt.token'
                    );

                    if (sessionCookie) {
                        clearInterval(checkCookie);
                        clearTimeout(timeout);
                        resolve(cookies.map(c => `${c.name}=${c.value}`).join('; '));
                    }
                } catch (e) {
                    clearInterval(checkCookie);
                    clearTimeout(timeout);
                    reject(e);
                }
            }, 1000);

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

        const cookies = await cookiesPromise;
        await browser.close();
        return cookies;
    } catch {
        if (browser) {
            await browser.close();
        }
    }

    return '';
}
