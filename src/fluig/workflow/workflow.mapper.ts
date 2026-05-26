import { readFileSync } from 'fs';
import { AttributionMechanismDTO } from './workflow.types';

export function buildMechanismStructure(
    companyId: number,
    mechanismId: string
): AttributionMechanismDTO {
    return {
        attributionMecanismPK: { companyId, attributionMecanismId: mechanismId },
        assignmentType: 1,
        controlClass: 'com.datasul.technology.webdesk.workflow.assignment.customization.CustomAssignmentImpl',
        preSelectionClass: null,
        configurationClass: '',
        name: '',
        description: '',
        attributionMecanismDescription: '',
    };
}

export function buildEventsPayload(
    events: { label: string; path: string }[]
): { name: string; contents: string }[] {
    return events.map(e => ({
        name: e.label,
        contents: readFileSync(e.path, 'utf8'),
    }));
}
