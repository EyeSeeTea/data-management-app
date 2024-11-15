import React from "react";
import { StepProps } from "../../../pages/project-wizard/ProjectWizard";
import { Filter } from "../data-elements/DataElementsFilters";
import DataElementsStep, { DataElementsStepProps } from "../data-elements/DataElementsStep";

const initialFilters: Filter = { peopleOrBenefit: "people" };

const UniqueIndicatorsStep: React.FC<StepProps> = props => {
    const { project } = props;
    const getSelection = React.useCallback<DataElementsStepProps["onSelect"]>(
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
            initialFilters={initialFilters}
        />
    );
};

export default React.memo(UniqueIndicatorsStep);
