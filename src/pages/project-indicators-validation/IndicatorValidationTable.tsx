import React from "react";
import { TextField, Tooltip, Typography } from "@material-ui/core";
import { ObjectsTable, TableConfig, useObjectsTable } from "@eyeseetea/d2-ui-components";

import {
    IndicatorCalculation,
    IndicatorCalculationAttrs,
    IndicatorCalculationKeys,
} from "../../domain/entities/IndicatorCalculation";
import i18n from "../../locales";

export type IndicatorValidationTableProps = {
    data: IndicatorCalculation[];
    onRowChange: (value: string, index: number, attributeName: IndicatorCalculationKeys) => void;
};

type IndicatorCalculationColumns = IndicatorCalculationAttrs & { total: number };

export const IndicatorValidationTable = (props: IndicatorValidationTableProps) => {
    const { data, onRowChange } = props;

    const previousValueLabel = i18n.t("Previous Value");
    const nextValueLabel = i18n.t("Next Value");

    const config = React.useMemo((): TableConfig<IndicatorCalculationColumns> => {
        return {
            actions: [],
            columns: [
                {
                    name: "code",
                    text: i18n.t("Unique Indicators"),
                    sortable: false,
                    getValue(row) {
                        const hasChanged = IndicatorCalculation.hasChanged(row);
                        const tooltipTitle = `${previousValueLabel}: ${row.previousValue} -> ${nextValueLabel}: ${row.nextValue}`;
                        return (
                            <Tooltip title={hasChanged ? tooltipTitle : ""}>
                                <Typography color={hasChanged ? "secondary" : "initial"}>
                                    {row.name} ({row.code})
                                </Typography>
                            </Tooltip>
                        );
                    },
                },
                {
                    name: "newValue",
                    text: i18n.t("New"),
                    sortable: false,
                },
                {
                    name: "editableNewValue",
                    text: i18n.t("Editable New"),
                    getValue(row) {
                        const index = data.findIndex(item => item.id === row.id);
                        return (
                            <TextField
                                autoComplete="off"
                                value={
                                    row.editableNewValue !== undefined ? row.editableNewValue : ""
                                }
                                onChange={event =>
                                    onRowChange(event.target.value, index, "editableNewValue")
                                }
                                inputProps={{ min: 0 }}
                                type="number"
                            />
                        );
                    },
                    sortable: false,
                },
                {
                    name: "returningValue",
                    text: i18n.t("Returning from previous Project"),
                    sortable: false,
                    getValue(row) {
                        const index = data.findIndex(item => item.id === row.id);
                        return (
                            <TextField
                                autoComplete="off"
                                value={row.returningValue !== undefined ? row.returningValue : ""}
                                inputProps={{ min: 0 }}
                                onChange={event => {
                                    onRowChange(event.target.value, index, "returningValue");
                                }}
                                type="number"
                            />
                        );
                    },
                },
                {
                    name: "total",
                    text: i18n.t("Total"),
                    sortable: false,
                    getValue(row) {
                        return IndicatorCalculation.getTotal(row);
                    },
                },
                {
                    name: "comment",
                    text: i18n.t("Comment"),
                    sortable: false,
                    getValue(row) {
                        const index = data.findIndex(item => item.id === row.id);
                        const hasError = IndicatorCalculation.commentIsRequired(row);
                        const errorMessage = hasError ? i18n.t("Comment is required") : "";
                        return (
                            <TextField
                                autoComplete="off"
                                value={row.comment}
                                onChange={event =>
                                    onRowChange(event.target.value, index, "comment")
                                }
                                error={hasError}
                                helperText={errorMessage}
                            />
                        );
                    },
                },
            ],
            initialSorting: { field: "id", order: "asc" },
            paginationOptions: { pageSizeInitialValue: 100, pageSizeOptions: [] },
        };
    }, [data, nextValueLabel, previousValueLabel, onRowChange]);

    const tableConfig = useObjectsTable<IndicatorCalculationColumns>(
        config,
        React.useCallback(() => {
            return Promise.resolve({
                objects: mapCalculationToTableRows(data),
                pager: { page: 1, pageCount: 1, total: data.length, pageSize: data.length },
            });
        }, [data])
    );

    return <ObjectsTable {...tableConfig} onChangeSearch={undefined} />;
};

function mapCalculationToTableRows(data: IndicatorCalculation[]): IndicatorCalculationColumns[] {
    return data.map(item => ({
        ...item,
        total: IndicatorCalculation.getTotal(item),
    }));
}

IndicatorValidationTable.displayName = "IndicatorValidationTable";
