import React, { useState } from "react";
import _ from "lodash";
import i18n from "../../locales";
import PageHeader from "../../components/page-header/PageHeader";
import { useHistory } from "react-router";
import { History } from "history";
import { DatePicker } from "d2-ui-components";
import MerReport, { MerReportData } from "../../models/MerReport";
import { useAppContext } from "../../contexts/api-context";
import UserOrgUnits from "../../components/org-units/UserOrgUnits";
import { Paper, TextField, Button } from "@material-ui/core";
import { getDevMerReport } from "../../models/dev-project";
import ReportDataTable from "./ReportDataTable";
import StaffTable from "./StaffTable";
import MerReportSpreadsheet from "../../models/MerReportSpreadsheet";
import { Moment } from "moment";

type Path = string;

function goTo(history: History, url: string) {
    history.push(url);
}

function getTranslations() {
    return {
        help: i18n.t(`Help message for MER`),
    };
}

const MerReportComponent: React.FC = () => {
    const history = useHistory();
    const goToLandingPage = () => goTo(history, "/");
    const { api, config, isDev } = useAppContext();
    const translations = getTranslations();
    const initial = isDev ? getDevMerReport() : { date: null, orgUnitPath: null };
    const [date, setDate] = useState<Moment | null>(initial.date);
    const [orgUnitPath, setOrgUnitPath] = useState<Path | null>(initial.orgUnitPath);
    const [merReport, setMerReport] = useState<MerReport | null>(null);

    React.useEffect(() => {
        if (date && orgUnitPath) {
            const selectData = { date, organisationUnit: { path: orgUnitPath } };
            MerReport.create(api, config, selectData).then(setMerReport);
        }
    }, [date, orgUnitPath]);

    function onChange<Field extends keyof MerReportData>(field: Field, val: MerReportData[Field]) {
        if (merReport) setMerReport(merReport.set(field, val));
    }

    async function download() {
        if (!merReport) return;
        const blob = await new MerReportSpreadsheet(merReport).generate();
        downloadFile("output.xlsx", blob);
    }

    return (
        <React.Fragment>
            <PageHeader
                title={i18n.t("Monthly Executive Report")}
                help={translations.help}
                onBackClick={goToLandingPage}
            />
            <Paper style={{ marginBottom: 20 }}>
                <DatePicker
                    label={i18n.t("Date")}
                    value={date ? date.toDate() : null}
                    onChange={setDate}
                    format="MMMM YYYY"
                    views={["year", "month"]}
                    style={{ marginLeft: 20 }}
                />
                <UserOrgUnits
                    onChange={paths => setOrgUnitPath(_.last(paths) || null)}
                    selected={orgUnitPath ? [orgUnitPath] : []}
                    selectableLevels={[2]}
                    withElevation={false}
                />
            </Paper>

            {merReport && (
                <React.Fragment>
                    <ReportDataTable merReport={merReport} onChange={setMerReport} />
                    <Paper>
                        <MultilineTextField
                            title={i18n.t("Executive Summary")}
                            value={merReport.data.executiveSummary}
                            onChange={value => onChange("executiveSummary", value)}
                        />
                        <MultilineTextField
                            title={i18n.t("Ministry Summary")}
                            value={merReport.data.ministrySummary}
                            onChange={value => onChange("ministrySummary", value)}
                        />
                        <StaffTable merReport={merReport} onChange={setMerReport} />
                        <MultilineTextField
                            title={i18n.t("Projected Activities for the next month")}
                            value={merReport.data.projectedActivitiesNextMonth}
                            onChange={value => onChange("projectedActivitiesNextMonth", value)}
                        />

                        <Button onClick={download}>{i18n.t("Download")}</Button>

                        <Button onClick={console.log} variant="contained">
                            {i18n.t("Save")}
                        </Button>
                    </Paper>
                </React.Fragment>
            )}
        </React.Fragment>
    );
};

function downloadFile(filename: string, blob: Blob): void {
    var element = document.createElement("a");
    element.href = window.URL.createObjectURL(blob);
    element.setAttribute("download", filename);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

const MultilineTextField: React.FC<{
    title: string;
    value: string;
    onChange(value: string): void;
}> = ({ title, value, onChange }) => {
    return (
        <div style={{ marginTop: 10, marginBottom: 10, padding: 10 }}>
            <div style={{ fontSize: "1.1em", color: "grey", marginTop: 10, marginBottom: 10 }}>
                {title}
            </div>

            <TextField
                value={value}
                multiline={true}
                fullWidth={true}
                rows={4}
                onChange={ev => onChange(ev.target.value)}
            />
        </div>
    );
};

export default MerReportComponent;
