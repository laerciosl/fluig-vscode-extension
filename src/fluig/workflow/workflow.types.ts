export interface AttributionMechanismDTO {
    attributionMecanismPK: {
        companyId: number;
        attributionMecanismId: string;
    };
    assignmentType: number;
    controlClass: string;
    preSelectionClass: null;
    configurationClass: string;
    name: string;
    description: string;
    attributionMecanismDescription: string;
}
