export type DeployFn = () => Promise<void>;

export interface EnqueueOptions {
    /** Wait this many ms before executing; restarts if the same key is re-enqueued within the window. */
    debounceMs?: number;
    /** Retry up to this many times after a failure (0 = no retry). */
    maxRetries?: number;
    /** Base delay between retries in ms; doubles on each attempt (exponential backoff). */
    retryBaseMs?: number;
    /** Called before each retry with the attempt number (1-based) and the caught error. */
    onRetry?: (attempt: number, error: unknown) => void;
}

interface Entry {
    readonly key: string;
    fn: DeployFn;                              // mutable — updated by re-enqueue during debounce/ready
    readonly opts: Required<EnqueueOptions>;
    timer: ReturnType<typeof setTimeout> | null;
    cancelled: boolean;
}

export class DeployQueue {
    private readonly _debouncing = new Map<string, Entry>();
    private readonly _ready: Entry[] = [];
    private readonly _inFlight = new Map<string, Entry>();
    private _draining = false;

    // ── Public ────────────────────────────────────────────────────────────────

    get size(): number {
        return this._debouncing.size + this._ready.length + this._inFlight.size;
    }

    get isRunning(): boolean {
        return this._draining || this._inFlight.size > 0;
    }

    enqueue(key: string, fn: DeployFn, options?: EnqueueOptions): void {
        const opts: Required<EnqueueOptions> = {
            debounceMs: 0,
            maxRetries: 0,
            retryBaseMs: 1000,
            onRetry: () => {},
            ...options,
        };

        // ── Deduplication: debouncing phase ───────────────────────────────────
        const debouncing = this._debouncing.get(key);
        if (debouncing) {
            debouncing.fn = fn;                           // always keep the latest fn
            if (debouncing.timer) { clearTimeout(debouncing.timer); }
            if (opts.debounceMs > 0) {
                debouncing.timer = setTimeout(() => this.promote(key), opts.debounceMs);
            } else {
                debouncing.timer = null;
                this.promote(key);
            }
            return;
        }

        // ── Deduplication: ready phase ────────────────────────────────────────
        const readyEntry = this._ready.find(e => e.key === key);
        if (readyEntry) {
            readyEntry.fn = fn;                           // replace fn, keep position in queue
            return;
        }

        // ── New entry ─────────────────────────────────────────────────────────
        const entry: Entry = { key, fn, opts, timer: null, cancelled: false };
        this._debouncing.set(key, entry);

        if (opts.debounceMs > 0) {
            entry.timer = setTimeout(() => this.promote(key), opts.debounceMs);
        } else {
            this.promote(key);
        }
    }

    cancel(key: string): void {
        const debouncing = this._debouncing.get(key);
        if (debouncing) {
            if (debouncing.timer) { clearTimeout(debouncing.timer); }
            this._debouncing.delete(key);
            return;
        }

        const readyIdx = this._ready.findIndex(e => e.key === key);
        if (readyIdx !== -1) {
            this._ready.splice(readyIdx, 1);
            return;
        }

        const inFlight = this._inFlight.get(key);
        if (inFlight) {
            // Signals runWithRetry to stop after the current attempt finishes
            inFlight.cancelled = true;
        }
    }

    cancelAll(): void {
        for (const entry of this._debouncing.values()) {
            if (entry.timer) { clearTimeout(entry.timer); }
        }
        this._debouncing.clear();
        this._ready.length = 0;
        for (const entry of this._inFlight.values()) {
            entry.cancelled = true;
        }
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private promote(key: string): void {
        const entry = this._debouncing.get(key);
        if (!entry) { return; }
        this._debouncing.delete(key);
        this._ready.push(entry);
        if (!this._draining) { void this.drain(); }
    }

    private async drain(): Promise<void> {
        this._draining = true;
        while (this._ready.length) {
            const entry = this._ready.shift()!;
            if (entry.cancelled) { continue; }
            this._inFlight.set(entry.key, entry);
            await this.runWithRetry(entry);
            this._inFlight.delete(entry.key);
        }
        this._draining = false;
    }

    private async runWithRetry(entry: Entry): Promise<void> {
        let attempt = 0;
        while (true) {
            if (entry.cancelled) { return; }
            try {
                await entry.fn();
                return;
            } catch (err) {
                if (attempt >= entry.opts.maxRetries) { return; }
                attempt++;
                entry.opts.onRetry(attempt, err);
                await sleep(entry.opts.retryBaseMs * (2 ** (attempt - 1)));
                if (entry.cancelled) { return; }
            }
        }
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}
