import React from "react";
import { StepProps } from "../../../pages/project-wizard/ProjectWizard";
import DataElementsStep, { DataElementsStepProps } from "../data-elements/DataElementsStep";

const UniqueIndicatorsStep: React.FC<StepProps> = props => {
    const { project } = props;
    const getSelection: DataElementsStepProps["onSelect"] = React.useCallback(
        (sectorId, dataElementIds) => {
            return project.updateUniqueBeneficiariesSelection(sectorId, dataElementIds);
        },
        [project]
    );

    return (
        <DataElementsStep
            {...props}
            onSelect={getSelection}
            dataElementsSet={project.uniqueIndicators}
            initialFilters={{ peopleOrBenefit: "people" }}
        />
    );
};

export default React.memo(UniqueIndicatorsStep);
