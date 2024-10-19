import { generateUid } from "d2/uid";
import { Id } from "../../domain/entities/Ref";
import { UniqueBeneficiariesPeriods } from "../../domain/entities/UniqueBeneficiariesPeriods";
import { UniqueBeneficiariesSettings } from "../../domain/entities/UniqueBeneficiariesSettings";
import { UniqueBeneficiariesSettingsRepository } from "../../domain/repositories/UniqueBeneficiariesSettingsRepository";
import { D2Api, DataStore } from "../../types/d2-api";
import { Maybe } from "../../types/utils";

export class UniqueBeneficiariesSettingsD2Repository
    implements UniqueBeneficiariesSettingsRepository
{
    private dataStore: DataStore;
    constructor(private api: D2Api) {
        this.dataStore = this.api.dataStore("data-management-app");
    }

    async get(projectId: Id): Promise<UniqueBeneficiariesSettings> {
        const d2Response = await this.dataStore
            .get<D2ProjectSettings>(this.buildKeyId(projectId))
            .getData();

        return {
            projectId: projectId,
            periods: this.mergeDefaultPeriodsWithExisting(d2Response?.uniqueBeneficiaries?.periods),
        };
    }

    async save(settings: UniqueBeneficiariesSettings): Promise<void> {
        const existingSettings = await this.dataStore
            .get<D2ProjectSettings>(this.buildKeyId(settings.projectId))
            .getData();

        await this.dataStore
            .save(this.buildKeyId(settings.projectId), {
                ...existingSettings,
                uniqueBeneficiaries: { periods: this.buildPeriods(settings.periods) },
            })
            .getData();
    }

    private buildPeriods(periods: UniqueBeneficiariesPeriods[]): UniqueBeneficiariesPeriods[] {
        const periodsWithIds = this.validateIdsInPeriods(periods);
        return this.excludeDefaultPeriods(periodsWithIds);
    }

    private validateIdsInPeriods(
        periods: UniqueBeneficiariesPeriods[]
    ): UniqueBeneficiariesPeriods[] {
        return periods.map(period => {
            if (!period.id) {
                return UniqueBeneficiariesPeriods.build({ ...period, id: generateUid() }).get();
            }
            return period;
        });
    }

    private buildKeyId(projectId: Id) {
        return `project-${projectId}`;
    }

    private excludeDefaultPeriods(periods: UniqueBeneficiariesPeriods[]) {
        return periods.filter(period => !UniqueBeneficiariesPeriods.isProtected(period));
    }

    private mergeDefaultPeriodsWithExisting(existingPeriods: Maybe<UniqueBeneficiariesPeriods[]>) {
        const defaultData = UniqueBeneficiariesPeriods.defaultPeriods();
        if (!existingPeriods) return defaultData;
        return [
            ...existingPeriods.map(period => UniqueBeneficiariesPeriods.build(period).get()),
            ...defaultData,
        ];
    }
}

type D2ProjectSettings = { uniqueBeneficiaries?: { periods: UniqueBeneficiariesPeriods[] } };
