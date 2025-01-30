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
import { Config } from "../../models/Config";
import { promiseMap } from "../../migrations/utils";
import { ProjectCountry } from "../../domain/entities/IndicatorReport";
import { D2ApiProject } from "./D2ApiProject";

export class D2ApiUbSettings {
    private dataStore: DataStore;
    private d2ApiProject: D2ApiProject;
    private namespace = DATA_MANAGEMENT_NAMESPACE;

    constructor(private api: D2Api, private config: Config) {
        this.dataStore = this.api.dataStore(this.namespace);
        this.d2ApiProject = new D2ApiProject(api, this.config);
    }

    async getAll(options: { projectsIds: Maybe<Id[]> }): Promise<UniqueBeneficiariesSettings[]> {
        return this.getAllSettings(1, [], options);
    }

    async get(projectId: Id): Promise<UniqueBeneficiariesSettings> {
        const projects = await this.d2ApiProject.getByIds([projectId]);
        const project = _(projects).first();
        if (!project) throw new Error(`Project not found for id: ${projectId}`);

        const d2Response = await this.dataStore
            .get<D2ProjectSettings>(this.buildKeyId(project.id))
            .getData();

        return this.buildSettings(d2Response, project);
    }

    private buildSettings(d2Response: Maybe<D2ProjectSettings>, project: ProjectCountry) {
        const uniqueBeneficiaries = d2Response?.uniqueBeneficiaries;
        const periods = this.mergeDefaultPeriodsWithExisting(uniqueBeneficiaries?.periods);

        const indicatorsIds = uniqueBeneficiaries?.indicatorsIds || [];
        const indicatorsValidation = uniqueBeneficiaries?.indicatorsValidation || [];

        const hasIndicatorsValidation = indicatorsValidation.length > 0;
        const indicatorsToInclude = hasIndicatorsValidation
            ? this.buildExistingIndicatorsValidation(d2Response, periods)
            : IndicatorValidation.buildIndicatorsValidationFromPeriods(
                  periods,
                  indicatorsIds,
                  project
              );

        return {
            projectId: project.id,
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
                periods: UniqueBeneficiariesPeriod.buildPeriods(settings.periods, generateUid()),
                indicatorsValidation: this.mapIndicatorValidations(settings, currentDate),
            },
        };

        await this.dataStore.save(this.buildKeyId(settings.projectId), d2SettingsToSave).getData();
    }

    private mapIndicatorValidations(
        settings: UniqueBeneficiariesSettings,
        currentDate: string
    ): D2IndicatorValidation[] {
        return settings.indicatorsValidation.map(indicatorValidation => {
            return {
                year: indicatorValidation.year,
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
        });
    }

    private async getAllSettings(
        page: number,
        settings: UniqueBeneficiariesSettings[],
        options: { projectsIds: Maybe<Id[]> }
    ): Promise<UniqueBeneficiariesSettings[]> {
        const response = await this.getEntriesPaginated(page);
        const filterByProjects = options.projectsIds
            ? response.entries.filter(entry => {
                  const projectId = entry.key.replace(this.getProjectKey(), "");
                  return options.projectsIds?.includes(projectId);
              })
            : response.entries;

        const settingsFromEntries = await this.convertEntriesToSettings(filterByProjects);
        const acumSettings = [...settings, ...settingsFromEntries];
        return response.entries.length === 0
            ? acumSettings
            : this.getAllSettings(page + 1, acumSettings, options);
    }

    private async convertEntriesToSettings(
        entries: D2Entries[]
    ): Promise<UniqueBeneficiariesSettings[]> {
        const projectsIds = entries.map(entry => entry.key.replace(this.getProjectKey(), ""));
        const allProjects = await promiseMap(projectsIds, projectId =>
            this.d2ApiProject.getByIds([projectId])
        );

        const projects = _(allProjects).flatten().value();

        return entries.map((d2Entry): UniqueBeneficiariesSettings => {
            const projectId = d2Entry.key.replace(this.getProjectKey(), "");
            const project = projects.find(project => project.id === projectId);
            if (!project) throw new Error(`Project not found for id: ${projectId}`);
            return this.buildSettings(d2Entry, project);
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
                    year: d2IndicatorValidation.year,
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

    getProjectKey() {
        return "project-";
    }

    buildKeyId(projectId: Id) {
        return `${this.getProjectKey()}${projectId}`;
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
