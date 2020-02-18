import _ from "lodash";
import moment from "moment";
import { D2DataSet, D2OrganisationUnit, D2ApiResponse, MetadataPayload, Id, D2Api } from "d2-api";
import { PartialModel, Ref, PartialPersistedModel, MetadataResponse } from "d2-api";
import Project, { getOrgUnitDatesFromProject, getDatesFromOrgUnit, DataSetType } from "./Project";
import { getMonthsRange, toISOString } from "../utils/date";
import "../utils/lodash-mixins";
import ProjectDashboard from "./ProjectDashboard";
import { getUid, getDataStore, getIds } from "../utils/dhis2";
import { Config } from "./Config";
import { runPromises } from "../utils/promises";
import DataElementsSet from "./dataElementsSet";
import { ProjectInfo, getProjectStorageKey } from "./MerReport";

const expiryDaysInMonthActual = 10;

type OpenProperties = "dataInputPeriods" | "openFuturePeriods" | "expiryDays";
export type DataSetOpenAttributes = Pick<D2DataSet, OpenProperties>;

export default class ProjectDb {
    api: D2Api;
    config: Config;

    constructor(public project: Project) {
        this.api = project.api;
        this.config = project.config;
    }

    async save() {
        const saveReponse = await this.saveMetadata();
        this.updateOrgUnit(saveReponse.response, saveReponse.orgUnit);
        return saveReponse;
    }

    async saveMetadata() {
        const { project, api, config } = this;
        const { startDate, endDate } = project;

        const validationErrors = _.flatten(_.values(await project.validate()));
        if (!_.isEmpty(validationErrors)) {
            throw new Error("Validation errors:\n" + validationErrors.join("\n"));
        } else if (!startDate || !endDate || !project.parentOrgUnit) {
            throw new Error("Invalid project state");
        }

        const baseAttributeValues = [
            { value: "true", attribute: { id: config.attributes.createdByApp.id } },
        ];

        const orgUnit = {
            id: project.id,
            name: project.name,
            displayName: project.name,
            path: project.parentOrgUnit.path + "/" + project.id,
            code: project.code,
            shortName: project.shortName,
            description: project.description,
            parent: { id: getOrgUnitId(project.parentOrgUnit) },
            ...getOrgUnitDatesFromProject(startDate, endDate),
            openingDate: toISOString(startDate.clone().subtract(1, "month")),
            closedDate: toISOString(
                endDate
                    .clone()
                    .add(1, "month")
                    .endOf("month")
            ),
            attributeValues: baseAttributeValues,
        };

        const projectWithOrgUnit = project.set("orgUnit", orgUnit);
        const dashboardsMetadata = new ProjectDashboard(projectWithOrgUnit).generate();
        const dashboard = dashboardsMetadata.dashboards[0];
        if (!dashboard) throw new Error("No dashboard defined");

        const orgUnitToSave = {
            ...orgUnit,
            attributeValues: addAttributeValue(
                orgUnit.attributeValues,
                config.attributes.projectDashboard,
                dashboard.id
            ),
        };

        const orgUnitGroupsToSave = await getOrgUnitGroups(api, project, orgUnit);

        const dataSetAttributeValues = addAttributeValue(
            baseAttributeValues,
            config.attributes.orgUnitProject,
            orgUnit.id
        );

        const dataSetTargetMetadata = this.getDataSetMetadata(orgUnit, {
            name: `${project.name} Target`,
            code: "TARGET",
            attributeValues: dataSetAttributeValues,
            workflow: { id: config.dataApprovalWorkflows.project.id },
            ...this.getDataSetOpenAttributes("target"),
        });
        const dataSetTarget = _(dataSetTargetMetadata.dataSets).getOrFail(0);

        const dataSetActualMetadata = this.getDataSetMetadata(orgUnit, {
            name: `${project.name} Actual`,
            code: "ACTUAL",
            attributeValues: dataSetAttributeValues,
            workflow: { id: config.dataApprovalWorkflows.project.id },
            ...this.getDataSetOpenAttributes("actual"),
        });
        const dataSetActual = _(dataSetActualMetadata.dataSets).getOrFail(0);

        const orgUnitsMetadata: OrgUnitsMeta = {
            organisationUnits: [orgUnitToSave],
            organisationUnitGroups: orgUnitGroupsToSave,
        };

        const payload = flattenPayloads([
            orgUnitsMetadata,
            dataSetTargetMetadata,
            dataSetActualMetadata,
            dashboardsMetadata,
        ]);

        await this.saveMERData(orgUnit.id).getData();

        const response = await this.postPayload(payload);

        const savedProject =
            response && response.status === "OK"
                ? this.project.setObj({
                      id: orgUnit.id,
                      orgUnit: orgUnit,
                      dashboard: { id: dashboard.id },
                      dataSets: { actual: dataSetActual, target: dataSetTarget },
                  })
                : this.project;

        return { orgUnit: orgUnitToSave, payload, response, project: savedProject };
    }

    async updateDataSet(dataSet: Ref, attrs: PartialModel<D2DataSet>) {
        const { dataSets } = await this.api.metadata
            .get({
                dataSets: {
                    fields: { $owner: true },
                    filter: { id: { eq: dataSet.id } },
                },
            })
            .getData();
        const dbDataSet = _(dataSets).get(0, null);

        if (dbDataSet) {
            const res = await this.api.models.dataSets.put({ ...dbDataSet, ...attrs }).getData();

            if (res.status !== "OK") throw new Error("Error saving data set");
        }
    }

    getDataSetOpenAttributes(dataSetType: DataSetType): DataSetOpenAttributes {
        const { startDate, endDate } = this.project.getDates();
        const projectOpeningDate = startDate;
        const projectClosingDate = startDate
            .clone()
            .add(1, "month")
            .endOf("month");

        switch (dataSetType) {
            case "target": {
                const targetPeriods = getMonthsRange(startDate, endDate).map(date => ({
                    period: { id: date.format("YYYYMM") },
                    openingDate: toISOString(projectOpeningDate),
                    closingDate: toISOString(projectClosingDate),
                }));

                return {
                    dataInputPeriods: targetPeriods,
                    openFuturePeriods: Math.max(endDate.diff(moment(), "month") + 1, 0),
                    expiryDays: 0,
                };
            }
            case "actual": {
                const actualPeriods = getMonthsRange(startDate, endDate).map(date => ({
                    period: { id: date.format("YYYYMM") },
                    openingDate: toISOString(projectOpeningDate),
                    closingDate: toISOString(
                        date
                            .clone()
                            .startOf("month")
                            .add(1, "month")
                            .date(expiryDaysInMonthActual)
                    ),
                }));

                return {
                    dataInputPeriods: actualPeriods,
                    openFuturePeriods: 1,
                    expiryDays: expiryDaysInMonthActual + 1,
                };
            }
        }
    }

    async postPayload(payload: Partial<MetadataPayload> & Pick<MetadataPayload, "sections">) {
        // 2.31 still has problems when updating dataSet/sections in the same payload, split in two
        const { api, project } = this;
        const sectionsPayload = _.pick(payload, ["sections"]);
        const nonSectionsPayload = _.omit(payload, ["sections"]);
        const dataSets = project.dataSets
            ? [project.dataSets.actual, project.dataSets.target]
            : null;

        const oldSections = dataSets
            ? (
                  await api.metadata
                      .get({
                          sections: {
                              fields: { id: true },
                              filter: { "dataSet.id": { in: dataSets.map(ds => ds.id) } },
                          },
                      })
                      .getData()
              ).sections
            : [];

        // Delete old sections which are not in current sectors
        const sectionsToDelete = _(oldSections)
            .differenceBy(payload.sections, section => section.id)
            .value();
        runPromises(
            sectionsToDelete.map(section => () => api.models.sections.delete(section).getData())
        );

        const response = await api.metadata
            .post(nonSectionsPayload)
            .getData()
            .catch(_err => null);

        if (!response || response.status !== "OK" || _.isEmpty(sectionsPayload)) return response;

        return api.metadata
            .post(sectionsPayload)
            .getData()
            .catch(_err => null);
    }

    saveMERData(orgUnitId: Id): D2ApiResponse<void> {
        const dataStore = getDataStore(this.project.api);
        const dataElementsForMER = this.project.dataElements.get({ onlyMERSelected: true });
        const ids = _.uniq(dataElementsForMER.map(de => de.id));
        const value: ProjectInfo = { merDataElementIds: ids };
        return dataStore.save(getProjectStorageKey({ id: orgUnitId }), value);
    }

    /*
    When we create the organisation unit using the metadata endpoint, we have two problems regarding
    the getOrganisationUnitTree.action endpoint:

    1. The version field is reset only when using the specific model endpoint, when using
        a metadata POST, the orgUnit tree in data entry is not updated.

    2. There seems to be a bug with fields odate/cdate: sometimes they will be saved as
        a long date format ("Fri Nov 08 09:49:00 GMT 2019"), instead of the correct format "YYYY-MM-DD",
        which breaks the data-entry JS code.

    Workaround: Re-save the orgUnit using a PUT /api/organisationUnits.

    This is an extra, so don't stop the saving process in case of an error.
    */
    async updateOrgUnit(
        response: MetadataResponse | null,
        orgUnit: PartialPersistedModel<D2OrganisationUnit>
    ) {
        if (response && response.status === "OK") {
            await this.project.api.models.organisationUnits
                .put(orgUnit)
                .getData()
                .then(() => true)
                .catch(() => false);
        }
    }

    getDataSetMetadata<T extends PartialPersistedModel<D2OrganisationUnit>>(
        orgUnit: T,
        baseDataSet: PartialModel<D2DataSet> & Pick<D2DataSet, "code" | OpenProperties>
    ) {
        const { project } = this;
        const dataSetId = getUid("dataSet", project.uid + baseDataSet.code);
        const dataElements = project.getSelectedDataElements();

        const dataElementsInSectors = _(dataElements)
            .filter(de => project.sectors.some(sector => sector.id === de.sectorId))
            .value();

        const dataSetElements = _.uniqBy(dataElementsInSectors, de => de.id).map(dataElement => ({
            dataSet: { id: dataSetId },
            dataElement: { id: dataElement.id },
            categoryCombo: { id: dataElement.categoryComboId },
        }));

        const sectorIdForDataElementId = _(dataElementsInSectors)
            .groupBy(de => de.id)
            .map((des, deId) => [deId, _.sortBy(des, de => (de.isMainSector ? 0 : 1))[0].sectorId])
            .fromPairs()
            .value();

        const sections0 = project.sectors.map((sector, index) => {
            const dataElementsForSector = dataElements
                .filter(de => de.sectorId === sector.id)
                .filter(de => sectorIdForDataElementId[de.id] === sector.id)
                .map(de => ({ id: de.id }));

            if (_.isEmpty(dataElementsForSector)) return null;

            return {
                id: getUid("section", project.uid + baseDataSet.code + sector.id),
                dataSet: { id: dataSetId },
                sortOrder: index,
                name: sector.displayName,
                code: sector.code + "_" + dataSetId,
                dataElements: dataElementsForSector,
                greyedFields: [],
            };
        });
        const sections = _.compact(sections0);

        const dataSet = {
            id: dataSetId,
            description: project.description,
            periodType: "Monthly",
            dataElementDecoration: true,
            renderAsTabs: true,
            categoryCombo: { id: project.config.categoryCombos.targetActual.id },
            organisationUnits: [{ id: orgUnit.id }],
            timelyDays: 0,
            formType: "DEFAULT" as const,
            ...baseDataSet,
            sections: sections.map(section => ({ id: section.id, code: section.code })),
            dataSetElements,
            code: `${orgUnit.id}_${baseDataSet.code}`,
            publicAccess: "rwrw----", // TODO: Add real permissions when defined
        };

        return { dataSets: [dataSet], sections };
    }

    static async get(api: D2Api, config: Config, id: string): Promise<Project> {
        const { organisationUnits, dataSets } = await api.metadata
            .get({
                organisationUnits: {
                    fields: {
                        id: true,
                        path: true,
                        displayName: true,
                        name: true,
                        description: true,
                        code: true,
                        openingDate: true,
                        closedDate: true,
                        parent: { id: true, displayName: true, path: true },
                        organisationUnitGroups: { id: true },
                        attributeValues: { attribute: { id: true }, value: true },
                    },
                    filter: { id: { eq: id } },
                },
                dataSets: {
                    fields: {
                        id: true,
                        code: true,
                        dataSetElements: { dataElement: { id: true }, categoryCombo: { id: true } },
                        dataInputPeriods: { period: true, openingDate: true, closingDate: true },
                        sections: { code: true },
                        openFuturePeriods: true,
                        expiryDays: true,
                    },
                    filter: { code: { $like: id } },
                },
            })
            .getData();

        const orgUnit = organisationUnits[0];
        if (!orgUnit) throw new Error("Org unit not found");

        const { projectDashboard } = config.attributes;
        const dashboardId = _(orgUnit.attributeValues)
            .map(av => (av.attribute.id === projectDashboard.id ? av.value : null))
            .compact()
            .first();

        const getDataSet = (type: DataSetType) => {
            const dataSet = _(dataSets).find(dataSet => dataSet.code.endsWith(type.toUpperCase()));
            if (!dataSet) throw new Error(`Cannot find dataset: ${type}`);
            return dataSet;
        };

        const projectDataSets = { actual: getDataSet("actual"), target: getDataSet("target") };

        const dataElementIdsForMer = await getDataElementIdsForMer(api, id);

        const code = orgUnit.code || "";
        const { startDate, endDate } = getDatesFromOrgUnit(orgUnit);
        const sectorCodes = projectDataSets.actual.sections.map(section =>
            getSectorCodeFromSectionCode(section.code)
        );
        const sectors = _(config.sectors)
            .keyBy(sector => sector.code)
            .at(sectorCodes)
            .compact()
            .value();
        const dataElementsSet = DataElementsSet.build(config);
        const dataElementsSetWithSelections = dataElementsSet
            .updateSelected(projectDataSets.actual.dataSetElements.map(dse => dse.dataElement.id))
            .updateMERSelected(dataElementIdsForMer);

        const projectData = {
            id: orgUnit.id,
            name: orgUnit.name,
            description: orgUnit.description,
            awardNumber: code.slice(2, 2 + 5),
            subsequentLettering: code.slice(0, 2),
            speedKey: code.slice(8),
            startDate: startDate,
            endDate: endDate,
            sectors: sectors,
            funders: _.intersectionBy(config.funders, orgUnit.organisationUnitGroups, "id"),
            locations: _.intersectionBy(config.locations, orgUnit.organisationUnitGroups, "id"),
            orgUnit: orgUnit,
            parentOrgUnit: orgUnit.parent,
            dataSets: projectDataSets,
            dashboard: dashboardId ? { id: dashboardId } : undefined,
            dataElements: dataElementsSetWithSelections,
        };

        const project = new Project(api, config, { ...projectData, initialData: projectData });
        return project;
    }
}

async function getDataElementIdsForMer(api: D2Api, id: string) {
    const dataStore = getDataStore(api);
    const value = await dataStore
        .get<ProjectInfo | undefined>(getProjectStorageKey({ id }))
        .getData();
    if (!value) console.error("Cannot get MER selections");
    return value ? value.merDataElementIds : [];
}

export function getSectorCodeFromSectionCode(code: string | undefined) {
    return _.initial((code || "").split("_")).join("_");
}

type OrgUnitsMeta = Pick<MetadataPayload, "organisationUnits" | "organisationUnitGroups">;

async function getOrgUnitGroups(
    api: D2Api,
    project: Project,
    orgUnit: PartialPersistedModel<D2OrganisationUnit>
) {
    /* The project may have changed funders and locations, so get also the previously related
       groups to clear them if necessary */
    const { organisationUnitGroups: prevOrgUnitGroups } = await api.metadata
        .get({
            organisationUnitGroups: {
                fields: { $owner: true },
                filter: { "organisationUnits.id": { eq: project.id } },
            },
        })
        .getData();

    const orgUnitGroupIds = new Set(getIds([...project.funders, ...project.locations]));

    const { organisationUnitGroups: newOrgUnitGroups } = await api.metadata
        .get({
            organisationUnitGroups: {
                fields: { $owner: true },
                filter: { id: { in: Array.from(orgUnitGroupIds) } },
            },
        })
        .getData();

    const orgUnitsToSave = _(prevOrgUnitGroups)
        .concat(newOrgUnitGroups)
        .uniqBy(oug => oug.id)
        .value();

    return orgUnitsToSave.map(orgUnitGroup => {
        const organisationUnits = _(orgUnitGroup.organisationUnits)
            .filter(ou => ou.id !== project.id)
            .concat(orgUnitGroupIds.has(orgUnitGroup.id) ? [{ id: orgUnit.id }] : [])
            .value();
        return { ...orgUnitGroup, organisationUnits };
    });
}

function getOrgUnitId(orgUnit: { path: string }): string {
    const id = _.last(orgUnit.path.split("/"));
    if (id) return id;
    else throw new Error(`Invalid path: ${orgUnit.path}`);
}

function addAttributeValue<Attribute extends Ref>(
    attributeValues: Array<{ attribute: Ref; value: string }>,
    attribute: Attribute,
    value: string
) {
    return attributeValues.concat([{ value, attribute: { id: attribute.id } }]);
}

export function flattenPayloads<Model extends keyof MetadataPayload>(
    payloads: Array<Partial<Pick<MetadataPayload, Model>>>
): Pick<MetadataPayload, Model> {
    const concat = <T>(value1: T[] | undefined, value2: T[]): T[] => (value1 || []).concat(value2);
    const payload = payloads.reduce(
        (payloadAcc, payload) => _.mergeWith(payloadAcc, payload, concat),
        {} as Pick<MetadataPayload, Model>
    );
    return payload as Pick<MetadataPayload, Model>;
}
