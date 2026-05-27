import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeployQueue } from '../../src/core/deploy-queue';

describe('DeployQueue', () => {
    let q: DeployQueue;

    beforeEach(() => {
        q = new DeployQueue();
    });

    // ── Serial execution ───────────────────────────────────────────────────────

    describe('execução serial', () => {
        it('executa jobs na ordem de entrada', async () => {
            const order: number[] = [];

            await new Promise<void>(resolve => {
                let done = 0;
                const check = () => { if (++done === 3) { resolve(); } };

                q.enqueue('a', async () => { await delay(30); order.push(1); check(); });
                q.enqueue('b', async () => { await delay(10); order.push(2); check(); });
                q.enqueue('c', async () => {                  order.push(3); check(); });
            });

            expect(order).toEqual([1, 2, 3]);
        });

        it('continua após falha de um job (sem retry)', async () => {
            const executed: string[] = [];

            await new Promise<void>(resolve => {
                let done = 0;
                const check = () => { if (++done === 2) { resolve(); } };

                q.enqueue('x', async () => { throw new Error('falha'); });
                q.enqueue('y', async () => { executed.push('y'); check(); });
                q.enqueue('z', async () => { executed.push('z'); check(); });
            });

            await delay(20);
            expect(executed).toContain('y');
            expect(executed).toContain('z');
        });

        it('aceita novos jobs após fila esvaziar', async () => {
            const log: string[] = [];

            await new Promise<void>(r => {
                q.enqueue('first', async () => { log.push('primeiro'); r(); });
            });
            await delay(20);

            await new Promise<void>(r => {
                q.enqueue('second', async () => { log.push('segundo'); r(); });
            });

            expect(log).toEqual(['primeiro', 'segundo']);
        });
    });

    // ── Deduplication ──────────────────────────────────────────────────────────

    describe('deduplicação', () => {
        it('atualiza fn quando a mesma chave é enfileirada durante debounce', async () => {
            vi.useFakeTimers();
            const calls: string[] = [];

            q.enqueue('file.js', async () => { calls.push('v1'); }, { debounceMs: 100 });
            q.enqueue('file.js', async () => { calls.push('v2'); }, { debounceMs: 100 });

            vi.runAllTimers();
            await vi.runAllTimersAsync();

            expect(calls).toEqual(['v2']);
            expect(calls).not.toContain('v1');

            vi.useRealTimers();
        });

        it('atualiza fn na fila ready (antes de executar)', async () => {
            const calls: string[] = [];
            // Block the queue with a slow first job so 'key' lands in _ready
            let unblock!: () => void;
            const blocked = new Promise<void>(r => { unblock = r; });

            q.enqueue('blocker', async () => blocked);
            q.enqueue('key', async () => { calls.push('v1'); });
            q.enqueue('key', async () => { calls.push('v2'); }); // should replace v1

            unblock();
            await delay(20);

            expect(calls).toEqual(['v2']);
        });
    });

    // ── Debounce ───────────────────────────────────────────────────────────────

    describe('debounce', () => {
        it('não executa antes do timer disparar', async () => {
            vi.useFakeTimers();
            const calls: string[] = [];

            q.enqueue('f', async () => { calls.push('ran'); }, { debounceMs: 200 });

            vi.advanceTimersByTime(100);
            expect(calls).toHaveLength(0);

            vi.useRealTimers();
        });

        it('reseta o timer quando re-enfileirado dentro da janela', async () => {
            vi.useFakeTimers();
            const calls: string[] = [];

            q.enqueue('f', async () => { calls.push('v1'); }, { debounceMs: 200 });
            vi.advanceTimersByTime(150);  // dentro da janela

            q.enqueue('f', async () => { calls.push('v2'); }, { debounceMs: 200 });
            vi.advanceTimersByTime(150);  // dentro da nova janela
            expect(calls).toHaveLength(0);

            vi.runAllTimers();
            await vi.runAllTimersAsync();

            expect(calls).toEqual(['v2']);
            vi.useRealTimers();
        });

        it('executa sem delay quando debounceMs não é passado', async () => {
            const calls: string[] = [];

            q.enqueue('f', async () => { calls.push('imediato'); });

            await delay(10);
            expect(calls).toEqual(['imediato']);
        });
    });

    // ── Retry ─────────────────────────────────────────────────────────────────

    describe('retry', () => {
        it('tenta novamente após falha e executa com sucesso', async () => {
            let attempts = 0;

            await new Promise<void>((resolve, reject) => {
                q.enqueue(
                    'op',
                    async () => {
                        attempts++;
                        if (attempts < 3) { throw new Error('falha transiente'); }
                        resolve();
                    },
                    { maxRetries: 2, retryBaseMs: 0 }
                );

                // Timeout de segurança
                setTimeout(() => reject(new Error('timeout')), 500);
            });

            expect(attempts).toBe(3);
        });

        it('desiste após esgotar maxRetries', async () => {
            let attempts = 0;

            q.enqueue(
                'op',
                async () => {
                    attempts++;
                    throw new Error('sempre falha');
                },
                { maxRetries: 2, retryBaseMs: 0 }
            );

            await delay(50);
            expect(attempts).toBe(3); // 1 tentativa inicial + 2 retries
        });

        it('job seguinte executa mesmo após maxRetries esgotado', async () => {
            const log: string[] = [];

            q.enqueue('bad', async () => { throw new Error('falha'); }, { maxRetries: 1, retryBaseMs: 0 });
            q.enqueue('good', async () => { log.push('ok'); });

            await delay(100);
            expect(log).toContain('ok');
        });
    });

    // ── Cancellation ──────────────────────────────────────────────────────────

    describe('cancelamento', () => {
        it('cancel durante debounce impede execução', async () => {
            vi.useFakeTimers();
            const calls: string[] = [];

            q.enqueue('f', async () => { calls.push('ran'); }, { debounceMs: 200 });
            q.cancel('f');

            vi.runAllTimers();
            await vi.runAllTimersAsync();

            expect(calls).toHaveLength(0);
            vi.useRealTimers();
        });

        it('cancel na fila ready impede execução', async () => {
            const calls: string[] = [];
            let unblock!: () => void;
            const blocked = new Promise<void>(r => { unblock = r; });

            q.enqueue('blocker', async () => blocked);
            q.enqueue('target', async () => { calls.push('ran'); });
            q.cancel('target');

            unblock();
            await delay(20);

            expect(calls).toHaveLength(0);
        });

        it('cancelAll limpa debounce e fila', async () => {
            vi.useFakeTimers();
            const calls: string[] = [];

            q.enqueue('a', async () => { calls.push('a'); }, { debounceMs: 100 });
            q.enqueue('b', async () => { calls.push('b'); }, { debounceMs: 100 });
            q.cancelAll();

            vi.runAllTimers();
            await vi.runAllTimersAsync();

            expect(calls).toHaveLength(0);
            expect(q.size).toBe(0);
            vi.useRealTimers();
        });
    });

    // ── size / isRunning ───────────────────────────────────────────────────────

    describe('observabilidade', () => {
        it('size conta entradas pendentes', () => {
            vi.useFakeTimers();

            q.enqueue('a', async () => {}, { debounceMs: 100 });
            q.enqueue('b', async () => {}, { debounceMs: 100 });
            expect(q.size).toBe(2);

            vi.useRealTimers();
            q.cancelAll();
        });

        it('size é 0 após cancelAll', () => {
            vi.useFakeTimers();
            q.enqueue('a', async () => {}, { debounceMs: 100 });
            q.cancelAll();
            expect(q.size).toBe(0);
            vi.useRealTimers();
        });
    });
});

function delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}
