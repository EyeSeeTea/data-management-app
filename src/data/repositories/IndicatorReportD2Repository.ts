import _ from "lodash";
import { D2Api, DataStore } from "../../types/d2-api";
import {
    IndicatorReport,
    IndicatorReportToSave,
    ProjectIndicatorRow,
} from "../../domain/entities/IndicatorReport";
import { IndicatorReportRepository } from "../../domain/repositories/IndicatorReportRepository";
import { DATA_MANAGEMENT_NAMESPACE } from "../common";
import { Id, ISODateTimeString } from "../../domain/entities/Ref";
import { D2ApiUbSettings } from "../common/D2ApiUbSettings";
import { Config } from "../../models/Config";
import { UniqueBeneficiariesPeriod } from "../../domain/entities/UniqueBeneficiariesPeriod";
import { D2DataElement } from "./D2DataElement";
import { D2ApiProject } from "../common/D2ApiProject";
import { UniqueBeneficiariesSettings } from "../../domain/entities/UniqueBeneficiariesSettings";
import { DataElement } from "../../domain/entities/DataElement";

export class IndicatorReportD2Repository implements IndicatorReportRepository {
    private prefixKey = "ubreport";
    private dataStore: DataStore;
    private d2ApiUbSettings: D2ApiUbSettings;
    private d2ApiDataElement: D2DataElement;
    private d2ApiProject: D2ApiProject;

    constructor(private api: D2Api, private config: Config) {
        this.dataStore = this.api.dataStore(DATA_MANAGEMENT_NAMESPACE);
        this.d2ApiUbSettings = new D2ApiUbSettings(this.api, config);
        this.d2ApiDataElement = new D2DataElement(this.api, this.config);
        this.d2ApiProject = new D2ApiProject(api, config);
    }

    async getByCountry(countryId: Id): Promise<IndicatorReport[]> {
        const response = await this.dataStore.get<D2Response[]>(this.buildKey(countryId)).getData();
        return this.buildReportsFromResponse(response || [], countryId);
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
            const existingRecord = existingReports?.find(item =>
                report.period.equalMonths(item.startDate, item.endDate)
            );

            return {
                year: report.year,
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

    private async buildReportsFromResponse(
        responses: D2Response[],
        countryId: Id
    ): Promise<IndicatorReport[]> {
        const projectResponse = await this.d2ApiProject.getAllProjectsByCountry(countryId, 1, []);

        const projectsIds = projectResponse.map(item => item.id);
        const projects = await this.d2ApiProject.getByIds(projectsIds);
        const settings = await this.d2ApiUbSettings.getAll({ projectsIds });
        const dataElementsIds = settings.flatMap(setting => setting.indicatorsIds);
        const dataElements = await this.d2ApiDataElement.getByIds(dataElementsIds);
        const settingsByProjects = settings.filter(setting =>
            projectsIds.includes(setting.projectId)
        );
        const periods = settingsByProjects.flatMap(setting => setting.periods);
        const groupedPeriods = UniqueBeneficiariesPeriod.uniquePeriodsByDates(periods);

        return responses.map(response => {
            const currentPeriod = groupedPeriods.find(period =>
                period.equalMonths(response.startDate, response.endDate)
            );
            if (!currentPeriod)
                throw Error(`Period ${response.startDate}-${response.endDate} not found`);

            return IndicatorReport.create({
                year: response.year,
                countryId: response.countryId,
                createdAt: response.createdAt,
                lastUpdatedAt: response.updatedAt,
                period: currentPeriod,
                projects: _(projects)
                    .map(project => {
                        const projectResult = response.projects.find(
                            item => item.id === project.id
                        );

                        return {
                            id: project.id,
                            indicators: projectResult?.indicators
                                ? this.buildExistingIndicators(projectResult, dataElements)
                                : this.buildIndicators(
                                      settingsByProjects,
                                      project.id,
                                      dataElements
                                  ),
                            project: {
                                id: project.id,
                                name: project.name,
                                openingDate: project.openingDate,
                                closedDate: project.closedDate,
                            },
                        };
                    })
                    .compact()
                    .value(),
            });
        });
    }

    private buildExistingIndicators(
        projectResult: D2Response["projects"][number],
        dataElements: DataElement[]
    ): ProjectIndicatorRow[] {
        return _(projectResult.indicators)
            .map(indicator => {
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
            })
            .value();
    }

    private buildIndicators(
        settings: UniqueBeneficiariesSettings[],
        projectId: Id,
        dataElements: DataElement[]
    ): ProjectIndicatorRow[] {
        const projectSettings = settings.find(setting => setting.projectId === projectId);
        const indicatorsIds = projectSettings?.indicatorsIds || [];
        return indicatorsIds.map((indicatorId): ProjectIndicatorRow => {
            const dataElementDetails = dataElements.find(
                dataElement => dataElement.id === indicatorId
            );
            return {
                include: false,
                indicatorCode: dataElementDetails?.code || "",
                indicatorName: dataElementDetails?.name || "",
                indicatorId: indicatorId,
                value: 0,
                periodNotAvailable: false,
            };
        });
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
    year: number;
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
