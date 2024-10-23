import { PeriodType } from "../UniqueBeneficiariesPeriod";
import { ValidationErrorKey } from "./Errors";

export const periodsTypes = ["CUSTOM", "ANNUAL", "SEMIANNUAL"] as const;

export function validateRequired(value: any): ValidationErrorKey[] {
    const isBlank = !value || (value.length !== undefined && value.length === 0);

    return isBlank ? ["field_cannot_be_blank"] : [];
}

export function validatePeriodType(periodType: PeriodType): ValidationErrorKey[] {
    return periodsTypes.includes(periodType) ? [] : ["not_in_list"];
}

export function betweenValue(value: number, from: number, to: number): ValidationErrorKey[] {
    return value >= from && value <= to ? [] : ["not_in_list"];
}
