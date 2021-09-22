import _ from "lodash";
import path from "path";
import parse from "parse-typed-args";
import fs from "fs";
import { D2Api, MetadataPick, Ref } from "../types/d2-api";
import { Config, getConfig } from "../models/Config";
import { getId, getRef } from "../utils/dhis2";

/*
On 09/2020 we have introduced optional new-benefit disaggregation for Benefig indicators. When
a change of category combo for a data element is done, the existing projects are then outdated.

This script gets all datasets and checks that is's dataSetElements have a valid disaggregation
(the one fixed by the data element + optional COVID-19). For the non-match items, generate a
metadata payload with the data sets that need to be updated.
*/

async function main() {
    const parser = parse({
        opts: {
            url: {},
            post: { switch: true },
        },
    });
    const { opts } = parser(process.argv);

    const api = new D2Api({ baseUrl: opts.url });
    const config = await getConfig(api);
    const metadata = await getMetadata(api);

    const dataSetsUpdated = metadata.dataSets.map(dataSet => {
        const dataSetElementsUpdated = dataSet.dataSetElements.map(dataSetElement => {
            return getDataSetElement(dataSet, dataSetElement, config, metadata);
        });
        const hasChanged = !_.isEqual(dataSet.dataSetElements, dataSetElementsUpdated);
        return hasChanged ? { ...dataSet, dataSetElements: dataSetElementsUpdated } : null;
    });

    const dataSetsToPost = _.compact(dataSetsUpdated);
    const filename = path.basename(__filename).replace(/\.[^/.]+$/, "") + ".json";
    const outputPath = path.join(__dirname, "data", filename);
    const payload = { dataSets: dataSetsToPost };
    const json = JSON.stringify(payload, null, 4);
    fs.writeFileSync(outputPath, json);
    console.error(`Written: ${outputPath}`);

    if (opts.post) {
        console.error(`POST: ${outputPath}`);
        const res = await api.metadata.post({ dataSets: dataSetsToPost }).getData();

        if (res.status !== "OK") {
            console.error(JSON.stringify(res, null, 4));
            throw new Error("Error on POST /metadata");
        }
    } else if (!_.isEmpty(dataSetsUpdated)) {
        console.error("Add --post to POST metadata");
    }
}

const yes = true as const;

const metadataQuery = {
    dataSets: {
        fields: {
            $owner: true,
            dataSetElements: {
                dataSet: { id: yes },
                dataElement: { id: yes },
                categoryCombo: { id: yes, name: yes, categories: { id: yes } },
            },
        },
    },
    dataElements: {
        fields: {
            id: yes,
            code: yes,
            name: yes,
            categoryCombo: { id: yes, name: yes, categories: { id: yes } },
        },
    },
    categoryCombos: {
        fields: {
            id: yes,
            name: yes,
            categories: { id: yes },
        },
    },
};

type Metadata = MetadataPick<typeof metadataQuery>;
type DataSet = Metadata["dataSets"][number];
type DataSetElement = DataSet["dataSetElements"][number];

function getMetadata(api: D2Api) {
    return api.metadata.get(metadataQuery).getData();
}

function getDataSetElement(
    dataSet: DataSet,
    dataSetElement: DataSetElement,
    config: Config,
    metadata: Metadata
) {
    const dataElementsById = _.keyBy(metadata.dataElements, getId);
    const dataElement = dataElementsById[dataSetElement.dataElement.id];
    const nonDefault = (category: Ref) => category.id !== config.categories.default.id;
    const dataSetElementCategories = dataSetElement.categoryCombo.categories.filter(nonDefault);
    const dataElementCategories = dataElement.categoryCombo.categories.filter(nonDefault);

    const areCategoriesForElementCorrect = _(dataSetElementCategories)
        .differenceBy([config.categories.covid19], getId)
        .isEqual(dataElementCategories);

    if (areCategoriesForElementCorrect) {
        return dataSetElement;
    } else {
        const isCodiv = (category: Ref) => category.id === config.categories.covid19.id;
        const hasCovidDisaggregation = _(dataSetElementCategories).some(isCodiv);
        const dataElementCategoriesWithoutCovid = _.reject(dataElementCategories, isCodiv);

        const categoriesFixed = hasCovidDisaggregation
            ? [getRef(config.categories.covid19), ...dataElementCategoriesWithoutCovid]
            : dataElementCategoriesWithoutCovid;

        const categoryComboFixed = metadata.categoryCombos.find(cc =>
            _.isEqual(cc.categories, categoriesFixed)
        );

        if (!categoryComboFixed) {
            const msg = `Cat combo not found: ${categoriesFixed.map(getId).join(", ")}`;
            throw new Error(msg);
        }

        console.log(
            `${dataSet.name}: dataElement (code=${dataElement.code}, catCombo=${dataElement.categoryCombo.name})` +
                `: ${dataSetElement.categoryCombo.name} -> ${categoryComboFixed.name}`
        );

        return { ...dataSetElement, categoryCombo: getRef(categoryComboFixed) };
    }
}

main();
