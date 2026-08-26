import _ from "lodash";
import { Config } from "./Config";
import { D2Api, Id, Ref, MetadataPayload } from "../types/d2-api";
import { getIds, getRefs, postMetadataRequests, getDataStore } from "../utils/dhis2";
import i18n from "../locales";
import { getProjectStorageKey } from "./MerReport";
import { runPromises } from "../utils/promises";
import ProjectDb, { getDashboardId } from "./ProjectDb";

export default class ProjectDelete {
    constructor(private config: Config, private api: D2Api) {}

    public async delete(ids: Id[]): Promise<void> {
        const { api } = this;
        const { organisationUnits, dataSets, dashboards } = await this.getReferences(ids);
        const visualizations = this.getVisualizations(dashboards);
        const dataValues = await this.getDataValues(organisationUnits, dataSets);

        if (!_.isEmpty(dataValues)) {
            throw new Error(
                i18n.t(
                    "There are data values associated, the delete operation cannot be completed. Contact the administrators."
                )
            );
        } else {
            /* Every object is deleted only once whatever references it is gone: the items of a
               dashboard reference the visualizations, and these reference the organisation units.
               Deleting an object still in use makes the API reply 'Could not delete due to
               association with another object'. The custom form of a data set needs no deletion of
               its own: the API deletes it along with the data set that owns it. */
            const deletions = [
                () => this.deleteMetadata({ dashboards: getRefs(dashboards) }),
                () => this.deleteVisualizations(visualizations),
                () =>
                    this.deleteMetadata({
                        organisationUnits: getRefs(organisationUnits),
                        dataSets: getRefs(dataSets),
                    }),
            ];

            const results = await runPromises(deletions, { concurrency: 1 });

            if (!_.every(results)) {
                throw new Error(i18n.t("Cannot delete projects"));
            }

            /* The data store is cleaned once the project no longer exists: doing it first leaves a
               project that could not be deleted without its MER selections. */
            await this.deleteProjectInDataStore(api, organisationUnits);
        }
    }

    private deleteMetadata(payload: Partial<MetadataPayload>): Promise<boolean> {
        return postMetadataRequests(this.api, getNonEmptyRequests([payload]), {
            importStrategy: "DELETE",
        });
    }

    /* The visualizations are deleted one by one instead of with the metadata endpoint: deleting them
       there makes the API reply with an internal error, raised by a callback that runs once the
       transaction has already completed. */
    private async deleteVisualizations(visualizations: Ref[]): Promise<boolean> {
        const { api } = this;

        await runPromises(
            visualizations.map(
                visualization => () => api.models.visualizations.delete(visualization).getData()
            ),
            { concurrency: 1 }
        );

        /* A visualization that cannot be deleted rejects, so all of them are gone at this point. */
        return true;
    }

    private async deleteProjectInDataStore(api: D2Api, organisationUnits: Ref[]) {
        const dataStore = getDataStore(api);

        return runPromises(
            organisationUnits.map(
                orgUnit => () => dataStore.delete(getProjectStorageKey(orgUnit)).getData()
            ),
            { concurrency: 3 }
        );
    }

    private async getDataValues(organisationUnits: Ref[], dataSets: Ref[]) {
        if (_(organisationUnits).isEmpty() || _(dataSets).isEmpty()) return [];

        const { dataValues } = await this.api.dataValues
            .getSet({
                orgUnit: getIds(organisationUnits),
                dataSet: getIds(dataSets),
                lastUpdated: "1970",
                includeDeleted: true,
                limit: 1,
            })
            .getData();

        return dataValues;
    }

    /* Only the items of type VISUALIZATION reference one: the dashboards of a project also contain
       texts and spacers, which are deleted along with the dashboard that contains them. */
    private getVisualizations(
        dashboards: Array<{ id: Id; dashboardItems: Array<{ visualization?: Ref }> }>
    ): Ref[] {
        return _(dashboards)
            .flatMap(dashboard => dashboard.dashboardItems)
            .map(dashboardItem => dashboardItem.visualization)
            .compact()
            .value();
    }

    private async getReferences(ids: Id[]) {
        const { config, api } = this;

        const { organisationUnits, dataSets } = await api.metadata
            .get({
                organisationUnits: {
                    fields: {
                        id: true,
                        attributeValues: { attribute: { id: true }, value: true },
                    },
                    filter: { id: { in: ids } },
                },
                dataSets: {
                    fields: { id: true, sections: { id: true } },
                    /* Data sets are selected by their code, which contains the id of the project:
                       filtering by their metadata attribute is not supported by the API. */
                    filter: { code: { in: ids.flatMap(id => ProjectDb.getDataSetCodes(id)) } },
                },
            })
            .getData();

        const dashboardIds = _(organisationUnits)
            .map(orgUnit => getDashboardId(config, orgUnit))
            .compact()
            .value();

        const { dashboards } = await api.metadata
            .get({
                dashboards: {
                    fields: {
                        id: true,
                        dashboardItems: {
                            id: true,
                            visualization: { id: true },
                        },
                    },
                    filter: { id: { in: dashboardIds } },
                },
            })
            .getData();

        return { organisationUnits, dataSets, dashboards };
    }
}

/* A request with nothing to delete is not sent: the deletion is only considered successful when
   every request replies OK, and the API may not accept an empty payload. */
function getNonEmptyRequests(
    requests: Array<Partial<MetadataPayload>>
): Array<Partial<MetadataPayload>> {
    return requests.filter(request => _.some(_.values(request), refs => !_.isEmpty(refs)));
}
