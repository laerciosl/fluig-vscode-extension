/**
 * Patching cirúrgico de atributos no XML do .process sem reconstruir o documento.
 *
 * O .process usa referências cruzadas EMF posicionais na seção pi:Diagram
 * (/0/@children.N/@link) que seriam invalidadas por um ciclo parse→build.
 * Por isso este módulo atualiza apenas os valores de atributos específicos,
 * mantendo todo o restante do documento intacto.
 */

export function patchActivityName(xml: string, id: string, newName: string): string {
    return patchAttribute(xml, id, 'name', newName);
}

export function patchActivityScriptFileName(xml: string, id: string, newScriptFileName: string): string {
    return patchAttribute(xml, id, 'scriptFileName', newScriptFileName);
}

function patchAttribute(xml: string, id: string, attrName: string, newValue: string): string {
    const lines = xml.split('\n');
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const idPattern = new RegExp(`\\bid="${escapedId}"`);

    for (let i = 0; i < lines.length; i++) {
        if (!idPattern.test(lines[i])) {
            continue;
        }

        const attrPattern = new RegExp(`([ \\t]${attrName}=")([^"]*)(")`, 'g');
        if (attrPattern.test(lines[i])) {
            lines[i] = lines[i].replace(
                new RegExp(`([ \\t]${attrName}=")([^"]*)(")`),
                `$1${escapeXmlAttr(newValue)}$3`
            );
        } else {
            // Atributo não existe na linha — insere antes do > ou /> final
            lines[i] = lines[i].replace(/(\s*\/?>)$/, ` ${attrName}="${escapeXmlAttr(newValue)}"$1`);
        }
        break;
    }

    return lines.join('\n');
}

function escapeXmlAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
