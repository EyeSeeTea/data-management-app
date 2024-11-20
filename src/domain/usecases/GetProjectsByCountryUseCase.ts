import _ from "lodash";
import { ProjectForList } from "../../models/ProjectsList";
import { getYearsFromProject } from "../../pages/project-indicators-validation/ProjectIndicatorsValidation";
import { Maybe } from "../../types/utils";
import { getId } from "../../utils/dhis2";
import { DataElement } from "../entities/DataElement";
import { IndicatorCalculation } from "../entities/IndicatorCalculation";
import {
    IndicatorReport,
    ProjectCountry,
    ProjectIndicatorRow,
    ProjectRows,
} from "../entities/IndicatorReport";
import { IndicatorValidation } from "../entities/IndicatorValidation";
import { Id, ISODateTimeString } from "../entities/Ref";
import { UniqueBeneficiariesPeriod } from "../entities/UniqueBeneficiariesPeriod";
import { UniqueBeneficiariesSettings } from "../entities/UniqueBeneficiariesSettings";
import { DataElementRepository } from "../repositories/DataElementRepository";
import { IndicatorReportRepository } from "../repositories/IndicatorReportRepository";
import { ProjectRepository } from "../repositories/ProjectRepository";
import { UniqueBeneficiariesSettingsRepository } from "../repositories/UniqueBeneficiariesSettingsRepository";

export class GetProjectsByCountryUseCase {
    constructor(
        private projectRepository: ProjectRepository,
        private beneficiariesSettingsRepository: UniqueBeneficiariesSettingsRepository,
        private dataElementRepository: DataElementRepository,
        private indicatorRepository: IndicatorReportRepository
    ) {}

    async execute(options: GetCountryIndicatorsOptions): Promise<IndicatorsReportsResult> {
        const projects = await this.getProjectsByCountry(options.countryId);
        const [settings, existingReports] = await Promise.all([
            this.getAllSettings(projects.map(project => project.id)),
            this.indicatorRepository.getByCountry(options.countryId),
        ]);

        const settingsInProjects = this.filterSettingsByProjects(settings, projects);
        const indicatorsIds = this.getAllIndicatorsIds(settingsInProjects);
        const dataElements = await this.dataElementRepository.getByIds(indicatorsIds);

        const settingsWithIndicatorsDetails = await this.buildSettingsWithIndicators(
            settingsInProjects,
            dataElements
        );

        const indicatorsReports = this.buildIndicatorReportFromProjects(
            projects,
            settingsWithIndicatorsDetails,
            existingReports,
            options.countryId,
            dataElements
        );
        return { indicatorsReports, settings: settingsWithIndicatorsDetails };
    }

    private buildIndicatorReportFromProjects(
        projects: ProjectForList[],
        settings: UniqueBeneficiariesSettings[],
        existingReports: IndicatorReport[],
        countryId: Id,
        dataElements: DataElement[]
    ): IndicatorReport[] {
        const uniquePeriods = this.getUniquePeriodsFromSettings(settings);
        const allYears = _(projects)
            .map(project => {
                return getYearsFromProject(project.openingDate, project.closedDate);
            })
            .flatten()
            .uniq()
            .sort()
            .value();

        const { periodsKeys, periodsByYears } = IndicatorValidation.groupPeriodsAndYears(
            allYears,
            uniquePeriods
        );

        return periodsKeys.map((periodYearKey): IndicatorReport => {
            const { period, year } = periodsByYears[periodYearKey];
            const existingData = existingReports.find(
                report =>
                    report.period.equalMonths(period.startDateMonth, period.endDateMonth) &&
                    report.year === year &&
                    report.countryId === countryId
            );

            return IndicatorReport.create({
                year,
                countryId,
                createdAt: existingData?.createdAt || "",
                lastUpdatedAt: existingData?.lastUpdatedAt || "",
                period,
                projects: this.generateProjects(
                    projects,
                    settings,
                    period,
                    dataElements,
                    year,
                    existingData
                ),
            });
        });
    }

    private getSettingsProject(
        settings: UniqueBeneficiariesSettings[],
        projectId: Id
    ): Maybe<UniqueBeneficiariesSettings> {
        const currentSettings = settings.find(setting => setting.projectId === projectId);

        return !currentSettings?.indicatorsIds || currentSettings?.indicatorsIds.length === 0
            ? undefined
            : currentSettings;
    }

    private getUniquePeriodsFromSettings(
        settings: UniqueBeneficiariesSettings[]
    ): UniqueBeneficiariesPeriod[] {
        const allPeriods = settings.flatMap(setting => setting.periods);
        return UniqueBeneficiariesPeriod.uniquePeriodsByDates(allPeriods);
    }

    private generateProjects(
        projectsByPeriod: ProjectForList[],
        settings: UniqueBeneficiariesSettings[],
        period: UniqueBeneficiariesPeriod,
        dataElements: DataElement[],
        year: number,
        existingRecord: Maybe<IndicatorReport>
    ): ProjectRows[] {
        return _(projectsByPeriod)
            .map(project => {
                const existingProject = existingRecord?.projects.find(
                    item => item.id === project.id
                );
                const settingsProject = this.getSettingsProject(settings, project.id);
                if (!settingsProject) return undefined;

                const notIndicatorsAvailable = this.isProjectNotAvailable(
                    period,
                    settingsProject,
                    project,
                    year
                );

                const indicatorsCalculation = settingsProject?.indicatorsValidation
                    .find(
                        item =>
                            period.equalMonths(
                                item.period.startDateMonth,
                                item.period.endDateMonth
                            ) && item.year === year
                    )
                    ?.indicatorsCalculation.map((indicator): ProjectIndicatorRow => {
                        const existingIndicator = existingProject?.indicators.find(
                            item => item.indicatorId === indicator.id
                        );
                        return {
                            periodNotAvailable: notIndicatorsAvailable,
                            include: existingIndicator?.include || false,
                            indicatorCode: indicator.code || "",
                            indicatorName: indicator.name || "",
                            indicatorId: indicator.id,
                            value: IndicatorCalculation.getTotal(indicator),
                        };
                    });

                const projectIndicators =
                    indicatorsCalculation && indicatorsCalculation.length > 0
                        ? indicatorsCalculation
                        : settingsProject.indicatorsIds.map((indicatorId): ProjectIndicatorRow => {
                              const dataElementDetails = dataElements.find(
                                  dataElement => dataElement.id === indicatorId
                              );
                              const existingIndicator = existingProject?.indicators.find(
                                  item => item.indicatorId === indicatorId
                              );
                              return {
                                  periodNotAvailable: notIndicatorsAvailable,
                                  indicatorId,
                                  indicatorCode: dataElementDetails?.code || "",
                                  indicatorName: dataElementDetails?.name || "",
                                  value: 0,
                                  include: existingIndicator?.include || false,
                              };
                          });

                return { id: project.id, project: project, indicators: projectIndicators };
            })
            .compact()
            .value();
    }

    private isProjectNotAvailable(
        period: UniqueBeneficiariesPeriod,
        settings: UniqueBeneficiariesSettings,
        project: ProjectCountry,
        year: number
    ): boolean {
        const periodExist = settings.periods.find(item =>
            period.equalMonths(item.startDateMonth, item.endDateMonth)
        );

        const projectIsInYear = this.checkProjectDateIsInYear(
            project.openingDate,
            project.closedDate,
            year
        );

        return !periodExist || !projectIsInYear;
    }

    private checkProjectDateIsInYear(
        startDate: ISODateTimeString,
        endDate: ISODateTimeString,
        year: number
    ): boolean {
        const start = new Date(startDate);
        const end = new Date(endDate);
        return year >= start.getFullYear() && year <= end.getFullYear();
    }

    private async buildSettingsWithIndicators(
        settings: UniqueBeneficiariesSettings[],
        dataElements: DataElement[]
    ): Promise<UniqueBeneficiariesSettings[]> {
        return settings.map(setting => {
            return {
                ...setting,
                indicatorsValidation: setting.indicatorsValidation.map(indicatorValidation => {
                    return IndicatorValidation.build({
                        ...indicatorValidation,
                        indicatorsCalculation: indicatorValidation.indicatorsCalculation.map(
                            indicatorCalculation => {
                                const dataElement = dataElements.find(
                                    dataElement => dataElement.id === indicatorCalculation.id
                                );
                                return IndicatorCalculation.build({
                                    ...indicatorCalculation,
                                    code: dataElement?.code || "",
                                    name: dataElement?.name || "",
                                }).get();
                            }
                        ),
                    }).get();
                }),
            };
        });
    }

    private getAllIndicatorsIds(settings: UniqueBeneficiariesSettings[]): Id[] {
        return settings.flatMap(setting => setting.indicatorsIds);
    }

    private filterSettingsByProjects(
        settings: UniqueBeneficiariesSettings[],
        projects: ProjectForList[]
    ): UniqueBeneficiariesSettings[] {
        const projectIds = projects.map(getId);
        const settingsByProjects = settings.filter(setting =>
            projectIds.includes(setting.projectId)
        );
        return settingsByProjects;
    }

    private getProjectsByCountry(countryId: Id): Promise<ProjectForList[]> {
        return this.projectRepository.getByCountries(countryId);
    }

    private getAllSettings(projectsIds: Id[]): Promise<UniqueBeneficiariesSettings[]> {
        return this.beneficiariesSettingsRepository.getAll({ projectsIds });
    }
}

export type GetCountryIndicatorsOptions = { countryId: Id };

export type IndicatorsReportsResult = {
    indicatorsReports: IndicatorReport[];
    settings: UniqueBeneficiariesSettings[];
};
