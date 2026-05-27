export interface SdkLogger {
    info(message: string): void;
    error(message: string): void;
    debug(message: string): void;
}

const noop: SdkLogger = { info: () => {}, error: () => {}, debug: () => {} };

let _authLog: SdkLogger = noop;
let _httpLog: SdkLogger = noop;

export function setSdkLoggers(auth: SdkLogger, http: SdkLogger): void {
    _authLog = auth;
    _httpLog = http;
}

export function getAuthLogger(): SdkLogger { return _authLog; }
export function getHttpLogger(): SdkLogger { return _httpLog; }
