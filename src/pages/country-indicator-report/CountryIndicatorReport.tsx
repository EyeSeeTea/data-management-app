import _ from "lodash";
import React from "react";
import { Dropdown, useLoading, useSnackbar } from "@eyeseetea/d2-ui-components";
import { Button, Grid, Typography } from "@material-ui/core";

import UserOrgUnits, { OrganisationUnit } from "../../components/org-units/UserOrgUnits";
import PageHeader from "../../components/page-header/PageHeader";
import { UniqueBeneficiariesPeriod } from "../../domain/entities/UniqueBeneficiariesPeriod";
import i18n from "../../locales";
import { useGoTo } from "../../router";
import { Maybe } from "../../types/utils";
import { GroupedRows, IndicatorReportTable } from "./IndicatorReportTable";
import { useAppContext } from "../../contexts/api-context";
import { getId } from "../../utils/dhis2";
import { IndicatorReport } from "../../domain/entities/IndicatorReport";
import { Id } from "../../domain/entities/Ref";
import { buildSpreadSheet } from "./excel-report";
import { downloadFile } from "../../utils/download";

export const CountryIndicatorReport = React.memo(() => {
    const goTo = useGoTo();
    const [orgUnit, setOrgUnit] = React.useState<OrganisationUnit>();
    const [selectedPeriod, setSelectedPeriod] = React.useState<UniqueBeneficiariesPeriod>();
    const { indicatorsReports, setIndicatorsReports } = useGetIndicatorsReport({
        countryId: orgUnit?.id,
    });

    const saveIndicatorReport = useSaveIndicatorReport({
        countryId: orgUnit?.id,
        indicatorsReports,
    });

    const updateSelectedOrgUnit = (orgUnit: OrganisationUnit) => {
        setOrgUnit(orgUnit);
    };

    const updatePeriod = (periodId: Maybe<string>) => {
        const periods = getUniquePeriods(indicatorsReports);
        const period = periods.find(period => period.id === periodId);
        if (period) {
            setSelectedPeriod(period);
        }
    };

    const updateReport = (value: boolean, row: GroupedRows) => {
        if (!selectedPeriod) return;

        const updatedIndicators = indicatorsReports.map(indicatorReport => {
            if (indicatorReport.period.id !== selectedPeriod.id) return indicatorReport;

            return indicatorReport.updateProjectIndicators(row.project.id, row.id, value);
        });
        setIndicatorsReports(updatedIndicators);
    };

    const indicatorReport = indicatorsReports.find(
        report => report.period.id === selectedPeriod?.id
    );

    const downloadReport = () => {
        if (indicatorReport && orgUnit) {
            console.log(indicatorReport);
            buildSpreadSheet(indicatorReport, orgUnit.displayName).then(downloadFile);
        }
    };

    const reportHasProjects = indicatorReport && indicatorReport.projects.length > 0;

    return (
        <section>
            <PageHeader
                title={i18n.t("Country Project & Indicators")}
                onBackClick={() => goTo("projects")}
            />

            <Grid container spacing={2}>
                <Grid item xs={12}>
                    <UserOrgUnits
                        onChange={updateSelectedOrgUnit}
                        selected={orgUnit}
                        selectableLevels={[1, 2]}
                        withElevation={false}
                        height={200}
                    />
                </Grid>
                <Grid item xs={12}>
                    <Dropdown
                        items={mapItemsToDropdown(getUniquePeriods(indicatorsReports))}
                        onChange={period => updatePeriod(period)}
                        label={i18n.t("Select period")}
                        value={selectedPeriod?.id}
                        hideEmpty
                    />
                </Grid>
                {reportHasProjects && (
                    <>
                        <Grid item xs={12}>
                            <IndicatorReportTable
                                report={indicatorReport}
                                onRowChange={updateReport}
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
                {selectedPeriod && !reportHasProjects && (
                    <Typography>
                        {i18n.t("No projects found for selected period: {{period}}", {
                            nsSeparator: false,
                            period: selectedPeriod ? selectedPeriod.name : "",
                        })}
                    </Typography>
                )}
            </Grid>
        </section>
    );
});

CountryIndicatorReport.displayName = "CountryIndicatorReport";

function getUniquePeriods(settings: IndicatorReport[]): UniqueBeneficiariesPeriod[] {
    return _(settings)
        .map(setting => setting.period)
        .compact()
        .uniqBy(getId)
        .value();
}

function mapItemsToDropdown(periods: UniqueBeneficiariesPeriod[]) {
    return periods.map(period => {
        return { text: period.name, value: period.id };
    });
}

export function useSaveIndicatorReport(props: UseSaveCountryReportProps) {
    const { compositionRoot } = useAppContext();
    const { countryId, indicatorsReports: reports } = props;
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
            .finally(() => loading.hide());
    }, [compositionRoot, loading, snackbar, countryId, reports]);

    return saveIndicatorReport;
}

export function useGetIndicatorsReport(props: { countryId: Maybe<Id> }) {
    const { countryId } = props;
    const { compositionRoot } = useAppContext();
    const snackbar = useSnackbar();
    const loading = useLoading();

    const [indicatorsReports, setIndicatorsReports] = React.useState<IndicatorReport[]>([]);

    React.useEffect(() => {
        if (!countryId) return;
        loading.show(true, i18n.t("Loading projects and indicators..."));
        compositionRoot.projects.getByCountry
            .execute({ countryId })
            .then(setIndicatorsReports)
            .catch(error => snackbar.error(error.message))
            .finally(() => loading.hide());
    }, [compositionRoot, countryId, loading, snackbar]);

    return { indicatorsReports, setIndicatorsReports };
}

type UseSaveCountryReportProps = { countryId: Maybe<Id>; indicatorsReports: IndicatorReport[] };
