import { Uri, workspace } from 'vscode';
import { parseProcess } from './process.parser';
import { ProcessDefinition } from './process.types';

/**
 * Lê um arquivo `.process` do workspace e retorna a definição parseada.
 */
export async function readProcessFile(uri: Uri): Promise<ProcessDefinition> {
    const bytes = await workspace.fs.readFile(uri);
    const xml = new TextDecoder('utf-8').decode(bytes);
    return parseProcess(xml);
}
