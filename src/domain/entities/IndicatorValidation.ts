import _ from "lodash";
import { Maybe } from "../../types/utils";
import { Either } from "./generic/Either";
import { ValidationError } from "./generic/Errors";
import { Struct } from "./generic/Struct";
import { validateRequired } from "./generic/Validations";
import { IndicatorCalculation } from "./IndicatorCalculation";
import { ISODateTimeString } from "./Ref";
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

        const calculatorsProperty: ValidationError<IndicatorValidation> = {
            property: "indicatorsCalculation",
            errors: validateRequired(data.indicatorsCalculation),
            value: data.indicatorsCalculation,
        };

        const errors: ValidationError<IndicatorValidation>[] = _([
            periodProperty,
            calculatorsProperty,
        ])
            .filter(validation => validation.errors.length > 0)
            .value();

        return errors;
    }

    static validateCommentIndicators(indicators: IndicatorCalculation[]): boolean {
        return indicators.some(indicator => IndicatorCalculation.commentIsRequired(indicator));
    }
}
