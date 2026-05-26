type DeployFn = () => Promise<void>;

const queue: DeployFn[] = [];
let running = false;

export function enqueue(fn: DeployFn): void {
    queue.push(fn);
    if (!running) {
        void drain();
    }
}

async function drain(): Promise<void> {
    running = true;
    while (queue.length) {
        const fn = queue.shift()!;
        try {
            await fn();
        } catch {
            // errors are handled and logged by the service / sync-state listener
        }
    }
    running = false;
}
