import { promiseMap } from "../../migrations/utils";
import { Config } from "../../models/Config";
import Project from "../../models/Project";
import { DataValue } from "../entities/DataValue";
import { IndicatorCalculation } from "../entities/IndicatorCalculation";
import { IndicatorValidation } from "../entities/IndicatorValidation";
import { Code, Id, Ref } from "../entities/Ref";
import { UniqueBeneficiariesPeriod } from "../entities/UniqueBeneficiariesPeriod";
import { UniqueBeneficiariesSettings } from "../entities/UniqueBeneficiariesSettings";
import { DataValueRepository } from "../repositories/DataValueRepository";
import { ProjectRepository } from "../repositories/ProjectRepository";
import { UniqueBeneficiariesSettingsRepository } from "../repositories/UniqueBeneficiariesSettingsRepository";

export class GetIndicatorsValidationUseCase {
    private actualCombination: Ref & { displayName: string };
    constructor(
        private repositories: {
            dataValueRepository: DataValueRepository;
            uniqueBeneficiariesSettingsRepository: UniqueBeneficiariesSettingsRepository;
            projectRepository: ProjectRepository;
            config: Config;
        }
    ) {
        this.actualCombination = this.repositories.config.categoryOptionCombos.actual;
    }

    async execute(options: GetIndicatorsOptions): Promise<IndicatorValidation[]> {
        const [settings, project] = await Promise.all([
            this.getSettings(options.projectId),
            this.getProjectById(options.projectId),
        ]);

        if (settings.indicatorsIds.length === 0) throw Error("No unique indicators selected");

        return this.getIndicatorsWithValues(project, settings);
    }

    private async getSettings(projectId: Id): Promise<UniqueBeneficiariesSettings> {
        return this.repositories.uniqueBeneficiariesSettingsRepository.get(projectId);
    }

    private async getProjectById(projectId: Id): Promise<Project> {
        return this.repositories.projectRepository.getById(projectId);
    }

    private async getIndicatorsWithValues(
        project: Project,
        settings: UniqueBeneficiariesSettings
    ): Promise<IndicatorValidation[]> {
        const dataSetId = project.dataSets?.actual.id;
        if (!dataSetId) throw new Error(`Actual dataSet not found for project: ${project.name}`);

        const indicatorsDetails = project.uniqueIndicators.get({ onlySelected: true });

        const indicatorsWithValues = await promiseMap(settings.periods, period => {
            return this.setValuesToIndicators(
                period,
                dataSetId,
                project.id,
                settings,
                indicatorsDetails
            );
        });

        return indicatorsWithValues;
    }

    private async setValuesToIndicators(
        period: UniqueBeneficiariesPeriod,
        dataSetId: Id,
        projectId: Id,
        settings: UniqueBeneficiariesSettings,
        indicatorsDetails: Array<{ id: Id; code: Code }>
    ): Promise<IndicatorValidation> {
        const dateRange = this.getDatesRange(period);
        const dataValues = await this.getDataValues(dataSetId, projectId, settings, dateRange);
        const actualDataValues = this.getOnlyActualDataValues(dataValues);
        const indicatorCalculation = settings.indicatorsValidation.find(
            item => item.period.id === period.id
        );

        const indicatorCalculations = settings.indicatorsIds.map(indicatorId => {
            const existingRecord = indicatorCalculation?.indicatorsCalculation.find(
                item => item.id === indicatorId
            );
            const details = indicatorsDetails.find(item => item.id === indicatorId);
            if (!details) throw new Error(`Indicator details not found for id: ${indicatorId}`);
            return IndicatorCalculation.updateValuesById(
                indicatorId,
                existingRecord,
                actualDataValues,
                details
            );
        });

        return IndicatorValidation.build({
            createdAt: indicatorCalculation?.createdAt || "",
            lastUpdatedAt: indicatorCalculation?.lastUpdatedAt,
            period: period,
            indicatorsCalculation: indicatorCalculations,
        }).get();
    }

    private async getDataValues(
        dataSetId: Id,
        projectId: Id,
        settings: UniqueBeneficiariesSettings,
        dateRange: DateRange
    ) {
        const { startDate, endDate } = dateRange;
        return this.repositories.dataValueRepository.get({
            dataSetIds: [dataSetId],
            orgUnitIds: [projectId],
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            children: false,
            dataElementsIds: settings.indicatorsIds,
            includeDeleted: false,
            logDataElements: false,
        });
    }

    private getDatesRange(period: UniqueBeneficiariesPeriod): DateRange {
        const startDate = this.getMonthDay(period.startDateMonth, "first");
        const endDate = this.getMonthDay(period.endDateMonth, "last");
        return { startDate, endDate };
    }

    private getOnlyActualDataValues(dataValues: DataValue[]): DataValue[] {
        return dataValues.filter(
            dataValue => dataValue.attributeOptionCombo === this.actualCombination.id
        );
    }

    private getMonthDay(month: number, option: "first" | "last"): Date {
        if (month < 1 || month > 12) {
            throw new Error(`Invalid month number: ${month}`);
        }
        const currentYear = new Date().getFullYear();
        return option === "first"
            ? new Date(currentYear, month - 1, 1)
            : new Date(currentYear, month, 0);
    }
}

type GetIndicatorsOptions = { projectId: Id };
type DateRange = { startDate: Date; endDate: Date };
