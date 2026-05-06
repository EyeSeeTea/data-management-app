import _ from "lodash";

import { D2Api, DataValueSetsGetRequest } from "../../types/d2-api";
import i18n from "../../locales";
import { Config } from "../Config";
import { DataElementBase, PeopleOrBenefit } from "../dataElementsSet";
import { DataSet, DataSetType, ProjectBasic } from "../Project";
import { getDataValuesFromD2, getDataValueId, Id } from "./GlobalValidator";
import { DataValue, ValidationItem } from "./validator-common";

/*
    Validate that paired people/benefit indicators are filled together.

    A benefit data element may declare a `pairedDataElement` attribute pointing to
    one or more people data elements (by code). On page exit (Actual or Target
    screens), if one side of a pair has any value entered while the paired side is
    fully empty, the user must complete the pair before navigating away.
*/

type IndexedDataValues = Record<string, DataValue>;

interface IndicatorRef {
    id: Id;
    name: string;
    peopleOrBenefit: PeopleOrBenefit;
}

interface PairedIndicators {
    benefit: IndicatorRef;
    people: IndicatorRef;
}

interface Data {
    pairs: PairedIndicators[];
    dataValues: IndexedDataValues;
    period: string;
    orgUnitId: Id;
    attributeOptionComboId: Id;
}

export class PairedValidator {
    constructor(private data: Data) {}

    static async build(
        api: D2Api,
        config: Config,
        project: ProjectBasic,
        dataSetType: DataSetType,
        period: string
    ): Promise<PairedValidator> {
        if (!project.orgUnit || !project.dataSets)
            throw new Error("Cannot build PairedValidator: missing data");

        const categoryOption = config.categoryOptions[dataSetType];
        const aocId = categoryOption.categoryOptionCombos.map(coc => coc.id)[0];
        const orgUnitId = project.orgUnit.id;
        const dataSet = project.dataSets[dataSetType];

        const getSetOptions: DataValueSetsGetRequest = {
            orgUnit: [orgUnitId],
            dataSet: [dataSet.id],
            period: [period],
            attributeOptionCombo: [aocId],
        };

        const res = await api.dataValues.getSet(getSetOptions).getData();
        const dataValues = getDataValuesFromD2(res.dataValues);
        const indexedDataValues = indexDataValues(dataValues);
        const pairs = PairedValidator.getPairs(config, dataSet);

        return new PairedValidator({
            pairs,
            dataValues: indexedDataValues,
            period,
            orgUnitId,
            attributeOptionComboId: aocId,
        });
    }

    static getPairs(config: Config, dataSet: DataSet): PairedIndicators[] {
        const dataElementsById = _.keyBy(config.dataElements, de => de.id);
        const projectDataElementIds = new Set(
            dataSet.dataSetElements.map(dse => dse.dataElement.id)
        );

        const seen = new Set<string>();
        const pairs: PairedIndicators[] = [];

        for (const id of projectDataElementIds) {
            const de = dataElementsById[id];
            if (!de) continue;

            for (const pairedRef of de.pairedDataElements) {
                if (!projectDataElementIds.has(pairedRef.id)) continue;
                const pairedDe = dataElementsById[pairedRef.id];
                if (!pairedDe) continue;

                const pair = toPair(de, pairedDe);
                if (!pair) continue;

                const key = [pair.benefit.id, pair.people.id].join(":");
                if (seen.has(key)) continue;
                seen.add(key);
                pairs.push(pair);
            }
        }

        return pairs;
    }

    onSave(dataValue: DataValue): PairedValidator {
        const updated = { ...this.data.dataValues, [getDataValueId(dataValue)]: dataValue };
        return new PairedValidator({ ...this.data, dataValues: updated });
    }

    validate(): ValidationItem[] {
        const valuesByDeId = _(this.data.dataValues)
            .values()
            .groupBy(dv => dv.dataElementId)
            .value();

        const hasAnyValue = (deId: Id): boolean =>
            (valuesByDeId[deId] || []).some(dv => Boolean(dv.value && dv.value.trim()));

        return _(this.data.pairs)
            .flatMap((pair): ValidationItem[] => {
                const benefitFilled = hasAnyValue(pair.benefit.id);
                const peopleFilled = hasAnyValue(pair.people.id);

                if (benefitFilled && !peopleFilled) {
                    return [
                        {
                            level: "error",
                            message: i18n.t(
                                "Paired indicator missing values: benefit indicator {{-benefitName}} has values but its paired people indicator {{-peopleName}} is empty. Both must be filled before leaving the page.",
                                {
                                    benefitName: pair.benefit.name,
                                    peopleName: pair.people.name,
                                    nsSeparator: false,
                                }
                            ),
                        },
                    ];
                } else if (peopleFilled && !benefitFilled) {
                    return [
                        {
                            level: "error",
                            message: i18n.t(
                                "Paired indicator missing values: people indicator {{-peopleName}} has values but its paired benefit indicator {{-benefitName}} is empty. Both must be filled before leaving the page.",
                                {
                                    benefitName: pair.benefit.name,
                                    peopleName: pair.people.name,
                                    nsSeparator: false,
                                }
                            ),
                        },
                    ];
                } else {
                    return [];
                }
            })
            .value();
    }
}

function toPair(a: DataElementBase, b: DataElementBase): PairedIndicators | null {
    const aRef: IndicatorRef = { id: a.id, name: a.name, peopleOrBenefit: a.peopleOrBenefit };
    const bRef: IndicatorRef = { id: b.id, name: b.name, peopleOrBenefit: b.peopleOrBenefit };

    if (a.peopleOrBenefit === "benefit" && b.peopleOrBenefit === "people") {
        return { benefit: aRef, people: bRef };
    } else if (a.peopleOrBenefit === "people" && b.peopleOrBenefit === "benefit") {
        return { benefit: bRef, people: aRef };
    } else {
        return null;
    }
}

function indexDataValues(dataValues: DataValue[]): IndexedDataValues {
    return _(dataValues)
        .map(dv => [getDataValueId(dv), dv] as [string, DataValue])
        .fromPairs()
        .value();
}
