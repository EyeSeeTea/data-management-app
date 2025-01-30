import _ from "lodash";
import { getYearsFromProject } from "../../pages/project-indicators-validation/ProjectIndicatorsValidation";
import { Maybe } from "../../types/utils";
import { Either } from "./generic/Either";
import { ValidationError } from "./generic/Errors";
import { Struct } from "./generic/Struct";
import { validateRequired } from "./generic/Validations";
import { IndicatorCalculation } from "./IndicatorCalculation";
import { ProjectCountry } from "./IndicatorReport";
import { Id, ISODateTimeString } from "./Ref";
import { UniqueBeneficiariesPeriod } from "./UniqueBeneficiariesPeriod";

export type IndicatorValidationAttrs = {
    period: UniqueBeneficiariesPeriod;
    year: number;
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
        indicatorsIds: Id[],
        project: ProjectCountry
    ): IndicatorValidation[] {
        const { periodsKeys, periodsByYears } = this.getPeriodsAndYearsFromDates(
            project.openingDate,
            project.closedDate,
            periods
        );

        return periodsKeys.map(periodYearKey => {
            const { period, year } = periodsByYears[periodYearKey];
            return IndicatorValidation.build({
                createdAt: "",
                lastUpdatedAt: "",
                period,
                year,
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

    checkPeriodAndYear(periodId: Id, year: number): boolean {
        return this.period.id === periodId && this.year === year;
    }

    static getPeriodsAndYearsFromDates(
        startDate: ISODateTimeString,
        endDate: ISODateTimeString,
        periods: UniqueBeneficiariesPeriod[]
    ) {
        const years = getYearsFromProject(startDate, endDate);
        return this.groupPeriodsAndYears(years, periods);
    }

    static groupPeriodsAndYears(years: number[], periods: UniqueBeneficiariesPeriod[]) {
        const periodsByYears = _(years)
            .flatMap(year =>
                periods.map(period => ({
                    id: `${year}-${period.id}`,
                    value: { period: period, year },
                }))
            )
            .keyBy(item => item.id)
            .mapValues(item => item.value)
            .value();

        const periodsKeys = Object.keys(periodsByYears);
        return { periodsByYears, periodsKeys };
    }
}
