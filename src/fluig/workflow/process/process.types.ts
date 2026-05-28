/**
 * Tipos do modelo de processo Fluig (.process).
 *
 * O arquivo `.process` é XMI (Eclipse EMF), não BPMN 2.0 standard. Tem duas partes:
 *   1. `pi:Diagram` — pictogramas / coordenadas (Eclipse Graphiti)
 *   2. `bpmn2:*`    — modelo de negócio (Fluig BpmnProcess, BpmnTask, etc.)
 *
 * Este módulo modela apenas o que é relevante para tooling no VS Code.
 */

export type ActivityKind =
    | 'start'
    | 'end'
    | 'end-cancel'
    | 'task'
    | 'service-task'
    | 'subprocess'
    | 'gateway-exclusive'
    | 'intermediate-link-throw'
    | 'intermediate-link-receive'
    | 'intermediate-error';

/** Coordenadas extraídas do pictograma (quando disponíveis). */
export interface Coordinates {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ProcessMetadata {
    id: string;
    name: string;
    version: string;
    author?: string;
    category?: string;
    cardIndex?: string;
    serverId?: string;
    publicProcess?: boolean;
    volume?: string;
    expedient?: string;
    managerMechanism?: string;
}

export interface ProcessAssignment {
    /** Rótulo cru ("Papel", "Grupo", "Pool Grupo", "Pool Papel"). */
    mechanism: string;
    /** Definido quando o mecanismo é baseado em papel. */
    roleId?: string;
    /** Definido quando o mecanismo é baseado em grupo. */
    groupId?: string;
}

export interface ProcessGatewayCondition {
    order: number;
    expression: string;
    targetTaskId: string;
}

export interface ProcessActivityBase {
    id: string;
    name: string;
    kind: ActivityKind;
    typeCode: number;
    coords?: Coordinates;
    incoming: string[];
    outgoing: string[];
}

export interface ProcessTaskActivity extends ProcessActivityBase {
    kind: 'task' | 'service-task';
    managerMechanism?: string;
    assignment?: ProcessAssignment;
    /** Nome do arquivo .js (apenas service-task). */
    scriptFileName?: string;
}

export interface ProcessGatewayActivity extends ProcessActivityBase {
    kind: 'gateway-exclusive';
    conditions: ProcessGatewayCondition[];
}

export interface ProcessIntermediateEventActivity extends ProcessActivityBase {
    kind: 'intermediate-link-throw' | 'intermediate-link-receive' | 'intermediate-error';
    /** Para link-throw: id do link-receive correspondente. */
    linkId?: string;
    /** Para error: id da task à qual o evento está anexado. */
    parentTask?: string;
}

export interface ProcessSubProcessActivity extends ProcessActivityBase {
    kind: 'subprocess';
    /** Id do processo filho referenciado. */
    process?: string;
}

export interface ProcessEventActivity extends ProcessActivityBase {
    kind: 'start' | 'end' | 'end-cancel';
}

export type ProcessActivity =
    | ProcessEventActivity
    | ProcessTaskActivity
    | ProcessGatewayActivity
    | ProcessIntermediateEventActivity
    | ProcessSubProcessActivity;

export interface ProcessTransition {
    id: string;
    /** Rótulo (vazio na maioria dos flows, "S"/"N"/"Aprovado" etc. em gateways). */
    name: string;
    sourceRef: string;
    targetRef: string;
}

export interface ProcessSwimlane {
    id: string;
    name: string;
    coords?: Coordinates;
}

export interface ProcessPool {
    id: string;
    name: string;
    coords?: Coordinates;
    swimlanes: ProcessSwimlane[];
}

export interface ProcessAnnotation {
    id: string;
    name: string;
    coords?: Coordinates;
}

export interface ProcessDefinition {
    metadata: ProcessMetadata;
    pool?: ProcessPool;
    activities: ProcessActivity[];
    transitions: ProcessTransition[];
    annotations: ProcessAnnotation[];
}
