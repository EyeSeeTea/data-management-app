import React, { useState, useMemo } from "react";
import {
    ObjectsTable,
    useSnackbar,
    RowConfig,
    TableAction,
    ObjectsTableProps,
    TablePagination,
    TableColumn,
    TableSorting,
} from "@eyeseetea/d2-ui-components";
import _ from "lodash";

import DataElementsFilters, { Filter, FilterKey } from "./DataElementsFilters";
import i18n from "../../../locales";
import DataElementsSet, {
    SelectionInfo,
    DataElement as DataElement_,
} from "../../../models/dataElementsSet";
import { Id } from "../../../types/d2-api";
import { onTableChange, withPaired, getName } from "./table-utils";
import Project from "../../../models/Project";
import { SelectionMessages } from "@eyeseetea/d2-ui-components/data-table/utils/selection";

// Column names must be known to the model interface, so we need to add keys used in custom columns
export type DataElement = DataElement_ & { isCovid19?: boolean };

export interface DataElementsTableProps {
    project: Project;
    dataElementsSet: DataElementsSet;
    sectorId: Id;
    onlySelected?: boolean;
    onSelectionChange?: (dataElementIds: Id[]) => SelectionInfo;
    showGuidance?: boolean;
    columns: FieldName[];
    customColumns?: TableColumn<DataElement>[];
    actions?: TableAction<DataElement>[];
    visibleFilters?: FilterKey[];
    onSectorsMatchChange(matches: Record<Id, number | undefined>): void;
    initialFilters?: Filter;
}

const paginationOptions = {
    pageSizeOptions: [10, 20, 50, 100],
};

const initialPagination: Partial<TablePagination> = {
    pageSize: 20,
    page: 1,
};

const initialSorting: TableSorting<DataElement> = {
    field: "crossInfo",
    order: "asc" as const,
};

export type FieldName =
    | "name"
    | "code"
    | "peopleOrBenefit"
    | "series"
    | "countingMethod"
    | "externals"
    | "indicatorType";

export const sortableFields = [
    "name",
    "code",
    "peopleOrBenefit",
    "series",
    "countingMethod",
    "externals",
] as const;

export type SortableField = typeof sortableFields[number];

const searchBoxColumns = ["name" as const, "code" as const, "search" as const];

const DataElementsTable: React.FC<DataElementsTableProps> = props => {
    const {
        project,
        dataElementsSet,
        sectorId,
        onSelectionChange,
        columns: initialColumns,
        visibleFilters,
        onlySelected,
        showGuidance = true,
        customColumns,
        actions,
        onSectorsMatchChange,
        initialFilters = {},
    } = props;
    const snackbar = useSnackbar();
    const [filter, setFilter] = useState(initialFilters);

    const resetKey = { onlySelected, ...filter, sectorId };

    const dataElements = useMemo(() => {
        return dataElementsSet.get({ onlySelected, ...filter, sectorId });
    }, [dataElementsSet, onlySelected, filter, sectorId]);

    const filterOptions = useMemo(() => {
        const dataElements = dataElementsSet.get({ sectorId });
        const externals = project.getExternalKeysForDataElements(dataElements);
        return { externals };
    }, [project, dataElementsSet, sectorId]);

    const selection = useMemo(() => {
        return onSelectionChange
            ? dataElementsSet.get({ onlySelected: true, sectorId }).map(de => ({ id: de.id }))
            : undefined;
    }, [dataElementsSet, onSelectionChange, sectorId]);

    const initialState = useMemo(() => {
        return { pagination: initialPagination, sorting: initialSorting };
    }, []);

    const onChange = React.useCallback<NonNullable<ObjectsTableProps<DataElement>["onChange"]>>(
        state => {
            if (onSelectionChange) return onTableChange(onSelectionChange, snackbar, state);
        },
        [onSelectionChange, snackbar]
    );

    const filterComponents = React.useMemo(
        () => (
            <DataElementsFilters
                key="filters"
                filter={filter}
                filterOptions={filterOptions}
                onChange={setFilter}
                visibleFilters={visibleFilters}
            />
        ),
        [filter, filterOptions, setFilter, visibleFilters]
    );

    const rowConfig = React.useCallback(
        (de: DataElement): RowConfig => ({
            selectable: de.selectable,
            style: de.selectable ? undefined : { backgroundColor: "#F5DFDF" },
        }),
        []
    );

    const allColumns = React.useMemo(() => {
        const paired = dataElementsSet.arePairedGrouped;
        const columns: TableColumn<DataElement>[] = [
            {
                name: "name" as const,
                text: i18n.t("Name"),
                sortable: true,
                getValue: (de: DataElement) => getName(de, paired, showGuidance, filter),
            },
            {
                name: "code" as const,
                text: i18n.t("Code"),
                sortable: true,
                getValue: withPaired(paired, "code"),
            },
            {
                name: "indicatorType" as const,
                text: i18n.t("Indicator Type"),
                sortable: true,
                getValue: dataElement => {
                    return dataElement.indicatorType === "reportableSub"
                        ? i18n.t("reportable sub")
                        : dataElement.indicatorType;
                },
            },
            {
                name: "peopleOrBenefit" as const,
                text: i18n.t("People / Benefit"),
                sortable: true,
                getValue: withPaired(paired, "peopleOrBenefit"),
            },
            {
                name: "series" as const,
                text: i18n.t("Series"),
                sortable: true,
                getValue: withPaired(paired, "series"),
            },
            {
                name: "countingMethod" as const,
                text: i18n.t("Counting Method"),
                sortable: true,
                getValue: withPaired(paired, "countingMethod"),
            },
            {
                name: "externals" as const,
                text: i18n.t("Externals"),
                sortable: true,
                hidden: true,
                getValue: withPaired(paired, "externals", externals =>
                    _.keys(externals).join(", ")
                ),
            },
        ];
        const columnsToShow: TableColumn<DataElement>[] = _(columns)
            .keyBy(column => column.name)
            .at(initialColumns)
            .value();
        return _.concat(columnsToShow, customColumns || []);
    }, [initialColumns, customColumns, showGuidance, dataElementsSet.arePairedGrouped, filter]);

    const [textSearch, setTextSearch] = React.useState("");

    React.useEffect(() => {
        const matches = searchDataElements(
            textSearch,
            dataElementsSet.get({ onlySelected, ...filter })
        );
        onSectorsMatchChange(matches);
    }, [onlySelected, filter, dataElementsSet, onSectorsMatchChange, textSearch]);

    const selectionMessages = React.useMemo(getSelectionMessages, []);

    if (!sectorId) return null;

    return (
        <ObjectsTable<DataElement>
            selection={selection}
            rows={dataElements}
            rowConfig={rowConfig}
            forceSelectionColumn={true}
            initialState={initialState}
            columns={allColumns}
            searchBoxLabel={i18n.t("Search by name / code")}
            onChange={onChange}
            searchBoxColumns={searchBoxColumns}
            resetKey={JSON.stringify(resetKey)}
            filterComponents={filterComponents}
            actions={actions}
            paginationOptions={paginationOptions}
            onChangeSearch={setTextSearch}
            selectionMessages={selectionMessages}
        />
    );
};

function getSelectionMessages(): SelectionMessages {
    return {
        itemsInAllPages(options: { total: number }) {
            return i18n.t("There are {{total}} indicators selected in this sector.", options);
        },
        itemsSelectedInOtherPages(options: { count: number; invisible: number }) {
            return i18n.t("There are {{count}} indicators selected in this sector.", options);
        },
        allItemsSelectedInCurrentPage(_options: { total: number }) {
            return "";
        },
        selectAllItemsInAllPages(options: { total: number }) {
            return i18n.t("Select all {{total}} indicators in all pages of the sector.", options);
        },
    };
}

function searchDataElements(textSearch: string, dataElements: DataElement[]) {
    const text = textSearch.toLowerCase().trim();
    const matches = (s: string) => s.toLowerCase().includes(text);

    if (!text) {
        return {};
    } else {
        return _(dataElements)
            .filter(de => matches(de.search))
            .countBy(de => de.sector.id)
            .value();
    }
}

export default React.memo(DataElementsTable);
