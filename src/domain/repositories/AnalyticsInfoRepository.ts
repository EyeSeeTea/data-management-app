import { AnalyticsInfo } from "../entities/AnalyticsInfo";

export interface AnalyticsInfoRepository {
    get(): Promise<AnalyticsInfo>;
}
