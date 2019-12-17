import React from "react";
import {
    Table,
    TableRow,
    TableHead,
    TableCell,
    TableBody,
    Paper,
    LinearProgress,
    TextField,
} from "@material-ui/core";

import MerReport, {
    staffKeys,
    StaffKey,
    StaffInfo,
    getStaffTranslations,
} from "../../models/MerReport";
import i18n from "../../locales";

interface StaffTableProps {
    merReport: MerReport;
    onChange(merReport: MerReport): void;
}

const StaffTable: React.FC<StaffTableProps> = props => {
    const { merReport, onChange } = props;
    const { date, organisationUnit } = merReport.data;
    if (!date || !organisationUnit) return null;
    const translations = React.useMemo(() => getStaffTranslations(), []);

    function onTimeChange(staffKey: StaffKey, staffInfo: StaffInfo): void {
        onChange(merReport.setStaffHours(staffKey, staffInfo));
    }

    if (!merReport || !merReport.data.projectsData) return <LinearProgress />;

    return (
        <Table style={{ width: "40vw" }}>
            <TableHead>
                <TableRow>
                    <TableCell style={{ width: "10em" }}></TableCell>
                    <TableCell style={{ width: "3em" }}>{i18n.t("Full-time")}</TableCell>
                    <TableCell style={{ width: "3em" }}>{i18n.t("Part-time")}</TableCell>
                    <TableCell style={{ width: "3em" }}>{i18n.t("Total")}</TableCell>
                </TableRow>
            </TableHead>

            <TableBody>
                {staffKeys.map(key => {
                    const staff = merReport.data.staffSummary[key];
                    const total = (staff.fullTime || 0) + (staff.partTime || 0);
                    return (
                        <TableRow key={key}>
                            <TableCell>{translations[key]}</TableCell>
                            <TableCell>
                                <TextField
                                    value={staff.fullTime.toString()}
                                    type="number"
                                    onChange={ev =>
                                        onTimeChange(key, {
                                            ...staff,
                                            fullTime: parseFloat(ev.target.value),
                                        })
                                    }
                                />
                            </TableCell>
                            <TableCell>
                                <TextField
                                    value={staff.partTime.toString()}
                                    type="number"
                                    onChange={ev =>
                                        onTimeChange(key, {
                                            ...staff,
                                            partTime: parseFloat(ev.target.value),
                                        })
                                    }
                                />
                            </TableCell>
                            <TableCell>{total}</TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
};

export default StaffTable;
