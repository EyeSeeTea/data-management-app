import { IndicatorReport } from "../entities/IndicatorReport";
import { Id } from "../entities/Ref";
import { IndicatorReportRepository } from "../repositories/IndicatorReportRepository";

export class SaveIndicatorReportUseCase {
    constructor(private indicatorReportRepository: IndicatorReportRepository) {}

    execute(options: SaveIndicatorOptions): Promise<void> {
        const onlyReportsWithProjects = options.reports.filter(
            report => report.projects.length > 0
        );
        return this.indicatorReportRepository.save(onlyReportsWithProjects, options.countryId);
    }
}

type SaveIndicatorOptions = { countryId: Id; reports: IndicatorReport[] };
