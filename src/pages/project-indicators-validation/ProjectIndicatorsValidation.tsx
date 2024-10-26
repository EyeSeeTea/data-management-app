import React from "react";
import { useParams } from "react-router-dom";
import { useLoading, useSnackbar } from "@eyeseetea/d2-ui-components";

import { useAppContext } from "../../contexts/api-context";
import { Ref } from "../../domain/entities/Ref";
import { useGetUniqueBeneficiaries } from "../../hooks/UniqueBeneficiaries";
import { IndicatorValidationForm } from "./IndicatorValidationForm";
import { IndicatorValidation } from "../../domain/entities/IndicatorValidation";
import i18n from "../../locales";

export const ProjectIndicatorsValidation = React.memo(() => {
    const { id } = useParams<Ref>();
    const { compositionRoot } = useAppContext();
    const { settings } = useGetUniqueBeneficiaries({ id, refresh: 0 });
    const [indicatorsValidation, setIndicatorsValidation] = React.useState<IndicatorValidation[]>(
        []
    );
    const [refresh, setRefresh] = React.useState(0);
    const loading = useLoading();
    const snackbar = useSnackbar();

    React.useEffect(() => {
        console.debug("refresh", refresh);
        loading.show(true, i18n.t("Loading Indicators..."));
        compositionRoot.indicators.getValidation
            .execute({ projectId: id })
            .then(setIndicatorsValidation)
            .catch(err => {
                snackbar.error(err.message);
            })
            .finally(() => loading.hide());
    }, [compositionRoot.indicators, id, loading, refresh, snackbar]);

    const saveIndicator = React.useCallback(
        (indicatorValidation: IndicatorValidation) => {
            loading.show(true, i18n.t("Saving Indicators..."));
            compositionRoot.indicators.saveValidation
                .execute({ projectId: id, indicatorsValidation: indicatorValidation })
                .then(() => {
                    snackbar.success(i18n.t("Indicators saved"));
                    setRefresh(prev => prev + 1);
                })
                .catch(err => {
                    snackbar.error(err.message);
                })
                .finally(() => loading.hide());
        },
        [compositionRoot.indicators.saveValidation, id, loading, snackbar]
    );

    if (!settings) return null;

    return (
        <div>
            <IndicatorValidationForm
                indicatorsValidation={indicatorsValidation}
                settings={settings}
                onSubmit={saveIndicator}
            />
        </div>
    );
});

ProjectIndicatorsValidation.displayName = "ProjectIndicatorsValidation";
