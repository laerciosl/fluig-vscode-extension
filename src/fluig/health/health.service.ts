import { window } from 'vscode';
import { ServerDTO } from '../../types/server.types';
import { Server } from '../../core/server.model';
import { getSelect } from '../../core/server.service';
import { logInfo, showOutput } from '../../core/output';
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

    showOutput();
    logInfo(`═══ Testando conexão: ${server.name} ═══`);

    let cookies = '';
    const failures: string[] = [];

    // 1. Login
    try {
        cookies = await withTimeout(loginAndGetCookies(server), TIMEOUT_MS);
        logInfo(`  ✔ Login (${server.username})`);
    } catch (e: any) {
        const msg = e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e));
        logInfo(`  ✖ Login: ${msg}`);
        failures.push(`Login: ${msg}`);
        logInfo(`══ ${failures.length} falha(s) — diagnóstico encerrado (sem sessão) ══`);
        window.showErrorMessage(`Falha ao conectar em ${server.name}: ${msg}`);
        return;
    }

    // 2. Tenant / Usuário
    try {
        const userResp: any = await withTimeout(getUser(server), TIMEOUT_MS);
        if (userResp?.content) {
            logInfo(`  ✔ Tenant/Usuário (${server.companyId})`);
        } else {
            throw new Error(userResp?.message?.message || 'resposta inesperada');
        }
    } catch (e: any) {
        const msg = e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e));
        logInfo(`  ✖ Tenant/Usuário: ${msg}`);
        failures.push(`Tenant: ${msg}`);
    }

    // 3. Dataset API (SOAP)
    try {
        await withTimeout(apiFindAllDatasets(server), TIMEOUT_MS);
        logInfo(`  ✔ Dataset API (SOAP)`);
    } catch (e: any) {
        const msg = e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e));
        logInfo(`  ✖ Dataset API (SOAP): ${msg}`);
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
            logInfo(`  ✔ Workflow API (REST)`);
        } else {
            throw new Error(`HTTP ${r.status}`);
        }
    } catch (e: any) {
        const msg = e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e));
        logInfo(`  ✖ Workflow API (REST): ${msg}`);
        failures.push(`Workflow API: ${msg}`);
    }

    // 5. FluiggersWidget
    try {
        await withTimeout(validateServerHasFluiggersWidget(server, cookies), TIMEOUT_MS);
        logInfo(`  ✔ FluiggersWidget`);
    } catch (e: any) {
        const msg = e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e));
        logInfo(`  ✖ FluiggersWidget: ${msg}`);
        failures.push(`FluiggersWidget: ${msg}`);
    }

    // Summary
    if (failures.length === 0) {
        logInfo(`══ ✔ Todos os testes passaram ══`);
        window.showInformationMessage(`Conexão com ${server.name} OK — todos os serviços responderam.`);
    } else {
        logInfo(`══ ✖ ${failures.length} falha(s) encontrada(s) ══`);
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
