import _ from "lodash";

import { D2Api } from "../../types/d2-api";
import { Code, Id, Ref } from "../../domain/entities/Ref";
import { promiseMap } from "../../migrations/utils";
import { DataElementGroup } from "../DataElementGroup";
import { getImportModeFromOptions, SaveOptions, skipValidation } from "../SaveOptions";
import { getId } from "../../utils/dhis2";
import { Identifiable } from "../Ref";
import { DataElement } from "../../domain/entities/DataElement";
import { Config } from "../../models/Config";

export class D2DataElementGroup {
    constructor(private api: D2Api) {}

    async getByIdentifiables(identifiables: Identifiable[]): Promise<DataElementGroup[]> {
        const sectors = await promiseMap(_.chunk(identifiables, 50), async codesToFilter => {
            const data = await this.api.models.dataElementGroups
                .get({ fields: fields, filter: { identifiable: { in: codesToFilter } } })
                .getData();

            return data.objects.map(d2DataElementGroup => ({ ...d2DataElementGroup }));
        });

        return _(sectors).flatten().value();
    }

    async save(
        dataElementGroupsIds: Id[],
        dataElementGroups: DataElementGroup[],
        dataElements: DataElement[],
        options: SaveOptions,
        config: Config
    ): Promise<object> {
        const groupsType1 = await this.getGroupSetType(config);
        const groupTypes1ToUpdate = await this.removeDataElementsFromOtherTypes1(
            groupsType1,
            dataElementGroups
        );

        const dataElementGroupsImported = await promiseMap(
            _.chunk(dataElementGroupsIds, 100),
            async dataElementGroupIds => {
                const response = await this.api.models.dataElementGroups
                    .get({
                        fields: { $owner: true },
                        filter: { id: { in: dataElementGroupIds } },
                        paging: false,
                    })
                    .getData();

                const postDataElementGroups = dataElementGroupIds.map(dataElementGroupId => {
                    const existingRecord = response.objects.find(
                        d2Record => d2Record.id === dataElementGroupId
                    );
                    const dataElementGroup = dataElementGroups.find(
                        dataElement => dataElement.id === dataElementGroupId
                    );
                    if (!dataElementGroup) {
                        throw Error(`Cannot find dataElementGroup ${dataElementGroupId}`);
                    }

                    const idsToDelete = existingRecord
                        ? this.getDataElementsToDeleteFromSeries(
                              {
                                  name: existingRecord.name,
                                  dataElements: existingRecord.dataElements,
                              },
                              dataElements
                          )
                        : [];

                    const mergeDataElements = _(existingRecord?.dataElements || [])
                        .concat(dataElementGroup.dataElements)
                        .uniqBy(getId)
                        .value();

                    return {
                        ...(existingRecord || {}),
                        id: dataElementGroup.id,
                        name: dataElementGroup.name,
                        code: dataElementGroup.code,
                        shortName: dataElementGroup.shortName,
                        dataElements:
                            idsToDelete.length > 0
                                ? mergeDataElements.filter(
                                      dataElement => !idsToDelete.includes(dataElement.id)
                                  )
                                : mergeDataElements,
                    };
                });

                const importMode = getImportModeFromOptions(options.post);

                const d2Response = await this.api.metadata
                    .post(
                        { dataElementGroups: postDataElementGroups.concat(groupTypes1ToUpdate) },
                        { importMode, skipValidation: skipValidation(importMode) }
                    )
                    .getData();

                if (options.post) {
                    console.info("dataElementGroups", d2Response);
                }
                return postDataElementGroups;
            }
        );

        return _(dataElementGroupsImported).flatten().value().concat(groupTypes1ToUpdate);
    }

    private async removeDataElementsFromOtherTypes1(
        groupsType1: DataElementGroup[],
        dataElementGroups: DataElementGroup[]
    ) {
        // dataElements only can be in DEG: sub, reportableSub, custom, global (GroupSet = TYPE_1)
        // keep dataElements in current DEG and remove from others
        const groupTypeIds = groupsType1.map(getId);
        const groupIdsToRemove = _(dataElementGroups)
            .filter(deg => groupTypeIds.includes(deg.id))
            .keyBy(getId)
            .value();

        const response = await this.api.models.dataElementGroups
            .get({ fields: { $owner: true }, filter: { id: { in: groupTypeIds } }, paging: false })
            .getData();

        const result = _(groupIdsToRemove)
            .flatMap((dataElementGroup, groupId) => {
                const d2Groups = response.objects.filter(d2Record => d2Record.id !== groupId);
                const deIdsToDelete = dataElementGroup.dataElements.map(de => de.id);
                const d2GroupRemovedDataElements = _(d2Groups)
                    .map(d2Group => {
                        const existIncurrenGroup = d2Group.dataElements.some(de =>
                            deIdsToDelete.includes(de.id)
                        );
                        if (!existIncurrenGroup) return undefined;
                        const dataElementsWithoutRemoved = d2Group.dataElements.filter(
                            de => !deIdsToDelete.includes(de.id)
                        );
                        return {
                            ...d2Group,
                            dataElements: dataElementsWithoutRemoved,
                        };
                    })
                    .compact()
                    .value();

                return d2GroupRemovedDataElements;
            })
            .value();

        return result;
    }

    private async getGroupSetType(config: Config): Promise<DataElementGroup[]> {
        const groupSetResponse = await this.api.models.dataElementGroupSets
            .get({
                fields: { id: true, dataElementGroups: true },
                filter: { code: { eq: config.base.dataElementGroupSets.type1 } },
            })
            .getData();
        const firstGroupSet = groupSetResponse.objects[0];
        if (!firstGroupSet) {
            throw Error(
                `Cannot find dataElementGroupSet ${config.base.dataElementGroupSets.type1}`
            );
        }

        const groupIds = firstGroupSet.dataElementGroups.map(d2Group => d2Group.id);
        const dataElementGroups = await this.getByIdentifiables(groupIds);
        return dataElementGroups;
    }

    private getDataElementsToDeleteFromSeries(
        dataElementGroup: { name: string; dataElements: Ref[] },
        dataElements: DataElement[]
    ): Id[] {
        if (!dataElementGroup.name.startsWith("Series ")) return [];
        const allSeries = dataElements.flatMap(dataElement => dataElement.extraSectors);
        const currentSerie = allSeries.find(serie => serie.name === dataElementGroup.name);
        if (!currentSerie) return [];
        const dataElementsInSerie = _(dataElements)
            .map(dataElement => {
                const isCurrentSerie = dataElement.extraSectors.find(
                    es => es.name === currentSerie.name
                );

                if (isCurrentSerie) return undefined;
                return dataElement;
            })
            .compact()
            .value();

        const deTomRemove = _(dataElementsInSerie)
            .map(dataElement => {
                const isInOtherSerie = dataElementGroup.dataElements.find(
                    deInGroup => deInGroup.id === dataElement.id
                );
                if (!isInOtherSerie) return undefined;
                return dataElement.id;
            })
            .compact()
            .value();
        return deTomRemove;
    }

    async getByCode(code: Code): Promise<DataElementGroup> {
        const response = await this.getByIdentifiables([code]);
        const dataElementGroup = response[0];
        if (!dataElementGroup) throw Error(`Cannot find DataElementGroup: ${code}`);
        return dataElementGroup;
    }

    async remove(dataElementGroups: DataElementGroup[]): Promise<void> {
        await this.api.metadata
            .post(
                {
                    dataElementGroups: dataElementGroups.map(dataElementGroup => {
                        return { id: dataElementGroup.id };
                    }),
                },
                { importStrategy: "DELETE" }
            )
            .getData();
    }
}

const fields = { id: true, name: true, code: true, shortName: true, dataElements: true } as const;
