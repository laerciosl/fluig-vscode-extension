export interface FluigApiResponse<T = string> {
    content: T;
    message?: {
        message: string;
    };
}

export interface FluigListResponse<T> {
    result?: {
        item: T | T[];
    };
}
