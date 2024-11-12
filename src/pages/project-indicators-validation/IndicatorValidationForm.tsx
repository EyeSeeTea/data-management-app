import _ from "lodash";
import React from "react";
import { Dropdown } from "@eyeseetea/d2-ui-components";
import i18n from "../../locales";
import { IndicatorValidation } from "../../domain/entities/IndicatorValidation";
import { Maybe } from "../../types/utils";
import { Button, Grid, makeStyles, Typography } from "@material-ui/core";
import { IndicatorValidationTable } from "./IndicatorValidationTable";
import PageHeader from "../../components/page-header/PageHeader";
import { useHistory } from "react-router-dom";
import { IndicatorCalculation } from "../../domain/entities/IndicatorCalculation";
import { UniqueBeneficiariesSettings } from "../../domain/entities/UniqueBeneficiariesSettings";
import { IndicatorNotification } from "./IndicatorNotification";
import { ISODateTimeString } from "../../domain/entities/Ref";
import { useIndicatorValidation } from "./hooks";

export type IndicatorValidationFormProps = {
    indicatorsValidation: IndicatorValidation[];
    onSubmit: (indicatorValidation: IndicatorValidation) => void;
    onUpdateIndicator: (indicator: IndicatorValidation) => void;
    settings: UniqueBeneficiariesSettings;
};

export const IndicatorValidationForm = React.memo((props: IndicatorValidationFormProps) => {
    const { indicatorsValidation, onSubmit, settings, onUpdateIndicator } = props;
    const { periods } = settings;
    const {
        dismissNotification,
        selectedIndicator,
        selectedPeriod,
        loadIndicatorValidation,
        saveIndicatorValidation,
        setDismissNotification,
        updateIndicatorsValidationRow,
    } = useIndicatorValidation({ indicatorsValidation, onSubmit, periods, onUpdateIndicator });

    const history = useHistory();
    const classes = useStyles();

    const mapPeriodsToItems = periods.map(period => ({
        value: period.id,
        text: period.name,
    }));

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
                            <DateDisplay
                                label={i18n.t("Created")}
                                date={selectedIndicator.createdAt}
                            />

                            <DateDisplay
                                label={i18n.t("Last Updated")}
                                date={selectedIndicator.lastUpdatedAt}
                            />
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

function DateDisplay(props: { label: string; date: Maybe<ISODateTimeString> }) {
    const { date, label } = props;

    if (!date) return null;

    return (
        <Typography variant="body1">
            <strong>{label}:</strong> {convertToLocalDate(date)}
        </Typography>
    );
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
