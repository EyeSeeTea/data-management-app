import { Id } from "../entities/Ref";
import { UniqueBeneficiariesPeriod } from "../entities/UniqueBeneficiariesPeriod";

export interface UniquePeriodRepository {
    getByProject(projectId: Id): Promise<UniqueBeneficiariesPeriod[]>;
    save(projectId: Id, periods: UniqueBeneficiariesPeriod[]): Promise<void>;
}
