import React from "react";
import { useParams } from "react-router-dom";
import { useLoading, useSnackbar } from "@eyeseetea/d2-ui-components";

import { useAppContext } from "../../contexts/api-context";
import { Ref } from "../../domain/entities/Ref";
import { useGetUniqueBeneficiaries } from "../../hooks/UniqueBeneficiaries";
import { IndicatorValidationForm } from "./IndicatorValidationForm";
import { IndicatorValidation } from "../../domain/entities/IndicatorValidation";
import i18n from "../../locales";
import { Id } from "@eyeseetea/d2-api";

export const ProjectIndicatorsValidation = React.memo(() => {
    const { id } = useParams<Ref>();
    const { compositionRoot } = useAppContext();
    const { settings } = useGetUniqueBeneficiaries({ id, refresh: 0 });
    const loading = useLoading();
    const snackbar = useSnackbar();
    const { indicatorsValidation, setIndicatorsValidation, setRefresh } =
        useLoadIndicatorsValidations({ id });

    const saveIndicator = React.useCallback(() => {
        loading.show(true, i18n.t("Saving Indicators..."));
        compositionRoot.indicators.saveValidation
            .execute({ projectId: id, indicatorsValidations: indicatorsValidation })
            .then(() => {
                snackbar.success(i18n.t("Indicators saved"));
                setRefresh(prev => prev + 1);
            })
            .catch(err => {
                snackbar.error(err.message);
            })
            .finally(() => loading.hide());
    }, [
        compositionRoot.indicators.saveValidation,
        id,
        indicatorsValidation,
        loading,
        snackbar,
        setRefresh,
    ]);

    const updateIndicator = React.useCallback(
        (indicatorValidation: IndicatorValidation) => {
            setIndicatorsValidation(prev =>
                prev.map(indicator => {
                    return indicator.period.id === indicatorValidation.period.id
                        ? indicatorValidation
                        : indicator;
                })
            );
        },
        [setIndicatorsValidation]
    );

    if (!settings) return null;

    return (
        <div>
            <IndicatorValidationForm
                indicatorsValidation={indicatorsValidation}
                settings={settings}
                onSubmit={saveIndicator}
                onUpdateIndicator={updateIndicator}
            />
        </div>
    );
});

function useLoadIndicatorsValidations(props: { id: Id }) {
    const { id } = props;
    const { compositionRoot } = useAppContext();
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

    return { indicatorsValidation, setIndicatorsValidation, setRefresh };
}

ProjectIndicatorsValidation.displayName = "ProjectIndicatorsValidation";
