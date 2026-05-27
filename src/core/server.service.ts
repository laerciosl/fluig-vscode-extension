import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { window, workspace, Uri, QuickPickItem } from 'vscode';
import { getWorkspaceUri, generateRandomId } from './workspace.utils';
import { ServerConfig, ServerDTO } from '../types/server.types';
import { Server } from './server.model';
import { getRuntime } from './runtime-state';
import { getUser } from '@fluiggers/sdk';

const SERVER_CONFIG_VERSION = '1.0.0';

let FILE_SERVER_CONFIG = resolveConfigPath();

// ── Config path ────────────────────────────────────────────────────────────

function resolveConfigPath(): string {
    const config = workspace.getConfiguration('fluiggers');
    const customPath = config.get<string>('serverConfigPath', '');
    if (customPath) {
        return customPath;
    }
    return Uri.joinPath(getWorkspaceUri(), '.vscode', 'servers.json').fsPath;
}

export function updateConfigPath(): void {
    FILE_SERVER_CONFIG = resolveConfigPath();
    getFileServerConfig();
}

export function getFileServerConfig(): string {
    if (!existsSync(FILE_SERVER_CONFIG)) {
        createServerConfig();
    }
    return FILE_SERVER_CONFIG;
}

// ── CRUD ───────────────────────────────────────────────────────────────────

export function create(server: ServerDTO): ServerDTO | null {
    const serverConfig = getServerConfig();
    if (!serverConfig.configurations) {
        return null;
    }
    server.id = generateRandomId();
    serverConfig.configurations.push(server);
    writeServerConfig(serverConfig);
    return server;
}

export function remove(id: string): void {
    const serverConfig = getServerConfig();
    if (!serverConfig.configurations) {
        return;
    }
    const index = serverConfig.configurations.findIndex(s => s.id === id);
    if (index !== -1) {
        serverConfig.configurations.splice(index, 1);
        writeServerConfig(serverConfig);
    }
}

export function update(server: ServerDTO): void {
    const serverConfig = getServerConfig();
    if (!serverConfig.configurations) {
        return;
    }
    const index = serverConfig.configurations.findIndex(s => s.id === server.id);
    if (index !== -1) {
        serverConfig.configurations.splice(index, 1, server);
        writeServerConfig(serverConfig);
    }
}

export function createOrUpdate(server: ServerDTO): void {
    if (server.id) {
        update(server);
    } else {
        create(server);
    }
}

export function findByName(name: string): ServerDTO | undefined {
    return getServerConfig().configurations.find(s => s.name === name);
}

export function findById(id: string): ServerDTO | undefined {
    return getServerConfig().configurations.find(s => s.id === id);
}

export function getServerConfig(): ServerConfig {
    if (!existsSync(FILE_SERVER_CONFIG)) {
        createServerConfig();
    }
    return JSON.parse(readFileSync(FILE_SERVER_CONFIG).toString());
}

// ── QuickPick selection ────────────────────────────────────────────────────

export async function getSelect(): Promise<Server | undefined> {
    const servers = buildServerLabels();

    const result = await window.showQuickPick(servers, {
        placeHolder: 'Selecione o servidor',
    });

    if (!result) {
        return undefined;
    }

    const dto = findByName(result.label);
    if (!dto) {
        return undefined;
    }
    const server = new Server(dto);
    getRuntime().selectServer(server);
    return server;
}

// ── Version migration ──────────────────────────────────────────────────────

export async function checkServerConfigVersion(): Promise<boolean> {
    let serverConfig = getServerConfig();

    if (serverConfig.version === SERVER_CONFIG_VERSION) {
        return true;
    }

    if (!serverConfig.configurations.length) {
        createServerConfig();
        return true;
    }

    const answer = await window.showWarningMessage(
        'Arquivo de Configuração está Desatualizado.',
        {
            detail: 'Para atualizar o arquivo você terá que digitar a senha de todos os servidores (aconselhável fazer backup antes).\n\nDeseja continuar?.',
            modal: true,
        },
        'Sim'
    );

    if (answer !== 'Sim') {
        return false;
    }

    for (const serverDto of serverConfig.configurations) {
        const server = new Server(serverDto);
        server.password =
            (await window.showInputBox({
                prompt: `Digite a senha do usuário ${server.username} no servidor ${server.name}`,
                ignoreFocusOut: true,
                password: true,
                placeHolder: 'Digite a senha',
            })) || '';

        try {
            const response: any = await getUser(server);
            if (!response.content) {
                window.showWarningMessage(`Erro ao salvar senha do servidor ${server.name}.`);
            }
            update(server);
        } catch (e) {
            window.showErrorMessage(
                `Falha na conexão com o servidor ${server.name}.\nErro retornado: ${e}`
            );
        }
    }

    serverConfig = getServerConfig();
    serverConfig.version = SERVER_CONFIG_VERSION;
    writeServerConfig(serverConfig);

    return true;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildServerLabels(): QuickPickItem[] {
    const serversConfig = getServerConfig();
    const activeName = getRuntime().activeServer?.name ?? '';
    const labels: QuickPickItem[] = [];
    let hasSelected = false;

    for (const server of serversConfig.configurations) {
        if (server.name === activeName) {
            hasSelected = true;
            continue;
        }
        labels.push({ label: server.name });
    }

    if (hasSelected) {
        labels.unshift({ label: activeName });
    }

    return labels;
}

function createServerConfig(): void {
    const serverConfig: ServerConfig = { version: SERVER_CONFIG_VERSION, configurations: [] };
    const dir = Uri.joinPath(getWorkspaceUri(), '.vscode').fsPath;

    if (!existsSync(dir)) {
        mkdirSync(dir);
    }

    writeFileSync(FILE_SERVER_CONFIG, JSON.stringify(serverConfig, null, '\t'));
}

function writeServerConfig(serverConfig: ServerConfig): void {
    writeFileSync(FILE_SERVER_CONFIG, JSON.stringify(serverConfig, null, '\t'));
}
