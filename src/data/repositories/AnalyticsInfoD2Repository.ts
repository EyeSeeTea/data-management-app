import { DateTime } from "luxon";
import { D2Api } from "../../types/d2-api";
import { AnalyticsInfo } from "../../domain/entities/AnalyticsInfo";
import { AnalyticsInfoRepository } from "../../domain/repositories/AnalyticsInfoRepository";

export class AnalyticsInfoD2Repository implements AnalyticsInfoRepository {
    constructor(private api: D2Api) {}

    async get(): Promise<AnalyticsInfo> {
        const response = await this.api.models.jobConfigurations
            .get({
                filter: { name: { eq: "Analytics" } },
                fields: { nextExecutionTime: true, lastExecutedStatus: true, lastExecuted: true },
            })
            .getData();

        const systemResponse = await this.api.system.info.getData();

        const analyticsData = response.objects[0];
        if (!analyticsData) {
            throw new Error("Analytics job configuration not found");
        }

        const executionDateServer = DateTime.fromISO(analyticsData.lastExecuted, {
            zone: systemResponse.serverTimeZoneId,
        });
        if (!executionDateServer) {
            throw new Error("Last execution date not found in analytics job configuration");
        }

        executionDateServer.setZone(systemResponse.serverTimeZoneId);

        return {
            lastExecutionDate: executionDateServer.toLocal().toISO() || "",
        };
    }
}
