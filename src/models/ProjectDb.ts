import { Disaggregation } from "./Disaggregation";
import _ from "lodash";
import moment from "moment";
import {
    MetadataPayload,
    Id,
    D2Api,
    D2OrganisationUnitGroup,
    DataValueSetsGetRequest,
    DataValueSetsPostRequest,
    DataValueSetsPostResponse,
} from "../types/d2-api";
import { D2DataSet, D2OrganisationUnit } from "../types/d2-api";
import { PartialModel, Ref, PartialPersistedModel, MetadataResponse } from "../types/d2-api";
import Project, {
    getOrgUnitDatesFromProject,
    getDatesFromOrgUnit,
    DataSetType,
    Dashboards,
    Dashboard,
    getProjectFromOrgUnit,
} from "./Project";
import { getMonthsRange, toISOString } from "../utils/date";
import "../utils/lodash-mixins";
import ProjectDashboard from "./ProjectDashboard";
import { getUid, getDataStore, getIds, getRefs, flattenPayloads, getId } from "../utils/dhis2";
import { Config } from "./Config";
import { runPromises } from "../utils/promises";
import DataElementsSet, { DataElement } from "./dataElementsSet";
import { ProjectInfo, getProjectStorageKey, getReportStorageKey } from "./MerReport";
import ProjectSharing from "./ProjectSharing";
import { splitParts } from "../utils/string";
import CountryDashboard from "./CountryDashboard";
import { addAttributeValueToObj, addAttributeValue } from "./Attributes";
import { getSharing } from "./Sharing";
import { DashboardSourceMetadata } from "./ProjectsListDashboard";
import { promiseMap } from "../migrations/utils";
import { ProjectDocument } from "./ProjectDocument";
import { ProjectDocumentRepository } from "./ProjectDocumentRepository";

const expiryDaysInMonthActual = 10;

type OpenProperties = "dataInputPeriods" | "openFuturePeriods" | "expiryDays";
export type DataSetOpenAttributes = Pick<D2DataSet, OpenProperties>;

type ExistingDataCheck =
    | { type: "no-values" }
    | { type: "with-values"; dataElementsWithData: DataElement[] };

export type ExistingData = Omit<Extract<ExistingDataCheck, { type: "with-values" }>, "type">;
type D2DataValue = DataValueSetsPostRequest["dataValues"][number];

export interface ProjectJson {
    id: Id;
    name: string;
    metadata: MetadataPayload;
    data: Record<string, object>;
    dataValues: D2DataValue[];
}

export default class ProjectDb {
    api: D2Api;
    config: Config;

    constructor(public project: Project) {
        this.api = project.api;
        this.config = project.config;
    }

    async save() {
        return await this.saveMetadata();
    }

    async saveFiles() {
        return await this.saveDocuments();
    }

    private async getDataValues() {
        const { api, project } = this;
        const dataSetIds = _.compact([project.dataSets?.actual.id, project.dataSets?.target.id]);

        if (!project.orgUnit || _.isEmpty(dataSetIds)) return [];

        const { dataValues } = await api.dataValues
            .getSet({
                dataSet: dataSetIds,
                orgUnit: [project.orgUnit.id],
                ...dataValuesDatesGetAll,
            })
            .getData();

        return dataValues;
    }

    async checkExistingDataForRemovedDataElements(): Promise<ExistingDataCheck> {
        const { api, project, config } = this;
        const noValues: ExistingDataCheck = { type: "no-values" };

        if (!project.dataSets || !project.orgUnit || !project.id) return noValues;

        const prevProject = await ProjectDb.get(api, config, project.id);
        const prevDataElement = prevProject.getSelectedDataElements();
        const existingDataValues = await this.getDataValues();

        const intersct = _.intersection;
        const newDataElements = project.dataElementsSelection.getAllSelected().map(getId);
        const removedDataElements = _.difference(prevDataElement.map(getId), newDataElements);
        const dataElementIdsWithData = _.uniq(existingDataValues.map(dv => dv.dataElement));
        const removedDataElementIdsWithData = intersct(dataElementIdsWithData, removedDataElements);

        const removedDataElementsWithData = _(prevDataElement)
            .keyBy(getId)
            .at(removedDataElementIdsWithData)
            .compact()
            .orderBy([de => de.sector.name, de => de.code, de => de.name])
            .value();

        if (_(removedDataElementsWithData).isEmpty()) {
            return { type: "no-values" };
        } else {
            return { type: "with-values", dataElementsWithData: removedDataElementsWithData };
        }
    }

    static async fromJSON(
        api: D2Api,
        _config: Config,
        json: ProjectJson,
        orgUnitIds: Set<Id>
    ): Promise<void> {
        const { metadata } = json;

        const cleanOrgUnits = (orgUnits: Array<{ id?: Id }> | undefined) =>
            (orgUnits || []).filter(ou => ou.id && orgUnitIds.has(ou.id));

        const existingMetadata = await api.metadata
            .get({
                organisationUnitGroupSets: {
                    fields: { $owner: true },
                    filter: {
                        id: { in: _.compact(metadata.organisationUnitGroupSets.map(o => o.id)) },
                    },
                },
            })
            .getData();

        /* Remove non-existing org units from references */

        const metadata2 = {
            ...metadata,
            organisationUnitGroups: metadata.organisationUnitGroups.map(oug => {
                return { ...oug, organisationUnits: cleanOrgUnits(oug.organisationUnits) };
            }),
            organisationUnitGroupSets: metadata.organisationUnitGroupSets.map(ougSet => {
                return {
                    ...ougSet,
                    organisationUnitGroups: _.intersectionBy(
                        _.unionBy(
                            existingMetadata.organisationUnitGroupSets.find(
                                ougs_ => ougs_.id === ougSet.id
                            )?.organisationUnitGroups || [],
                            metadata.organisationUnitGroups.map(oug => ({ id: oug.id })),
                            o => o.id
                        ),
                        (ougSet.organisationUnitGroups || []).map(oug => ({ id: oug.id })),
                        o => o.id
                    ),
                };
            }),
            visualizations: metadata.visualizations.map(visualization => {
                return {
                    ...visualization,
                    organisationUnits: cleanOrgUnits(visualization.organisationUnits),
                };
            }),
        };

        const res = await postPayload(api, metadata2);
        if (!res || res.status !== "OK") throwResponseError(res, "Error importing metadata");

        const dataStore = getDataStore(api);
        await promiseMap(_.toPairs(json.data), ([key, value]) => {
            return dataStore.save(key, value).getData();
        });

        const dataValueRes = await api.dataValues
            .postSet({ force: true }, { dataValues: json.dataValues })
            .getData();
        if (dataValueRes.status !== "SUCCESS")
            throwResponseError(dataValueRes, "Error importing data values");
    }

    async toJSON(): Promise<ProjectJson> {
        const { payload: metadata, orgUnit, project } = await this.getMetadata();

        const dataStore = getDataStore(this.api);
        const countryId = project.parentOrgUnit?.id;
        if (!countryId) throw new Error();

        const reportKey = getReportStorageKey({ id: countryId });
        const reportData = dataStore.get<object>(reportKey).getData();

        const projectKey = getProjectStorageKey({ id: orgUnit.id });
        const projectData = await dataStore.get<object>(projectKey).getData();

        const data = {
            ...(reportData ? { [reportKey]: reportData } : {}),
            ...(projectData ? { [projectKey]: projectData } : {}),
        };

        const dataSetIds = _([project.dataSets?.actual, project.dataSets?.target])
            .compact()
            .sortBy()
            .reverse()
            .map(getId)
            .value();

        const { dataValues } = await this.api.dataValues
            .getSet({
                dataSet: dataSetIds,
                orgUnit: [orgUnit.id],
                startDate: "1970",
                endDate: (new Date().getFullYear() + 10).toString(),
            })
            .getData();

        return { id: orgUnit.id, name: orgUnit.name, metadata, data, dataValues };
    }

    async getMetadata() {
        const { project, api, config } = this;
        const { startDate, endDate } = project;

        const country = project.parentOrgUnit;

        const validationErrors = _.flatten(_.values(await project.validate()));
        if (!_.isEmpty(validationErrors)) {
            throw new Error("Validation errors:\n" + validationErrors.join("\n"));
        } else if (!startDate || !endDate || !project.parentOrgUnit) {
            throw new Error("Invalid project state");
        } else if (!country) {
            throw new Error("No country set");
        }

        const baseAttributeValues = [
            { value: "true", attribute: { id: config.attributes.createdByApp.id } },
        ];

        const metadata = await this.api.metadata
            .get({
                organisationUnits: {
                    fields: { attributeValues: { attribute: { id: true }, value: true } },
                    filter: { id: { eq: project.id } },
                },
            })
            .getData();

        const existingOrgUnit = metadata.organisationUnits[0];
        const name = `${project.awardNumber.trim()}${project.subsequentLettering.trim()} - ${project.name.trim()}`;

        const orgUnit = {
            id: project.id,
            created: project.created ? toISOString(project.created) : undefined,
            name: name,
            displayName: name,
            path: project.parentOrgUnit.path + "/" + project.id,
            code: project.code,
            shortName: name.slice(0, 50),
            description: project.description,
            parent: { id: getOrgUnitId(project.parentOrgUnit) },
            ...getOrgUnitDatesFromProject(startDate, endDate),
            openingDate: toISOString(startDate.clone().subtract(1, "month")),
            closedDate: toISOString(endDate.clone().add(1, "month").endOf("month")),
            attributeValues: existingOrgUnit?.attributeValues || [],
            // No sharing, permissions through user.organisationUnits
        };

        const projectWithOrgUnit = project.set("orgUnit", orgUnit);

        const dataSetActualId = getUid("dataSet", project.uid + "ACTUAL");
        const dataSetsMetadata = await this.api.metadata
            .get({
                dataSets: {
                    fields: { $owner: true },
                    filter: { id: { eq: dataSetActualId } },
                },
            })
            .getData();

        const existingDataSetActual = _.get(dataSetsMetadata.dataSets, 0, null);

        const dataSetAttributeValues = addAttributeValue(
            _.concat(existingDataSetActual?.attributeValues || [], baseAttributeValues),
            config.attributes.orgUnitProject,
            orgUnit.id
        );

        const dataSetTargetMetadata = this.getDataSetMetadata(orgUnit, {
            name: `${project.name} Target`,
            shortName: `${project.name.slice(0, 25)} [${project.id}] Target`,
            code: "TARGET",
            attributeValues: dataSetAttributeValues,
            workflow: { id: config.dataApprovalWorkflows.project.id },
            ...this.getDataSetOpenAttributes("target"),
        });
        const dataSetTarget = _(dataSetTargetMetadata.dataSets).getOrFail(0);

        const dataSetActualMetadata = this.getDataSetMetadata(orgUnit, {
            name: `${project.name} Actual`,
            shortName: `${project.name.slice(0, 25)} [${project.id}] Actual`,
            code: "ACTUAL",
            attributeValues: dataSetAttributeValues,
            workflow: { id: config.dataApprovalWorkflows.project.id },
            ...this.getDataSetOpenAttributes("actual"),
        });
        const dataSetActual = _(dataSetActualMetadata.dataSets).getOrFail(0);

        const projectMetadata = this.getProjectMetadataForDashboard(orgUnit, dataSetActual);

        const { metadata: dashboardMetadata, dashboards } = await this.getDashboardsMetadata(
            projectWithOrgUnit,
            projectMetadata
        );
        if (!dashboards.project) throw new Error("Dashboards error");

        const projectOrgUnit = addAttributeValueToObj(
            addAttributeValueToObj(orgUnit, {
                attribute: config.attributes.createdByApp,
                value: "true",
            }),
            {
                attribute: config.attributes.projectDashboard,
                value: dashboards.project.id,
            }
        );

        const orgUnitGroupsMetadata = await getOrgUnitGroupsMetadata(api, project, dashboards);

        const orgUnitsMetadata: OrgUnitsMeta = {
            organisationUnits: [projectOrgUnit],
            ...orgUnitGroupsMetadata,
        };

        const payload = flattenPayloads([
            orgUnitsMetadata,
            dataSetTargetMetadata,
            dataSetActualMetadata,
            dashboardMetadata,
        ]);

        const projectUpdated = this.project.setObj({
            id: orgUnit.id,
            orgUnit: orgUnit,
            dashboard: dashboards,
            dataSets: { actual: dataSetActual, target: dataSetTarget },
        });

        return { payload, orgUnit: projectOrgUnit, project: projectUpdated };
    }

    private async saveDocuments() {
        const projectDocumentRepository = new ProjectDocumentRepository(this.api);
        const { project } = this;
        const projectDocumentsWithSharing = project.documents.map(document => {
            return { ...document, sharing: project.sharing };
        });
        const projectDocumentsSaved = await projectDocumentRepository.saveAll(
            projectDocumentsWithSharing
        );

        await this.saveMERData(
            project.id,
            projectDocumentsSaved.filter(document => !document.markAsDeleted)
        );
    }

    async saveMetadata() {
        const { payload, orgUnit, project: projectUpdated } = await this.getMetadata();

        await this.saveDocuments();

        const response = await postPayload(this.api, payload, this.project);
        const savedProject = response && response.status === "OK" ? projectUpdated : this.project;

        await this.updateOrgUnit(response, orgUnit);

        return { payload, response, project: savedProject };
    }

    getProjectMetadataForDashboard(
        orgUnit: DashboardSourceMetadata["orgUnits"][0],
        dataSet: ReturnType<InstanceType<typeof ProjectDb>["getDataSetMetadata"]>["dataSets"][0]
    ): DashboardSourceMetadata {
        const { config } = this;
        const dataElementsById = _.keyBy(config.dataElements, de => de.id);
        // Add extra metadata to dataSetElements->dataElement, needed by dashboards generator
        const dataSets = [dataSet].map(dataSet => ({
            ...dataSet,
            dataSetElements: dataSet.dataSetElements.map(dataSetElement => ({
                ...dataSetElement,
                dataElement: dataElementsById[dataSetElement.dataElement.id],
            })),
        }));

        return { orgUnits: [orgUnit], dataSets };
    }

    async getDashboardsMetadata(
        project: Project,
        projectMetadata: DashboardSourceMetadata
    ): Promise<DashboardsMetadata> {
        const { api, config } = this;

        const projectDashboardMetadata = (
            await ProjectDashboard.buildForProject(api, config, project, projectMetadata)
        ).generate();

        const { awardNumber } = project;

        const awardNumberDashboardMetadata = (
            await ProjectDashboard.buildForAwardNumber(api, config, awardNumber, projectMetadata)
        ).generate({ minimumOrgUnits: 2 });

        if (!project.parentOrgUnit) throw new Error("No parent orgunit for country");

        const countryDashboardMetadata = (
            await CountryDashboard.build(api, config, project.parentOrgUnit.id, projectMetadata)
        ).generate();

        const metadata = flattenPayloads(
            _.compact([
                projectDashboardMetadata,
                countryDashboardMetadata,
                awardNumberDashboardMetadata,
            ])
        );

        return {
            metadata,
            dashboards: {
                project: projectDashboardMetadata.dashboards[0],
                country: countryDashboardMetadata.dashboards[0],
                awardNumber: awardNumberDashboardMetadata.dashboards[0],
            },
        };
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
            const dataSetAttrs = { ...dbDataSet, ...attrs, id: dbDataSet.id };
            const res = await this.api.models.dataSets.put(dataSetAttrs).getData();

            if (res.status !== "OK") throw new Error("Error saving data set");
        }
    }

    getDataSetOpenAttributes(dataSetType: DataSetType): DataSetOpenAttributes {
        const { startDate, endDate } = this.project.getDates();
        const now = moment();
        const projectOpeningDate = startDate;
        const projectClosingDate = startDate.clone().add(1, "month").endOf("month");
        const targetOpeningDate = moment.min(projectOpeningDate, now).startOf("day");

        switch (dataSetType) {
            case "target": {
                const targetPeriods = getMonthsRange(startDate, endDate).map(date => ({
                    period: { id: date.format("YYYYMM") },
                    openingDate: toISOString(targetOpeningDate),
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
                    openingDate: toISOString(projectOpeningDate.clone().startOf("month")),
                    closingDate: toISOString(
                        date.clone().startOf("month").add(1, "month").date(expiryDaysInMonthActual)
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

    async saveMERData(orgUnitId: Id, projectDocuments: ProjectDocument[]): Promise<void> {
        const dataStore = getDataStore(this.project.api);
        const existingData = await dataStore
            .get<ProjectInfo>(getProjectStorageKey({ id: orgUnitId }))
            .getData();

        const dataElementsForMER = this.project.dataElementsMER.get({ onlySelected: true });
        const selectedUniqueBeneficiariesIds = this.project.uniqueIndicators
            .get({ onlySelected: true })
            .map(dataElement => dataElement.id);
        const ids = _.sortBy(_.uniq(dataElementsForMER.map(de => de.id)));
        const value: ProjectInfo = {
            merDataElementIds: ids,
            uniqueBeneficiaries: {
                ...(existingData?.uniqueBeneficiaries || {}),
                indicatorsIds: selectedUniqueBeneficiariesIds,
            },
            documents: projectDocuments.map(document => document.id),
        };
        await dataStore.save(getProjectStorageKey({ id: orgUnitId }), value).getData();
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

    async updateLastUpdatedData(api: D2Api, config: Config, project: Project) {
        const dataSetRef = project.dataSets?.actual;
        if (!dataSetRef) return;

        const { dataSets } = await api.metadata
            .get({
                dataSets: {
                    fields: { $owner: true },
                    filter: { id: { eq: dataSetRef.id } },
                },
            })
            .getData();

        const dataSet = _(dataSets).get(0, null);
        if (!dataSet) return;

        if (dataSet) {
            const dataSetUpdated = addAttributeValueToObj(dataSet, {
                attribute: config.attributes.lastUpdatedData,
                value: moment().toISOString(),
            });

            const res = await api.models.dataSets.put(dataSetUpdated).getData();

            if (res.status !== "OK") console.error("Error saving data set");
        }
    }

    getDataElementsBySector() {
        const { project } = this;
        const sectorIdForDataElementId = this.getDataElementsBySectorMapping();

        return project.sectors.map(sector => {
            const dataElements = project.dataElementsSelection
                .get({ sectorId: sector.id, onlySelected: true, includePaired: true })
                .filter(de => sectorIdForDataElementId[de.id] === sector.id);
            return { sector, dataElements };
        });
    }

    getDataElementsBySectorMapping() {
        const { project } = this;
        const selectedDataElements = project.getSelectedDataElements();

        // A data element can only be in one form section, add it in the main sector
        const sectorIdForDataElementId = _(selectedDataElements)
            .groupBy(de => de.id)
            .map((des, deId) => {
                const sortedSectors = _.sortBy(des, de => (de.isMainSector ? 0 : 1));
                return [deId, sortedSectors[0].sector.id] as [Id, Id];
            })
            .fromPairs()
            .value();

        return sectorIdForDataElementId;
    }

    getDataSetMetadata<T extends PartialPersistedModel<D2OrganisationUnit>>(
        orgUnit: T,
        baseDataSet: PartialModel<D2DataSet> & Pick<D2DataSet, "code" | OpenProperties>
    ) {
        const { config, project } = this;
        const dataSetId = getUid("dataSet", project.uid + baseDataSet.code);
        const selectedDataElements = project.getSelectedDataElements();

        const dataSetElements = _.uniqBy(selectedDataElements, de => de.id).map(dataElement => ({
            dataSet: { id: dataSetId },
            dataElement: { id: dataElement.id },
            categoryCombo: project.disaggregation.getCategoryCombo(dataElement.id),
        }));

        const sections0 = this.getDataElementsBySector().map(({ sector, dataElements }, index) => {
            if (_.isEmpty(dataElements)) return null;

            return {
                id: getUid("section", project.uid + baseDataSet.code + sector.id),
                dataSet: { id: dataSetId },
                sortOrder: index,
                name: sector.displayName,
                code: sector.code + "_" + dataSetId,
                dataElements: getRefs(dataElements),
                greyedFields: [],
            };
        });
        const sections = _.compact(sections0);
        const projectSharing = new ProjectSharing(config, project);

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
            ...projectSharing.getSharingAttributesForDataSets(),
        };

        return { dataSets: [dataSet], sections };
    }

    static getCodeInfo(code: string) {
        const [code1 = "", code2 = ""] = splitParts(code, "-", 2);
        return {
            awardNumber: code1.slice(0, 5),
            subsequentLettering: code1.slice(5),
            additional: code2,
        };
    }

    static async get(api: D2Api, config: Config, id: string): Promise<Project> {
        const attributeValues = { attribute: { id: true }, value: true } as const;

        const { organisationUnits, dataSets } = await api.metadata
            .get({
                organisationUnits: {
                    fields: {
                        id: true,
                        created: true,
                        path: true,
                        displayName: true,
                        name: true,
                        description: true,
                        code: true,
                        openingDate: true,
                        closedDate: true,
                        parent: {
                            id: true,
                            name: true,
                            displayName: true,
                            path: true,
                            attributeValues,
                        },
                        organisationUnitGroups: {
                            id: true,
                            name: true,
                            attributeValues,
                            groupSets: { id: true },
                        },
                        attributeValues,
                    },
                    filter: { id: { eq: id } },
                },
                dataSets: {
                    fields: dataSetFields,
                    filter: { code: { $like: id } },
                },
            })
            .getData();

        const orgUnit = organisationUnits[0];
        if (!orgUnit) throw new Error("Org unit not found");

        const dashboards = await getDashboards(api, config, orgUnit);

        const getDataSet = (type: DataSetType) => {
            const dataSet = _(dataSets).find(dataSet => dataSet.code.endsWith(type.toUpperCase()));
            if (!dataSet)
                throw new Error(
                    `Cannot find dataset: ${type} (dataSets: ${
                        dataSets.map(ds => ds.id).join(", ") || "-"
                    })`
                );
            return dataSet;
        };

        const projectDataSets = { actual: getDataSet("actual"), target: getDataSet("target") };

        const projectInfo = await getDataElementIdsForMer(api, id);

        const code = orgUnit.code || "";
        const { startDate, endDate } = getDatesFromOrgUnit(orgUnit);
        const sectorsById = _.keyBy(config.sectors, sector => sector.id);
        const sectorsByCode = _.keyBy(config.sectors, sector => sector.code);
        const dataElementsBySectorId = _(projectDataSets.actual.sections)
            .map(section => {
                const sectorCode = getSectorCodeFromSectionCode(section.code);
                const sector = _(sectorsByCode).get(sectorCode);
                const selectedIds = section.dataElements.map(de => de.id);
                const selectedMERIds = _.intersection(selectedIds, projectInfo.merDataElementIds);
                const uniqueIndicatorsIds = _.intersection(
                    selectedIds,
                    projectInfo.uniqueBeneficiaries.indicatorsIds
                );
                const value = { selectedIds, selectedMERIds, uniqueIndicatorsIds };
                return sector ? ([sector.id, value] as [string, typeof value]) : null;
            })
            .compact()
            .fromPairs()
            .value();
        const sectors = _.compact(_.at(sectorsById, _.keys(dataElementsBySectorId)));

        const dataElementsSelection = DataElementsSet.build(config, {
            groupPaired: true,
        }).updateSelected(_.mapValues(dataElementsBySectorId, value => value.selectedIds));

        const dataElementsMER = DataElementsSet.build(config, {
            groupPaired: false,
            superSet: dataElementsSelection,
        }).updateSelected(_.mapValues(dataElementsBySectorId, value => value.selectedMERIds));

        const uniqueIndicators = DataElementsSet.build(config, {
            groupPaired: false,
            superSet: dataElementsSelection,
        }).updateSelected(_.mapValues(dataElementsBySectorId, value => value.uniqueIndicatorsIds));

        const { dataSetElements } = projectDataSets.actual;
        const disaggregation = Disaggregation.buildFromDataSetElements(config, dataSetElements);
        const codeInfo = ProjectDb.getCodeInfo(code);
        const { displayName } = getProjectFromOrgUnit(orgUnit);

        const projectDocumentRepository = new ProjectDocumentRepository(api);
        const projectDocumentsIds = projectInfo.documents.map(documentId => documentId);
        const existingProjectDocuments = await projectDocumentRepository.getByIds(
            projectDocumentsIds
        );
        const isInDartApplicableGroup = orgUnit.organisationUnitGroups.some(
            group => group.id === config.organisationUnitGroups.isDartApplicable.id
        );

        const partnerGroup = orgUnit.organisationUnitGroups.some(
            group => group.id === config.organisationUnitGroups.partner.id
        );

        const projectData = {
            id: orgUnit.id,
            name: displayName,
            created: orgUnit.created ? moment(orgUnit.created) : undefined,
            description: orgUnit.description,
            ...codeInfo,
            startDate: startDate,
            endDate: endDate,
            sectors: sectors,
            funders: _.intersectionBy(config.funders, orgUnit.organisationUnitGroups, "id"),
            locations: _.intersectionBy(config.locations, orgUnit.organisationUnitGroups, "id"),
            orgUnit: orgUnit,
            parentOrgUnit: orgUnit.parent,
            dataSets: projectDataSets,
            dashboard: dashboards,
            dataElementsSelection,
            dataElementsMER,
            disaggregation,
            sharing: getSharing(projectDataSets.target),
            documents: existingProjectDocuments.map(projectDocument => {
                return ProjectDocument.create(projectDocument);
            }),
            isDartApplicable: isInDartApplicableGroup,
            partner: partnerGroup,
            uniqueIndicators,
        };
        const project = new Project(api, config, { ...projectData, initialData: projectData });
        return project;
    }

    async getDanglingDataValues(): Promise<DataValue[]> {
        const { api, project } = this;
        const dataElements = project.getSelectedDataElements();
        const dataValues = await this.getDataValues();

        const cocIdsByCategoryComboId = _(this.config.categoryCombos)
            .values()
            .map(catCombo => [catCombo.id, getIds(catCombo.categoryOptionCombos)] as [Id, Id[]])
            .fromPairs()
            .value();

        const validPairIds = new Set(
            _.flatMap(dataElements, de => {
                const categoryCombo = project.disaggregation.getCategoryCombo(de.id);
                const cocIds = cocIdsByCategoryComboId[categoryCombo.id] || [];
                return cocIds.map(cocId => [de.id, cocId].join("-"));
            })
        );

        const danglingDataValues = dataValues
            .filter(dataValue => dataValue.value && dataValue.value !== "0")
            .filter(dv => !validPairIds.has([dv.dataElement, dv.categoryOptionCombo].join("-")));

        const cocIdsFromDataValues = _(danglingDataValues)
            .flatMap(dv => [dv.categoryOptionCombo, dv.attributeOptionCombo])
            .uniq()
            .value();

        const { categoryOptionCombos } = await api.metadata
            .get({
                categoryOptionCombos: {
                    fields: { id: true, name: true },
                    filter: { id: { in: cocIdsFromDataValues } },
                },
            })
            .getData();

        const dataElementsById = _.keyBy(dataElements, getId);
        const cocsById = _.keyBy(categoryOptionCombos, getId);

        const dataValuesInfo = danglingDataValues.map((dv): DataValue | null => {
            const dataElement = _(dataElementsById).get(dv.dataElement, null);
            const categoryOptionCombo = _(cocsById).get(dv.categoryOptionCombo, null);
            const attributeOptionCombo = _(cocsById).get(dv.attributeOptionCombo, null);

            if (!dataElement || !categoryOptionCombo || !attributeOptionCombo) {
                console.warn("Metadata not found for datavalue", dv);
                return null;
            } else {
                return {
                    dataElement,
                    categoryOptionCombo,
                    attributeOptionCombo,
                    period: dv.period,
                    value: dv.value,
                };
            }
        });

        return _.compact(dataValuesInfo);
    }
}

export interface DataValue {
    dataElement: { id: Id; name: string; code: string };
    categoryOptionCombo: { id: Id; name: string };
    attributeOptionCombo: { id: Id; name: string };
    period: string;
    value: string;
}

export function getStringDataValue(dataValue: DataValue): string {
    return [
        `[${dataValue.dataElement.code}] ${dataValue.dataElement.name}`,
        dataValue.attributeOptionCombo.name,
        dataValue.categoryOptionCombo.name,
        dataValue.period,
        `value=${dataValue.value}`,
    ].join(" - ");
}

async function getDataElementIdsForMer(api: D2Api, id: string) {
    const dataStore = getDataStore(api);
    const value = await dataStore
        .get<ProjectInfo | undefined>(getProjectStorageKey({ id }))
        .getData();
    if (!value) console.error("Cannot get MER selections");
    return {
        uniqueBeneficiaries: {
            indicatorsIds: value?.uniqueBeneficiaries?.indicatorsIds || [],
        },
        documents: value?.documents || [],
        merDataElementIds: value?.merDataElementIds || [],
    };
}

export function getSectorCodeFromSectionCode(code: string | undefined) {
    return _.initial((code || "").split("_")).join("_");
}

type OrgUnitGroup = PartialPersistedModel<D2OrganisationUnitGroup> & {
    attributeValues: Array<{ attribute: Ref; value: string }>;
};

type OrgUnitsMeta = Pick<
    MetadataPayload,
    "organisationUnits" | "organisationUnitGroups" | "organisationUnitGroupSets"
>;

async function getOrgUnitGroupsMetadata(
    api: D2Api,
    project: Project,
    dashboards: DashboardsMetadata["dashboards"]
) {
    const { config } = project;

    /* The project may have changed funders/locations/awardNumber, so we need to get
       the previously associated organisation unit groups and clear them if necessary.
       Get also the orgUnitGroupSets containing the award numbers to update it. */
    const orgUnitId = project.id;
    const {
        organisationUnitGroups: prevOrgUnitGroups,
        organisationUnitGroupSets: prevOrganisationUnitGroupSets,
    } = await api.metadata
        .get({
            organisationUnitGroups: {
                fields: { $owner: true },
                filter: { "organisationUnits.id": { eq: orgUnitId } },
            },
            organisationUnitGroupSets: {
                fields: { $owner: true },
                filter: { code: { eq: config.base.organisationUnitGroupSets.awardNumber } },
            },
        })
        .getData();

    const name = `Award Number ${project.awardNumber}`;

    const awardNumberOrgUnitGroupBase: OrgUnitGroup = {
        id: getUid("awardNumber", project.awardNumber),
        name: name,
        shortName: name,
        code: config.base.organisationUnitGroupsPrefixes.awardNumberPrefix + project.awardNumber,
        organisationUnits: [],
        attributeValues: [],
    };

    const orgUnitGroupIds = new Set(
        getIds([
            ...project.funders,
            ...project.locations,
            awardNumberOrgUnitGroupBase,
            { id: config.organisationUnitGroups.isDartApplicable.id },
            { id: config.organisationUnitGroups.partner.id },
        ])
    );

    const { organisationUnitGroups: newOrgUnitGroups } = await api.metadata
        .get({
            organisationUnitGroups: {
                fields: { $owner: true },
                filter: { id: { in: Array.from(orgUnitGroupIds) } },
            },
        })
        .getData();

    const orgUnitGroupsToSave = _(prevOrgUnitGroups as OrgUnitGroup[])
        .concat(newOrgUnitGroups as OrgUnitGroup[])
        .concat([awardNumberOrgUnitGroupBase])
        .uniqBy(oug => oug.id)
        .map(setDefaultShortName)
        .map(oug => {
            return oug.id === awardNumberOrgUnitGroupBase.id && dashboards.awardNumber // Set dashboard ID to awardNumber group
                ? addAttributeValueToObj(oug, {
                      attribute: config.attributes.awardNumberDashboard,
                      value: dashboards.awardNumber.id,
                  })
                : oug;
        })
        .value();

    const organisationUnitGroups = orgUnitGroupsToSave.map(orgUnitGroup => {
        if (orgUnitGroup.id === config.organisationUnitGroups.isDartApplicable.id) {
            return checkIfProjectIsInGroup(orgUnitGroup, {
                projectId: project.id,
                condition: project.isDartApplicable,
            });
        } else if (orgUnitGroup.id === config.organisationUnitGroups.partner.id) {
            return checkIfProjectIsInGroup(orgUnitGroup, {
                projectId: project.id,
                condition: project.partner,
            });
        } else {
            const organisationUnits = _(orgUnitGroup.organisationUnits || [])
                .filter(ou => ou.id !== orgUnitId)
                .map(ou => ({ id: ou.id }))
                .concat(orgUnitGroupIds.has(orgUnitGroup.id) ? [{ id: orgUnitId }] : [])
                .value();
            return { ...orgUnitGroup, organisationUnits };
        }
    });

    const organisationUnitGroupSets = prevOrganisationUnitGroupSets.map(oug => ({
        ...oug,
        organisationUnitGroups: _(oug.organisationUnitGroups)
            .concat([{ id: awardNumberOrgUnitGroupBase.id }])
            .uniqBy(oug => oug.id)
            .value(),
    }));

    return { organisationUnitGroups, organisationUnitGroupSets };
}

function checkIfProjectIsInGroup(
    orgUnitGroup: OrgUnitGroup,
    { projectId, condition }: { projectId: string; condition: boolean }
) {
    const currentOrgUnits = orgUnitGroup.organisationUnits || [];
    const orgUnitsDartApplicable = condition
        ? _([...currentOrgUnits, { id: projectId }])
              .uniqBy(ou => ou.id)
              .value()
        : currentOrgUnits.filter(ou => ou.id !== projectId);

    return { ...orgUnitGroup, organisationUnits: orgUnitsDartApplicable };
}

function getOrgUnitId(orgUnit: { path: string }): string {
    const id = _.last(orgUnit.path.split("/"));
    if (id) return id;
    else throw new Error(`Invalid path: ${orgUnit.path}`);
}

type AttributeValue = { attribute: { id: Id }; value: string };

export function getDashboardId<OrgUnit extends { attributeValues: AttributeValue[] }>(
    config: Config,
    orgUnit: OrgUnit
): Id | undefined {
    return _(orgUnit.attributeValues)
        .map(av => (av.attribute.id === config.attributes.projectDashboard.id ? av.value : null))
        .compact()
        .first();
}

interface OrgUnitsForDashboards {
    attributeValues: AttributeValue[];
    parent: { attributeValues: AttributeValue[] };
    organisationUnitGroups: Array<{
        name: string;
        attributeValues: AttributeValue[];
        groupSets: Ref[];
    }>;
}

async function getDashboards<OrgUnit extends OrgUnitsForDashboards>(
    api: D2Api,
    config: Config,
    orgUnit: OrgUnit
): Promise<Partial<Dashboards>> {
    const projectDashboardId = _(orgUnit.attributeValues)
        .map(av => (av.attribute.id === config.attributes.projectDashboard.id ? av.value : null))
        .compact()
        .first();

    const countryDashboardId = _(orgUnit.parent.attributeValues)
        .map(av => (av.attribute.id === config.attributes.projectDashboard.id ? av.value : null))
        .compact()
        .first();

    const awardNumberDashboardId = _(orgUnit.organisationUnitGroups)
        .filter(oug =>
            _.some(
                oug.groupSets,
                groupSet => groupSet.id === config.organisationUnitGroupSets.awardNumber.id
            )
        )
        .flatMap(oug => oug.attributeValues)
        .map(av =>
            av.attribute.id === config.attributes.awardNumberDashboard.id ? av.value : null
        )
        .compact()
        .first();

    const ids = [projectDashboardId, countryDashboardId, awardNumberDashboardId];
    const { objects: dashboards } = await api.models.dashboards
        .get({
            fields: { id: true, name: true },
            filter: { id: { in: _.compact(ids) } },
        })
        .getData();
    const dashboardsById = _(dashboards).keyBy(dashboard => dashboard.id);
    const getById = (id: Id | undefined): Dashboard | undefined =>
        id ? dashboardsById.get(id) : undefined;

    return {
        project: getById(projectDashboardId),
        country: getById(countryDashboardId),
        awardNumber: getById(awardNumberDashboardId),
    };
}

type GenericMetadata = Record<string, Array<{ id: Id; created?: string }>>;
const dateFieldsToKeep = ["created"] as const;

/* On POST /metadata, objects not containing field "created", have this field set to the current time.
   Workaround: request all the objects we plan to post and merge the previous value of this field. */
async function mergePreviousDates(api: D2Api, metadata: GenericMetadata) {
    const ids = _(metadata)
        .values()
        .flatten()
        .map(obj => obj.id)
        .value();

    const existingMetadata = await api
        .get<GenericMetadata>("/metadata", {
            filter: `id:in:[${ids.join(",")}]`,
            fields: ["id", ...dateFieldsToKeep].join(","),
        })
        .getData();

    const attributesById = _(existingMetadata)
        .values()
        .flatten()
        .map(value => {
            const properties = _.pick(value, dateFieldsToKeep);
            return [value.id, properties] as [Id, typeof properties];
        })
        .fromPairs()
        .value();

    const metadataWithPrevDates = _(metadata)
        .mapValues(objs => objs.map(obj => ({ ...attributesById[obj.id], ...obj })))
        .value();

    return metadataWithPrevDates;
}

async function postPayload(
    api: D2Api,
    payload: Partial<MetadataPayload> & Pick<MetadataPayload, "sections">,
    project?: Project
) {
    // DHIS2 has problems updating dataSet/sections in the same payload, split.
    const sectionsPayload = _.pick(payload, ["sections"]);
    const nonSectionsPayload = _.omit(payload, ["sections"]);
    const dataSets = project?.dataSets ? [project.dataSets.actual, project.dataSets.target] : [];

    const oldSections = !_.isEmpty(dataSets)
        ? (
              await api.metadata
                  .get({
                      sections: {
                          fields: { id: true },
                          filter: { "dataSet.id": { in: dataSets.map(getId) } },
                      },
                  })
                  .getData()
          ).sections
        : [];

    // Delete old sections which are not in current sectors.
    const sectionsToDelete = _(oldSections)
        .differenceBy(payload.sections, section => section.id)
        .value();
    runPromises(
        sectionsToDelete.map(section => () => api.models.sections.delete(section).getData())
    );

    const mainPayload = await mergePreviousDates(api, nonSectionsPayload as GenericMetadata);

    const response = await api.metadata
        .post(mainPayload)
        .getData()
        .catch(_err => null);

    if (!response || response.status !== "OK" || _.isEmpty(sectionsPayload)) return response;

    return api.metadata
        .post(sectionsPayload)
        .getData()
        .catch(_err => null);
}

function throwResponseError(
    response: MetadataResponse | DataValueSetsPostResponse | null,
    msg: string
): never {
    console.error("ERROR", JSON.stringify(response, null, 4));
    throw new Error(_.compact([response?.status, msg]).join(" - "));
}

interface DashboardsMetadata {
    metadata: Partial<MetadataPayload>;
    dashboards: Dashboards;
}

const dataValuesDatesGetAll: Required<Pick<DataValueSetsGetRequest, "startDate" | "endDate">> = {
    startDate: "1970",
    endDate: (new Date().getFullYear() + 10).toString(),
};

type ObjWithShortName = Partial<{ name: string; shortName: string }>;

function setDefaultShortName<T extends ObjWithShortName>(obj: T): T {
    return { ...obj, shortName: obj.shortName || obj.name };
}

export const dataSetFields = {
    id: true,
    code: true,
    dataSetElements: {
        dataElement: { id: true },
        categoryCombo: { id: true, categoryOptionCombos: { id: true } },
    },
    dataInputPeriods: { period: true, openingDate: true, closingDate: true },
    sections: { code: true, dataElements: { id: true } },
    openFuturePeriods: true,
    expiryDays: true,
    publicAccess: true,
    externalAccess: true,
    userAccesses: { id: true, displayName: true, access: true },
    userGroupAccesses: { id: true, displayName: true, access: true },
} as const;
