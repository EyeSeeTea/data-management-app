import { generateUid } from "d2/uid";
import { Id } from "../../domain/entities/Ref";
import { UniqueBeneficiariesPeriod } from "../../domain/entities/UniqueBeneficiariesPeriod";
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
                uniqueBeneficiaries: {
                    ...(existingSettings?.uniqueBeneficiaries || {}),
                    periods: this.buildPeriods(settings.periods),
                },
            })
            .getData();
    }

    private buildPeriods(periods: UniqueBeneficiariesPeriod[]): UniqueBeneficiariesPeriod[] {
        const periodsWithIds = this.validateIdsInPeriods(periods);
        return this.excludeDefaultPeriods(periodsWithIds);
    }

    private validateIdsInPeriods(
        periods: UniqueBeneficiariesPeriod[]
    ): UniqueBeneficiariesPeriod[] {
        return periods.map(period => {
            if (!period.id) {
                return UniqueBeneficiariesPeriod.build({ ...period, id: generateUid() }).get();
            }
            return period;
        });
    }

    private buildKeyId(projectId: Id) {
        return `project-${projectId}`;
    }

    private excludeDefaultPeriods(periods: UniqueBeneficiariesPeriod[]) {
        return periods.filter(period => !UniqueBeneficiariesPeriod.isProtected(period));
    }

    private mergeDefaultPeriodsWithExisting(existingPeriods: Maybe<UniqueBeneficiariesPeriod[]>) {
        const defaultData = UniqueBeneficiariesPeriod.defaultPeriods();
        if (!existingPeriods) return defaultData;
        return [
            ...existingPeriods.map(period => UniqueBeneficiariesPeriod.build(period).get()),
            ...defaultData,
        ];
    }
}

type D2ProjectSettings = { uniqueBeneficiaries?: { periods: UniqueBeneficiariesPeriod[] } };
