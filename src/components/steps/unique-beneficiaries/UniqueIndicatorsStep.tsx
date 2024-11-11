import React from "react";
import { Id } from "../../../domain/entities/Ref";
import { StepProps } from "../../../pages/project-wizard/ProjectWizard";
import { Filter } from "../data-elements/DataElementsFilters";
import DataElementsStep from "../data-elements/DataElementsStep";

const initialFilters: Filter = { peopleOrBenefit: "people" };

const UniqueIndicatorsStep: React.FC<StepProps> = props => {
    const { project } = props;
    const getSelection = React.useCallback(
        (sectorId: Id, dataElementIds: Id[]) => {
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
