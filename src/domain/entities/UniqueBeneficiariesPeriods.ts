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

export type PeriodType = typeof periodsTypes[number];

export type UniqueBeneficiariesPeriodsAttrs = {
    id: string;
    name: string;
    type: PeriodType;
    startDateMonth: number;
    endDateMonth: number;
};

export class UniqueBeneficiariesPeriods extends Struct<UniqueBeneficiariesPeriodsAttrs>() {
    static build(
        data: UniqueBeneficiariesPeriodsAttrs
    ): Either<ValidationError<UniqueBeneficiariesPeriods>[], UniqueBeneficiariesPeriods> {
        const errors = this.checkDataAndGetErrors(data);
        if (errors.length > 0) {
            return Either.error(errors);
        }
        return Either.success(UniqueBeneficiariesPeriods.create(data));
    }

    public static defaultPeriods(): UniqueBeneficiariesPeriods[] {
        const yearlyPeriod = UniqueBeneficiariesPeriods.create({
            id: "annual",
            name: "Annual",
            type: "ANNUAL",
            startDateMonth: 1,
            endDateMonth: 12,
        });
        const semiAnnualPeriod = UniqueBeneficiariesPeriods.create({
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

    public static initialPeriodData(): UniqueBeneficiariesPeriods {
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
    ): ValidationError<UniqueBeneficiariesPeriods>[] {
        const errors: ValidationError<UniqueBeneficiariesPeriods>[] = _([
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

    private static validateAndGetError(value: string | number, errorMessage: string): string {
        const valueToValidate = String(value);
        return valueToValidate.length === 0 ? errorMessage : "";
    }

    private static validateTypes(value: PeriodType, errorMessage: string): string {
        return periodsTypes.includes(value) ? "" : errorMessage;
    }

    private static validateMonths(monthNumber: number, errorMessage: string): string {
        return monthNumber >= 1 && monthNumber <= 12 ? "" : errorMessage;
    }
}
