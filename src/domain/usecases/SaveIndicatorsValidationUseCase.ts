import { IndicatorValidation, IndicatorValidationAttrs } from "../entities/IndicatorValidation";
import { Id } from "../entities/Ref";
import { UniqueBeneficiariesSettings } from "../entities/UniqueBeneficiariesSettings";
import { UniqueBeneficiariesSettingsRepository } from "../repositories/UniqueBeneficiariesSettingsRepository";

export class SaveIndicatorsValidationUseCase {
    constructor(private settingsRepository: UniqueBeneficiariesSettingsRepository) {}

    async execute(options: SaveIndicatorsOptions): Promise<void> {
        const { indicatorsValidation, projectId } = options;
        const settings = await this.settingsRepository.get(projectId);

        const hasErrors = IndicatorValidation.validateCommentIndicators(
            indicatorsValidation.indicatorsCalculation
        );

        if (hasErrors) throw new Error("Cannot save indicators without comments");

        const periodIsValid = settings.periods.find(
            period => period.id === indicatorsValidation.period.id
        );
        if (!periodIsValid) throw new Error(`Period not found: ${indicatorsValidation.period.id}`);

        const indicatorExist = settings.indicatorsValidation.find(
            item => item.period.id === indicatorsValidation.period.id
        );

        const currentDate = new Date().toISOString();
        const indicatorAttributes: IndicatorValidationAttrs = {
            ...options.indicatorsValidation,
            lastUpdatedAt: indicatorExist ? currentDate : undefined,
            createdAt: indicatorExist ? indicatorExist.createdAt : currentDate,
        };

        const indicatorValidationToSave = IndicatorValidation.build(indicatorAttributes).get();

        const settingsToSave: UniqueBeneficiariesSettings = {
            ...settings,
            indicatorsValidation: indicatorExist
                ? settings.indicatorsValidation.map(indicator => {
                      if (indicator.period.id !== indicatorsValidation.period.id) return indicator;
                      return IndicatorValidation.build(indicatorValidationToSave).get();
                  })
                : settings.indicatorsValidation.concat(indicatorValidationToSave),
        };
        return this.settingsRepository.save(settingsToSave);
    }
}

type SaveIndicatorsOptions = { projectId: Id; indicatorsValidation: IndicatorValidation };
