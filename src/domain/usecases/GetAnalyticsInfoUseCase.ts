import { AnalyticsInfo } from "../entities/AnalyticsInfo";
import { AnalyticsInfoRepository } from "../repositories/AnalyticsInfoRepository";

export class GetAnalyticsInfoUseCase {
    constructor(private analyticsInfoRepository: AnalyticsInfoRepository) {}

    execute(): Promise<AnalyticsInfo> {
        return this.analyticsInfoRepository.get();
    }
}
