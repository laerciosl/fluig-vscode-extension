import { ExtensionContext, commands, Uri, window } from 'vscode';
import { runDatasetLocally } from '../../fluig/runtime/runtime.service';
import { getDeployRecords, getLastSuccessfulExports, DeployRecord } from '../deploy-history';
import { appendToOutputChannel, showLogger } from '../logger';
import { findByName } from '../server.service';
import { importDatasetFromTree } from '../../fluig/datasets/dataset.service';
import { ArtifactKind } from '../event-bus';

export function registerRuntimeCommands(context: ExtensionContext): void {
    context.subscriptions.push(
        commands.registerCommand(
            'fluiggers-fluig-vscode-extension.runDatasetLocally',
            (fileUri: Uri) => runDatasetLocally(fileUri)
        ),
        commands.registerCommand(
            'fluiggers-fluig-vscode-extension.showDeployHistory',
            showDeployHistory
        ),
        commands.registerCommand(
            'fluiggers-fluig-vscode-extension.undoLastDeploy',
            undoLastDeploy
        ),
    );
}

// ── 7.2 — Histórico de deploys ────────────────────────────────────────────

function showDeployHistory(): void {
    const records = getDeployRecords();

    const divider = '─'.repeat(70);
    appendToOutputChannel('');
    appendToOutputChannel(divider);
    appendToOutputChannel(` HISTÓRICO DE DEPLOYS — ${records.length} registro(s)`);
    appendToOutputChannel(divider);

    if (records.length === 0) {
        appendToOutputChannel(' (nenhum deploy registrado nesta sessão)');
    } else {
        for (const r of records) {
            const icon = r.status === 'success' ? '✓' : r.status === 'error' ? '✗' : '⊘';
            const ts = r.timestamp.toLocaleTimeString('pt-BR', { hour12: false });
            const kind = r.kind.padEnd(12);
            const name = r.artifactName.padEnd(30);
            const server = r.serverName;
            const suffix = r.error ? `  — ${r.error}` : r.status === 'blocked' ? '  — bloqueado por validação' : '';
            appendToOutputChannel(` ${icon} ${ts}  ${kind} ${name} → ${server}${suffix}`);
        }
    }

    appendToOutputChannel(divider);
    showLogger();
}

// ── 7.3 — Desfazer último deploy ──────────────────────────────────────────

const IMPORT_COMMANDS: Partial<Record<ArtifactKind, string>> = {
    'global-event': 'fluiggers-fluig-vscode-extension.importGlobalEvent',
    'mechanism':    'fluiggers-fluig-vscode-extension.importMechanism',
    'form':         'fluiggers-fluig-vscode-extension.importForm',
    'widget':       'fluiggers-fluig-vscode-extension.importWidget',
};

async function undoLastDeploy(): Promise<void> {
    const recent = getLastSuccessfulExports(10);

    if (recent.length === 0) {
        window.showInformationMessage('Nenhum deploy bem-sucedido registrado nesta sessão.');
        return;
    }

    const items = recent.map(r => ({
        label: r.artifactName,
        description: `${r.kind}  ·  ${r.serverName}`,
        detail: r.timestamp.toLocaleTimeString('pt-BR', { hour12: false }),
        record: r,
    }));

    const picked = await window.showQuickPick(items, {
        placeHolder: 'Selecione o deploy para desfazer (re-importar do servidor)',
        matchOnDescription: true,
    });
    if (!picked) {
        return;
    }

    await reimport(picked.record);
}

async function reimport(record: DeployRecord): Promise<void> {
    if (record.kind === 'dataset') {
        const server = findByName(record.serverName);
        if (!server) {
            window.showErrorMessage(`Servidor "${record.serverName}" não encontrado na configuração.`);
            return;
        }
        await importDatasetFromTree(server, record.artifactName);
        return;
    }

    const cmd = IMPORT_COMMANDS[record.kind];
    if (cmd) {
        await commands.executeCommand(cmd);
        return;
    }

    window.showWarningMessage(
        `Re-importação automática não disponível para "${record.kind}". Use o menu de contexto do painel Workflows.`
    );
}
