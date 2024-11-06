import { IndicatorReport, IndicatorReportToSave } from "../entities/IndicatorReport";
import { Id } from "../entities/Ref";

export interface IndicatorReportRepository {
    getByCountry(countryId: Id): Promise<IndicatorReport[]>;
    save(reports: IndicatorReportToSave[], countryId: Id): Promise<void>;
}
