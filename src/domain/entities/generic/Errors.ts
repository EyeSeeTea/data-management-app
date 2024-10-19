import i18n from "../../../locales";

export type ValidationErrorKey = "field_cannot_be_blank" | "not_in_list";

export const validationErrorMessages: Record<
    ValidationErrorKey,
    (fieldName: string, value: unknown) => string
> = {
    field_cannot_be_blank: (fieldName: string) =>
        i18n.t(`Cannot be blank: {{fieldName}}`, { fieldName: fieldName, nsSeparator: false }),
    not_in_list: (fieldName: string, value: unknown) =>
        i18n.t(`{{value}} is not a valid value for {{fieldName}}`, {
            fieldName: fieldName,
            value: value,
            nsSeparator: false,
        }),
};

export function getErrors<T>(errors: ValidationError<T>[]) {
    return errors
        .map(error => {
            return error.errors.map(err =>
                validationErrorMessages[err](error.property as string, error.value)
            );
        })
        .flat()
        .join("\n");
}

export type ValidationError<T> = {
    property: keyof T;
    value: unknown;
    errors: ValidationErrorKey[];
};
