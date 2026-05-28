/**
 * Tipos públicos do modelo de processo Fluig.
 *
 * Espelham os tipos internos da extensão VS Code e são expostos pelo SDK
 * para que ferramentas de CI/CD e scripts externos possam trabalhar com
 * `ProcessDefinition` de forma tipada.
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

export interface Coordinates {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** @deprecated Use `Coordinates` */
export type ProcessCoordinates = Coordinates;

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
    diagramVersion?: string;
    extraAttributes?: Record<string, string>;
}

export interface ProcessAssignment {
    mechanism: string;
    roleId?: string;
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
    extraAttributes?: Record<string, string>;
}

export interface ProcessEventActivity extends ProcessActivityBase {
    kind: 'start' | 'end' | 'end-cancel';
}

export interface ProcessTaskActivity extends ProcessActivityBase {
    kind: 'task' | 'service-task';
    managerMechanism?: string;
    assignment?: ProcessAssignment;
    scriptFileName?: string;
    rawAssignmentXml?: string;
}

export interface ProcessGatewayActivity extends ProcessActivityBase {
    kind: 'gateway-exclusive';
    conditions: ProcessGatewayCondition[];
    rawConditionXml?: string;
}

export interface ProcessIntermediateEventActivity extends ProcessActivityBase {
    kind: 'intermediate-link-throw' | 'intermediate-link-receive' | 'intermediate-error';
    linkId?: string;
    parentTask?: string;
}

export interface ProcessSubProcessActivity extends ProcessActivityBase {
    kind: 'subprocess';
    process?: string;
}

export type ProcessActivity =
    | ProcessEventActivity
    | ProcessTaskActivity
    | ProcessGatewayActivity
    | ProcessIntermediateEventActivity
    | ProcessSubProcessActivity;

export interface ProcessTransition {
    id: string;
    name: string;
    sourceRef: string;
    targetRef: string;
    extraAttributes?: Record<string, string>;
}

export interface ProcessSwimlane {
    id: string;
    name: string;
    coords?: Coordinates;
    extraAttributes?: Record<string, string>;
}

export interface ProcessPool {
    id: string;
    name: string;
    coords?: Coordinates;
    swimlanes: ProcessSwimlane[];
    extraAttributes?: Record<string, string>;
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
