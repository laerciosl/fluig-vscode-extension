import { describe, it, expect, beforeEach } from 'vitest';
import { RuntimeState } from '../../src/core/runtime-state';

describe('deploy-queue', () => {
    let rt: RuntimeState;

    beforeEach(() => {
        rt = new RuntimeState();
    });

    it('executa jobs sequencialmente', async () => {
        const order: number[] = [];

        await new Promise<void>(resolve => {
            let done = 0;
            const check = () => { if (++done === 3) { resolve(); } };

            rt.enqueue(async () => { await delay(30); order.push(1); check(); });
            rt.enqueue(async () => { await delay(10); order.push(2); check(); });
            rt.enqueue(async () => {                  order.push(3); check(); });
        });

        expect(order).toEqual([1, 2, 3]);
    });

    it('continua após falha de um job', async () => {
        const executed: string[] = [];

        await new Promise<void>(resolve => {
            let done = 0;
            const check = () => { if (++done === 2) { resolve(); } };

            rt.enqueue(async () => { throw new Error('falha intencional'); });
            rt.enqueue(async () => { executed.push('segundo'); check(); });
            rt.enqueue(async () => { executed.push('terceiro'); check(); });
        });

        await delay(50);
        expect(executed).toContain('segundo');
    });

    it('aceita novos jobs após fila esvaziar', async () => {
        const log: string[] = [];

        await new Promise<void>(r => {
            rt.enqueue(async () => { log.push('primeiro'); r(); });
        });

        await delay(20); // fila vazia

        await new Promise<void>(r => {
            rt.enqueue(async () => { log.push('segundo'); r(); });
        });

        expect(log).toEqual(['primeiro', 'segundo']);
    });
});

function delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}
