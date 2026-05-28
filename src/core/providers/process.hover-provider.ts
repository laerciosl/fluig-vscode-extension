import * as vscode from 'vscode';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { getProcessDefinition } from '../../fluig/workflow/process/process.cache';
import {
    ProcessActivity,
    ProcessDefinition,
    ProcessGatewayActivity,
    ProcessIntermediateEventActivity,
    ProcessSubProcessActivity,
    ProcessTaskActivity,
    ProcessTransition,
} from '../../fluig/workflow/process/process.types';

/**
 * Hover sobre identificadores em arquivos `.process`.
 *
 * Funciona em qualquer token alfanumérico — quando o token corresponde ao
 * `id` de uma atividade ou transition, mostra detalhes úteis (tipo, nome,
 * mecanismo de atribuição, script associado, status do arquivo local, etc.).
 */
export class ProcessHoverProvider implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.ProviderResult<vscode.Hover> {
        const range = document.getWordRangeAtPosition(position, /[a-zA-Z][\w.]*/);
        if (!range) {
            return undefined;
        }
        const token = document.getText(range);
        const def = getProcessDefinition(document);
        if (!def) {
            return undefined;
        }

        const activity = def.activities.find(a => a.id === token);
        if (activity) {
            return new vscode.Hover(buildActivityMarkdown(activity, def, document.uri), range);
        }

        const transition = def.transitions.find(t => t.id === token);
        if (transition) {
            return new vscode.Hover(buildTransitionMarkdown(transition, def), range);
        }

        return undefined;
    }
}

// ── Activity markdown ─────────────────────────────────────────────────────

function buildActivityMarkdown(
    activity: ProcessActivity,
    def: ProcessDefinition,
    processUri: vscode.Uri
): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.supportThemeIcons = true;
    md.isTrusted = true;

    md.appendMarkdown(`**${kindIcon(activity.kind)} ${activity.name || '_(sem nome)_'}**\n\n`);
    md.appendMarkdown(`\`${activity.id}\` · ${kindLabel(activity.kind)}\n\n`);

    if ('managerMechanism' in activity && activity.managerMechanism) {
        const t = activity as ProcessTaskActivity;
        md.appendMarkdown(`**Mecanismo:** ${t.managerMechanism}\n\n`);
        if (t.assignment?.roleId) {
            md.appendMarkdown(`**Papel:** \`${t.assignment.roleId}\`\n\n`);
        }
        if (t.assignment?.groupId) {
            md.appendMarkdown(`**Grupo:** \`${t.assignment.groupId}\`\n\n`);
        }
    }

    if (activity.kind === 'service-task') {
        const t = activity as ProcessTaskActivity;
        if (t.scriptFileName) {
            appendScriptInfo(md, t.scriptFileName, processUri);
        }
    }

    if (activity.kind === 'subprocess') {
        const sub = activity as ProcessSubProcessActivity;
        if (sub.process) {
            md.appendMarkdown(`**Processo:** \`${sub.process}\`\n\n`);
        }
    }

    if (activity.kind === 'gateway-exclusive') {
        const gw = activity as ProcessGatewayActivity;
        if (gw.conditions.length > 0) {
            md.appendMarkdown(`**Condições:**\n\n`);
            for (const c of gw.conditions) {
                md.appendMarkdown(`- \`→ ${c.targetTaskId}\` quando \`${c.expression}\`\n`);
            }
            md.appendMarkdown('\n');
        }
    }

    if (
        activity.kind === 'intermediate-link-throw' ||
        activity.kind === 'intermediate-error'
    ) {
        const ev = activity as ProcessIntermediateEventActivity;
        if (ev.linkId) {
            md.appendMarkdown(`**Link target:** \`${ev.linkId}\`\n\n`);
        }
        if (ev.parentTask) {
            md.appendMarkdown(`**Anexado a:** \`${ev.parentTask}\`\n\n`);
        }
    }

    if (activity.incoming.length > 0 || activity.outgoing.length > 0) {
        md.appendMarkdown(
            `**Fluxos:** ${activity.incoming.length} entrada(s) · ${activity.outgoing.length} saída(s)\n`
        );
    }

    return md;
}

// ── Transition markdown ───────────────────────────────────────────────────

function buildTransitionMarkdown(
    transition: ProcessTransition,
    def: ProcessDefinition
): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.supportThemeIcons = true;

    const label = transition.name ? ` "${transition.name}"` : '';
    md.appendMarkdown(`**$(arrow-right) Sequence Flow${label}**\n\n`);
    md.appendMarkdown(`\`${transition.id}\`\n\n`);

    const source = def.activities.find(a => a.id === transition.sourceRef);
    const target = def.activities.find(a => a.id === transition.targetRef);

    md.appendMarkdown(
        `**De:** \`${transition.sourceRef}\`${source?.name ? ` _(${source.name})_` : ''}\n\n`
    );
    md.appendMarkdown(
        `**Para:** \`${transition.targetRef}\`${target?.name ? ` _(${target.name})_` : ''}\n`
    );

    return md;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function appendScriptInfo(
    md: vscode.MarkdownString,
    scriptFileName: string,
    processUri: vscode.Uri
): void {
    // Scripts ficam em `workflow/scripts/` ao lado do .process (que está em `workflow/`).
    const processDir = dirname(processUri.fsPath);
    const scriptPath = join(processDir, 'scripts', scriptFileName);
    const exists = existsSync(scriptPath);
    const indicator = exists ? '$(check)' : '$(warning)';
    const status = exists ? 'arquivo local presente' : '**arquivo local ausente**';
    md.appendMarkdown(`**Script:** ${indicator} \`${scriptFileName}\` — ${status}\n\n`);
    if (exists) {
        const args = encodeURIComponent(JSON.stringify([vscode.Uri.file(scriptPath)]));
        md.appendMarkdown(`[Abrir script](command:vscode.open?${args})\n\n`);
    }
}

function kindLabel(kind: ProcessActivity['kind']): string {
    switch (kind) {
        case 'start': return 'Evento de Início';
        case 'end': return 'Evento de Fim';
        case 'end-cancel': return 'Evento de Fim (Cancelamento)';
        case 'task': return 'Tarefa de Usuário';
        case 'service-task': return 'Tarefa de Serviço (Script)';
        case 'subprocess': return 'Sub-processo';
        case 'gateway-exclusive': return 'Gateway Exclusivo';
        case 'intermediate-link-throw': return 'Link (Throw)';
        case 'intermediate-link-receive': return 'Link (Catch)';
        case 'intermediate-error': return 'Evento de Erro';
    }
}

function kindIcon(kind: ProcessActivity['kind']): string {
    switch (kind) {
        case 'start': return '$(play-circle)';
        case 'end':
        case 'end-cancel': return '$(stop-circle)';
        case 'task': return '$(person)';
        case 'service-task': return '$(gear)';
        case 'subprocess': return '$(repo)';
        case 'gateway-exclusive': return '$(symbol-namespace)';
        case 'intermediate-link-throw':
        case 'intermediate-link-receive': return '$(link)';
        case 'intermediate-error': return '$(error)';
    }
}
