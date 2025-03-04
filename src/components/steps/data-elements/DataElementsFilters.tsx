import React from "react";
import { indicatorTypes, IndicatorType, PeopleOrBenefit } from "../../../models/dataElementsSet";
import Dropdown from "../../dropdown/Dropdown";
import i18n from "../../../locales";
import { Checkbox, FormControlLabel } from "@material-ui/core";
import { makeStyles } from "@material-ui/styles";
import { fromPairs } from "../../../types/utils";

interface DataElementsFiltersProps {
    filter: Filter;
    filterOptions: FilterOptions;
    onChange(newFilters: Filter): void;
    visibleFilters?: FilterKey[];
}

const filterKeys = ["indicatorType", "externals", "onlySelected"] as const;

export type FilterKey = typeof filterKeys[number];

export interface Filter {
    indicatorType?: IndicatorType;
    onlySelected?: boolean;
    external?: string;
    peopleOrBenefit?: PeopleOrBenefit;
}

export interface FilterOptions {
    externals: string[];
}

const DataElementsFilters: React.FC<DataElementsFiltersProps> = props => {
    const { filter, filterOptions, onChange, visibleFilters } = props;
    const classes = useStyles();

    const externalsOptions = filterOptions.externals.map(name => ({ value: name, text: name }));

    const isFilterVisible: Record<FilterKey, boolean> = React.useMemo(() => {
        return fromPairs(
            filterKeys.map(key => {
                const isVisible = visibleFilters ? visibleFilters.includes(key) : true;
                return [key, isVisible] as [FilterKey, boolean];
            })
        );
    }, [visibleFilters]);

    const indicatorTypesItems = indicatorTypes.map(indicator => {
        return {
            text: indicator === "reportableSub" ? i18n.t("reportable sub") : indicator,
            value: indicator,
        };
    });

    return (
        <div>
            {isFilterVisible.indicatorType && (
                <Dropdown
                    items={indicatorTypesItems}
                    value={filter.indicatorType}
                    onChange={value =>
                        onChange({ ...filter, indicatorType: value as IndicatorType })
                    }
                    label={i18n.t("Indicator Type")}
                />
            )}

            {isFilterVisible.externals && (
                <Dropdown
                    items={externalsOptions}
                    value={filter.external}
                    onChange={newExternal => onChange({ ...filter, external: newExternal })}
                    label={i18n.t("Funder")}
                />
            )}

            {isFilterVisible.onlySelected && (
                <FormControlLabel
                    label={i18n.t("Selected Indicators")}
                    className={classes.checkbox}
                    control={
                        <Checkbox
                            checked={!!filter.onlySelected}
                            onChange={ev =>
                                onChange({ ...filter, onlySelected: ev.target.checked })
                            }
                        />
                    }
                />
            )}
        </div>
    );
};

const useStyles = makeStyles({
    checkbox: { marginLeft: 5 },
});

export default React.memo(DataElementsFilters);
