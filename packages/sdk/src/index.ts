// Types
export type { ServerDTO, ServerConfig } from './types/server.types';
export type { CookieCache, JwtPayload } from './types/auth.types';
export type { FluigApiResponse, FluigListResponse } from './types/api.types';
export type { DatasetDTO, DatasetStructureDTO } from './dataset/dataset.types';

// Process types
export type {
    ActivityKind,
    Coordinates,
    ProcessCoordinates,
    ProcessMetadata,
    ProcessAssignment,
    ProcessGatewayCondition,
    ProcessActivityBase,
    ProcessEventActivity,
    ProcessTaskActivity,
    ProcessGatewayActivity,
    ProcessIntermediateEventActivity,
    ProcessSubProcessActivity,
    ProcessActivity,
    ProcessTransition,
    ProcessSwimlane,
    ProcessPool,
    ProcessAnnotation,
    ProcessDefinition,
} from './process/process.types';

// Process API
export { parseProcess } from './process/process.parser';
export {
    validateProcessDefinition,
} from './process/process.validator';
export type {
    ValidationSeverity,
    ValidationIssue,
    ValidationContext,
} from './process/process.validator';

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
