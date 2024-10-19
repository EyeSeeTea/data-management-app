import { UniqueBeneficiariesPeriods } from "../entities/UniqueBeneficiariesPeriods";
import { UniqueBeneficiariesSettings } from "../entities/UniqueBeneficiariesSettings";
import { UniqueBeneficiariesSettingsRepository } from "../repositories/UniqueBeneficiariesSettingsRepository";

export class RemoveUniqueBeneficiariesPeriodUseCase {
    constructor(private repository: UniqueBeneficiariesSettingsRepository) {}

    async execute(options: Options): Promise<void> {
        const settings = await this.repository.get(options.projectId);
        const isPeriodProtected = UniqueBeneficiariesPeriods.isProtected(options.period);
        if (isPeriodProtected) {
            throw new Error("Cannot delete a protected period");
        }
        return this.save(settings, options);
    }

    private save(settings: UniqueBeneficiariesSettings, options: Options) {
        const newSettings: UniqueBeneficiariesSettings = {
            ...settings,
            periods: settings.periods.filter(period => period.id !== options.period.id),
        };
        return this.repository.save(newSettings);
    }
}

export type Options = { projectId: string; period: UniqueBeneficiariesPeriods };
