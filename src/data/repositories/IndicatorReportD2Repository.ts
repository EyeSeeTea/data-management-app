import _ from "lodash";
import { D2Api, DataStore } from "../../types/d2-api";
import {
    IndicatorReport,
    IndicatorReportToSave,
    ProjectCountry,
} from "../../domain/entities/IndicatorReport";
import { IndicatorReportRepository } from "../../domain/repositories/IndicatorReportRepository";
import { DATA_MANAGEMENT_NAMESPACE } from "../common";
import { Id, ISODateTimeString } from "../../domain/entities/Ref";
import { D2ApiUbSettings } from "../common/D2ApiUbSettings";
import Project from "../../models/Project";
import { promiseMap } from "../../migrations/utils";
import { Config } from "../../models/Config";
import { UniqueBeneficiariesPeriod } from "../../domain/entities/UniqueBeneficiariesPeriod";
import { D2DataElement } from "./D2DataElement";

export class IndicatorReportD2Repository implements IndicatorReportRepository {
    private prefixKey = "ubreport";
    private dataStore: DataStore;
    private d2ApiUbSettings: D2ApiUbSettings;
    private d2ApiDataElement: D2DataElement;

    constructor(private api: D2Api, private config: Config) {
        this.dataStore = this.api.dataStore(DATA_MANAGEMENT_NAMESPACE);
        this.d2ApiUbSettings = new D2ApiUbSettings(this.api);
        this.d2ApiDataElement = new D2DataElement(this.api, this.config);
    }

    async getByCountry(countryId: Id): Promise<IndicatorReport[]> {
        const response = await this.dataStore.get<D2Response[]>(this.buildKey(countryId)).getData();
        return this.buildReportsFromResponse(response || []);
    }

    async save(reports: IndicatorReportToSave[], countryId: Id): Promise<void> {
        const existingReports = await this.dataStore
            .get<D2Response[]>(this.buildKey(countryId))
            .getData();

        const reportsToSave = this.buildD2IndicatorReport(reports, existingReports || []);

        await this.dataStore.save(this.buildKey(countryId), reportsToSave).getData();
    }

    private buildD2IndicatorReport(
        reports: IndicatorReportToSave[],
        existingReports: D2Response[]
    ) {
        const currentDate = new Date().toISOString();
        return reports.map((report): D2Response => {
            const existingRecord = existingReports?.find(
                item =>
                    item.startDate === report.period.startDateMonth &&
                    item.endDate === report.period.endDateMonth
            );

            return {
                countryId: report.countryId,
                createdAt: existingRecord?.createdAt || currentDate,
                updatedAt: currentDate,
                endDate: report.period.endDateMonth,
                startDate: report.period.startDateMonth,
                projects: report.projects.map((project): D2Response["projects"][number] => ({
                    id: project.id,
                    indicators: project.indicators.map(indicator => ({
                        include: indicator.include,
                        indicatorId: indicator.indicatorId,
                        value: indicator.value || 0,
                        periodNotAvailable: indicator.periodNotAvailable,
                    })),
                })),
            };
        });
    }

    private async buildReportsFromResponse(responses: D2Response[]): Promise<IndicatorReport[]> {
        const projectIds = responses.flatMap(item => item.projects.map(project => project.id));
        const projects = await this.getProjectsByIds(projectIds);
        const settings = await this.d2ApiUbSettings.getAll();
        const dataElementsIds = settings.flatMap(setting => setting.indicatorsIds);
        const dataElements = await this.d2ApiDataElement.getByIds(dataElementsIds);
        const settingsByProjects = settings.filter(setting =>
            projectIds.includes(setting.projectId)
        );
        const periods = settingsByProjects.flatMap(setting => setting.periods);
        const groupedPeriods = UniqueBeneficiariesPeriod.uniquePeriodsByDates(periods);

        return responses.map(response => {
            const currentPeriod = groupedPeriods.find(
                period =>
                    period.startDateMonth === response.startDate &&
                    period.endDateMonth === response.endDate
            );
            if (!currentPeriod)
                throw Error(`Period ${response.startDate}-${response.endDate} not found`);

            return IndicatorReport.create({
                countryId: response.countryId,
                createdAt: response.createdAt,
                lastUpdatedAt: response.updatedAt,
                period: currentPeriod,
                projects: _(response.projects)
                    .map(project => {
                        const projectDetails = projects.find(
                            projectDetail => projectDetail.id === project.id
                        );
                        if (!projectDetails) return undefined;

                        return {
                            id: project.id,
                            indicators: project.indicators.map(indicator => {
                                const dataElementDetails = dataElements.find(
                                    dataElement => dataElement.id === indicator.indicatorId
                                );
                                return {
                                    include: indicator.include,
                                    indicatorId: indicator.indicatorId,
                                    indicatorCode: dataElementDetails?.code || "",
                                    indicatorName: dataElementDetails?.name || "",
                                    value: indicator.value,
                                    periodNotAvailable: indicator.periodNotAvailable,
                                };
                            }),
                            project: projectDetails,
                        };
                    })
                    .compact()
                    .value(),
            });
        });
    }

    private async getProjectsByIds(projectIds: Id[]): Promise<ProjectCountry[]> {
        const projects = await promiseMap(projectIds, id => Project.get(this.api, this.config, id));
        return projects.map(project => ({
            id: project.id,
            name: project.name,
            openingDate: project.startDate?.toISOString() || "",
            closedDate: project.endDate?.toISOString() || "",
        }));
    }

    private buildKey(countryId: Id) {
        return `${this.prefixKey}-${countryId}`;
    }
}

type D2Response = {
    countryId: Id;
    startDate: number;
    endDate: number;
    createdAt: ISODateTimeString;
    updatedAt: ISODateTimeString;
    projects: Array<{
        id: Id;
        indicators: Array<{
            include: boolean;
            indicatorId: Id;
            value: number;
            periodNotAvailable: boolean;
        }>;
    }>;
};
