import _ from "lodash";
import React from "react";
import { useParams } from "react-router-dom";
import { useLoading, useSnackbar } from "@eyeseetea/d2-ui-components";

import { useAppContext } from "../../contexts/api-context";
import { Id, ISODateTimeString, Ref } from "../../domain/entities/Ref";
import { useGetUniqueBeneficiaries } from "../../hooks/UniqueBeneficiaries";
import { IndicatorValidationForm } from "./IndicatorValidationForm";
import { IndicatorValidation } from "../../domain/entities/IndicatorValidation";
import i18n from "../../locales";
import Project from "../../models/Project";
import { Maybe } from "../../types/utils";

export const ProjectIndicatorsValidation = React.memo(() => {
    const { id } = useParams<Ref>();
    const { compositionRoot } = useAppContext();
    const { project } = useGetProjectById({ id });
    const { settings } = useGetUniqueBeneficiaries({ id, refresh: 0 });
    const loading = useLoading();
    const snackbar = useSnackbar();
    const { indicatorsValidation, setIndicatorsValidation, setRefresh } =
        useLoadIndicatorsValidations({ project });

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
                    return indicator.checkPeriodAndYear(
                        indicatorValidation.period.id,
                        indicatorValidation.year
                    )
                        ? indicatorValidation
                        : indicator;
                })
            );
        },
        [setIndicatorsValidation]
    );

    if (!settings || !project) return null;

    const years = getYearsFromProject(
        project.startDate?.toISOString() || "",
        project.endDate?.toISOString() || ""
    );

    return (
        <div>
            <IndicatorValidationForm
                indicatorsValidation={indicatorsValidation}
                settings={settings}
                onSubmit={saveIndicator}
                onUpdateIndicator={updateIndicator}
                years={years}
            />
        </div>
    );
});

export function getYearsFromProject(
    startDate: ISODateTimeString,
    endDate: ISODateTimeString
): number[] {
    if (!startDate || !endDate) return [];
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    return _.range(startYear, endYear + 1);
}

function useGetProjectById(props: { id: Id }) {
    const { id } = props;
    const { compositionRoot } = useAppContext();
    const [project, setProject] = React.useState<Project>();

    const loading = useLoading();
    const snackbar = useSnackbar();

    React.useEffect(() => {
        loading.show(true, i18n.t("Loading Project"));
        compositionRoot.projects.getById
            .execute(id)
            .then(setProject)
            .catch(err => {
                snackbar.error(err.message);
            })
            .finally(() => loading.hide());
    }, [compositionRoot.projects.getById, id, loading, snackbar]);

    return { project };
}

function useLoadIndicatorsValidations(props: { project: Maybe<Project> }) {
    const { project } = props;
    const { compositionRoot } = useAppContext();
    const [indicatorsValidation, setIndicatorsValidation] = React.useState<IndicatorValidation[]>(
        []
    );
    const [refresh, setRefresh] = React.useState(0);
    const loading = useLoading();
    const snackbar = useSnackbar();

    React.useEffect(() => {
        if (!project) return;
        console.debug("refresh", refresh);
        loading.show(true, i18n.t("Loading Indicators..."));
        compositionRoot.indicators.getValidation
            .execute({ projectId: project.id })
            .then(setIndicatorsValidation)
            .catch(err => {
                snackbar.error(err.message);
            })
            .finally(() => loading.hide());
    }, [compositionRoot.indicators, loading, project, refresh, snackbar]);

    return { indicatorsValidation, setIndicatorsValidation, setRefresh };
}

ProjectIndicatorsValidation.displayName = "ProjectIndicatorsValidation";
