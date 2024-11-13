import _ from "lodash";
import { Maybe } from "../../types/utils";
import { getMonthNameFromNumber } from "../../utils/date";
import { getUid } from "../../utils/dhis2";

import { Either } from "./generic/Either";
import { ValidationError, ValidationErrorKey } from "./generic/Errors";
import { Struct } from "./generic/Struct";
import {
    betweenValue,
    periodsTypes,
    validatePeriodType,
    validateRequired,
} from "./generic/Validations";
import { Id } from "./Ref";

export type PeriodType = typeof periodsTypes[number];

export type UniqueBeneficiariesPeriodsAttrs = {
    id: string;
    name: string;
    type: PeriodType;
    startDateMonth: number;
    endDateMonth: number;
    projectId?: Id;
};

export class UniqueBeneficiariesPeriod extends Struct<UniqueBeneficiariesPeriodsAttrs>() {
    static build(
        data: UniqueBeneficiariesPeriodsAttrs
    ): Either<ValidationError<UniqueBeneficiariesPeriod>[], UniqueBeneficiariesPeriod> {
        const errors = this.checkDataAndGetErrors(data);
        if (errors.length > 0) {
            return Either.error(errors);
        }
        return Either.success(UniqueBeneficiariesPeriod.create(data));
    }

    public static defaultPeriods(): UniqueBeneficiariesPeriod[] {
        const yearlyPeriod = UniqueBeneficiariesPeriod.create({
            id: "annual",
            name: "Annual",
            type: "ANNUAL",
            startDateMonth: 1,
            endDateMonth: 12,
        });
        const semiAnnualPeriod = UniqueBeneficiariesPeriod.create({
            id: "semi-annual",
            name: "Semi-annual",
            type: "SEMIANNUAL",
            startDateMonth: 1,
            endDateMonth: 6,
        });

        return [semiAnnualPeriod, yearlyPeriod];
    }

    isProtected(): boolean {
        return this.id === "annual" || this.id === "semi-annual";
    }

    public static initialPeriodData(): UniqueBeneficiariesPeriod {
        return this.create({
            endDateMonth: 12,
            id: getUid("unique_beneficiaries_period", new Date().getTime().toString()),
            name: "",
            startDateMonth: 1,
            type: "CUSTOM",
        });
    }

    public static validate(data: UniqueBeneficiariesPeriodsAttrs): {
        isValid: boolean;
        errorMessage: string;
    } {
        const errors = this.checkDataAndGetErrors(data).filter(
            validation => validation.errors.length > 0
        );
        return {
            isValid: errors.length === 0,
            errorMessage: errors.map(error => error.errors.join(", ")).join(", "),
        };
    }

    private static checkDataAndGetErrors(
        data: UniqueBeneficiariesPeriodsAttrs
    ): ValidationError<UniqueBeneficiariesPeriod>[] {
        const dateDifferentError: ValidationErrorKey[] =
            data.startDateMonth > data.endDateMonth || data.startDateMonth === data.endDateMonth
                ? ["invalid_period_date_range"]
                : [];

        const errors: ValidationError<UniqueBeneficiariesPeriod>[] = _([
            {
                property: "name" as const,
                errors: validateRequired(data.name),
                value: data.name,
            },
            {
                property: "type" as const,
                errors: validatePeriodType(data.type),
                value: data.type,
            },
            {
                property: "startDateMonth" as const,
                errors: betweenValue(data.startDateMonth, 1, 12),
                value: data.startDateMonth,
            },
            {
                property: "startDateMonth" as const,
                errors: betweenValue(data.startDateMonth, 1, 12),
                value: data.startDateMonth,
            },
            {
                property: "startDateMonth" as const,
                errors: dateDifferentError,
                value: data.startDateMonth,
            },
        ])
            .filter(validation => validation.errors.length > 0)
            .value();

        return errors;
    }

    public static uniquePeriodsByDates(
        periods: UniqueBeneficiariesPeriod[]
    ): UniqueBeneficiariesPeriod[] {
        const combinedPeriods = _(periods)
            .groupBy(period => `${period.startDateMonth}-${period.endDateMonth}`)
            .map((group, key): Maybe<UniqueBeneficiariesPeriod> => {
                const [startDateMonth, endDateMonth] = key.split("-").map(Number);
                const startMonthName = getMonthNameFromNumber(startDateMonth);
                const endMonthName = getMonthNameFromNumber(endDateMonth);
                const joinNames = group.map(period => period.name).join(", ");

                const isAnnualOrSemiAnnual = group.some(
                    period => period.type === "ANNUAL" || period.type === "SEMIANNUAL"
                );

                if (isAnnualOrSemiAnnual) return undefined;

                return UniqueBeneficiariesPeriod.create({
                    id: group[0].id || "",
                    name: `${startMonthName} - ${endMonthName} (${joinNames})`,
                    type: "CUSTOM",
                    startDateMonth,
                    endDateMonth,
                });
            })
            .compact()
            .value();

        return _(combinedPeriods)
            .concat(this.defaultPeriods())
            .uniqBy(period => period.id)
            .value();
    }

    public equalMonths(startDateMonth: number, endDateMonth: number): boolean {
        return this.startDateMonth === startDateMonth && this.endDateMonth === endDateMonth;
    }
}
