import _ from "lodash";
import React from "react";
import {
    Checkbox,
    Paper,
    Table,
    TableCell,
    TableFooter,
    TableHead,
    TableRow,
    Typography,
} from "@material-ui/core";
import { IndicatorReportAttrs, ProjectCountry } from "../../domain/entities/IndicatorReport";
import { Id } from "../../domain/entities/Ref";
import i18n from "../../locales";
import { Grouper, RowComponent } from "../report/rich-rows-utils";
import TableBodyGrouped from "../report/TableBodyGrouped";
import { buildMonthYearFormatDate } from "../../utils/date";
import { UniqueBeneficiariesPeriod } from "../../domain/entities/UniqueBeneficiariesPeriod";
import { UniqueBeneficiariesSettings } from "../../domain/entities/UniqueBeneficiariesSettings";
import { Maybe } from "../../types/utils";

type IndicatorReportTableProps = {
    period: UniqueBeneficiariesPeriod;
    settings: UniqueBeneficiariesSettings[];
    report: IndicatorReportAttrs;
    onRowChange: (value: boolean, row: GroupedRows) => void;
};

export const IndicatorReportTable = React.memo((props: IndicatorReportTableProps) => {
    const { onRowChange, period, report, settings } = props;
    const groupers: Grouper<GroupedRows>[] = React.useMemo(() => {
        return [
            {
                name: "project",
                getId: row => row.project.id,
                component: function ProjectCells(props) {
                    return (
                        <ProjectCell
                            row={props.row}
                            rowSpan={props.rowSpan}
                            settings={settings}
                            period={period}
                        />
                    );
                },
            },
            {
                name: "indicator",
                getId: row => [row.project.id, row.id].join("-"),
                component: function DataElementCellsForIndicator(props) {
                    return <IndicatorCell row={props.row} onRowChange={onRowChange} />;
                },
            },
            {
                name: "total",
                getId: row => [row.project.id, "total"].join("-"),
                component: TotalCell,
            },
        ];
    }, [onRowChange, period, settings]);

    const indicatorsRows = generateRows(report);

    return (
        <Paper>
            <Table stickyHeader>
                <TableHead>
                    <TableRow>
                        <TableCell>{i18n.t("Project")}</TableCell>
                        <TableCell>{i18n.t("Selected Activity Indicators")}</TableCell>
                        <TableCell>{i18n.t("Unique Beneficiaries")}</TableCell>
                        <TableCell>{i18n.t("Include?")}</TableCell>
                        <TableCell>{i18n.t("Total Unique Served")}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBodyGrouped rows={indicatorsRows} groupers={groupers} />
                <TableFooter>
                    <TableRow>
                        <TableCell colSpan={3}></TableCell>
                        <TableCell>
                            <Typography>{i18n.t("Country Unique Beneficiaries")}</Typography>
                        </TableCell>
                        <TableCell>
                            <Typography>
                                {_(indicatorsRows).sumBy(row => (row.include ? row.value : 0))}
                            </Typography>
                        </TableCell>
                    </TableRow>
                </TableFooter>
            </Table>
        </Paper>
    );
});

IndicatorReportTable.displayName = "IndicatorReportTable";

const ProjectCell = (props: ProjectCellProps) => {
    const { period, rowSpan, row, settings } = props;

    const currentPeriod = getCurrentPeriodForProject(settings, row.project.id, period);
    const periodName = `Period: ${currentPeriod?.name || getNotAvailableText()}`;

    return (
        <TableCell rowSpan={rowSpan}>
            {row.project.name} <br /> ({buildMonthYearFormatDate(row.project.openingDate)} -{" "}
            {buildMonthYearFormatDate(row.project.closedDate)})
            <br />
            {row.periodNotAvailable ? getNotAvailableText() : periodName}
        </TableCell>
    );
};

const TotalCell: RowComponent<GroupedRows> = props => {
    return (
        <TableCell rowSpan={props.rowSpan}>
            {props.row.periodNotAvailable ? getNotAvailableText() : props.row.total}
        </TableCell>
    );
};

const IndicatorCell = (props: IndicatorCellProps) => {
    const notAvailableText = getNotAvailableText();
    const isPeriodNotAvailable = props.row.periodNotAvailable;

    return (
        <>
            <TableCell>
                {props.row.name} ({props.row.code})
            </TableCell>
            <TableCell>{isPeriodNotAvailable ? notAvailableText : props.row.value}</TableCell>
            <TableCell>
                {isPeriodNotAvailable ? (
                    notAvailableText
                ) : (
                    <Checkbox
                        checked={props.row.include}
                        onChange={event => props.onRowChange(event.target.checked, props.row)}
                    />
                )}
            </TableCell>
        </>
    );
};

IndicatorCell.displayName = "IndicatorCell";
ProjectCell.displayName = "ProjectCell";

export type GroupedRows = {
    id: Id;
    code: string;
    name: string;
    value: number;
    include: boolean;
    total: number;
    project: ProjectCountry;
    periodNotAvailable: boolean;
};

type IndicatorCellProps = {
    row: GroupedRows;
    onRowChange: (value: boolean, row: GroupedRows) => void;
};

type ProjectCellProps = {
    period: UniqueBeneficiariesPeriod;
    row: GroupedRows;
    rowSpan: number | undefined;
    settings: UniqueBeneficiariesSettings[];
};

function generateRows(report: IndicatorReportAttrs): GroupedRows[] {
    return report.projects.flatMap(project => {
        const sumIndicators = _(project.indicators)
            .filter(indicator => indicator.include)
            .sumBy(indicator => indicator.value || 0);
        const allIndicators = _(project.indicators)
            .map((indicator): Maybe<GroupedRows> => {
                if (indicator.periodNotAvailable) return undefined;
                return {
                    id: indicator.indicatorId,
                    code: indicator.indicatorCode || "",
                    name: indicator.indicatorName,
                    value: indicator.value || 0,
                    include: indicator.include,
                    total: sumIndicators,
                    project: project.project,
                    periodNotAvailable: indicator.periodNotAvailable,
                };
            })
            .compact()
            .value();
        return allIndicators.length ? allIndicators : [];
    });
}

export function getCurrentPeriodForProject(
    settings: UniqueBeneficiariesSettings[],
    projectId: Id,
    period: UniqueBeneficiariesPeriod
) {
    const projectSettings = settings.find(setting => setting.projectId === projectId);
    const currentPeriod = projectSettings?.periods.find(projectPeriod =>
        projectPeriod.equalMonths(period.startDateMonth, period.endDateMonth)
    );
    return currentPeriod;
}

function getNotAvailableText() {
    return i18n.t("N/A");
}
