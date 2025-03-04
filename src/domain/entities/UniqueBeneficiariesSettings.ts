import { IndicatorValidation } from "./IndicatorValidation";
import { Id } from "./Ref";
import { UniqueBeneficiariesPeriod } from "./UniqueBeneficiariesPeriod";

export type UniqueBeneficiariesSettings = {
    projectId: Id;
    periods: UniqueBeneficiariesPeriod[];
    indicatorsIds: Id[];
    indicatorsValidation: IndicatorValidation[];
};
