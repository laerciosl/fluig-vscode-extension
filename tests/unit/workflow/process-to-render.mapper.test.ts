import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseProcess } from '../../../src/fluig/workflow/process/process.parser';
import { buildRenderModel, RenderModel } from '../../../src/fluig/workflow/process/process-to-render.mapper';

describe('buildRenderModel', () => {
    let model: RenderModel;

    beforeAll(() => {
        const xml = readFileSync(
            join(__dirname, '../../fixtures/process/repair_shop.process'),
            'utf-8'
        );
        const def = parseProcess(xml);
        model = buildRenderModel(def);
    });

    it('carries process metadata', () => {
        expect(model.processId).toBe('repair_shop');
        expect(model.processName).toBe('Repair Shop');
        expect(model.processVersion).toBe('4');
    });

    it('builds a viewBox enclosing all nodes with padding', () => {
        expect(model.viewBox.width).toBeGreaterThan(0);
        expect(model.viewBox.height).toBeGreaterThan(0);
        // Padding deve abrir um pouco antes do origin.
        expect(model.viewBox.x).toBeLessThanOrEqual(0);
        expect(model.viewBox.y).toBeLessThanOrEqual(0);
    });

    it('includes one pool with all swimlanes', () => {
        expect(model.pools).toHaveLength(1);
        expect(model.swimlanes.length).toBeGreaterThanOrEqual(6);
    });

    it('maps service tasks with their script file names', () => {
        const services = model.activities.filter(n => n.kind === 'service-task');
        expect(services.length).toBeGreaterThan(0);
        const withScript = services.find(s => s.scriptFileName);
        expect(withScript).toBeDefined();
        expect(withScript?.scriptFileName).toMatch(/^repair_shop\..+\.js$/);
    });

    it('maps subprocess nodes with linked process id', () => {
        const sub = model.activities.find(n => n.kind === 'subprocess');
        expect(sub?.process).toBe('service_order_credit');
    });

    it('produces edges with valid waypoints between known activities', () => {
        const edge = model.edges.find(e => e.sourceId === 'task9' && e.targetId === 'task10');
        expect(edge).toBeDefined();
        expect(edge?.waypoints.length).toBeGreaterThanOrEqual(2);
        const [start, end] = edge!.waypoints;
        expect(start.x).not.toBeNaN();
        expect(end.x).not.toBeNaN();
    });

    it('skips edges referencing unknown nodes (defensive)', () => {
        // Todas as edges retornadas devem ter source e target presentes.
        const ids = new Set([
            ...model.activities.map(a => a.id),
            ...model.annotations.map(a => a.id),
            ...model.swimlanes.map(l => l.id),
            ...model.pools.map(p => p.id),
        ]);
        for (const e of model.edges) {
            expect(ids.has(e.sourceId)).toBe(true);
            expect(ids.has(e.targetId)).toBe(true);
        }
    });

    it('uses real coordinates from the diagram (not zero)', () => {
        const start = model.activities.find(a => a.kind === 'start');
        expect(start?.x).toBeGreaterThan(0);
        expect(start?.y).toBeGreaterThan(0);
    });
});
