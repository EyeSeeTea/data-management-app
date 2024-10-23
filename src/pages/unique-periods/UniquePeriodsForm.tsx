import React from "react";
import { Dropdown, useSnackbar } from "@eyeseetea/d2-ui-components";
import { Button, TextField } from "@material-ui/core";
import { makeStyles, createStyles } from "@material-ui/styles";

import {
    UniqueBeneficiariesPeriod,
    UniqueBeneficiariesPeriodsAttrs,
} from "../../domain/entities/UniqueBeneficiariesPeriod";
import i18n from "../../locales";
import { Maybe } from "../../types/utils";
import { getErrors } from "../../domain/entities/generic/Errors";

export type UniquePeriodsFormProps = {
    existingPeriod?: UniqueBeneficiariesPeriodsAttrs;
    onClose: () => void;
    onSubmit: (uniquePeriods: UniqueBeneficiariesPeriod) => void;
};

const months = [
    { value: "1", text: i18n.t("January") },
    { value: "2", text: i18n.t("February") },
    { value: "3", text: i18n.t("March") },
    { value: "4", text: i18n.t("April") },
    { value: "5", text: i18n.t("May") },
    { value: "6", text: i18n.t("June") },
    { value: "7", text: i18n.t("July") },
    { value: "8", text: i18n.t("August") },
    { value: "9", text: i18n.t("September") },
    { value: "10", text: i18n.t("October") },
    { value: "11", text: i18n.t("November") },
    { value: "12", text: i18n.t("December") },
];

function getValueByAttribute(
    value: string,
    attribute: keyof UniqueBeneficiariesPeriod
): number | string {
    if (attribute === "endDateMonth" || attribute === "startDateMonth") {
        return Number(value);
    } else {
        return value;
    }
}

export const UniquePeriodsForm = React.memo((props: UniquePeriodsFormProps) => {
    const { existingPeriod, onClose, onSubmit } = props;
    const snackbar = useSnackbar();
    const classes = useStyles();
    const [uniquePeriod, setUniquePeriod] = React.useState<UniqueBeneficiariesPeriodsAttrs>(
        existingPeriod || UniqueBeneficiariesPeriod.initialPeriodData()
    );

    const validateAndSubmit = React.useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            UniqueBeneficiariesPeriod.build(uniquePeriod).match({
                success: period => onSubmit(period),
                error: errors => {
                    const errorMessage = getErrors(errors);
                    snackbar.error(errorMessage, { autoHideDuration: 3000 });
                },
            });
        },
        [onSubmit, snackbar, uniquePeriod]
    );

    const updatePeriod = React.useCallback(
        (value: Maybe<string>, attribute: keyof UniqueBeneficiariesPeriod) => {
            setUniquePeriod(prev => {
                if (!prev) return prev;
                return { ...prev, [attribute]: getValueByAttribute(value || "", attribute) };
            });
        },
        []
    );

    return (
        <form className={classes.form} onSubmit={validateAndSubmit}>
            <TextField
                placeholder={i18n.t("Name")}
                onChange={event => updatePeriod(event.target.value, "name")}
                value={uniquePeriod.name}
            />
            <Dropdown
                hideEmpty
                items={months}
                label={i18n.t("Start Month")}
                onChange={value => updatePeriod(value, "startDateMonth")}
                value={uniquePeriod.startDateMonth.toString()}
            />
            <Dropdown
                hideEmpty
                items={months}
                label={i18n.t("End Month")}
                onChange={value => updatePeriod(value, "endDateMonth")}
                value={uniquePeriod.endDateMonth.toString()}
            />

            <section className={classes.buttonContainer}>
                <Button variant="contained" color="primary" type="submit">
                    {i18n.t("Save")}
                </Button>
                <Button variant="outlined" color="secondary" type="button" onClick={onClose}>
                    {i18n.t("Cancel")}
                </Button>
            </section>
        </form>
    );
});

const useStyles = makeStyles(() =>
    createStyles({
        form: { display: "flex", flexDirection: "column", gap: "1rem" },
        buttonContainer: { display: "flex", alignItems: "center", justifyContent: "space-between" },
    })
);

UniquePeriodsForm.displayName = "UniquePeriodsForm";
