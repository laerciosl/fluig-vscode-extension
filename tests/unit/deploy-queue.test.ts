import { describe, it, expect, vi, beforeEach } from 'vitest';

// Isolate module state between tests by re-importing fresh each time
describe('deploy-queue', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('executa jobs sequencialmente', async () => {
        const { enqueue } = await import('../../src/core/deploy-queue');
        const order: number[] = [];

        await new Promise<void>(resolve => {
            let done = 0;
            const check = () => { if (++done === 3) { resolve(); } };

            enqueue(async () => { await delay(30); order.push(1); check(); });
            enqueue(async () => { await delay(10); order.push(2); check(); });
            enqueue(async () => {                  order.push(3); check(); });
        });

        expect(order).toEqual([1, 2, 3]);
    });

    it('continua após falha de um job', async () => {
        const { enqueue } = await import('../../src/core/deploy-queue');
        const executed: string[] = [];

        await new Promise<void>(resolve => {
            let done = 0;
            const check = () => { if (++done === 2) { resolve(); } };

            enqueue(async () => { throw new Error('falha intencional'); });
            enqueue(async () => { executed.push('segundo'); check(); });
            enqueue(async () => { executed.push('terceiro'); check(); });
        });

        await delay(50);
        expect(executed).toContain('segundo');
    });

    it('aceita novos jobs após fila esvaziar', async () => {
        const { enqueue } = await import('../../src/core/deploy-queue');
        const log: string[] = [];

        await new Promise<void>(r => {
            enqueue(async () => { log.push('primeiro'); r(); });
        });

        await delay(20); // fila vazia

        await new Promise<void>(r => {
            enqueue(async () => { log.push('segundo'); r(); });
        });

        expect(log).toEqual(['primeiro', 'segundo']);
    });
});

function delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}
