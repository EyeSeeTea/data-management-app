import _ from "lodash";
import { generateUid } from "d2/uid";
import {
    IndicatorValidation,
    IndicatorValidationAttrs,
} from "../../domain/entities/IndicatorValidation";
import { Id } from "../../domain/entities/Ref";
import { UniqueBeneficiariesPeriod } from "../../domain/entities/UniqueBeneficiariesPeriod";
import { UniqueBeneficiariesSettings } from "../../domain/entities/UniqueBeneficiariesSettings";
import { D2Api, DataStore } from "../../types/d2-api";
import { Maybe } from "../../types/utils";
import {
    IndicatorCalculation,
    IndicatorCalculationAttrs,
} from "../../domain/entities/IndicatorCalculation";
import { DATA_MANAGEMENT_NAMESPACE } from "../common";

export class D2ApiUbSettings {
    private dataStore: DataStore;
    private namespace = DATA_MANAGEMENT_NAMESPACE;

    constructor(private api: D2Api) {
        this.dataStore = this.api.dataStore(this.namespace);
    }

    async getAll(): Promise<UniqueBeneficiariesSettings[]> {
        return this.getAllSettings(1, []);
    }

    async get(projectId: Id): Promise<UniqueBeneficiariesSettings> {
        const d2Response = await this.dataStore
            .get<D2ProjectSettings>(this.buildKeyId(projectId))
            .getData();

        return this.buildSettings(d2Response, projectId);
    }

    private buildSettings(d2Response: Maybe<D2ProjectSettings>, projectId: string) {
        const periods = this.mergeDefaultPeriodsWithExisting(
            d2Response?.uniqueBeneficiaries?.periods
        );

        const indicatorsIds = d2Response?.uniqueBeneficiaries?.indicatorsIds || [];
        const indicatorsValidation = d2Response?.uniqueBeneficiaries?.indicatorsValidation || [];

        const hasIndicatorsValidation = indicatorsValidation.length > 0;
        const indicatorsToInclude = hasIndicatorsValidation
            ? this.buildExistingIndicatorsValidation(d2Response, periods)
            : this.buildIndicatorsValidationFromPeriods(periods, indicatorsIds);

        return {
            projectId: projectId,
            periods,
            indicatorsIds: indicatorsIds,
            indicatorsValidation: indicatorsToInclude,
        };
    }

    async save(settings: UniqueBeneficiariesSettings): Promise<void> {
        const existingSettings = await this.dataStore
            .get<D2ProjectSettings>(this.buildKeyId(settings.projectId))
            .getData();

        const currentDate = new Date().toISOString();

        const d2SettingsToSave: D2ProjectSettings = {
            ...existingSettings,
            uniqueBeneficiaries: {
                ...(existingSettings?.uniqueBeneficiaries || {}),
                indicatorsIds: existingSettings?.uniqueBeneficiaries?.indicatorsIds || [],
                periods: this.buildPeriods(settings.periods),
                indicatorsValidation: settings.indicatorsValidation.map(indicatorValidation => {
                    return {
                        periodId: indicatorValidation.period.id,
                        createdAt: indicatorValidation.createdAt || currentDate,
                        lastUpdatedAt: currentDate,
                        indicatorsCalculation: indicatorValidation.indicatorsCalculation.map(
                            indicatorCalculation => {
                                return {
                                    comment: indicatorCalculation.comment,
                                    editableNewValue: indicatorCalculation.editableNewValue,
                                    id: indicatorCalculation.id,
                                    newValue: indicatorCalculation.newValue,
                                    returningValue: indicatorCalculation.returningValue,
                                    total: IndicatorCalculation.getTotal(indicatorCalculation),
                                    code: "",
                                    name: "",
                                };
                            }
                        ),
                    };
                }),
            },
        };

        await this.dataStore.save(this.buildKeyId(settings.projectId), d2SettingsToSave).getData();
    }

    private async getAllSettings(
        page: number,
        settings: UniqueBeneficiariesSettings[]
    ): Promise<UniqueBeneficiariesSettings[]> {
        const response = await this.getEntriesPaginated(page);
        const settingsFromEntries = this.convertEntriesToSettings(response.entries);
        const acumSettings = [...settings, ...settingsFromEntries];
        return response.entries.length === 0
            ? acumSettings
            : this.getAllSettings(page + 1, acumSettings);
    }

    private convertEntriesToSettings(entries: D2Entries[]): UniqueBeneficiariesSettings[] {
        return entries.map((d2Entry): UniqueBeneficiariesSettings => {
            return this.buildSettings(d2Entry, d2Entry.key.replace(this.getProjectKey(), ""));
        });
    }

    private getEntriesPaginated(page: number): Promise<D2DataStoreResponse> {
        return this.api
            .request<D2DataStoreResponse>({
                method: "get",
                url: `/dataStore/${this.namespace}`,
                params: { page: page, pageSize: 50, fields: "uniqueBeneficiaries" },
            })
            .getData();
    }

    private buildIndicatorsValidationFromPeriods(
        periods: UniqueBeneficiariesPeriod[],
        indicatorsIds: Id[]
    ): IndicatorValidation[] {
        return periods.map(period => {
            return IndicatorValidation.build({
                createdAt: "",
                lastUpdatedAt: "",
                period,
                indicatorsCalculation: indicatorsIds.map(indicatorId => {
                    return IndicatorCalculation.build({
                        id: indicatorId,
                        newValue: 0,
                        editableNewValue: undefined,
                        returningValue: undefined,
                        comment: "",
                        code: "",
                        name: "",
                    }).get();
                }),
            }).get();
        });
    }

    private buildExistingIndicatorsValidation(
        settings: Maybe<D2ProjectSettings>,
        periods: UniqueBeneficiariesPeriod[]
    ): IndicatorValidation[] {
        return _(settings?.uniqueBeneficiaries?.indicatorsValidation || [])
            .map(d2IndicatorValidation => {
                const period = periods.find(period => period.id === d2IndicatorValidation.periodId);
                if (!period) return undefined;

                return IndicatorValidation.build({
                    createdAt: d2IndicatorValidation.createdAt,
                    lastUpdatedAt: d2IndicatorValidation.lastUpdatedAt,
                    period: period,
                    indicatorsCalculation: d2IndicatorValidation.indicatorsCalculation.map(
                        d2IndicatorCalculation => {
                            return IndicatorCalculation.build({
                                ...d2IndicatorCalculation,
                                code: "",
                            }).get();
                        }
                    ),
                }).get();
            })
            .compact()
            .value();
    }

    private buildPeriods(periods: UniqueBeneficiariesPeriod[]): UniqueBeneficiariesPeriod[] {
        const periodsWithIds = this.validateIdsInPeriods(periods);
        return this.excludeDefaultPeriods(periodsWithIds);
    }

    private validateIdsInPeriods(
        periods: UniqueBeneficiariesPeriod[]
    ): UniqueBeneficiariesPeriod[] {
        return periods.map(period => {
            if (!period.id) {
                return UniqueBeneficiariesPeriod.build({ ...period, id: generateUid() }).get();
            }
            return period;
        });
    }

    private getProjectKey() {
        return "project-";
    }

    private buildKeyId(projectId: Id) {
        return `${this.getProjectKey()}${projectId}`;
    }

    private excludeDefaultPeriods(periods: UniqueBeneficiariesPeriod[]) {
        return periods.filter(period => !UniqueBeneficiariesPeriod.isProtected(period));
    }

    private mergeDefaultPeriodsWithExisting(existingPeriods: Maybe<UniqueBeneficiariesPeriod[]>) {
        const defaultData = UniqueBeneficiariesPeriod.defaultPeriods();
        if (!existingPeriods) return defaultData;
        return [
            ...existingPeriods.map(period => UniqueBeneficiariesPeriod.build(period).get()),
            ...defaultData,
        ];
    }
}

type D2DataStoreResponse = { pager: { page: number; pageSize: number }; entries: D2Entries[] };
type D2Entries = { key: string; uniqueBeneficiaries: D2UniqueBeneficiary };

type D2ProjectSettings = { uniqueBeneficiaries?: D2UniqueBeneficiary };

type D2IndicatorValidation = Omit<IndicatorValidationAttrs, "period" | "indicatorsCalculation"> & {
    periodId: Id;
    indicatorsCalculation: Omit<
        IndicatorCalculationAttrs,
        "previousValue" | "nextValue" | "code"
    >[];
};

type D2UniqueBeneficiary = {
    periods: UniqueBeneficiariesPeriod[];
    indicatorsIds: Id[];
    indicatorsValidation: D2IndicatorValidation[];
};
