import { useSnackbar } from "@eyeseetea/d2-ui-components";
import React from "react";
import { getErrors } from "../../domain/entities/generic/Errors";
import {
    IndicatorCalculation,
    IndicatorCalculationKeys,
} from "../../domain/entities/IndicatorCalculation";
import { IndicatorValidation } from "../../domain/entities/IndicatorValidation";
import { UniqueBeneficiariesPeriod } from "../../domain/entities/UniqueBeneficiariesPeriod";
import i18n from "../../locales";
import { Maybe } from "../../types/utils";

export type UseIndicatorValidationProps = {
    periods: UniqueBeneficiariesPeriod[];
    indicatorsValidation: IndicatorValidation[];
    onSubmit: (indicatorValidation: IndicatorValidation) => void;
    onUpdateIndicator: (indicator: IndicatorValidation) => void;
};

export function useIndicatorValidation(props: UseIndicatorValidationProps) {
    const { indicatorsValidation, onSubmit, onUpdateIndicator, periods } = props;

    const [selectedPeriod, setSelectedPeriod] = React.useState<UniqueBeneficiariesPeriod>();
    const [selectedIndicator, setIndicatorValidation] = React.useState<IndicatorValidation>();
    const [dismissNotification, setDismissNotification] = React.useState(false);
    const snackbar = useSnackbar();
    const loadIndicatorValidation = React.useCallback(
        (period: Maybe<string>) => {
            const uniquePeriod = periods.find(item => item.id === period);
            if (!uniquePeriod) {
                snackbar.error(i18n.t("Period not found"));
                return;
            }

            const currentIndicatorValidation = indicatorsValidation.find(
                indicator => indicator.period.id === period
            );

            setSelectedPeriod(uniquePeriod);
            setDismissNotification(false);
            IndicatorValidation.build({
                createdAt: currentIndicatorValidation?.createdAt || "",
                lastUpdatedAt: currentIndicatorValidation?.lastUpdatedAt,
                period: uniquePeriod,
                indicatorsCalculation: currentIndicatorValidation?.indicatorsCalculation || [],
            }).match({
                success: value => {
                    setIndicatorValidation(value);
                },
                error: err => {
                    const errorMessage = getErrors(err);
                    snackbar.error(errorMessage);
                },
            });
        },
        [indicatorsValidation, periods, snackbar]
    );

    const updateIndicatorsValidationRow = React.useCallback(
        (value: string, indexRow: number, attributeName: IndicatorCalculationKeys) => {
            setIndicatorValidation(prevState => {
                if (!prevState) return prevState;

                if (attributeName === "editableNewValue" || attributeName === "returningValue") {
                    const numericValue = Number(value);
                    if (numericValue < 0) {
                        snackbar.error(i18n.t("Value must be greater than or equal to zero"));
                        return prevState;
                    }
                }

                const record = IndicatorValidation.build({
                    ...prevState,
                    indicatorsCalculation: prevState.indicatorsCalculation.map((item, index) => {
                        if (index !== indexRow) return item;
                        return IndicatorCalculation.build({
                            ...item,
                            [attributeName]: getValue(value, attributeName),
                        }).get();
                    }),
                }).get();
                onUpdateIndicator(record);
                return record;
            });
        },
        [onUpdateIndicator, snackbar]
    );

    const saveIndicatorValidation = React.useCallback(
        (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!selectedPeriod || !selectedIndicator) return;
            onSubmit(selectedIndicator);
        },
        [selectedIndicator, onSubmit, selectedPeriod]
    );

    return {
        selectedIndicator,
        selectedPeriod,
        dismissNotification,
        setDismissNotification,
        loadIndicatorValidation,
        updateIndicatorsValidationRow,
        saveIndicatorValidation,
    };
}

function getValue(value: string, attributeName: IndicatorCalculationKeys) {
    switch (attributeName) {
        case "editableNewValue":
        case "returningValue":
            return value.length > 0 ? Number(value) : undefined;
        case "comment":
            return value;
        default:
            throw new Error(`Attribute ${attributeName} not supported`);
    }
}
