import _ from "lodash";
import React from "react";
import { Dropdown, useSnackbar } from "@eyeseetea/d2-ui-components";
import i18n from "../../locales";
import { IndicatorValidation } from "../../domain/entities/IndicatorValidation";
import { Maybe } from "../../types/utils";
import { UniqueBeneficiariesPeriod } from "../../domain/entities/UniqueBeneficiariesPeriod";
import { Button, Grid, makeStyles, Typography } from "@material-ui/core";
import { IndicatorValidationTable } from "./IndicatorValidationTable";
import PageHeader from "../../components/page-header/PageHeader";
import { useHistory } from "react-router-dom";
import {
    IndicatorCalculation,
    IndicatorCalculationKeys,
} from "../../domain/entities/IndicatorCalculation";
import { UniqueBeneficiariesSettings } from "../../domain/entities/UniqueBeneficiariesSettings";
import { getErrors } from "../../domain/entities/generic/Errors";
import { IndicatorNotification } from "./IndicatorNotification";
import { ISODateTimeString } from "../../domain/entities/Ref";

export type IndicatorValidationFormProps = {
    indicatorsValidation: IndicatorValidation[];
    onSubmit: (indicatorValidation: IndicatorValidation) => void;
    settings: UniqueBeneficiariesSettings;
};

export const IndicatorValidationForm = React.memo((props: IndicatorValidationFormProps) => {
    const { indicatorsValidation, onSubmit, settings } = props;
    const { periods } = settings;
    const [selectedPeriod, setSelectedPeriod] = React.useState<UniqueBeneficiariesPeriod>();
    const [selectedIndicator, setIndicatorValidation] = React.useState<IndicatorValidation>();
    const [dismissNotification, setDismissNotification] = React.useState(false);
    const snackbar = useSnackbar();
    const history = useHistory();
    const classes = useStyles();

    const mapPeriodsToItems = periods.map(period => ({
        value: period.id,
        text: period.name,
    }));

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

                return IndicatorValidation.build({
                    ...prevState,
                    indicatorsCalculation: prevState.indicatorsCalculation.map((item, index) => {
                        if (index !== indexRow) return item;
                        return IndicatorCalculation.build({
                            ...item,
                            [attributeName]: getValue(value, attributeName),
                        }).get();
                    }),
                }).get();
            });
        },
        [snackbar]
    );

    const saveIndicatorValidation = React.useCallback(
        (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!selectedPeriod || !selectedIndicator) return;
            onSubmit(selectedIndicator);
        },
        [selectedIndicator, onSubmit, selectedPeriod]
    );

    const hasChanged = selectedIndicator?.indicatorsCalculation.some(
        IndicatorCalculation.hasChanged
    );

    const commentsNotValid = selectedIndicator?.indicatorsCalculation.some(
        IndicatorCalculation.commentIsRequired
    );

    const showNotification = hasChanged ?? false;

    const total = _(selectedIndicator?.indicatorsCalculation).sumBy(indicator =>
        IndicatorCalculation.getTotal(indicator)
    );

    return (
        <div>
            <PageHeader
                title={i18n.t("Project Indicators Validation")}
                onBackClick={() => history.push("/")}
            />

            <form onSubmit={saveIndicatorValidation}>
                <Dropdown
                    hideEmpty
                    items={mapPeriodsToItems}
                    label={i18n.t("Select a Period")}
                    onChange={loadIndicatorValidation}
                    value={selectedPeriod?.id || ""}
                />

                {selectedIndicator && (
                    <Grid container>
                        <Grid item className={classes.alignRight}>
                            {selectedIndicator.createdAt && (
                                <Typography variant="body1">
                                    <strong>{i18n.t("Created")}:</strong>{" "}
                                    {convertToLocalDate(selectedIndicator.createdAt)}
                                </Typography>
                            )}

                            {selectedIndicator.lastUpdatedAt && (
                                <Typography variant="body1">
                                    <strong>{i18n.t("Last Updated")}:</strong>{" "}
                                    {convertToLocalDate(selectedIndicator.lastUpdatedAt)}
                                </Typography>
                            )}
                        </Grid>

                        <Grid item xs={12}>
                            <IndicatorValidationTable
                                data={selectedIndicator.indicatorsCalculation}
                                onRowChange={updateIndicatorsValidationRow}
                            />
                            <div className={classes.totalContainer}>
                                <Typography>
                                    {i18n.t("Unique in Project")}: {total}
                                </Typography>
                            </div>
                        </Grid>

                        <Grid item className={classes.alignRight}>
                            <Button
                                disabled={commentsNotValid}
                                variant="contained"
                                color="primary"
                                type="submit"
                                size="large"
                            >
                                {i18n.t("Save")}
                            </Button>
                        </Grid>
                    </Grid>
                )}
            </form>

            {showNotification && selectedIndicator && !dismissNotification && (
                <IndicatorNotification
                    onClose={() => setDismissNotification(true)}
                    indicatorValidation={selectedIndicator}
                />
            )}
        </div>
    );
});

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

type FieldValidation = { comment: { isRequired: boolean } };
export type ErrorValidation = Record<number, FieldValidation>;

function convertToLocalDate(isoDateString: Maybe<ISODateTimeString>): string {
    if (!isoDateString) return "";
    return new Date(isoDateString).toLocaleString();
}

const useStyles = makeStyles({
    alignRight: { marginLeft: "auto" },
    totalContainer: {
        display: "flex",
        paddingBlock: "0 1em",
        paddingInline: "0 1em",
        justifyContent: "flex-end",
    },
});

IndicatorValidationForm.displayName = "IndicatorValidationForm";
