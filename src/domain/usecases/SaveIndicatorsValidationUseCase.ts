import i18n from "../../locales";
import { IndicatorValidation, IndicatorValidationAttrs } from "../entities/IndicatorValidation";
import { Id } from "../entities/Ref";
import { UniqueBeneficiariesSettings } from "../entities/UniqueBeneficiariesSettings";
import { UniqueBeneficiariesSettingsRepository } from "../repositories/UniqueBeneficiariesSettingsRepository";

export class SaveIndicatorsValidationUseCase {
    constructor(private settingsRepository: UniqueBeneficiariesSettingsRepository) {}

    async execute(options: SaveIndicatorsOptions): Promise<void> {
        const { indicatorsValidations, projectId } = options;
        const settings = await this.settingsRepository.get(projectId);

        const rowWithError = this.getIndexRowWithError(indicatorsValidations);

        if (rowWithError !== -1) {
            const row = indicatorsValidations[rowWithError];
            throw new Error(
                i18n.t("Cannot save indicators without comments for period: {{period}}", {
                    period: row.period.name,
                    nsSeparator: false,
                })
            );
        }

        const indicatorsToSave = this.buildIndicatorsToSave(indicatorsValidations, settings);

        return this.saveIndicators(settings, indicatorsToSave);
    }

    private getIndexRowWithError(indicatorsValidations: IndicatorValidation[]): number {
        return indicatorsValidations.findIndex(item =>
            IndicatorValidation.validateCommentIndicators(item.indicatorsCalculation)
        );
    }

    private saveIndicators(
        settings: UniqueBeneficiariesSettings,
        indicatorsToSave: IndicatorValidation[]
    ): Promise<void> {
        const settingsToSave: UniqueBeneficiariesSettings = {
            ...settings,
            indicatorsValidation: indicatorsToSave,
        };

        return this.settingsRepository.save(settingsToSave);
    }

    private buildIndicatorsToSave(
        indicatorsValidations: IndicatorValidation[],
        settings: UniqueBeneficiariesSettings
    ): IndicatorValidation[] {
        return indicatorsValidations.map(indicator => {
            const indicatorExist = settings.indicatorsValidation.find(
                item => item.period.id === indicator.period.id
            );

            const currentDate = new Date().toISOString();
            const indicatorAttributes: IndicatorValidationAttrs = {
                ...indicator,
                lastUpdatedAt: indicatorExist ? currentDate : undefined,
                createdAt: indicatorExist ? indicatorExist.createdAt : currentDate,
            };
            return IndicatorValidation.build(indicatorAttributes).get();
        });
    }
}

type SaveIndicatorsOptions = { projectId: Id; indicatorsValidations: IndicatorValidation[] };
