import { Id } from "../../domain/entities/Ref";
import { UniqueBeneficiariesSettings } from "../../domain/entities/UniqueBeneficiariesSettings";
import { UniqueBeneficiariesSettingsRepository } from "../../domain/repositories/UniqueBeneficiariesSettingsRepository";
import { Config } from "../../models/Config";
import { D2Api } from "../../types/d2-api";
import { Maybe } from "../../types/utils";
import { D2ApiUbSettings } from "../common/D2ApiUbSettings";

export class UniqueBeneficiariesSettingsD2Repository
    implements UniqueBeneficiariesSettingsRepository
{
    private d2ApiUbSettings: D2ApiUbSettings;

    constructor(private api: D2Api, private config: Config) {
        this.d2ApiUbSettings = new D2ApiUbSettings(this.api, this.config);
    }

    async getAll(options: { projectsIds: Maybe<Id[]> }): Promise<UniqueBeneficiariesSettings[]> {
        return this.d2ApiUbSettings.getAll(options);
    }

    async get(projectId: Id): Promise<UniqueBeneficiariesSettings> {
        return this.d2ApiUbSettings.get(projectId);
    }

    async save(settings: UniqueBeneficiariesSettings): Promise<void> {
        await this.d2ApiUbSettings.save(settings);
    }
}
