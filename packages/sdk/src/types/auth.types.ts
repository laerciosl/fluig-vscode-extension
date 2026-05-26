export interface CookieCache {
    [key: string]: string;
}

export interface JwtPayload {
    sub?: string;
    tenant?: number;
    [key: string]: unknown;
}
