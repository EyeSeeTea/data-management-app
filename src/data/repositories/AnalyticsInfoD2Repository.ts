import { DateTime } from "luxon";
import { D2Api } from "../../types/d2-api";
import { AnalyticsInfo } from "../../domain/entities/AnalyticsInfo";
import { AnalyticsInfoRepository } from "../../domain/repositories/AnalyticsInfoRepository";

export class AnalyticsInfoD2Repository implements AnalyticsInfoRepository {
    constructor(private api: D2Api) {}

    async get(): Promise<AnalyticsInfo> {
        const systemResponse = await this.api.system.info.getData();

        const analyticsDate = systemResponse.lastAnalyticsTableSuccess?.toString();
        if (!analyticsDate) {
            throw new Error("Analytics date not found");
        }

        const executionDateServer = DateTime.fromISO(analyticsDate, {
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
