#!/usr/bin/env node
/**
 * CLI: fluig-validate-process
 *
 * Valida um ou mais arquivos `.process` Fluig e sai com código 1 se houver erros.
 *
 * Uso:
 *   npx fluig-validate-process workflow/diagrams/*.process
 *   fluig-validate-process approval.process onboarding.process
 *
 * Saída:
 *   ✓  arquivo.process — OK (0 problemas)
 *   ⚠  arquivo.process [taskId]: [código] mensagem   (warning)
 *   ✗  arquivo.process [taskId]: [código] mensagem   (error)
 *
 * Flags:
 *   --json   Emite resultados em JSON para consumo por outras ferramentas
 *   --help   Exibe este texto de ajuda
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseProcess } from '../process/process.parser';
import { validateProcessDefinition, ValidationIssue } from '../process/process.validator';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
    console.log(
        'Uso: fluig-validate-process [--json] <arquivo.process> [<arquivo.process> ...]\n' +
        '\n' +
        'Valida arquivos .process Fluig e reporta erros, avisos e informações.\n' +
        'Retorna exit code 1 se qualquer arquivo tiver erros (severity=error).\n' +
        '\n' +
        'Flags:\n' +
        '  --json   Emite resultados em JSON\n' +
        '  --help   Exibe esta mensagem'
    );
    process.exit(args.length === 0 ? 1 : 0);
}

const jsonMode = args.includes('--json');
const filePaths = args.filter(a => !a.startsWith('--'));

interface FileResult {
    file: string;
    ok: boolean;
    processId?: string;
    processName?: string;
    issues: ValidationIssue[];
    error?: string;
}

let hasErrors = false;
const results: FileResult[] = [];

for (const filePath of filePaths) {
    const absPath = resolve(filePath);
    let xml: string;
    try {
        xml = readFileSync(absPath, 'utf-8');
    } catch {
        const result: FileResult = { file: filePath, ok: false, issues: [], error: 'Arquivo não encontrado ou sem permissão de leitura.' };
        results.push(result);
        hasErrors = true;
        if (!jsonMode) {
            console.error(`✗  ${filePath}: ${result.error}`);
        }
        continue;
    }

    let def;
    try {
        def = parseProcess(xml);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const result: FileResult = { file: filePath, ok: false, issues: [], error: msg };
        results.push(result);
        hasErrors = true;
        if (!jsonMode) {
            console.error(`✗  ${filePath}: Parse falhou — ${msg}`);
        }
        continue;
    }

    const issues = validateProcessDefinition(def, { processFsPath: absPath });
    const errorCount = issues.filter(i => i.severity === 'error').length;
    if (errorCount > 0) { hasErrors = true; }

    const result: FileResult = {
        file: filePath,
        ok: errorCount === 0,
        processId: def.metadata.id,
        processName: def.metadata.name,
        issues,
    };
    results.push(result);

    if (!jsonMode) {
        if (issues.length === 0) {
            console.log(`✓  ${filePath} [${def.metadata.id}] — OK`);
        } else {
            const icons: Record<string, string> = { error: '✗', warning: '⚠', info: 'ℹ' };
            for (const issue of issues) {
                const icon = icons[issue.severity] ?? '•';
                const target = issue.targetId ? ` [${issue.targetId}]` : '';
                console.log(`${icon}  ${filePath}${target}: [${issue.code}] ${issue.message}`);
            }
        }
    }
}

if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
}

process.exit(hasErrors ? 1 : 0);
