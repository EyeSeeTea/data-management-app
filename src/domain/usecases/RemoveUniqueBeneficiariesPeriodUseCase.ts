import i18n from "../../locales";
import { UniqueBeneficiariesPeriod } from "../entities/UniqueBeneficiariesPeriod";
import { UniquePeriodRepository } from "../repositories/UniquePeriodRepository";

export class RemoveUniqueBeneficiariesPeriodUseCase {
    constructor(private repository: UniquePeriodRepository) {}

    async execute(options: Options): Promise<void> {
        const periods = await this.repository.getByProject(options.projectId);
        const isPeriodProtected = options.period.isProtected();
        if (isPeriodProtected) {
            throw new Error(i18n.t("Cannot delete a protected period"));
        }
        return this.save(periods, options);
    }

    private save(periods: UniqueBeneficiariesPeriod[], options: Options) {
        const periodsToSave = periods.filter(period => period.id !== options.period.id);
        return this.repository.save(options.projectId, periodsToSave);
    }
}

export type Options = { projectId: string; period: UniqueBeneficiariesPeriod };
