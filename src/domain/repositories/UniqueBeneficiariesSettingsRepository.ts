import { Id } from "../entities/Ref";
import { UniqueBeneficiariesSettings } from "../entities/UniqueBeneficiariesSettings";

export interface UniqueBeneficiariesSettingsRepository {
    get(projectId: Id): Promise<UniqueBeneficiariesSettings>;
    save(settings: UniqueBeneficiariesSettings): Promise<void>;
}
