export function buildLog(emit: (level: string, msg: string) => void): object {
    const format = (level: string, msg: any) => emit(level, String(msg));
    return {
        info:  (msg: any) => format('LOG', msg),
        error: (msg: any) => format('LOG', `[ERROR] ${msg}`),
        debug: (msg: any) => format('LOG', `[DEBUG] ${msg}`),
        warn:  (msg: any) => format('LOG', `[WARN]  ${msg}`),
    };
}
