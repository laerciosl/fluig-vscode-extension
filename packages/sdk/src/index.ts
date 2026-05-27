// Types
export type { ServerDTO, ServerConfig } from './types/server.types';
export type { CookieCache, JwtPayload } from './types/auth.types';
export type { FluigApiResponse, FluigListResponse } from './types/api.types';
export type { DatasetDTO, DatasetStructureDTO } from './dataset/dataset.types';

// Logger injection
export type { SdkLogger } from './sdk-logger';
export { setSdkLoggers } from './sdk-logger';

// HTTP utilities
export {
    getHost,
    getRestUrl,
    fillServerFromJwtCookies,
    validateServerHasFluiggersWidget,
} from './hapi/http.client';

// Authentication
export {
    loginAndGetCookies,
    createAuthenticatedClientAsync,
    clearCookies,
    setBrowserPathProvider,
    fetchWithAuth,
} from './hapi/login.client';

// User
export { getUser } from './hapi/user.client';

// Dataset API
export {
    apiFindAllDatasets,
    apiLoadDataset,
    apiGetDatasetResult,
    apiCreateDataset,
    apiUpdateDataset,
} from './dataset/dataset.api';

// Workflow API
export {
    apiGetLastWorkflowVersion,
    apiUpdateWorkflowEvents,
} from './workflow/workflow.api';
