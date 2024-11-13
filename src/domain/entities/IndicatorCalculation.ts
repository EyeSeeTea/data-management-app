import _ from "lodash";
import { Maybe } from "../../types/utils";
import { DataElement } from "./DataElement";
import { DataValue } from "./DataValue";
import { Either } from "./generic/Either";
import { ValidationError } from "./generic/Errors";
import { Struct } from "./generic/Struct";
import { isPositive, validateRequired } from "./generic/Validations";
import { Code, Id } from "./Ref";

export type IndicatorCalculationKeys = keyof IndicatorCalculationAttrs;
export type IndicatorCalculationAttrs = {
    id: Id;
    newValue: number;
    editableNewValue: Maybe<number>;
    returningValue: Maybe<number>;
    comment: string;
    previousValue?: number;
    nextValue?: number;
    code: Code;
    name: string;
};

export class IndicatorCalculation extends Struct<IndicatorCalculationAttrs>() {
    static getTotal(data: IndicatorCalculationAttrs): number {
        return this.calculateTotalValue(data.editableNewValue, data.returningValue);
    }

    static hasChanged(data: IndicatorCalculationAttrs): boolean {
        return data.nextValue !== undefined;
    }

    static build(
        data: IndicatorCalculationAttrs
    ): Either<ValidationError<IndicatorCalculation>[], IndicatorCalculation> {
        const errors = this.checkDataAndGetErrors(data);
        if (errors.length > 0) return Either.error(errors);

        return Either.success(IndicatorCalculation.create(data));
    }

    static checkDataAndGetErrors(
        data: IndicatorCalculationAttrs
    ): ValidationError<IndicatorCalculation>[] {
        const idProperty: ValidationError<IndicatorCalculation> = {
            property: "id",
            errors: validateRequired(data.id),
            value: data.id,
        };

        const newProperty: ValidationError<IndicatorCalculation> = {
            property: "newValue",
            errors: [...isPositive(data.newValue)],
            value: data.newValue,
        };

        const editableNewValueProperty: ValidationError<IndicatorCalculation> = {
            property: "editableNewValue",
            errors: data.editableNewValue ? [...isPositive(data.editableNewValue)] : [],
            value: data.editableNewValue,
        };

        const returningProperty: ValidationError<IndicatorCalculation> = {
            property: "returningValue",
            errors: data.returningValue ? [...isPositive(data.returningValue)] : [],
            value: data.returningValue,
        };

        const errors: ValidationError<IndicatorCalculation>[] = _([
            idProperty,
            newProperty,
            editableNewValueProperty,
            returningProperty,
        ])
            .filter(validation => validation.errors.length > 0)
            .value();

        return errors;
    }

    static updateValuesById(
        id: Id,
        existingRecord: Maybe<IndicatorCalculation>,
        dataValues: DataValue[],
        details: Pick<DataElement, "id" | "code" | "name">,
        verifyChangesInValues: boolean
    ): IndicatorCalculation {
        const newValueSum = _(dataValues)
            .filter(dataValue => dataValue.dataElement === id)
            .sumBy(dataValue => Number(dataValue.value || 0));

        const returningValue = existingRecord?.returningValue;

        const newValueHasChanged = verifyChangesInValues
            ? existingRecord?.newValue !== newValueSum
            : false;

        return IndicatorCalculation.build({
            id: id,
            newValue: newValueSum,
            editableNewValue: existingRecord?.editableNewValue || newValueSum,
            returningValue,
            comment: existingRecord?.comment || "",
            previousValue: newValueHasChanged ? existingRecord?.newValue : undefined,
            nextValue: newValueHasChanged ? newValueSum : undefined,
            code: details.code,
            name: details.name,
        }).get();
    }

    static commentIsRequired(attrs: IndicatorCalculationAttrs): boolean {
        const entity = IndicatorCalculation.create(attrs);
        const newAndTotalAreDifferent = IndicatorCalculation.getTotal(entity) !== entity.newValue;
        return newAndTotalAreDifferent && entity.comment.length === 0;
    }

    static calculateTotalValue(editable: Maybe<number>, returning: Maybe<number>): number {
        return (editable ?? 0) + (returning ?? 0);
    }
}
