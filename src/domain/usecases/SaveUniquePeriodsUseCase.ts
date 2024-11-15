import i18n from "../../locales";
import { UniqueBeneficiariesPeriod } from "../entities/UniqueBeneficiariesPeriod";
import { UniquePeriodRepository } from "../repositories/UniquePeriodRepository";

export class SaveUniquePeriodsUseCase {
    constructor(private repository: UniquePeriodRepository) {}

    async execute(options: SaveSettingsOptions): Promise<void> {
        const periods = await this.repository.getByProject(options.projectId);
        const periodExist = periods.some(period => period.id === options.period.id);
        const isPeriodProtected = options.period.isProtected();
        const { isValid, errorMessage } = UniqueBeneficiariesPeriod.validate(options.period);

        if (this.isAnnualOrSemiAnnual(options.period)) {
            throw new Error(i18n.t("Period is equal to the predefined annual/semi-annual period"));
        } else if (!isValid) {
            throw new Error(errorMessage);
        } else if (isPeriodProtected) {
            throw new Error(i18n.t("Cannot save a protected period"));
        } else if (this.validateMonths(options.period, periods)) {
            throw new Error(i18n.t("Already exist a period with the same months"));
        } else {
            return this.saveSettings(periods, periodExist, options);
        }
    }

    private validateMonths(
        period: UniqueBeneficiariesPeriod,
        existingPeriods: UniqueBeneficiariesPeriod[]
    ): boolean {
        return existingPeriods.some(existingPeriod =>
            existingPeriod.equalMonths(period.startDateMonth, period.endDateMonth)
        );
    }

    private isAnnualOrSemiAnnual(period: UniqueBeneficiariesPeriod): boolean {
        const defaultPeriods = UniqueBeneficiariesPeriod.defaultPeriods();
        return defaultPeriods.some(defaultPeriod =>
            defaultPeriod.equalMonths(period.startDateMonth, period.endDateMonth)
        );
    }

    private saveSettings(
        periods: UniqueBeneficiariesPeriod[],
        periodExist: boolean,
        options: SaveSettingsOptions
    ) {
        const periodsToSave = this.buildPeriodsToSave(periods, options.period, periodExist);
        return this.repository.save(options.projectId, periodsToSave);
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
            throw new Error(i18n.t("Cannot save duplicate periods"));
        }
        return periodsToSave;
    }

    private checkDuplicatesInPeriods(periods: UniqueBeneficiariesPeriod[]): boolean {
        return periods.length === new Set(periods.map(period => period.name)).size;
    }
}

export type SaveSettingsOptions = { projectId: string; period: UniqueBeneficiariesPeriod };
