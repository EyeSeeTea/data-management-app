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

type IndicatorReportTableProps = {
    period: UniqueBeneficiariesPeriod;
    report: IndicatorReportAttrs;
    onRowChange: (value: boolean, row: GroupedRows) => void;
};

export const IndicatorReportTable = React.memo((props: IndicatorReportTableProps) => {
    const { period, report, onRowChange } = props;
    const groupers: Grouper<GroupedRows>[] = React.useMemo(() => {
        return [
            {
                name: "project",
                getId: row => row.project.id,
                component: function ProjectCells(props) {
                    return <ProjectCell row={props.row} rowSpan={props.rowSpan} period={period} />;
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
    }, [onRowChange, period]);

    const indicatorsRows = report.projects.flatMap(project => {
        const sumIndicators = _(project.indicators)
            .filter(indicator => indicator.include)
            .sumBy(indicator => indicator.value || 0);
        const allIndicators = project.indicators.map((indicator): GroupedRows => {
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
        });
        return allIndicators;
    });

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
    const { rowSpan, row, period } = props;

    return (
        <TableCell rowSpan={rowSpan}>
            {row.project.name} <br /> ({buildMonthYearFormatDate(row.project.openingDate)} -{" "}
            {buildMonthYearFormatDate(row.project.closedDate)})
            <br />
            {period.name}
        </TableCell>
    );
};

const TotalCell: RowComponent<GroupedRows> = props => {
    return (
        <TableCell rowSpan={props.rowSpan}>
            {props.row.periodNotAvailable ? i18n.t("N/A") : props.row.total}
        </TableCell>
    );
};

const IndicatorCell = (props: IndicatorCellProps) => {
    const notAvailableText = i18n.t("N/A");
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
    row: GroupedRows;
    rowSpan: number | undefined;
    period: UniqueBeneficiariesPeriod;
};
