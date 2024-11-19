import _ from "lodash";
import React from "react";
import {
    ConfirmationDialog,
    Dropdown,
    useLoading,
    useSnackbar,
    DropdownItem,
} from "@eyeseetea/d2-ui-components";
import { Button, Grid, Typography } from "@material-ui/core";

import UserOrgUnits, { OrganisationUnit } from "../../components/org-units/UserOrgUnits";
import PageHeader from "../../components/page-header/PageHeader";
import { UniqueBeneficiariesPeriod } from "../../domain/entities/UniqueBeneficiariesPeriod";
import i18n from "../../locales";
import { useGoTo } from "../../router";
import { Maybe } from "../../types/utils";
import { GroupedRows, IndicatorReportTable } from "./IndicatorReportTable";
import { useAppContext } from "../../contexts/api-context";
import { IndicatorReport } from "../../domain/entities/IndicatorReport";
import { Id } from "../../domain/entities/Ref";
import { buildSpreadSheet } from "./excel-report";
import { downloadFile } from "../../utils/download";
import { useConfirmChanges } from "../report/MerReport";
import { UniqueBeneficiariesSettings } from "../../domain/entities/UniqueBeneficiariesSettings";
import { getYearsFromProject } from "../project-indicators-validation/ProjectIndicatorsValidation";

export const CountryIndicatorReport = React.memo(() => {
    const goTo = useGoTo();
    const [orgUnit, setOrgUnit] = React.useState<OrganisationUnit>();
    const [year, setYear] = React.useState<number>();
    const [selectedPeriod, setSelectedPeriod] = React.useState<UniqueBeneficiariesPeriod>();
    const { confirmIfUnsavedChanges, proceedWarning, runProceedAction, wasReportModifiedSet } =
        useConfirmChanges();
    const { indicatorsReports, settings, setIndicatorsReports } = useGetIndicatorsReport({
        countryId: orgUnit?.id,
        wasReportModifiedSet,
    });

    const saveIndicatorReport = useSaveIndicatorReport({
        countryId: orgUnit?.id,
        indicatorsReports,
        wasReportModifiedSet,
    });

    const updateOrgUnit = (orgUnit: OrganisationUnit) => {
        confirmIfUnsavedChanges(() => {
            setOrgUnit(orgUnit);
            setSelectedPeriod(undefined);
        });
    };

    const updatePeriod = (periodId: Maybe<string>) => {
        const periods = getAllPeriods(indicatorsReports);
        const period = periods.find(period => period.id === periodId);
        if (period) {
            setSelectedPeriod(period);
        }
    };

    const updateYear = (year: Maybe<string>) => {
        if (year) setYear(Number(year));
    };

    const updateReport = React.useCallback(
        (value: boolean, row: GroupedRows) => {
            if (!selectedPeriod || !year) return;

            const updatedIndicators = indicatorsReports.map(indicatorReport => {
                if (!indicatorReport.checkPeriodAndYear(selectedPeriod.id, year))
                    return indicatorReport;

                return indicatorReport.updateProjectIndicators(row.project.id, row.id, value);
            });
            setIndicatorsReports(updatedIndicators);
            wasReportModifiedSet(true);
        },
        [indicatorsReports, selectedPeriod, setIndicatorsReports, wasReportModifiedSet, year]
    );

    const indicatorReport =
        year && selectedPeriod
            ? indicatorsReports.find(report => report.checkPeriodAndYear(selectedPeriod.id, year))
            : undefined;

    const downloadReport = () => {
        if (indicatorReport && orgUnit && selectedPeriod) {
            buildSpreadSheet({
                indicatorReport,
                countryName: orgUnit.displayName,
                period: selectedPeriod,
                settings,
            }).then(downloadFile);
        }
    };

    const changePage = React.useCallback(() => {
        confirmIfUnsavedChanges(() => {
            goTo("projects");
        });
    }, [confirmIfUnsavedChanges, goTo]);

    const reportHasProjects = indicatorReport && indicatorReport.projects.length > 0;
    const titlePage = i18n.t("Country Project & Indicators");

    const years = mapYearsToItems(indicatorsReports);

    return (
        <section>
            <PageHeader title={i18n.t("Country Project & Indicators")} onBackClick={changePage} />

            <Grid container spacing={2}>
                <Grid item xs={12}>
                    <UserOrgUnits
                        onChange={updateOrgUnit}
                        selected={orgUnit}
                        selectableLevels={[1, 2]}
                        withElevation={false}
                        height={200}
                    />
                </Grid>
                <Grid item>
                    <Dropdown
                        items={mapItemsToDropdown(getAllPeriods(indicatorsReports))}
                        onChange={updatePeriod}
                        label={i18n.t("Select period")}
                        value={selectedPeriod?.id}
                        hideEmpty
                    />
                </Grid>
                <Grid item>
                    <Dropdown
                        items={years}
                        onChange={updateYear}
                        label={i18n.t("Select Year")}
                        value={year?.toString()}
                        hideEmpty
                    />
                </Grid>
                {reportHasProjects && selectedPeriod && year && (
                    <>
                        <Grid item xs={12}>
                            <IndicatorReportTable
                                report={indicatorReport}
                                onRowChange={updateReport}
                                period={selectedPeriod}
                                settings={settings}
                            />
                        </Grid>
                        <Grid item>
                            <Grid container spacing={2}>
                                <Grid item>
                                    <Button
                                        size="large"
                                        variant="contained"
                                        color="primary"
                                        onClick={() => saveIndicatorReport()}
                                    >
                                        {i18n.t("Save")}
                                    </Button>
                                </Grid>
                                <Grid item>
                                    <Button
                                        onClick={downloadReport}
                                        size="large"
                                        variant="contained"
                                        color="secondary"
                                    >
                                        {i18n.t("Download")}
                                    </Button>
                                </Grid>
                            </Grid>
                        </Grid>
                    </>
                )}
                {selectedPeriod && year && !reportHasProjects && (
                    <Typography>
                        {i18n.t("No projects found for selected period: {{period}}", {
                            nsSeparator: false,
                            period: selectedPeriod ? selectedPeriod.name : "",
                        })}
                    </Typography>
                )}
            </Grid>

            {proceedWarning.type === "visible" && (
                <ConfirmationDialog
                    isOpen
                    onSave={() => runProceedAction(proceedWarning.action)}
                    onCancel={() => runProceedAction(() => {})}
                    title={titlePage}
                    description={i18n.t(
                        "Any changes will be lost. Are you sure you want to proceed?"
                    )}
                    saveText={i18n.t("Yes")}
                    cancelText={i18n.t("No")}
                />
            )}
        </section>
    );
});

CountryIndicatorReport.displayName = "CountryIndicatorReport";

function getUniqueYearsFromProjects(indicatorsReports: IndicatorReport[]): number[] {
    return _(indicatorsReports)
        .flatMap(report =>
            report.projects.map(project => {
                return getYearsFromProject(project.project.openingDate, project.project.closedDate);
            })
        )
        .flatten()
        .uniq()
        .value();
}

function mapYearsToItems(indicatorsReports: IndicatorReport[]): DropdownItem[] {
    const years = getUniqueYearsFromProjects(indicatorsReports);
    return years.map(year => ({ text: year.toString(), value: year.toString() }));
}

function getAllPeriods(indicatorsReports: IndicatorReport[]): UniqueBeneficiariesPeriod[] {
    return _(indicatorsReports)
        .flatMap(setting => setting.period)
        .uniqBy(period => period.name)
        .value();
}

function mapItemsToDropdown(periods: UniqueBeneficiariesPeriod[]) {
    return periods.map(period => {
        return { text: period.name, value: period.id };
    });
}

export function useSaveIndicatorReport(props: UseSaveCountryReportProps) {
    const { compositionRoot } = useAppContext();
    const { countryId, indicatorsReports: reports, wasReportModifiedSet } = props;
    const snackbar = useSnackbar();
    const loading = useLoading();

    const saveIndicatorReport = React.useCallback(() => {
        if (!countryId) return;
        loading.show(true, i18n.t("Saving..."));
        compositionRoot.indicators.saveReports
            .execute({ reports, countryId })
            .then(() => {
                snackbar.success("Report saved successfully");
            })
            .catch(err => {
                snackbar.error(err.message);
            })
            .finally(() => {
                wasReportModifiedSet(false);
                loading.hide();
            });
    }, [compositionRoot, loading, snackbar, countryId, reports, wasReportModifiedSet]);

    return saveIndicatorReport;
}

export function useGetIndicatorsReport(props: {
    countryId: Maybe<Id>;
    wasReportModifiedSet: React.Dispatch<React.SetStateAction<boolean>>;
}) {
    const { countryId, wasReportModifiedSet } = props;
    const { compositionRoot } = useAppContext();
    const snackbar = useSnackbar();
    const loading = useLoading();

    const [indicatorsReports, setIndicatorsReports] = React.useState<IndicatorReport[]>([]);
    const [settings, setSettings] = React.useState<UniqueBeneficiariesSettings[]>([]);

    React.useEffect(() => {
        if (!countryId) return;
        loading.show(true, i18n.t("Loading projects and indicators..."));
        compositionRoot.projects.getByCountry
            .execute({ countryId })
            .then(result => {
                setIndicatorsReports(result.indicatorsReports);
                setSettings(result.settings);
            })
            .catch(error => snackbar.error(error.message))
            .finally(() => {
                loading.hide();
                wasReportModifiedSet(false);
            });
    }, [compositionRoot, countryId, loading, snackbar, wasReportModifiedSet]);

    return { indicatorsReports, settings, setIndicatorsReports };
}

type UseSaveCountryReportProps = {
    countryId: Maybe<Id>;
    indicatorsReports: IndicatorReport[];
    wasReportModifiedSet: React.Dispatch<React.SetStateAction<boolean>>;
};
