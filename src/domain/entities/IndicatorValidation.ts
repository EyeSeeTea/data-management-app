import { Maybe } from "../../types/utils";
import { Either } from "./generic/Either";
import { ValidationError } from "./generic/Errors";
import { Struct } from "./generic/Struct";
import { validateRequired } from "./generic/Validations";
import { IndicatorCalculation } from "./IndicatorCalculation";
import { Id, ISODateTimeString } from "./Ref";
import { UniqueBeneficiariesPeriod } from "./UniqueBeneficiariesPeriod";

export type IndicatorValidationAttrs = {
    period: UniqueBeneficiariesPeriod;
    createdAt: ISODateTimeString;
    lastUpdatedAt: Maybe<ISODateTimeString>;
    indicatorsCalculation: IndicatorCalculation[];
};

export class IndicatorValidation extends Struct<IndicatorValidationAttrs>() {
    static build(
        attrs: IndicatorValidationAttrs
    ): Either<ValidationError<IndicatorValidation>[], IndicatorValidation> {
        const errors = this.checkDataAndGetErrors(attrs);
        if (errors.length > 0) {
            return Either.error(errors);
        }
        return Either.success(IndicatorValidation.create(attrs));
    }

    private static checkDataAndGetErrors(
        data: IndicatorValidationAttrs
    ): ValidationError<IndicatorValidation>[] {
        const periodProperty: ValidationError<IndicatorValidation> = {
            property: "period",
            errors: validateRequired(data.period),
            value: data.period,
        };

        const errors = [periodProperty].filter(validation => validation.errors.length > 0);

        return errors;
    }

    static validateCommentIndicators(indicators: IndicatorCalculation[]): boolean {
        return indicators.some(indicator => IndicatorCalculation.commentIsRequired(indicator));
    }

    static buildIndicatorsValidationFromPeriods(
        periods: UniqueBeneficiariesPeriod[],
        indicatorsIds: Id[]
    ): IndicatorValidation[] {
        return periods.map(period => {
            return IndicatorValidation.build({
                createdAt: "",
                lastUpdatedAt: "",
                period,
                indicatorsCalculation: indicatorsIds.map(indicatorId => {
                    return IndicatorCalculation.build({
                        id: indicatorId,
                        newValue: 0,
                        editableNewValue: undefined,
                        returningValue: undefined,
                        comment: "",
                        code: "",
                        name: "",
                    }).get();
                }),
            }).get();
        });
    }
}
