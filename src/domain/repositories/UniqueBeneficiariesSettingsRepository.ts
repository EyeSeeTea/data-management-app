import { Maybe } from "../../types/utils";
import { Id } from "../entities/Ref";
import { UniqueBeneficiariesSettings } from "../entities/UniqueBeneficiariesSettings";

export interface UniqueBeneficiariesSettingsRepository {
    get(projectId: Id): Promise<UniqueBeneficiariesSettings>;
    save(settings: UniqueBeneficiariesSettings): Promise<void>;
    getAll(options: { projectsIds: Maybe<Id[]> }): Promise<UniqueBeneficiariesSettings[]>;
}
