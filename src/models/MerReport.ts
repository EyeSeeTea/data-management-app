import { Disaggregation } from "./Disaggregation";
import { GetItemType, Maybe } from "./../types/utils";
import moment, { Moment } from "moment";
import _ from "lodash";
import { Id, Ref, D2Api, DataStore } from "../types/d2-api";
import { Config, Sector } from "./Config";
import { getDataStore, getId, getIds } from "../utils/dhis2";
import { runPromises } from "../utils/promises";
import { getProjectFromOrgUnit } from "./Project";
import { toISOString, getMonthsRange } from "../utils/date";
import i18n from "../locales";
import { DataElementBase } from "./dataElementsSet";
import ProjectsList, { ProjectForList } from "./ProjectsList";

export const staffKeys = [
    "nationalStaff" as const,
    "ifs" as const,
    "ifsDependents" as const,
    "regional" as const,
    "regionalDependents" as const,
    "interns" as const,
];

const textFields: Array<keyof Data> = [
    "countryDirector",
    "executiveSummaries",
    "executiveSummariesSelected",
    "ministrySummary",
    "projectedActivitiesNextMonth",
    "additionalComments",
];

export type StaffKey = GetItemType<typeof staffKeys>;

export type StaffSummary = Partial<Record<StaffKey, StaffInfo>>;

export type StaffInfo = Partial<{ fullTime: number; partTime: number }>;

interface OrganisationUnit {
    id: string;
    path: string;
    displayName: string;
}

export interface Data {
    sectors: Sector[];
    date: Moment;
    organisationUnit: OrganisationUnit;
    projectsData: ProjectsData;
    countryDirector: string;
    executiveSummaries: ExecutiveSummaries;
    executiveSummariesSelected: Maybe<Id>[];
    ministrySummary: string;
    projectedActivitiesNextMonth: string;
    staffSummary: StaffSummary;
    additionalComments: string;
}

export type MerReportData = Data;

type SectorId = Id;

export type ExecutiveSummaries = Record<SectorId, string | undefined>;

type ExecutiveSummariesList = Array<{ sector: Sector; value: string }>;

interface Row {
    deId: string;
    orgUnitId: string;
    periodId: string;
    actualOrTarget: "actual" | "target";
    newOrRecurring: "new" | "recurring" | undefined;
    isPeople: boolean;
    value: number;
    approved: boolean;
}

type Location = { id: Id; name: string };

export interface DataElementMER extends DataElementInfo {
    locations: Location[];
    project: ProjectForMer;
}

interface OrgUnit {
    id: Id;
    code: string;
    name: string;
    openingDate: string;
    closedDate: string;
    organisationUnitGroups: Ref[];
}

export interface ProjectInfo {
    uniqueBeneficiaries: { indicatorsIds: Id[] };
    merDataElementIds: string[];
    documents: string[];
}

interface ReportInfo {
    reports?: Record<string, Report>;
}

interface Report {
    created: string;
    createdBy: Id;
    updated: string;
    updatedBy: Id;
    countryDirector: string;
    executiveSummaries: ExecutiveSummaries;
    executiveSummariesSelected: Maybe<Id>[];
    ministrySummary: string;
    projectedActivitiesNextMonth: string;
    additionalComments: string;
    staffSummary: StaffSummary;
    comments: {
        [orgUnitCountryAndDataElementId: string]: string;
    };
}

export interface DataValue {
    all: number;
    approved: number;
    unapproved: number;
}

export type MaybeDataValue = { [K in keyof DataValue]: Maybe<DataValue[K]> };

export interface DataElementInfo {
    id: string;
    code: string;
    name: string;
    target: DataValue;
    actual: DataValue;
    targetAchieved: DataValue;
    actualAchieved: DataValue;
    achieved: MaybeDataValue;
    comment: string;
    isCovid19: boolean;
}

export interface ProjectForMer {
    id: string;
    code: string;
    prefix: string;
    dateInfo: string;
    name: string;
    dataElements: DataElementInfo[];
    locations: Array<{ id: Id; name: string }>;
}

export type ProjectsData = ProjectForMer[];

type SelectData = Pick<Data, "date" | "organisationUnit">;

const emptyStaffSummary: StaffSummary = {};

function getProjectSectors(config: Config, projects: ProjectForList[]): Sector[] {
    return _(projects)
        .flatMap(project => project.sectors)
        .reject(sector => config.base.merReports.excludedSectors.includes(sector.code))
        .uniqBy(sector => sector.id)
        .sortBy(sector => sector.displayName)
        .value();
}

function getInitialData(sectors: Sector[]) {
    const executiveSummaries = _(sectors)
        .map(sector => [sector.id, ""] as [SectorId, string])
        .fromPairs()
        .value();

    return {
        countryDirector: "",
        executiveSummaries,
        executiveSummariesSelected: [],
        ministrySummary: "",
        projectedActivitiesNextMonth: "",
        additionalComments: "",
        staffSummary: emptyStaffSummary,
    };
}

type ExecutiveSummariesInfo = Array<{
    sector?: Sector;
    value?: string;
    selectable: Sector[];
}>;

class MerReport {
    dataStore: DataStore;

    constructor(public api: D2Api, public config: Config, public data: Data) {
        this.dataStore = getDataStore(this.api);
    }

    static async create(api: D2Api, config: Config, selectData: SelectData): Promise<MerReport> {
        const { organisationUnit, date } = selectData;
        const reportData = await getReportData(api, organisationUnit, date);
        const { report } = reportData;
        const comments = report ? report.comments : {};
        const projects = await getProjects(api, config, selectData);
        const projectsData = await MerReport.getProjectsData(api, config, projects, date, comments);
        const sectors = getProjectSectors(config, projects);

        const data: Data = {
            sectors,
            ...selectData,
            ..._.merge(getInitialData(sectors), _.pick(report, textFields)),
            staffSummary: reportData.staffSummaryCurrent,
            projectsData,
        };
        return new MerReport(api, config, data);
    }

    public set<K extends keyof Data>(field: K, value: Data[K]): MerReport {
        return new MerReport(this.api, this.config, { ...this.data, [field]: value });
    }

    public getExecutiveSummaries(): ExecutiveSummariesList {
        return this.data.sectors.map(sector => ({
            sector,
            value: _(this.data.executiveSummaries).get(sector.id, ""),
        }));
    }

    public getExecutiveSummariesForDownload(): ExecutiveSummariesList {
        return _(this.getExecutiveSummaries())
            .keyBy(o => o.sector.id)
            .at(_.compact(this.data.executiveSummariesSelected))
            .compact()
            .take(this.config.base.merReports.maxExecutiveSummaries)
            .filter(o => !!o.value)
            .value();
    }

    public getExecutiveSummariesInfo(): ExecutiveSummariesInfo {
        const { sectors, executiveSummariesSelected } = this.data;
        const limit = Math.min(this.config.base.merReports.maxExecutiveSummaries, sectors.length);
        const sectorsById = _.keyBy(sectors, sector => sector.id);

        const selectedSectors = _(executiveSummariesSelected)
            .map(sectorId => (sectorId ? sectorsById[sectorId] : undefined))
            .compact()
            .take(limit)
            .value();

        const selectableSectors = _.differenceBy(sectors, selectedSectors, sector => sector.id);

        const infoForSelected: ExecutiveSummariesInfo = selectedSectors.map(sector => ({
            sector,
            value: sector ? this.data.executiveSummaries[sector.id] : undefined,
            selectable: sector ? [sector, ...selectableSectors] : selectableSectors,
        }));

        const padCount = limit - selectedSectors.length;
        const infoForRemaining: ExecutiveSummariesInfo = _.range(0, padCount).map(() => ({
            selectable: selectableSectors,
        }));

        return _.concat(infoForSelected, infoForRemaining);
    }

    hasProjects(): boolean {
        return this.data.projectsData.length > 0;
    }

    getStaffTotals(): { partTime: number; fullTime: number; total: number } {
        const staffs = staffKeys.map(key => _(this.data.staffSummary).get(key, undefined));
        const partTime = _.sum(_.compact(staffs.map(staff => (staff ? staff.partTime : null))));
        const fullTime = _.sum(_.compact(staffs.map(staff => (staff ? staff.fullTime : null))));
        return { partTime, fullTime, total: partTime + fullTime };
    }

    setComment(project: ProjectForMer, dataElement: DataElementInfo, comment: string): MerReport {
        if (!this.data.projectsData) return this;

        const projectDataUpdated = this.data.projectsData.map(project_ => {
            if (project_.id === project.id) {
                return {
                    ...project_,
                    dataElements: project_.dataElements.map(dataElement_ => {
                        if (dataElement_.id === dataElement.id) {
                            return { ...dataElement_, comment };
                        } else {
                            return dataElement_;
                        }
                    }),
                };
            } else {
                return project_;
            }
        });
        return this.set("projectsData", projectDataUpdated);
    }

    setStaffHours(staffKey: StaffKey, staffInfo: StaffInfo): MerReport {
        const staffSummaryUpdated = {
            ...this.data.staffSummary,
            [staffKey]: staffInfo,
        };
        return this.set("staffSummary", staffSummaryUpdated);
    }

    async save(): Promise<void> {
        const { dataStore, config, api } = this;
        const { projectsData, organisationUnit, date, staffSummary } = this.data;
        const { countryDirector, executiveSummaries, executiveSummariesSelected } = this.data;
        const { ministrySummary, projectedActivitiesNextMonth, additionalComments } = this.data;
        const now = moment();
        const storeReportKey = getReportStorageKey(organisationUnit);
        const reportData = await getReportData(api, organisationUnit, date);
        const { reportInfo: reportInfoOld, report: reportOld } = reportData;
        const { reportPeriod, staffSummaryPrev } = reportData;
        const newStaffSummary = mergeNotEqual(staffSummaryPrev, staffSummary);

        const comments = _(projectsData)
            .flatMap(projectInfo => {
                return projectInfo.dataElements.map(deInfo => {
                    return [getKey([projectInfo.id, deInfo.id]), deInfo.comment];
                });
            })
            .fromPairs()
            .value();

        const storeReport: Report = {
            created: reportOld ? reportOld.created : toISOString(now),
            createdBy: reportOld ? reportOld.createdBy : config.currentUser.id,
            updated: toISOString(now),
            updatedBy: config.currentUser.id,
            countryDirector,
            executiveSummaries,
            executiveSummariesSelected,
            ministrySummary,
            projectedActivitiesNextMonth,
            additionalComments,
            staffSummary: newStaffSummary,
            comments,
        };

        const newStoreValue: ReportInfo = {
            ...reportInfoOld,
            reports: {
                ...(reportInfoOld && reportInfoOld.reports),
                [reportPeriod]: storeReport,
            },
        };

        await dataStore.save(storeReportKey, newStoreValue).getData();
    }

    static async getProjectsData(
        api: D2Api,
        config: Config,
        projects: Ref[],
        date: Moment,
        commentsByProjectAndDe: _.Dictionary<string>
    ): Promise<ProjectsData> {
        const orgUnits = await getOrgUnitsForProjects(api, projects);
        const disaggregationsByProject = await getDisaggregationsByProject(api, config, orgUnits);

        if (_.isEmpty(orgUnits)) return [];

        const projectInfoByOrgUnitId = await getProjectInfoByOrgUnitId(api, orgUnits);
        const oldestPeriod = _.min(_.compact(orgUnits.map(orgUnit => orgUnit.openingDate)));
        const dataElementsById = getDataElementsById(config);
        const months = getMonthsRange(moment(oldestPeriod), date);
        const periods = months.map(date => date.format("YYYYMM"));
        const reportPeriod = getReportPeriod(date);

        const merDataElements = _(projectInfoByOrgUnitId)
            .values()
            .flatMap(info => (info ? info.merDataElementIds : []))
            .uniq()
            .map(deId => _(dataElementsById).get(deId, null))
            .compact()
            .value();

        if (_.isEmpty(merDataElements)) return [];

        const rows = await getAnalyticRows(config, api, orgUnits, periods, merDataElements);

        const projectsData: Array<ProjectForMer | null> = orgUnits.map(orgUnit => {
            const locations = _(config.locations)
                .keyBy(getId)
                .at(getIds(orgUnit.organisationUnitGroups))
                .compact()
                .sortBy(location => location.displayName)
                .value();
            const project = getProjectFromOrgUnit(orgUnit);
            const formatDate = (dateStr: string): string => moment(dateStr).format("MMM YYYY");
            const projectInfo = projectInfoByOrgUnitId[orgUnit.id];
            const dataElementIds = _.uniq(projectInfo ? projectInfo.merDataElementIds : []);
            const getDataElementInfo = (deId: Id): Maybe<DataElementInfo> => {
                const dataElement = _(dataElementsById).get(deId, null);
                if (!dataElement) {
                    console.error(`Cannot found data element: ${deId}`);
                    return;
                }

                const rowsForDeOU = rows.filter(
                    row => row.deId === dataElement.id && row.orgUnitId === orgUnit.id
                );
                const targetAchieved = getDataValueFromRows(
                    rowsForDeOU,
                    row =>
                        row.actualOrTarget === "target" &&
                        (!row.isPeople || row.newOrRecurring === "new")
                );
                const actualAchieved = getDataValueFromRows(
                    rowsForDeOU,
                    row =>
                        row.actualOrTarget === "actual" &&
                        (!row.isPeople || row.newOrRecurring === "new")
                );

                const achieved = getAchieved(targetAchieved, actualAchieved);

                const rowsForDeOrgUnitPeriod = rowsForDeOU.filter(r => r.periodId === reportPeriod);
                const disaggregation = _(disaggregationsByProject).get(project.id, null);

                const actual = getDataValueFromRows(
                    rowsForDeOrgUnitPeriod,
                    row => row.actualOrTarget === "actual"
                );
                const target = getDataValueFromRows(
                    rowsForDeOrgUnitPeriod,
                    row => row.actualOrTarget === "target"
                );

                return {
                    id: dataElement.id,
                    code: dataElement.code,
                    name: dataElement.name,
                    actual,
                    target,
                    actualAchieved,
                    targetAchieved,
                    achieved,
                    comment: commentsByProjectAndDe[getKey([project.id, dataElement.id])] || "",
                    isCovid19: disaggregation ? disaggregation.isCovid19(dataElement.id) : false,
                };
            };

            if (_.isEmpty(dataElementIds)) return null;

            const projectForMer: ProjectForMer = {
                id: orgUnit.id,
                name: project.name,
                code: orgUnit.code,
                prefix: orgUnit.code?.split("-")[0] || "",
                locations: locations.map(({ id, displayName }) => ({ id, name: displayName })),
                dateInfo: `${formatDate(project.openingDate)} - ${formatDate(project.closedDate)}`,
                dataElements: _.compact(dataElementIds.map(getDataElementInfo)),
            };

            return projectForMer;
        });

        return _.compact(projectsData);
    }

    getData(): DataElementMER[] {
        const richDataElements = _.flatMap(this.data.projectsData, project =>
            project.dataElements.map<DataElementMER>(dataElementInfo => {
                return {
                    ...dataElementInfo,
                    locations: project.locations,
                    project,
                };
            })
        );

        return _.orderBy(richDataElements, [
            item => item.locations.length,
            item => item.locations.map(location => location.name).join(", "),
            item => item.project.name,
            item => item.project.id,
            item => item.name,
        ]);
    }
}

function getAchieved(
    targetAchieved: DataValue,
    actualAchieved: DataValue
): DataElementInfo["achieved"] {
    const achievedApproved = targetAchieved.approved
        ? (100 * actualAchieved.approved) / targetAchieved.approved
        : null;

    const achievedAll = targetAchieved.all ? (100 * actualAchieved.all) / targetAchieved.all : null;

    const achievedUnapproved = targetAchieved.unapproved
        ? (100 * actualAchieved.unapproved) / targetAchieved.unapproved
        : null;

    return { all: achievedAll, approved: achievedApproved, unapproved: achievedUnapproved };
}

async function getOrgUnitsForProjects(api: D2Api, projects: Ref[]): Promise<OrgUnit[]> {
    const { organisationUnits } = await api.metadata
        .get({
            organisationUnits: {
                fields: {
                    id: true,
                    code: true,
                    name: true,
                    openingDate: true,
                    closedDate: true,
                    organisationUnitGroups: { id: true },
                },
                filter: {
                    id: { in: projects.map(getId) },
                },
            },
        })
        .getData();

    return organisationUnits;
}

async function getProjectInfoByOrgUnitId(api: D2Api, orgUnits: Ref[]) {
    const dataStore = getDataStore(api);
    return _.fromPairs(
        _.compact(
            await runPromises(
                orgUnits.map(
                    orgUnit => () =>
                        dataStore
                            .get<ProjectInfo | undefined>(getProjectStorageKey(orgUnit))
                            .getData()
                            .then(value => [orgUnit.id, value] as [string, ProjectInfo])
                ),
                { concurrency: 3 }
            )
        )
    );
}

export function getStaffTranslations(): Record<StaffKey, string> {
    return {
        nationalStaff: i18n.t("National Staff"),
        ifs: i18n.t("IFS"),
        ifsDependents: i18n.t("IFS Dependents"),
        regional: i18n.t("Regional"),
        regionalDependents: i18n.t("Regional Dependents"),
        interns: i18n.t("Interns"),
    };
}

function getKey(parts: string[]): string {
    return parts.join("-");
}

function getReportPeriod(date: Moment): string {
    return date.format("YYYYMM");
}

export function getProjectStorageKey(organisationUnit: Ref): string {
    return ["project", organisationUnit.id].join("-");
}

export function getReportStorageKey(country: Ref): string {
    return ["mer", country.id].join("-");
}

async function getAnalytics(
    config: Config,
    api: D2Api,
    dataElements: Ref[],
    dimension: string[]
): Promise<Array<{ approved: boolean; rawRow: string[] }>> {
    if (_.isEmpty(dataElements)) return [];

    const fullDimension = [...dimension, "dx:" + dataElements.map(de => de.id).join(";")];
    const baseOptions = { dimension: fullDimension, skipRounding: true };

    const analyticOptionsApproved = {
        ...baseOptions,
        approvalLevel: config.dataApprovalLevels.project.id,
    };

    const analyticOptionsAll = baseOptions;

    const { rows: approvedRows } = await api.analytics.get(analyticOptionsApproved).getData();
    const { rows: allRows } = await api.analytics.get(analyticOptionsAll).getData();

    return [
        ...approvedRows.map(rawRow => ({ approved: true, rawRow })),
        ...allRows.map(rawRow => ({ approved: false, rawRow })),
    ];
}

async function getAnalyticRows(
    config: Config,
    api: D2Api,
    organisationUnits: Ref[],
    periods: string[],
    merDataElements: DataElementBase[]
): Promise<Row[]> {
    const { categories, categoryOptions } = config;
    const dataElementsById = getDataElementsById(config);

    const baseDimension = [
        "ou:" + organisationUnits.map(ou => ou.id).join(";"),
        "pe:" + periods.join(";"),
        categories.targetActual.id,
    ];

    const benefitDataElements = merDataElements.filter(de => de.peopleOrBenefit === "benefit");
    const peopleDataElements = merDataElements.filter(de => de.peopleOrBenefit === "people");

    const benefitRows = await getAnalytics(config, api, benefitDataElements, baseDimension);

    const peopleRows = await getAnalytics(config, api, peopleDataElements, [
        ...baseDimension,
        categories.newRecurring.id,
    ]);

    const analyticsRows = _.concat(benefitRows, peopleRows);

    const actualTarget: Record<string, "actual" | "target"> = {
        [categoryOptions.actual.id]: "actual",
        [categoryOptions.target.id]: "target",
    };

    const newRecurring: Record<string, "new" | "recurring"> = {
        [categoryOptions.new.id]: "new",
        [categoryOptions.recurring.id]: "recurring",
    };

    const rows = analyticsRows.map(({ approved, rawRow: analyticsRow }) => {
        const deId = analyticsRow[0];
        const dataElement = _(dataElementsById).get(deId, null);
        const isPeople = dataElement ? dataElement.peopleOrBenefit === "people" : false;
        let orgUnitId, periodId, actualOrTargetId, newOrRecurringId, value;

        if (isPeople) {
            [, orgUnitId, periodId, actualOrTargetId, newOrRecurringId, value] = analyticsRow;
        } else {
            [, orgUnitId, periodId, actualOrTargetId, value] = analyticsRow;
            newOrRecurringId = undefined;
        }

        const row: Row = {
            deId,
            orgUnitId,
            periodId,
            actualOrTarget: actualTarget[actualOrTargetId],
            newOrRecurring: newOrRecurringId ? newRecurring[newOrRecurringId] : undefined,
            isPeople,
            value: parseFloat(value),
            approved,
        };

        return row;
    });

    return rows;
}

async function getReportData<OU extends Ref>(
    api: D2Api,
    organisationUnit: OU,
    date: Moment
): Promise<{
    reportInfo: Maybe<ReportInfo>;
    report: Maybe<Report>;
    reportPeriod: string;
    staffSummaryPrev: StaffSummary;
    staffSummaryCurrent: StaffSummary;
}> {
    const reportInfo = await getDataStore(api)
        .get<ReportInfo | undefined>(getReportStorageKey(organisationUnit))
        .getData();
    const reportPeriod = getReportPeriod(date);
    const reports = reportInfo ? reportInfo.reports : undefined;
    const report = reports ? reports[reportPeriod] : undefined;

    // Merge old and current values to build the final staff summary for this period
    const staffSummaryPrev = _(reports)
        .toPairs()
        .sortBy(([period, _report]) => period)
        .map(([period, report]) => (period < reportPeriod ? report : null))
        .compact()
        .reduce((acc, report) => mergeNotNil(acc, report.staffSummary), emptyStaffSummary);

    const staffSummaryCurrent = report
        ? mergeNotNil(staffSummaryPrev, report.staffSummary)
        : staffSummaryPrev;

    return { reportInfo, staffSummaryPrev, staffSummaryCurrent, report, reportPeriod };
}

function mergeNotNil(staff1: StaffSummary, staff2: StaffSummary): StaffSummary {
    return mergeStaffSummaries(staff1, staff2, (val1, val2) => (_.isNil(val2) ? val1 : val2));
}

function mergeNotEqual(staff1: StaffSummary, staff2: StaffSummary): StaffSummary {
    return mergeStaffSummaries(staff1, staff2, (val1, val2) =>
        _.isNil(val1) ? val2 : val1 === val2 ? undefined : val2
    );
}

function mergeStaffSummaries(
    staff1: StaffSummary,
    staff2: StaffSummary,
    merger: (val1: Maybe<number>, val2: Maybe<number>) => Maybe<number>
): StaffSummary {
    return _(staffKeys)
        .map(staffKey => {
            const time1 = staff1[staffKey] || {};
            const time2 = staff2[staffKey] || {};
            const fullTime = merger(time1.fullTime, time2.fullTime);
            const partTime = merger(time1.partTime, time2.partTime);
            return [staffKey, _.omitBy({ partTime, fullTime }, _.isNil)];
        })
        .fromPairs()
        .thru(staffSummary => _.omitBy(staffSummary, _.isEmpty))
        .value();
}

function sumRows(rows: Row[], filterPredicate?: (row: Row) => boolean) {
    return _(rows)
        .filter(row => (filterPredicate ? filterPredicate(row) : true))
        .map(row => row.value)
        .sum();
}

function getDataValueFromRows(rows: Row[], filterPredicate?: (row: Row) => boolean): DataValue {
    const [approved, all] = _.partition(rows, row => row.approved);
    const approvedT = sumRows(approved, filterPredicate);
    const allT = sumRows(all, filterPredicate);

    return {
        all: allT,
        approved: approvedT,
        unapproved: allT - approvedT,
    };
}

function getDataElementsById(config: Config) {
    const allDataElements = _(config.dataElements)
        .uniqBy(de => de.id)
        .value();
    return _.keyBy(allDataElements, "id");
}

async function getProjects(
    api: D2Api,
    config: Config,
    selectData: SelectData
): Promise<ProjectForList[]> {
    const { objects: projects } = await new ProjectsList(api, config).get(
        {
            countryIds: [selectData.organisationUnit.id],
            dateInProject: selectData.date,
            createdByAppOnly: true,
            userCountriesOnly: true,
        },
        { field: "displayName", order: "asc" },
        { page: 1, pageSize: 1000 }
    );
    return projects;
}

async function getDisaggregationsByProject(
    api: D2Api,
    config: Config,
    orgUnits: Ref[]
): Promise<Record<string /* project.id */, Disaggregation>> {
    const { dataSets } = await api.metadata
        .get({
            dataSets: {
                filter: { code: { in: orgUnits.map(ou => `${ou.id}_ACTUAL`) } },
                fields: {
                    code: true,
                    dataSetElements: { dataElement: { id: true }, categoryCombo: { id: true } },
                },
            },
        })
        .getData();

    return _(dataSets)
        .map(dataSet => {
            const { dataSetElements, code } = dataSet;
            const projectId = code.split("_")[0];
            const disaggregation = Disaggregation.buildFromDataSetElements(config, dataSetElements);
            return [projectId, disaggregation] as [string, Disaggregation];
        })
        .fromPairs()
        .value();
}

export default MerReport;
