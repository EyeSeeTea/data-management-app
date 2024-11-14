import { DataElementD2Repository } from "./data/repositories/DataElementD2Repository";
import { DataValueD2Repository } from "./data/repositories/DataValueD2Repository";
import { DataValueExportJsonRepository } from "./data/repositories/DataValueExportJsonRepository";
import { ExportDataElementJsonRepository } from "./data/repositories/ExportDataElementJsonRepository";
import { ImportDataElementSpreadSheetRepository } from "./data/repositories/ImportDataElementSpreadSheetRepository";
import { IndicatorReportD2Repository } from "./data/repositories/IndicatorReportD2Repository";
import { OrgUnitD2Repository } from "./data/repositories/OrgUnitD2Repository";
import { ProjectD2Repository } from "./data/repositories/ProjectD2Repository";
import { UniqueBeneficiariesSettingsD2Repository } from "./data/repositories/UniqueBeneficiariesSettingsD2Repository";
import { UniquePeriodD2Repository } from "./data/repositories/UniquePeriodD2Repository";
import { GetIndicatorsValidationUseCase } from "./domain/usecases/GetIndicatorsValidationUseCase";
import { GetProjectsByCountryUseCase } from "./domain/usecases/GetProjectsByCountryUseCase";
import { GetUniqueBeneficiariesSettingsUseCase } from "./domain/usecases/GetUniqueBeneficiariesSettingsUseCase";
import { ImportDataElementsUseCase } from "./domain/usecases/ImportDataElementsUseCase";
import { RemoveUniqueBeneficiariesPeriodUseCase } from "./domain/usecases/RemoveUniqueBeneficiariesPeriodUseCase";
import { SaveIndicatorReportUseCase } from "./domain/usecases/SaveIndicatorReportUseCase";
import { SaveIndicatorsValidationUseCase } from "./domain/usecases/SaveIndicatorsValidationUseCase";
import { SaveUniquePeriodsUseCase } from "./domain/usecases/SaveUniquePeriodsUseCase";
import { Config } from "./models/Config";
import { D2Api } from "./types/d2-api";

export function getCompositionRoot(api: D2Api, config: Config) {
    const uniqueBeneficiariesSettingsRepository = new UniqueBeneficiariesSettingsD2Repository(api);
    const dataValueRepository = new DataValueD2Repository(api);
    const dataElementRepository = new DataElementD2Repository(api, config);
    const importDataElementSpreadSheetRepository = new ImportDataElementSpreadSheetRepository(
        api,
        config
    );
    const exportDataElementJsonRepository = new ExportDataElementJsonRepository(api, config);
    const dataValueExportRepository = new DataValueExportJsonRepository();
    const orgUnitRepository = new OrgUnitD2Repository(api);
    const projectRepository = new ProjectD2Repository(api, config);
    const indicatorReportRepository = new IndicatorReportD2Repository(api, config);
    const periodRepository = new UniquePeriodD2Repository(api);

    return {
        dataElements: {
            import: new ImportDataElementsUseCase(
                importDataElementSpreadSheetRepository,
                dataElementRepository,
                exportDataElementJsonRepository,
                dataValueRepository,
                dataValueExportRepository,
                orgUnitRepository
            ),
        },
        uniqueBeneficiaries: {
            getSettings: new GetUniqueBeneficiariesSettingsUseCase(
                uniqueBeneficiariesSettingsRepository
            ),
            saveSettings: new SaveUniquePeriodsUseCase(periodRepository),
            removePeriod: new RemoveUniqueBeneficiariesPeriodUseCase(periodRepository),
        },
        indicators: {
            getValidation: new GetIndicatorsValidationUseCase(
                dataValueRepository,
                uniqueBeneficiariesSettingsRepository,
                projectRepository,
                config
            ),
            saveValidation: new SaveIndicatorsValidationUseCase(
                uniqueBeneficiariesSettingsRepository
            ),
            saveReports: new SaveIndicatorReportUseCase(indicatorReportRepository),
        },
        projects: {
            getByCountry: new GetProjectsByCountryUseCase(
                projectRepository,
                uniqueBeneficiariesSettingsRepository,
                dataElementRepository,
                indicatorReportRepository
            ),
        },
    };
}

export type CompositionRoot = ReturnType<typeof getCompositionRoot>;
