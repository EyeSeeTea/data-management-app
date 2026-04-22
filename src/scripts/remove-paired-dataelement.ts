import _ from "lodash";
import parse from "parse-typed-args";
import { promiseMap } from "../migrations/utils";
import { getConfig } from "../models/Config";
import { D2Api } from "../types/d2-api";
import fs from "fs";

async function main() {
    const parser = parse({
        opts: {
            url: {},
            auth: {},
            codes: {},
            persist: { switch: true },
        },
    });
    const { opts } = parser(process.argv);
    const { url, auth, codes, persist } = opts;

    const usage =
        "npx tsx remove-paired-dataelement --url=<DHIS2 URL> [--auth=user:pass] [--codes=deCode1,deCode2] [--persist]";
    if (!url) {
        console.error(usage);
        process.exit(1);
    }

    if (!codes || codes.length === 0) {
        console.error(usage);
        process.exit(1);
    }

    const [username, password] = auth ? auth.split(":") : ["", ""];
    const api = new D2Api({ baseUrl: url, auth: { password, username }, agent: {} });
    const config = await getConfig(api);

    // TODO: request in chunks
    const responseDes = await api.models.dataElements
        .get({
            fields: { id: true, attributeValues: { attribute: { id: true }, value: true } },
            filter: { code: { in: codes.split(",") } },
            paging: false,
        })
        .getData();

    if (responseDes.objects.length === 0) {
        console.debug("No data elements found with the provided codes");
        return;
    }

    const dataElements = responseDes.objects.map((de): DataElement => {
        return {
            id: de.id,
            pairedDataElement: de.attributeValues?.find(
                av => av.attribute.id === config.attributes.pairedDataElement.id
            )?.value,
        };
    });

    const dataElementsWithPaired = dataElements.filter(de => de.pairedDataElement);

    console.debug(`Found ${dataElementsWithPaired.length} dataElements with paired data elements`);

    const allDeIds = dataElementsWithPaired.map(de => de.id);

    const allStats = await promiseMap(_(allDeIds).chunk(100).value(), async dataElementIds => {
        const response = await api.models.dataElements
            .get({
                fields: { $owner: true },
                filter: { id: { in: dataElementIds } },
                paging: false,
            })
            .getData();

        const dataElementsToUpdate = dataElementIds.map(dataElementId => {
            const existingDe = response.objects.find(de => de.id === dataElementId);

            const dataElement = dataElementsWithPaired.find(de => de.id === dataElementId);
            if (!dataElement) {
                throw Error("Cannot find dataElement");
            }

            const newAttributeValues = existingDe?.attributeValues.map(d2Attribute => {
                if (d2Attribute.attribute.id === config.attributes.pairedDataElement.id) {
                    return {
                        ...d2Attribute,
                        value: "",
                    };
                }
                return d2Attribute;
            });

            return { ...(existingDe || {}), attributeValues: newAttributeValues };
        });

        const persistResponse = await api.metadata
            .post(
                { dataElements: dataElementsToUpdate },
                { importMode: persist ? "COMMIT" : "VALIDATE", importStrategy: "UPDATE" }
            )
            .getData();

        // @ts-ignore
        const stats = persistResponse.response.stats;
        return { stats: stats, payload: dataElementsToUpdate };
    });

    console.debug(
        "Stats: ",
        allStats.reduce(
            (acum, stat) => {
                return {
                    created: (acum.created || 0) + (stat.stats.created || 0),
                    updated: (acum.updated || 0) + (stat.stats.updated || 0),
                    deleted: (acum.deleted || 0) + (stat.stats.deleted || 0),
                    ignored: (acum.ignored || 0) + (stat.stats.ignored || 0),
                };
            },
            { created: 0, updated: 0, deleted: 0, ignored: 0 }
        )
    );

    // save payload to disk
    fs.writeFileSync(
        "data_elements_paired_dataelements.json",
        JSON.stringify(
            allStats.flatMap(stat => stat.payload),
            null,
            2
        )
    );
}

type DataElement = {
    id: string;
    pairedDataElement?: string;
};

main();
