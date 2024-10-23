import { UniqueBeneficiariesPeriod } from "../entities/UniqueBeneficiariesPeriod";
import { UniqueBeneficiariesSettings } from "../entities/UniqueBeneficiariesSettings";
import { UniqueBeneficiariesSettingsRepository } from "../repositories/UniqueBeneficiariesSettingsRepository";

export class SaveUniqueBeneficiariesSettingsUseCase {
    constructor(private repository: UniqueBeneficiariesSettingsRepository) {}

    async execute(options: SaveSettingsOptions): Promise<void> {
        const settings = await this.repository.get(options.projectId);
        const periodExist = settings.periods.some(period => period.id === options.period.id);
        const isPeriodProtected = UniqueBeneficiariesPeriod.isProtected(options.period);
        const { isValid, errorMessage } = UniqueBeneficiariesPeriod.validate(options.period);
        if (!isValid) {
            throw new Error(errorMessage);
        }
        if (isPeriodProtected) {
            throw new Error("Cannot save a protected period");
        }
        return this.saveSettings(settings, periodExist, options);
    }

    private saveSettings(
        settings: UniqueBeneficiariesSettings,
        periodExist: boolean,
        options: SaveSettingsOptions
    ) {
        const newSettings: UniqueBeneficiariesSettings = {
            ...settings,
            periods: this.buildPeriodsToSave(settings.periods, options.period, periodExist),
        };
        return this.repository.save(newSettings);
    }

    private buildPeriodsToSave(
        existingPeriods: UniqueBeneficiariesPeriod[],
        currentPeriod: UniqueBeneficiariesPeriod,
        periodExist: boolean
    ): UniqueBeneficiariesPeriod[] {
        const periodsToSave = periodExist
            ? existingPeriods.map(period => {
                  return period.id === currentPeriod.id ? currentPeriod : period;
              })
            : [...existingPeriods, currentPeriod];

        if (!this.checkDuplicatesInPeriods(periodsToSave)) {
            throw new Error("Cannot save duplicate periods");
        }
        return periodsToSave;
    }

    private checkDuplicatesInPeriods(periods: UniqueBeneficiariesPeriod[]): boolean {
        return periods.length === new Set(periods.map(period => period.name)).size;
    }
}

export type SaveSettingsOptions = { projectId: string; period: UniqueBeneficiariesPeriod };
