import { Id } from "../../domain/entities/Ref";
import { UniqueBeneficiariesSettings } from "../../domain/entities/UniqueBeneficiariesSettings";
import { UniqueBeneficiariesSettingsRepository } from "../../domain/repositories/UniqueBeneficiariesSettingsRepository";
import { D2Api } from "../../types/d2-api";
import { D2ApiUbSettings } from "../common/D2ApiUbSettings";

export class UniqueBeneficiariesSettingsD2Repository
    implements UniqueBeneficiariesSettingsRepository
{
    private d2ApiUbSettings: D2ApiUbSettings;

    constructor(private api: D2Api) {
        this.d2ApiUbSettings = new D2ApiUbSettings(this.api);
    }

    async getAll(): Promise<UniqueBeneficiariesSettings[]> {
        return this.d2ApiUbSettings.getAll();
    }

    async get(projectId: Id): Promise<UniqueBeneficiariesSettings> {
        return this.d2ApiUbSettings.get(projectId);
    }

    async save(settings: UniqueBeneficiariesSettings): Promise<void> {
        await this.d2ApiUbSettings.save(settings);
    }
}
