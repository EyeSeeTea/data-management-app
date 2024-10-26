import React from "react";
import { ConfirmationDialog } from "@eyeseetea/d2-ui-components";
import i18n from "../../locales";
import { IndicatorValidation } from "../../domain/entities/IndicatorValidation";
import { ISODateTimeString } from "../../domain/entities/Ref";
import { IndicatorCalculation } from "../../domain/entities/IndicatorCalculation";
import { Typography } from "@material-ui/core";

export type IndicatorNotificationProps = {
    indicatorValidation: IndicatorValidation;
    onClose: () => void;
};

export const IndicatorNotification = React.memo((props: IndicatorNotificationProps) => {
    const { indicatorValidation, onClose } = props;

    const monthName = getMonthName(
        indicatorValidation.lastUpdatedAt
            ? indicatorValidation.lastUpdatedAt
            : indicatorValidation.createdAt
    );

    const onlyIndicatorsWithChanges = indicatorValidation.indicatorsCalculation.filter(
        IndicatorCalculation.hasChanged
    );

    return (
        <ConfirmationDialog
            open
            title="Indicators Notification"
            description={i18n.t(
                "Please review the following indicators  which have been updated since {{monthName}}",
                {
                    monthName: monthName,
                }
            )}
            onSave={onClose}
            saveText={i18n.t("Close")}
        >
            <ul>
                {onlyIndicatorsWithChanges.map(indicatorCalculation => {
                    return (
                        <li key={indicatorCalculation.id}>
                            <span>{i18n.t("Indicator Code")} </span>
                            <span>
                                <strong>{indicatorCalculation.code}: </strong>
                            </span>
                            <Typography component="span" color="error">
                                {indicatorCalculation.previousValue}
                            </Typography>
                            <span> ➝ </span>
                            <Typography component="span" color="primary">
                                {indicatorCalculation.nextValue}
                            </Typography>
                        </li>
                    );
                })}
            </ul>
        </ConfirmationDialog>
    );
});

IndicatorNotification.displayName = "IndicatorNotification";

function getMonthName(dateIso: ISODateTimeString) {
    const date = new Date(dateIso);
    return date.toLocaleString("en", { month: "long" });
}
