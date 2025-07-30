import React from "react";
import _ from "lodash";
import {
    Table,
    TableRow,
    TableHead,
    TableCell,
    Paper,
    Tooltip,
    Typography,
    Button,
} from "@material-ui/core";

import MerReport, {
    DataElementInfo,
    ProjectForMer,
    DataElementMER,
    MerProjectStatus,
} from "../../models/MerReport";
import i18n from "../../locales";
import TableBodyGrouped from "./TableBodyGrouped";
import { Grouper, RowComponent } from "./rich-rows-utils";
import DataElementCells from "./DataElementCells";
import { Maybe } from "../../types/utils";

interface ReportDataTableProps {
    merReport: MerReport;
    onChange(merReport: MerReport): void;
}

const ReportDataTable: React.FC<ReportDataTableProps> = props => {
    const { merReport, onChange } = props;
    const { date, organisationUnit } = merReport.data;

    const onCommentChange = React.useCallback(
        (project: ProjectForMer, dataElement: DataElementInfo, comment: string): void => {
            if (merReport) onChange(merReport.setComment(project, dataElement, comment));
        },
        [merReport, onChange]
    );

    const groupers: Grouper<DataElementMER>[] = React.useMemo(() => {
        return [
            {
                name: "locations",
                getId: dataElementMER =>
                    dataElementMER.locations.map(location => location.id).join("+"),
                component: LocationCell,
            },
            {
                name: "project",
                getId: dataElementMER => dataElementMER.project.id,
                component: ProjectCell,
            },
            {
                name: "indicator",
                getId: dataElementMER => [dataElementMER.project.id, dataElementMER.id].join("-"),
                component: function DataElementCellsForIndicator({ row: dataElementMER }) {
                    return (
                        <DataElementCells dataElement={dataElementMER} onChange={onCommentChange} />
                    );
                },
            },
        ];
    }, [onCommentChange]);

    const rows = React.useMemo(() => merReport.getData(), [merReport]);

    if (!date || !organisationUnit) return null;

    return (
        <Paper>
            <Table stickyHeader>
                <TableHead>
                    <TableRow>
                        <Cell width={15} name={i18n.t("Locations")} />
                        <Cell width={15} name={i18n.t("Project")} />
                        <Cell width={35} name={i18n.t("Indicator")} />
                        <Cell width={3} name={i18n.t("Target")} data />
                        <Cell width={3} name={i18n.t("Actual")} data />
                        <Cell width={4} name={i18n.t("Target to date")} data />
                        <Cell width={4} name={i18n.t("Actual to date")} data />
                        <Cell width={5} name={i18n.t("Achieved to date")} data />
                        <Cell width={5} name={i18n.t("Achieved to date %")} data />
                        <Cell width={30} name={i18n.t("Comment")} />
                    </TableRow>
                </TableHead>
                <TableBodyGrouped rows={rows} groupers={groupers} />
            </Table>
        </Paper>
    );
};

const Cell_: React.FC<{ name: string; width: number; data?: boolean }> = props => {
    const { name, width, data = false } = props;
    const style = React.useMemo(() => ({ width: `${width}m` }), [width]);

    const title = _.compact([
        name,
        data
            ? i18n.t("(A/U)") +
              " - " +
              i18n.t(
                  "A = Approved (data that has been validated and approved) / U = Unapproved (data that has been entered but has not yet been approved)"
              )
            : null,
    ]).join(" ");

    return (
        <TableCell title={title} style={style}>
            {name} {data ? ` ${i18n.t("(A/U)")}` : null}
        </TableCell>
    );
};

const Cell = React.memo(Cell_);

const LocationCell: RowComponent<DataElementMER> = props => {
    const { row: dataElementMER, rowSpan } = props;
    return (
        <TableCell rowSpan={rowSpan}>
            {dataElementMER.locations.map(location => location.name).join(", ")}
        </TableCell>
    );
};

const ProjectCell: RowComponent<DataElementMER> = props => {
    const { row: dataElementMER, rowSpan } = props;
    const { project } = dataElementMER;

    const goToApprovalPage = (status: Maybe<MerProjectStatus>) => {
        if (!status) return;

        if (status.actual?.isUnapproved) {
            const period = status.actual.period;
            const url = `/#/data-approval/${project.id}/actual/${period}`;
            window.open(url, "_blank");
        }

        setTimeout(() => {
            if (status.target?.isUnapproved) {
                const period = status.target.period;
                const url = `/#/data-approval/${project.id}/target/${period}`;
                window.open(url, "_blank");
            }
        }, 100);
    };

    return (
        <TableCell rowSpan={rowSpan}>
            {project.prefix} -
            {project.approvalStatus?.actual?.isUnapproved ||
            project.approvalStatus?.target?.isUnapproved ? (
                <Tooltip
                    title={i18n.t(
                        "The <Target / Actual / Target and Actual> data for the selected month in this project is currently unapproved. Click here to review and approve it on the Data Approval page (opens in a new tab)."
                    )}
                >
                    <Button
                        onClick={() => goToApprovalPage(project.approvalStatus)}
                        color="primary"
                    >
                        <Typography variant="body2">{project.name}</Typography>
                    </Button>
                </Tooltip>
            ) : (
                <Typography variant="body2">{project.name}</Typography>
            )}
            <br />
            <i>{project.dateInfo}</i>
        </TableCell>
    );
};

function shouldKeepView(prevProps: ReportDataTableProps, nextProps: ReportDataTableProps): boolean {
    return prevProps.merReport.data.projectsData === nextProps.merReport.data.projectsData;
}

export default React.memo(ReportDataTable, shouldKeepView);
