import _ from "lodash";
import { Id, Ref } from "../types/d2-api";

import { Config, DataElementGroupSet, BaseConfig, Metadata, CurrentUser } from "./Config";
import { Sector } from "./Config";
import i18n from "../locales";
import User from "./user";
import { fromPairs, getKeys } from "../types/utils";
import Project from "./Project";
import { splitParts } from "../utils/string";
import { ValidationError } from "../utils/validations";

/*
    Abstract list of Project data element of type DataElement. Usage:

    const dataElementsSet = await DataElements.build(api)
    const dataElements = dataElementsSet.get();
    # [... Array of data elements ...]
*/

export const indicatorTypes = ["global", "sub", "custom", "reportableSub"] as const;
export const peopleOrBenefitList = ["people", "benefit"] as const;
export const benefitDisaggregationList = ["", "new-returning"] as const;
export const internalKey = "__internal";

export type IndicatorType = typeof indicatorTypes[number];
export type PeopleOrBenefit = typeof peopleOrBenefitList[number];
export type BenefitDisaggregation = typeof benefitDisaggregationList[number];

type SectorInfo = { id: Id; series?: string };

type External = { name: string | undefined };

export type CategoryKey = keyof Config["categories"];

export interface DataElementBase {
    id: Id;
    name: string;
    code: string;
    description: string;
    sectorsInfo: SectorInfo[];
    isCrossSectoral: boolean;
    mainSector: { id: Id; name: string };
    mainSeries?: string;
    indicatorType: IndicatorType;
    peopleOrBenefit: PeopleOrBenefit;
    countingMethod: string;
    externals: Record<string, External>;
    externalsDescription: string;
    pairedDataElements: Array<{ id: Id; name: string; code: string }>;
    categoryCombo: { id: Id; displayName: string };
    selectable: boolean;
    dataElementGroups: Array<{ code: string }>;
    attributeValues: AttributeValue[];
    categories: CategoryKey[];
}

export interface DataElement extends DataElementBase {
    base: DataElementBase;
    sector: { id: Id; name: string };
    isMainSector: boolean;
    series?: string;
    pairedDataElements: DataElement[];
    search: string; // For text search (include searchable fields of paired data elements)
    crossInfo: [IsCross, isCustom, Series]; // Lexicographically sortable array so it can be used as a sorting field
}

type IsCross = string;
type isCustom = string;
type Series = string;

type SectorId = Id;
type BySector<T> = Record<SectorId, T>;

interface DataElementsData {
    dataElementsBase: DataElementBase[];
    dataElementsAllBySector: BySector<DataElement[]>;
    dataElementsBySector: BySector<DataElement[]>;
    allDataElementsByKey: Record<string, DataElement>;
    selected: BySector<Id[]>;
    groupPaired: boolean;
}

export interface SelectionInfo {
    messages?: string[];
}

export interface ProjectSelection {
    selectionInfo: SelectionInfo;
    project: Project;
}

export type GetOptions = Partial<{
    sectorId: string;
    series: string;
    indicatorType: IndicatorType;
    peopleOrBenefit: PeopleOrBenefit;
    includePaired: boolean;
    onlySelected: boolean;
    external: string;
}>;

type DataElementGroupCodes = Config["base"]["dataElementGroups"];

export default class DataElementsSet {
    constructor(private config: Config, public data: DataElementsData) {}

    validateAtLeastOneItemPerSector(sectors: Sector[]) {
        const sectorsWithSel = this.get({ onlySelected: true }).map(de => ({ id: de.sector.id }));
        const missingSectors = _(sectors)
            .differenceBy(sectorsWithSel, sector => sector.id)
            .map(sector => sector.displayName)
            .value();
        const baseMsg = i18n.t("The following sectors have no indicators selected");
        const msg = `${baseMsg}: ${missingSectors.join(", ")}`;

        return _.isEmpty(missingSectors) ? [] : [msg];
    }

    private getSelectedForSectors(projectSectors: Sector[]) {
        const sectorIds = new Set(projectSectors.map(sector => sector.id));
        return this.get({ onlySelected: true }).filter(de => sectorIds.has(de.sector.id));
    }

    validateTotalSelectedCount(
        projectSectors: Sector[],
        counts: { min: number; max: number }
    ): ValidationError {
        const selected = this.getSelectedForSectors(projectSectors);

        if (selected.length < counts.min) {
            return [i18n.t("Select at least a total of {{min}} indicators", counts)];
        } else if (selected.length > counts.max) {
            return [i18n.t("Select at most a total of {{max}} indicators", counts)];
        } else {
            return [];
        }
    }

    validateMaxSelectedBySector(projectSectors: Sector[], maxCount: number): ValidationError {
        const selected = this.getSelectedForSectors(projectSectors);
        const sectorNamesWithTooManySelections = _(selected)
            .countBy(de => de.sector.name)
            .pickBy(count => count > maxCount)
            .keys()
            .value();

        if (_.isEmpty(sectorNamesWithTooManySelections)) {
            return [];
        } else {
            const msg = i18n.t(
                "A maximum of {{n}} MER indicators can be selected per sector; too many selected for {{sectors}}",
                { n: maxCount, sectors: sectorNamesWithTooManySelections.join(", ") }
            );
            return [msg];
        }
    }

    validateMaxSectorsWithSelections(projectSectors: Sector[], maxCount: number): ValidationError {
        const selected = this.getSelectedForSectors(projectSectors);
        const sectorsCount = _(selected)
            .map(de => de.sector.id)
            .uniq()
            .size();

        if (sectorsCount <= maxCount) {
            return [];
        } else {
            const msg = i18n.t(
                "A maximum of {{max}} sectors can have MER indicators selected, but there are {{n}} sectors with MER indicators",
                { max: maxCount, n: sectorsCount }
            );
            return [msg];
        }
    }

    static async getDataElements(
        currentUser: CurrentUser,
        baseConfig: BaseConfig,
        metadata: Metadata
    ): Promise<DataElementBase[]> {
        const { dataElementGroupSets } = metadata;
        const degsCodes = baseConfig.dataElementGroupSets;
        const user = new User({ base: baseConfig, currentUser });

        const sectorsSet = getBy(dataElementGroupSets, "code", degsCodes.sector);
        const seriesSet = getBy(dataElementGroupSets, "code", degsCodes.series);
        const degCodes = baseConfig.dataElementGroups;
        const dataElementsByCode = _.keyBy(metadata.dataElements, de => de.code);
        const sectorsByCode = _.keyBy(sectorsSet.dataElementGroups, deg => deg.code);
        const d2DataElements = getDataElementsFromSet(metadata, sectorsSet);
        const sectorsByDataElementId = getGroupsByDataElementId(sectorsSet);
        const seriesByDataElementId = getGroupsByDataElementId(seriesSet);
        const groupCodesByDataElementId = getGroupCodeByDataElementId(dataElementGroupSets);
        const categoryCombosById = _.keyBy(metadata.categoryCombos, cc => cc.id);

        const dataElements = d2DataElements.map(d2DataElement => {
            const deId = d2DataElement.id;
            const sectorsInfo = getSectorsInfo(deId, sectorsByDataElementId, seriesByDataElementId);
            const attrsMap = getAttrsMap(baseConfig.attributes, d2DataElement.attributeValues);
            const { mainSector: mainSectorCode, countingMethod, pairedDataElement } = attrsMap;
            const groupCodes = groupCodesByDataElementId[deId] || new Set();
            const indicatorType = getGroupKey(groupCodes, degCodes, indicatorTypes);
            const peopleOrBenefit = getGroupKey(groupCodes, degCodes, peopleOrBenefitList);
            const deCode = d2DataElement.code;
            const isSelectable =
                indicatorType !== "custom" || user.hasRole("admin") || user.hasRole("dataReviewer");
            const name =
                d2DataElement.displayName +
                (isSelectable ? "" : ` ${i18n.t("[only for admin users]")}`);
            const pairedDataElements = getPairedDataElements(pairedDataElement, dataElementsByCode);
            const mainSector = mainSectorCode ? _(sectorsByCode).get(mainSectorCode, null) : null;
            const mainSeries = mainSector
                ? sectorsInfo.find(si => si.id === mainSector.id)?.series
                : undefined;
            const categoryCombo = categoryCombosById[d2DataElement.categoryCombo.id];

            if (!indicatorType) {
                console.error(`DataElement ${deCode} has no indicator type`);
                return null;
            } else if (!peopleOrBenefit) {
                console.error(`DataElement ${deCode} has no indicator type people/benefit`);
                return null;
            } else if (!mainSector) {
                console.error(`DataElement ${deCode} has no main sector`);
                return null;
            } else if (!categoryCombo) {
                console.error(`DataElement ${deCode} has no main sector`);
                return null;
            } else {
                const dataElement: DataElementBase = {
                    id: d2DataElement.id,
                    name: name,
                    code: d2DataElement.code,
                    ...getDescriptionFields(attrsMap.extraDataElement || ""),
                    sectorsInfo: sectorsInfo,
                    mainSector: { id: mainSector.id, name: mainSector.displayName },
                    mainSeries,
                    isCrossSectoral: sectorsInfo.length > 1,
                    indicatorType,
                    peopleOrBenefit,
                    pairedDataElements,
                    countingMethod: countingMethod || "",
                    categoryCombo: {
                        id: categoryCombo.id,
                        displayName: getCategoryComboName(categoryCombosById, categoryCombo),
                    },
                    selectable: isSelectable,
                    dataElementGroups: Array.from(groupCodes).map(code => ({ code })),
                    attributeValues: d2DataElement.attributeValues,
                    categories: getCategoryKeys(baseConfig, categoryCombo.categories),
                };
                return dataElement;
            }
        });

        return _.compact(dataElements);
    }

    static build(config: Config, options: { superSet?: DataElementsSet; groupPaired: boolean }) {
        const { superSet, groupPaired } = options;
        const dataElementsBase = config.dataElements;
        const dataElementsAllBySector = getDataElementsBySector(config, { groupPaired });
        const desBySector = getDataElementsBySectorInSet(dataElementsAllBySector, superSet);
        const allDataElementsByKey = _(config.sectors)
            .flatMap(sector => dataElementsAllBySector[sector.id])
            .keyBy(de => getDataElementKey(de.sector, de.indicatorType, de.series || ""))
            .value();

        return new DataElementsSet(config, {
            dataElementsBase,
            dataElementsAllBySector,
            dataElementsBySector: desBySector,
            allDataElementsByKey,
            selected: {},
            groupPaired,
        });
    }

    get arePairedGrouped() {
        return this.data.groupPaired;
    }

    updateSuperSet(superSet: DataElementsSet): DataElementsSet {
        return new DataElementsSet(this.config, {
            ...this.data,
            dataElementsBySector: getDataElementsBySectorInSet(
                this.data.dataElementsAllBySector,
                superSet
            ),
        });
    }

    getAllSelected(): DataElement[] {
        return this.get({ onlySelected: true, includePaired: true });
    }

    get(options: GetOptions = {}): DataElement[] {
        const { sectorId, series, onlySelected, includePaired } = options;
        const { indicatorType, peopleOrBenefit, external } = options;
        const dataElementsBySector = this.data.dataElementsBySector;
        const sectorsIds = sectorId ? [sectorId] : _.keys(dataElementsBySector);
        return _.flatMap(sectorsIds, sectorId => {
            const dataElements1: DataElement[] = _(dataElementsBySector).get(sectorId, []);
            if (_.isEqual(options, {})) return dataElements1;

            const selectedIds = new Set(this.data.selected[sectorId] || []);

            const dataElements2 = onlySelected
                ? dataElements1.filter(de => selectedIds.has(de.id))
                : dataElements1;

            const dataElements3 = includePaired
                ? _(dataElements2)
                      .flatMap(de => [de, ...de.pairedDataElements])
                      .uniqBy(de => de.id)
                      .value()
                : dataElements2;

            const dataElements4 = dataElements3.filter(
                dataElement =>
                    (!series || dataElement.series === series) &&
                    (!indicatorType || dataElement.indicatorType === indicatorType) &&
                    (!peopleOrBenefit || dataElement.peopleOrBenefit === peopleOrBenefit) &&
                    externalInDataElement(dataElement, external)
            );

            return _.sortBy(dataElements4, de => de.code);
        });
    }

    updateSelected(dataElementsBySectorId: Record<Id, Id[]>): DataElementsSet {
        return new DataElementsSet(this.config, {
            ...this.data,
            selected: { ...this.data.selected, ...dataElementsBySectorId },
        });
    }

    keepSelectionInSectors(sectors: Ref[]): DataElementsSet {
        const newSelected = _(sectors)
            .map(sector => [sector.id, this.data.selected[sector.id] || []])
            .fromPairs()
            .value();

        return new DataElementsSet(this.config, { ...this.data, selected: newSelected });
    }

    updateSelectedWithRelations(query?: { sectorId: Id; dataElementIds: string[] }): {
        selectionInfo: SelectionInfo;
        dataElements: DataElementsSet;
    } {
        const firstSectorId = _.keys(this.data.selected)[0];
        if (!query && !firstSectorId) return { selectionInfo: {}, dataElements: this };

        const { sectorId, dataElementIds: selectedIds } = query || {
            sectorId: firstSectorId,
            dataElementIds: this.data.selected[firstSectorId],
        };

        const res = this.getSelectionInfo(selectedIds, sectorId);
        const { selected, unselectable, selectionInfo } = res;

        const deInOtherSectors = this.getDataElementsInOtherSectors(selectedIds, sectorId);
        const deIdsToRemove = deInOtherSectors.map(r => r.dataElementId);
        const selectedWithOutDeInOtherSectors = _(selectedIds).difference(deIdsToRemove).value();

        const finalSelected = _(selectedWithOutDeInOtherSectors)
            .map(deId => ({ id: deId, sector: { id: sectorId } }))
            .union(selected.map(de => de))
            .union(unselectable.map(de => de))
            .groupBy(de => de.sector.id)
            .mapValues(group => group.map(o => o.id))
            .value();

        const sectorIds = _.union(_.keys(this.data.selected), _.keys(finalSelected));
        const newSelected = _(sectorIds)
            .map(sId => {
                const deIds = _(sId === sectorId ? [] : this.data.selected[sId] || [])
                    .concat(finalSelected[sId] || [])
                    .uniq()
                    .value();
                return [sId, deIds];
            })
            .fromPairs()
            .value();
        const dataElementsUpdated = this.updateSelected(newSelected);

        const selectionInfoInOtherSectors = deInOtherSectors.map(r => r.selectionMessage);

        return {
            selectionInfo: {
                messages: selectionInfo.messages?.concat(selectionInfoInOtherSectors),
            },
            dataElements: dataElementsUpdated,
        };
    }

    private getDataElementsInOtherSectors(selectedIds: string[], sectorId: string) {
        return selectedIds.flatMap(dataElementId => {
            const sectorsIds = Object.keys(this.data.selected);
            const deInOtherSectors = _(sectorsIds)
                .map(currentSectorId => {
                    if (currentSectorId === sectorId) return undefined;
                    const deIds = this.data.selected[currentSectorId];
                    const isInOtherSector = deIds.includes(dataElementId);
                    if (!isInOtherSector) return undefined;
                    const dataElement = this.data.dataElementsBySector[currentSectorId].find(
                        de => de.id === dataElementId
                    );
                    if (!dataElement) return undefined;
                    const sector =
                        this.config.sectors.find(sector => sector.id === currentSectorId)
                            ?.displayName || "";

                    return {
                        dataElementId,
                        selectionMessage: i18n.t(
                            "Indicator {{deCode}} cannot be selected because is selected in another sector ({{sector}})",
                            {
                                deCode: dataElement.code,
                                sector,
                            }
                        ),
                    };
                })
                .compact()
                .value();
            return deInOtherSectors;
        });
    }

    /*
        Given a selection/unselection action on a specific sector, return:

            - Data elements that must be automatically selected bacause of enforced relationships.
            - Data elements that cannot be unselected because of those same relationships.
            - Some info messages about the operation (useful to give feedback to the user).

        Pass an optional filter predicate to act on a subset of data elements.
    */
    getSelectionInfo(
        selectedIds: string[],
        sectorId: string,
        options: {
            filter?: (dataElementId: string) => boolean;
            autoselectionMessage?: string;
            unselectionWarningMessage?: string;
        } = {}
    ): { selected: DataElement[]; unselectable: DataElement[]; selectionInfo: SelectionInfo } {
        const newSelection = new Set(selectedIds);
        const {
            filter = (_dataElementId: string) => true,
            autoselectionMessage = i18n.t(
                "These related global indicators have been automatically selected:"
            ),
            unselectionWarningMessage = i18n.t(
                "Global indicators with selected sub-indicators cannot be unselected"
            ),
        } = options;

        const prevSelectionAll = new Set(
            this.get({ onlySelected: true })
                .map(de => de.id)
                .filter(filter)
        );
        const prevSelection = new Set(
            this.get({ sectorId, onlySelected: true })
                .map(de => de.id)
                .filter(filter)
        );
        const newRelated = _(this.data.selected)
            .flatMap((deIds, sectorId_) =>
                sectorId_ === sectorId
                    ? this.getRelated(sectorId, selectedIds)
                    : this.getRelated(sectorId_, deIds.filter(filter))
            )
            .value();
        const unselectable = newRelated.filter(
            de => de.sector.id === sectorId && prevSelection.has(de.id) && !newSelection.has(de.id)
        );
        const selected = newRelated.filter(de => !prevSelectionAll.has(de.id));
        const selectionInfo = {
            messages: [
                ...getSelectionMessage(selected, autoselectionMessage),
                ...(_.isEmpty(unselectable) ? [] : [unselectionWarningMessage]),
            ],
        };

        return { selected, unselectable, selectionInfo };
    }

    getRelated(sectorId: Id, dataElementIds: Id[]): DataElement[] {
        const { dataElementsAllBySector, allDataElementsByKey } = this.data;
        const dataElementsInSector = dataElementsAllBySector[sectorId] || [];

        const sourceDataElements = _(dataElementsInSector)
            .keyBy(de => de.id)
            .at(dataElementIds)
            .compact()
            .flatMap(de => [de, ...de.pairedDataElements])
            .uniqBy(de => de.id)
            .compact()
            .value();

        const relatedDataElements = _.flatMap(sourceDataElements, de => {
            if (de.indicatorType !== "global" && de.mainSeries && !de.mainSeries.endsWith("00")) {
                const key = getDataElementKey(de.mainSector, "global", de.mainSeries);
                return _(allDataElementsByKey).at([key]).compact().value();
            } else {
                return [];
            }
        });

        return _.uniqBy(relatedDataElements, de => de.id);
    }
}

type GroupByDataElement = Record<Id, Array<{ dataElements: Ref[] } & { id: string; code: string }>>;

function getSectorsInfo(
    dataElementId: Id,
    sectorsByDataElementId: GroupByDataElement,
    seriesByDataElementId: GroupByDataElement
): SectorInfo[] {
    const sectorsGroups = sectorsByDataElementId[dataElementId] || [];
    const seriesGroups = seriesByDataElementId[dataElementId] || null;

    // series.code = SERIES_${sectorCode}_${number}. Example: SERIES_FOOD_5002
    return sectorsGroups.map(sectorGroup => {
        const seriesGroupForSector = seriesGroups
            ? seriesGroups.find(seriesGroup => {
                  const [, sectorCode, series] = seriesGroup.code.split("_");
                  return sectorGroup.code.split("_")[1] === sectorCode ? series : null;
              })
            : undefined;

        const sectorInfo: SectorInfo = {
            id: sectorGroup.id,
            series: seriesGroupForSector ? _.last(seriesGroupForSector.code.split("_")) : undefined,
        };

        return sectorInfo;
    });
}

function getDataElementsFromSet(
    metadata: Metadata,
    sectorsSet: { dataElementGroups: Array<{ dataElements: Ref[] }> }
) {
    const dataElementsById = _.keyBy(metadata.dataElements, de => de.id);
    return _(sectorsSet.dataElementGroups)
        .flatMap(deg => deg.dataElements.map(deRef => dataElementsById[deRef.id]))
        .compact()
        .uniqBy(de => de.id)
        .value();
}

function getPairedDataElements(
    pairedDataElement: string | null,
    dataElementsByCode: Record<string, { id: Id; code: string; displayName: string }>
): Array<{ id: Id; code: string; name: string }> {
    return _((pairedDataElement || "").split(","))
        .map(s => s.trim())
        .compact()
        .map(code => {
            const de = _(dataElementsByCode).get(code, null);
            return de ? { id: de.id, code: de.code, name: de.displayName } : null;
        })
        .compact()
        .value();
}

function getGroupCodeByDataElementId(dataElementGroupSets: DataElementGroupSet[]): {
    [dataElementId: string]: Set<string>;
} {
    return _(dataElementGroupSets)
        .flatMap(degSet => degSet.dataElementGroups)
        .flatMap(deg => deg.dataElements.map(de => ({ deId: de.id, degCode: deg.code })))
        .groupBy(obj => obj.deId)
        .mapValues(objs => new Set(objs.map(obj => obj.degCode)))
        .value();
}

function getGroupKey<T extends keyof DataElementGroupCodes>(
    groupCodes: Set<string>,
    degCodes: DataElementGroupCodes,
    keys: readonly T[]
): T | undefined {
    return keys.find(key => groupCodes.has(degCodes[key]));
}

function getBy<T, K extends keyof T>(objs: T[], key: K, value: T[K]): T {
    const matchingObj = objs.find(obj => obj[key] === value);
    if (!matchingObj) {
        throw new Error(
            `Cannot get object: ${key.toString()}=${value} (${objs
                .map(obj => obj[key])
                .join(", ")})`
        );
    } else {
        return matchingObj;
    }
}

type AttributeValue = { attribute: { id: string; code: string }; value: string };

function getAttrsMap(
    attributes: BaseConfig["attributes"],
    attributeValues: AttributeValue[]
): Record<keyof BaseConfig["attributes"], string | null> {
    const valuesByAttributeCode = fromPairs(
        attributeValues.map(attributeValue => [attributeValue.attribute.code, attributeValue.value])
    );

    return fromPairs(
        getKeys(attributes).map(key => {
            const code = attributes[key];
            const value = _(valuesByAttributeCode).get(code, null);
            return [key, value];
        })
    );
}

function getDataElementsBySector(
    config: Config,
    options: { groupPaired: boolean }
): BySector<DataElement[]> {
    const { groupPaired } = options;

    const pairs = config.sectors.map(sector => {
        const allDes = _.compact(
            config.dataElements.map(dataElement => {
                const sectorInfo = dataElement.sectorsInfo.find(info => info.id === sector.id);
                if (!sectorInfo) return null;
                else
                    return {
                        ...dataElement,
                        sector: { id: sector.id, name: sector.displayName },
                        base: dataElement,
                        isMainSector: sectorInfo.id === dataElement.mainSector.id,
                        series: sectorInfo.series,
                        search: "",
                        crossInfo: [
                            dataElement.isCrossSectoral ? "1" : "0",
                            dataElement.indicatorType === "custom" ? "1" : "0",
                            _.padStart(sectorInfo.series, 6, "0"),
                        ] as DataElement["crossInfo"],
                    };
            })
        );
        const pairedDes = groupPaired ? _.flatMap(allDes, de => de.pairedDataElements) : [];
        const dataElementsById = _.keyBy(allDes, de => de.id);
        const mainDataElements = _.differenceBy(allDes, pairedDes, de => de.id);

        // Finally, add paired DataElement[] to main data elements
        const dataElements: DataElement[] = mainDataElements.map(dataElement => {
            const pairedDataElements = _(groupPaired ? dataElement.pairedDataElements : [])
                .map(de => dataElementsById[de.id])
                .compact()
                .map(pairedDe => ({ ...pairedDe, pairedDataElements: [] }))
                .value();

            // Add name/code in search field of the paired elements so we can search on the table
            const search = getSearchString([dataElement, ...pairedDataElements]);

            return { ...dataElement, pairedDataElements, search };
        });

        return [sector.id, dataElements];
    });

    return _.fromPairs(pairs);
}

function getSearchString(dataElements: DataElementBase[]): string {
    return dataElements
        .map(dataElement => {
            const externals = _(dataElement.externals)
                .values()
                .map(external => external.name)
                .join(" ");

            return [dataElement.name, dataElement.code, externals].join("\n");
        })
        .join("\n");
}

function getDataElementsBySectorInSet(
    dataElementsAllBySector: BySector<DataElement[]>,
    superSet: DataElementsSet | undefined
) {
    return superSet
        ? _(dataElementsAllBySector)
              .mapValues((dataElementsInSector, sectorId) =>
                  _.intersectionBy(
                      dataElementsInSector,
                      superSet.get({ sectorId, onlySelected: true, includePaired: true }),
                      de => de.id
                  )
              )
              .value()
        : dataElementsAllBySector;
}

function getGroupsByDataElementId<Group extends { dataElements: Array<Ref> }>(degSet: {
    dataElementGroups: Group[];
}): Record<Id, Group[]> {
    const res = _(degSet.dataElementGroups)
        .flatMap(deg => deg.dataElements.map(deRef => ({ deId: deRef.id, deg })))
        .groupBy(item => item.deId)
        .mapValues(items => items.map(item => item.deg))
        .value();
    return res;
}

function getDescriptionFields(
    extraInfo: string
): Pick<DataElementBase, "externalsDescription" | "description" | "externals"> {
    const [section1 = "", guidance = ""] = splitParts(extraInfo, "\n", 2);
    const externalsString = section1.split("Externals: ", 2)[1] || "";
    const externalsDescription = externalsString === "-" ? "" : externalsString;
    const externals = _(externalsDescription.split("|"))
        .map(part => {
            const [externalName, dataElementName] = part.trim().split(":", 2);
            return externalName.trim()
                ? ([externalName, { name: dataElementName?.trim() }] as [string, External])
                : null;
        })
        .compact()
        .fromPairs()
        .value();

    return {
        externalsDescription,
        description: guidance.trim(),
        externals,
    };
}

function getCategoryComboName(
    categoryCombosById: Record<Id, { displayName: string; code: string }>,
    categoryComboRef: Ref
) {
    const categoryCombo = _(categoryCombosById).get(categoryComboRef.id, null);
    if (categoryCombo) {
        return categoryCombo.code === "default" ? i18n.t("None") : categoryCombo.displayName;
    } else {
        return i18n.t("Unknown");
    }
}

function getDataElementKey(sector: Ref, indicatorType: IndicatorType, series: string): string {
    return [sector.id, indicatorType, series].join(".");
}

export function getSelectionMessage(dataElements: DataElement[], msg: string): string[] {
    const dataElementDescriptionList = dataElements.map(
        de => `${de.sector.name}: [${de.code}] ${de.name} (${de.indicatorType})`
    );
    return _.isEmpty(dataElementDescriptionList) ? [] : [msg, ...dataElementDescriptionList];
}

function externalInDataElement(dataElement: DataElement, external: string | undefined): boolean {
    const dataElements = [dataElement, ...dataElement.pairedDataElements];

    return (
        external === undefined ||
        (external === internalKey && _(dataElements).some(de => _.isEmpty(de.externals))) ||
        _(dataElements)
            .flatMap(de => _.keys(de.externals))
            .includes(external)
    );
}

function getCategoryKeys(config: BaseConfig, categories: Array<{ code: string }>) {
    return _(config.categories)
        .keys()
        .map(key => key as CategoryKey)
        .filter(key => _(categories).some(category => category.code === config.categories[key]))
        .value();
}

function getGlobalCode(code: string): string {
    return code.replace(/\d\d$/, "00");
}

export function getGlobal(config: Config, dataElementId: Id): DataElementBase | undefined {
    const dataElement = config.dataElements.find(de => de.id === dataElementId);

    if (!dataElement) {
        return;
    } else if (
        dataElement.indicatorType !== "sub" &&
        dataElement.indicatorType !== "reportableSub"
    ) {
        return;
    } else {
        const globalCode = getGlobalCode(dataElement.code);
        return config.dataElements.find(
            de => de.indicatorType === "global" && de.code === globalCode
        );
    }
}

export function getSubs(config: Config, dataElementId: Id): DataElementBase[] {
    const dataElement = config.dataElements.find(de => de.id === dataElementId);

    if (!dataElement) {
        return [];
    } else if (!["global", "custom"].includes(dataElement.indicatorType)) {
        return [];
    } else {
        return config.dataElements.filter(
            de =>
                isSubOrReportableIndicator(de.indicatorType) &&
                getGlobalCode(de.code) === dataElement.code
        );
    }
}

export function getDataElementName(dataElement: DataElementBase): string {
    return `[${dataElement.code}] ${dataElement.name}`;
}

export function isSubOrReportableIndicator(indicatorType: IndicatorType): Boolean {
    return indicatorType === "sub" || indicatorType === "reportableSub";
}
