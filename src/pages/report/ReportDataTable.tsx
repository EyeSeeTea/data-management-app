import React from "react";
import _ from "lodash";
import {
    Table,
    TableRow,
    TableHead,
    TableCell,
    Paper,
    Tooltip,
    Button,
    Typography,
} from "@material-ui/core";

import MerReport, { DataElementInfo, ProjectForMer, DataElementMER } from "../../models/MerReport";
import i18n from "../../locales";
import TableBodyGrouped from "./TableBodyGrouped";
import { Grouper, RowComponent } from "./rich-rows-utils";
import DataElementCells from "./DataElementCells";
import Project from "../../models/Project";
import { useAppContext } from "../../contexts/api-context";
import { useGoTo } from "../../router";
import { ProjectStatus } from "../../domain/entities/ProjectStatus";

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

    const { loading, goToApprovalPage } = useGoToApprovalPage({ project });

    return (
        <TableCell rowSpan={rowSpan}>
            {project.prefix} -
            <Tooltip
                title={i18n.t(
                    "Click here to access the Data Approval page and approve unapproved data"
                )}
            >
                <Button href="#" onClick={goToApprovalPage} color="primary" disabled={loading}>
                    <Typography variant="body2">
                        {loading ? i18n.t("Searching latest unapproved period...") : project.name}
                    </Typography>
                </Button>
            </Tooltip>
            <br />
            <i>{project.dateInfo}</i>
        </TableCell>
    );
};

export function useGoToApprovalPage(props: { project: ProjectForMer }) {
    const { compositionRoot } = useAppContext();
    const { project } = props;
    const period = Project.getPreviousPeriod(project.startDate, project.endDate);
    const [loading, setLoading] = React.useState(false);
    const goTo = useGoTo();
    const dataSetType = "actual";

    const goToApprovalPage = React.useCallback(
        (event: React.MouseEvent) => {
            event.preventDefault();
            setLoading(true);
            compositionRoot.projectStatus.getBy
                .execute({ projectId: project.id, dataSetType: dataSetType })
                .then(statuses => {
                    const unapprovedPeriod = ProjectStatus.getLastUnapprovedPeriod(
                        statuses,
                        period
                    );

                    goTo("dataApproval", {
                        id: project.id,
                        period: String(unapprovedPeriod) || period,
                        dataSetType: dataSetType,
                    });
                })
                .catch(error => {
                    console.error("Error fetching project status:", error);
                    goTo("dataApproval", {
                        id: project.id,
                        period: period,
                        dataSetType: dataSetType,
                    });
                })
                .finally(() => {
                    setLoading(false);
                });
        },
        [compositionRoot, goTo, period, project]
    );

    return { loading, goToApprovalPage };
}

function shouldKeepView(prevProps: ReportDataTableProps, nextProps: ReportDataTableProps): boolean {
    return prevProps.merReport.data.projectsData === nextProps.merReport.data.projectsData;
}

export default React.memo(ReportDataTable, shouldKeepView);
