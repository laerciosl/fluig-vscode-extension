import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseProcess } from '../../../src/fluig/workflow/process/process.parser';
import {
    ProcessDefinition,
    ProcessGatewayActivity,
    ProcessSubProcessActivity,
    ProcessTaskActivity,
} from '../../../src/fluig/workflow/process/process.types';

describe('parseProcess', () => {
    let def: ProcessDefinition;

    beforeAll(() => {
        const xml = readFileSync(
            join(__dirname, '../../fixtures/process/repair_shop.process'),
            'utf-8'
        );
        def = parseProcess(xml);
    });

    describe('metadata', () => {
        it('extracts process id and name', () => {
            expect(def.metadata.id).toBe('repair_shop');
            expect(def.metadata.name).toBe('Repair Shop');
        });

        it('extracts version, category and card index', () => {
            expect(def.metadata.version).toBe('4');
            expect(def.metadata.category).toBe('Serviços');
            expect(def.metadata.cardIndex).toBe('repair_shop');
        });

        it('parses publicProcess as boolean', () => {
            expect(def.metadata.publicProcess).toBe(true);
        });
    });

    describe('pool and swimlanes', () => {
        it('extracts pool with all 6 swimlanes', () => {
            expect(def.pool).toBeDefined();
            expect(def.pool?.name).toBe('OBL Services - Repair Shop');
            expect(def.pool?.swimlanes).toHaveLength(6);
        });

        it('preserves swimlane names', () => {
            const names = def.pool?.swimlanes.map(l => l.name).sort() ?? [];
            expect(names).toContain('Logística');
            expect(names).toContain('Comercial');
            expect(names).toContain('Reparo');
            expect(names).toContain('Qualidade');
            expect(names).toContain('Customer Services');
            expect(names).toContain('Inspeção');
        });
    });

    describe('activities', () => {
        it('extracts the start event', () => {
            const start = def.activities.find(a => a.kind === 'start');
            expect(start?.id).toBe('startevent8');
            expect(start?.name).toBe('Início');
        });

        it('extracts user tasks correctly', () => {
            const task = def.activities.find(a => a.id === 'task9') as ProcessTaskActivity;
            expect(task.kind).toBe('task');
            expect(task.name).toBe('Solicitar Coleta');
            expect(task.managerMechanism).toBe('Pool Grupo');
            expect(task.assignment?.groupId).toBe('log');
        });

        it('extracts service tasks with script file', () => {
            const svc = def.activities.find(a => a.id === 'servicetask113') as ProcessTaskActivity;
            expect(svc.kind).toBe('service-task');
            expect(svc.scriptFileName).toBe('repair_shop.servicetask113.js');
            expect(svc.name).toBe('Criar Orçamento SalesNET');
        });

        it('extracts role-based tasks with roleId', () => {
            const task = def.activities.find(a => a.id === 'task15') as ProcessTaskActivity;
            expect(task.managerMechanism).toBe('Pool Papel');
            expect(task.assignment?.roleId).toBe('rps_inspection');
        });

        it('extracts gateways with parsed conditions', () => {
            const gw = def.activities.find(a => a.id === 'exclusivegateway13') as ProcessGatewayActivity;
            expect(gw.kind).toBe('gateway-exclusive');
            expect(gw.conditions.length).toBeGreaterThan(0);
            const target = gw.conditions.find(c => c.targetTaskId === 'task15');
            expect(target).toBeDefined();
            expect(target?.expression).toContain('externalRepair');
        });

        it('extracts subprocess with linked process id', () => {
            const sub = def.activities.find(a => a.id === 'subprocess255') as ProcessSubProcessActivity;
            expect(sub.kind).toBe('subprocess');
            expect(sub.process).toBe('service_order_credit');
            expect(sub.name).toBe('Análise Crédito');
        });

        it('extracts incoming and outgoing flows on a task', () => {
            const task = def.activities.find(a => a.id === 'task9') as ProcessTaskActivity;
            expect(task.incoming).toEqual(expect.arrayContaining(['flow331', 'flow333']));
            expect(task.outgoing).toEqual(['flow12']);
        });

        it('classifies intermediate link events by subtype', () => {
            const linkReceive = def.activities.find(a => a.id === 'intermediatelinkreceive65');
            const linkThrow = def.activities.find(a => a.id === 'intermediatelink67');
            const errorEvt = def.activities.find(a => a.id === 'intermediateerror117');
            expect(linkReceive?.kind).toBe('intermediate-link-receive');
            expect(linkThrow?.kind).toBe('intermediate-link-throw');
            expect(errorEvt?.kind).toBe('intermediate-error');
        });

        it('classifies endcancel separately', () => {
            const endCancel = def.activities.find(a => a.id === 'endcancel237');
            expect(endCancel?.kind).toBe('end-cancel');
        });

        it('attaches coordinates from the diagram', () => {
            const start = def.activities.find(a => a.kind === 'start');
            expect(start?.coords).toBeDefined();
            expect(start?.coords?.width).toBeGreaterThan(0);
            expect(start?.coords?.height).toBeGreaterThan(0);
        });
    });

    describe('transitions', () => {
        it('extracts a flow with source and target', () => {
            const flow = def.transitions.find(t => t.id === 'flow12');
            expect(flow?.sourceRef).toBe('task9');
            expect(flow?.targetRef).toBe('task10');
        });

        it('preserves transition labels (S/N/etc.)', () => {
            const flow17 = def.transitions.find(t => t.id === 'flow17');
            expect(flow17?.name).toBe('N');
            const flow82 = def.transitions.find(t => t.id === 'flow82');
            expect(flow82?.name).toBe('S');
        });

        it('captures all SequenceFlow elements', () => {
            // Process has well over 80 flows.
            expect(def.transitions.length).toBeGreaterThan(80);
        });
    });

    describe('annotations', () => {
        it('extracts annotations with their names', () => {
            const names = def.annotations.map(a => a.name);
            expect(names).toContain('Criar Orçamento ou Ped. Remessa');
            expect(names).toContain('Reparar Equipamento');
            // Annotations have multiple instances with same name in repair_shop.
            expect(def.annotations.length).toBeGreaterThan(10);
        });
    });

    describe('error handling', () => {
        it('throws on invalid root', () => {
            expect(() => parseProcess('<root/>')).toThrow(/xmi:XMI/);
        });
    });
});
