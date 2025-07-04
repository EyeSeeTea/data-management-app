import { ProjectStatusD2Repository } from "./data/ProjectStatusD2Repository";
import { DataElementD2Repository } from "./data/repositories/DataElementD2Repository";
import { DataValueD2Repository } from "./data/repositories/DataValueD2Repository";
import { IndicatorReportD2Repository } from "./data/repositories/IndicatorReportD2Repository";
import { ProjectD2Repository } from "./data/repositories/ProjectD2Repository";
import { UniqueBeneficiariesSettingsD2Repository } from "./data/repositories/UniqueBeneficiariesSettingsD2Repository";
import { UniquePeriodD2Repository } from "./data/repositories/UniquePeriodD2Repository";
import { GetIndicatorsValidationUseCase } from "./domain/usecases/GetIndicatorsValidationUseCase";
import { GetProjectByIdUseCase } from "./domain/usecases/GetProjectByIdUseCase";
import { GetProjectsByCountryUseCase } from "./domain/usecases/GetProjectsByCountryUseCase";
import { GetProjectStatusesUseCase } from "./domain/usecases/GetProjectStatusesUseCase";
import { GetUniqueBeneficiariesSettingsUseCase } from "./domain/usecases/GetUniqueBeneficiariesSettingsUseCase";
import { RemoveUniqueBeneficiariesPeriodUseCase } from "./domain/usecases/RemoveUniqueBeneficiariesPeriodUseCase";
import { SaveIndicatorReportUseCase } from "./domain/usecases/SaveIndicatorReportUseCase";
import { SaveIndicatorsValidationUseCase } from "./domain/usecases/SaveIndicatorsValidationUseCase";
import { SaveUniquePeriodsUseCase } from "./domain/usecases/SaveUniquePeriodsUseCase";
import { Config } from "./models/Config";
import { D2Api } from "./types/d2-api";

export function getCompositionRoot(api: D2Api, config: Config) {
    const uniqueBeneficiariesSettingsRepository = new UniqueBeneficiariesSettingsD2Repository(
        api,
        config
    );
    const dataValueRepository = new DataValueD2Repository(api);
    const dataElementRepository = new DataElementD2Repository(api, config);

    const projectRepository = new ProjectD2Repository(api, config);
    const indicatorReportRepository = new IndicatorReportD2Repository(api, config);
    const periodRepository = new UniquePeriodD2Repository(api, config);
    const projectStatusRepository = new ProjectStatusD2Repository(api, config);

    return {
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
            getById: new GetProjectByIdUseCase(projectRepository),
            getByCountry: new GetProjectsByCountryUseCase(
                projectRepository,
                uniqueBeneficiariesSettingsRepository,
                dataElementRepository,
                indicatorReportRepository
            ),
        },
        projectStatus: {
            getBy: new GetProjectStatusesUseCase(projectStatusRepository),
        },
    };
}

export type CompositionRoot = ReturnType<typeof getCompositionRoot>;
