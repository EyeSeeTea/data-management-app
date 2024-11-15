import { D2Api, DataStore } from "../../types/d2-api";
import {
    UniqueBeneficiariesPeriod,
    UniqueBeneficiariesPeriodsAttrs,
} from "../../domain/entities/UniqueBeneficiariesPeriod";
import { UniquePeriodRepository } from "../../domain/repositories/UniquePeriodRepository";
import { DATA_MANAGEMENT_NAMESPACE } from "../common";
import { Id } from "../../domain/entities/Ref";
import { D2ApiUbSettings } from "../common/D2ApiUbSettings";
import { generateUid } from "d2/uid";

export class UniquePeriodD2Repository implements UniquePeriodRepository {
    private dataStore: DataStore;
    private namespace = DATA_MANAGEMENT_NAMESPACE;
    private d2ApiUbSettings: D2ApiUbSettings;

    constructor(private api: D2Api) {
        this.dataStore = this.api.dataStore(this.namespace);
        this.d2ApiUbSettings = new D2ApiUbSettings(this.api);
    }

    async getByProject(projectId: Id): Promise<UniqueBeneficiariesPeriod[]> {
        const settings = await this.d2ApiUbSettings.get(projectId);
        return settings.periods;
    }

    async save(projectId: Id, periods: UniqueBeneficiariesPeriod[]): Promise<void> {
        const d2Response = await this.dataStore
            .get<D2PeriodResponse>(this.d2ApiUbSettings.buildKeyId(projectId))
            .getData();

        await this.dataStore
            .save(this.buildKeyId(projectId), {
                ...d2Response,
                uniqueBeneficiaries: {
                    ...(d2Response?.uniqueBeneficiaries || {}),
                    periods: UniqueBeneficiariesPeriod.buildPeriods(periods, generateUid()),
                },
            })
            .getData();
    }

    private getProjectKey() {
        return "project-";
    }

    private buildKeyId(projectId: Id) {
        return `${this.getProjectKey()}${projectId}`;
    }
}

type D2PeriodResponse = {
    uniqueBeneficiaries: {
        periods: Omit<UniqueBeneficiariesPeriodsAttrs, "projectId">[];
    };
};
