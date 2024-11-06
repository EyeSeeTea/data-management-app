import _ from "lodash";
import { ProjectForList } from "../../models/ProjectsList";
import { getId } from "../../utils/dhis2";
import { DataElement } from "../entities/DataElement";
import { IndicatorCalculation } from "../entities/IndicatorCalculation";
import { IndicatorReport, ProjectIndicatorRow, ProjectRows } from "../entities/IndicatorReport";
import { IndicatorValidation } from "../entities/IndicatorValidation";
import { Id } from "../entities/Ref";
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

    async execute(options: GetCountryIndicatorsOptions): Promise<IndicatorReport[]> {
        const [projects, settings, existingReports] = await Promise.all([
            this.getProjectsByCountry(options.countryId),
            this.getAllSettings(),
            this.indicatorRepository.getByCountry(options.countryId),
        ]);

        const settingsInProjects = this.filterSettingsByProjects(settings, projects);
        const indicatorsIds = this.getAllIndicatorsIds(settingsInProjects);
        const dataElements = await this.dataElementRepository.getByIds(indicatorsIds);

        const settingsWithIndicatorsDetails = await this.buildSettingsWithIndicators(
            settingsInProjects,
            dataElements
        );

        return this.buildIndicatorReportFromProjects(
            projects,
            settingsWithIndicatorsDetails,
            existingReports,
            options.countryId,
            dataElements
        );
    }

    private buildIndicatorReportFromProjects(
        projects: ProjectForList[],
        settings: UniqueBeneficiariesSettings[],
        existingReports: IndicatorReport[],
        countryId: Id,
        dataElements: DataElement[]
    ): IndicatorReport[] {
        const allPeriods = _(settings)
            .flatMap(setting => setting.periods)
            .uniqBy(period => period.id)
            .value();

        return allPeriods.map((period): IndicatorReport => {
            const existingData = existingReports.find(
                report => report.period?.id === period.id && report.countryId === countryId
            );

            return existingData
                ? existingData
                : IndicatorReport.create({
                      countryId,
                      createdAt: "",
                      lastUpdatedAt: "",
                      period,
                      projects: this.generateProjects(projects, settings, period, dataElements),
                  });
        });
    }

    private generateProjects(
        projectsByPeriod: ProjectForList[],
        settings: UniqueBeneficiariesSettings[],
        period: UniqueBeneficiariesPeriod,
        dataElements: DataElement[]
    ): ProjectRows[] {
        return _(projectsByPeriod)
            .map(project => {
                const settingsProject = settings.find(setting => setting.projectId === project.id);

                if (!settingsProject?.indicatorsIds || settingsProject.indicatorsIds.length === 0)
                    return undefined;

                const isCustomPeriod = period.type === "CUSTOM";
                const periodExist = settingsProject?.periods.find(item => item.id === period.id);

                const notIndicatorsAvailable = isCustomPeriod && !periodExist;

                const indicatorsCalculation = settingsProject?.indicatorsValidation
                    .find(item => item.period.id === period.id)
                    ?.indicatorsCalculation.map((indicator): ProjectIndicatorRow => {
                        return {
                            periodNotAvailable: notIndicatorsAvailable,
                            include: false,
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
                              return {
                                  periodNotAvailable: notIndicatorsAvailable,
                                  indicatorId,
                                  indicatorCode: dataElementDetails?.code || "",
                                  indicatorName: dataElementDetails?.name || "",
                                  value: 0,
                                  include: false,
                              };
                          });

                return {
                    id: project.id,
                    project: project,
                    indicators: projectIndicators,
                };
            })
            .compact()
            .value();
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

    private getAllSettings(): Promise<UniqueBeneficiariesSettings[]> {
        return this.beneficiariesSettingsRepository.getAll();
    }
}

export type GetCountryIndicatorsOptions = { countryId: Id };
