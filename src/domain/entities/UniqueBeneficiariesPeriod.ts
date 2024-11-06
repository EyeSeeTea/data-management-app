import _ from "lodash";

import { Either } from "./generic/Either";
import { ValidationError } from "./generic/Errors";
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

    public static isProtected(data: UniqueBeneficiariesPeriodsAttrs): boolean {
        return data.id === "annual" || data.id === "semi-annual";
    }

    public static initialPeriodData(): UniqueBeneficiariesPeriod {
        return this.create({
            endDateMonth: 12,
            id: "",
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
                property: "endDateMonth" as const,
                errors: betweenValue(data.endDateMonth, 1, 12),
                value: data.endDateMonth,
            },
        ])
            .filter(validation => validation.errors.length > 0)
            .value();

        return errors;
    }
}
