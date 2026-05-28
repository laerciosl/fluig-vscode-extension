import { XMLParser } from 'fast-xml-parser';
import {
    ActivityKind,
    ProcessAssignment,
    ProcessGatewayCondition,
} from './process.types';

/**
 * Parser dedicado para strings XML aninhadas dentro de atributos
 * (XStream-encoded). Mais leniente que o parser principal — não falha em XML
 * malformado, apenas retorna estruturas vazias.
 */
const nestedXmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    parseTagValue: false,
});

/**
 * Decodifica o número `type` do Fluig em uma `ActivityKind` semântica.
 *
 * Os códigos foram inferidos por inspeção de processos reais; valores não
 * mapeados retornam `null` para que o chamador decida o fallback.
 */
export function decodeTypeCode(tag: string, typeCode: number): ActivityKind | null {
    if (tag === 'BpmnStartEvent') {
        return 'start';
    }
    if (tag === 'BpmnEndEvent') {
        return typeCode === 65 ? 'end-cancel' : 'end';
    }
    if (tag === 'BpmnTask') {
        return typeCode === 82 ? 'service-task' : 'task';
    }
    if (tag === 'BpmnSubProcess') {
        return 'subprocess';
    }
    if (tag === 'BpmnGateway') {
        return 'gateway-exclusive';
    }
    if (tag === 'BpmnIntermediateEvent') {
        switch (typeCode) {
            case 36: return 'intermediate-link-throw';
            case 42: return 'intermediate-link-receive';
            case 43: return 'intermediate-error';
            default: return 'intermediate-link-throw';
        }
    }
    return null;
}

/**
 * Quebra atributos do tipo `incoming="flow1 flow2 flow3"` em array.
 * Strings vazias / ausentes retornam `[]`.
 */
export function splitFlows(value: string | undefined): string[] {
    if (!value) {
        return [];
    }
    return value.split(/\s+/).filter(Boolean);
}

/**
 * Parseia o atributo `condition` de um BpmnGateway.
 *
 * Formato:
 * ```xml
 * <list>
 *   <org.eclipse.bpmn2.impl.ConditionImpl>
 *     <order>1</order>
 *     <expression>hAPI.getCardValue("x") == "y"</expression>
 *     <targetTask>task15</targetTask>
 *     <conditionType>0</conditionType>
 *   </org.eclipse.bpmn2.impl.ConditionImpl>
 *   ...
 * </list>
 * ```
 */
export function parseConditions(xml: string | undefined): ProcessGatewayCondition[] {
    if (!xml) {
        return [];
    }
    try {
        const parsed = nestedXmlParser.parse(xml);
        const list = parsed?.list;
        if (!list) {
            return [];
        }
        const rawConditions = list['org.eclipse.bpmn2.impl.ConditionImpl'];
        if (!rawConditions) {
            return [];
        }
        const conditions = Array.isArray(rawConditions) ? rawConditions : [rawConditions];
        return conditions.map((c: Record<string, string>) => ({
            order: parseInt(c.order, 10) || 0,
            expression: String(c.expression ?? '').trim(),
            targetTaskId: String(c.targetTask ?? '').trim(),
        }));
    } catch {
        return [];
    }
}

/**
 * Parseia o atributo `managerAssignmentControllerString` de tasks.
 *
 * Formato (varia conforme mecanismo):
 * ```xml
 * <org.eclipse.bpmn2.impl.AssignmentControllerPoolRole>
 *   <roleId>rps_inspection</roleId>
 *   <mechanismName>Pool Papel</mechanismName>
 * </org.eclipse.bpmn2.impl.AssignmentControllerPoolRole>
 * ```
 * Ou:
 * ```xml
 * <org.eclipse.bpmn2.impl.AssignmentControllerPoolGroup>
 *   <groupId>log</groupId>
 *   <mechanismName>Pool Grupo</mechanismName>
 * </org.eclipse.bpmn2.impl.AssignmentControllerPoolGroup>
 * ```
 */
export function parseAssignment(xml: string | undefined, fallbackMechanism?: string): ProcessAssignment | undefined {
    if (!xml) {
        if (fallbackMechanism) {
            return { mechanism: fallbackMechanism };
        }
        return undefined;
    }
    try {
        const parsed = nestedXmlParser.parse(xml);
        // O nó raiz é o nome da classe XStream — pega o primeiro filho.
        const rootKey = Object.keys(parsed)[0];
        if (!rootKey) {
            return fallbackMechanism ? { mechanism: fallbackMechanism } : undefined;
        }
        const node = parsed[rootKey] ?? {};
        const mechanism = String(node.mechanismName ?? fallbackMechanism ?? '').trim();
        const result: ProcessAssignment = { mechanism };
        if (node.roleId) {
            result.roleId = String(node.roleId).trim();
        }
        if (node.groupId) {
            result.groupId = String(node.groupId).trim();
        }
        return result;
    } catch {
        return fallbackMechanism ? { mechanism: fallbackMechanism } : undefined;
    }
}
