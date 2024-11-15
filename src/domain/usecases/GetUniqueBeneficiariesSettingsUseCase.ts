import { Id } from "../entities/Ref";
import { UniqueBeneficiariesSettings } from "../entities/UniqueBeneficiariesSettings";
import { UniqueBeneficiariesSettingsRepository } from "../repositories/UniqueBeneficiariesSettingsRepository";

export class GetUniqueBeneficiariesSettingsUseCase {
    constructor(private uniqueBeneficiariesRepository: UniqueBeneficiariesSettingsRepository) {}

    execute(id: Id): Promise<UniqueBeneficiariesSettings> {
        return this.uniqueBeneficiariesRepository.get(id);
    }
}
