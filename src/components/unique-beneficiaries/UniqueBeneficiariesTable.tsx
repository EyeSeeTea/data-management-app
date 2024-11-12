import { ObjectsList, useObjectsTable, TableConfig } from "@eyeseetea/d2-ui-components";
import DeleteIcon from "@material-ui/icons/Delete";
import EditIcon from "@material-ui/icons/Edit";
import React from "react";
import { UniqueBeneficiariesPeriod } from "../../domain/entities/UniqueBeneficiariesPeriod";
import i18n from "../../locales";
import { getMonthNameFromNumber } from "../../utils/date";

export type ActionTable = { action: "edit" | "delete" | "add"; id: string };

export type UniqueBeneficiariesTableProps = {
    onChangeAction: (options: ActionTable) => void;
    periods: UniqueBeneficiariesPeriod[];
};

export const UniqueBeneficiariesTable = React.memo((props: UniqueBeneficiariesTableProps) => {
    const { onChangeAction, periods } = props;
    const config = React.useMemo((): TableConfig<UniqueBeneficiariesPeriod> => {
        return {
            onActionButtonClick: () => {
                onChangeAction({ action: "add", id: "" });
            },
            actions: [
                {
                    name: "edit",
                    text: i18n.t("Edit"),
                    icon: <EditIcon />,
                    isActive: showAction,
                    onClick: ids => onChangeAction({ action: "edit", id: getFirstItem(ids) }),
                },
                {
                    name: "remove",
                    text: i18n.t("Delete"),
                    icon: <DeleteIcon />,
                    isActive: showAction,
                    onClick: ids => onChangeAction({ action: "delete", id: getFirstItem(ids) }),
                },
            ],
            columns: [
                {
                    name: "name",
                    text: i18n.t("Name"),
                    sortable: false,
                },
                {
                    name: "startDateMonth",
                    text: i18n.t("Start Month"),
                    sortable: false,
                    getValue: value => getMonthNameFromNumber(value.startDateMonth),
                },
                {
                    name: "endDateMonth",
                    text: i18n.t("End Month"),
                    sortable: false,
                    getValue: value => getMonthNameFromNumber(value.endDateMonth),
                },
            ],
            initialSorting: { field: "name", order: "asc" },
            paginationOptions: { pageSizeInitialValue: 100, pageSizeOptions: [100] },
        };
    }, [onChangeAction]);

    const tableConfig = useObjectsTable(
        config,
        React.useCallback(() => {
            return Promise.resolve({
                objects: periods,
                pager: { page: 1, pageCount: 1, total: periods.length, pageSize: 100 },
            });
        }, [periods])
    );

    return <ObjectsList {...tableConfig} onChangeSearch={undefined} />;
});

UniqueBeneficiariesTable.displayName = "UniqueBeneficiariesTable";

function getFirstItem(values: string[]): string {
    const value = values[0];
    if (!value) throw new Error("Value is empty");
    return value;
}

function showAction(rows: UniqueBeneficiariesPeriod[]): boolean {
    return rows.filter(row => !row.isProtected()).length === 1;
}
