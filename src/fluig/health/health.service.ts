import { window } from 'vscode';
import { ServerDTO } from '../../types/server.types';
import { Server } from '../../core/server.model';
import { getSelect } from '../../core/server.service';
import { createLogger, showLogger } from '../../core/logger';

const log = createLogger('[HEALTH]');
import {
    loginAndGetCookies,
    getUser,
    apiFindAllDatasets,
    validateServerHasFluiggersWidget,
    getHost,
    getRestUrl,
} from '@fluiggers/sdk';

const TIMEOUT_MS = 15_000;

export async function testConnection(serverDto?: ServerDTO): Promise<void> {
    const server = serverDto ? new Server(serverDto) : await getSelect();
    if (!server) {
        return;
    }

    showLogger();
    log.info(`═══ Testando conexão: ${server.name} ═══`);

    let cookies = '';
    const failures: string[] = [];

    // 1. Login
    try {
        cookies = await withTimeout(loginAndGetCookies(server), TIMEOUT_MS);
        log.info(`  ✔ Login (${server.username})`);
    } catch (e: any) {
        const msg = e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e));
        log.info(`  ✖ Login: ${msg}`);
        failures.push(`Login: ${msg}`);
        log.info(`══ ${failures.length} falha(s) — diagnóstico encerrado (sem sessão) ══`);
        window.showErrorMessage(`Falha ao conectar em ${server.name}: ${msg}`);
        return;
    }

    // 2. Tenant / Usuário
    try {
        const userResp: any = await withTimeout(getUser(server), TIMEOUT_MS);
        if (userResp?.content) {
            log.info(`  ✔ Tenant/Usuário (${server.companyId})`);
        } else {
            throw new Error(userResp?.message?.message || 'resposta inesperada');
        }
    } catch (e: any) {
        const msg = e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e));
        log.info(`  ✖ Tenant/Usuário: ${msg}`);
        failures.push(`Tenant: ${msg}`);
    }

    // 3. Dataset API (SOAP)
    try {
        await withTimeout(apiFindAllDatasets(server), TIMEOUT_MS);
        log.info(`  ✔ Dataset API (SOAP)`);
    } catch (e: any) {
        const msg = e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e));
        log.info(`  ✖ Dataset API (SOAP): ${msg}`);
        failures.push(`Dataset API: ${msg}`);
    }

    // 4. Mechanism REST (workflow)
    try {
        const url = getRestUrl(server, '/ecm/api/rest/ecm/mechanism/', 'getCustomAttributionMechanismList');
        const r = await withTimeout(
            fetch(url, { headers: { Cookie: cookies } }),
            TIMEOUT_MS
        );
        if (r.ok) {
            log.info(`  ✔ Workflow API (REST)`);
        } else {
            throw new Error(`HTTP ${r.status}`);
        }
    } catch (e: any) {
        const msg = e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e));
        log.info(`  ✖ Workflow API (REST): ${msg}`);
        failures.push(`Workflow API: ${msg}`);
    }

    // 5. FluiggersWidget
    try {
        await withTimeout(validateServerHasFluiggersWidget(server, cookies), TIMEOUT_MS);
        log.info(`  ✔ FluiggersWidget`);
    } catch (e: any) {
        const msg = e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e));
        log.info(`  ✖ FluiggersWidget: ${msg}`);
        failures.push(`FluiggersWidget: ${msg}`);
    }

    // Summary
    if (failures.length === 0) {
        log.info(`══ ✔ Todos os testes passaram ══`);
        window.showInformationMessage(`Conexão com ${server.name} OK — todos os serviços responderam.`);
    } else {
        log.info(`══ ✖ ${failures.length} falha(s) encontrada(s) ══`);
        window.showWarningMessage(
            `${failures.length} problema(s) em ${server.name}. Veja o Output "Fluig" para detalhes.`
        );
    }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'AbortError' })), ms)
        ),
    ]);
}
