import { D2Api } from "../../types/d2-api";
import { DataValue } from "../../domain/entities/DataValue";
import {
    DataValueRepository,
    GetDataValueOptions,
} from "../../domain/repositories/DataValueRepository";
import { D2DataElementGroup } from "./D2DataElementGroup";
import { writeToDisk } from "../../scripts/utils/logger";
export class DataValueD2Repository implements DataValueRepository {
    d2DataElementGroup: D2DataElementGroup;
    constructor(private api: D2Api) {
        this.d2DataElementGroup = new D2DataElementGroup(api);
    }

    async get(options: GetDataValueOptions): Promise<DataValue[]> {
        const res$ = this.api.dataValues.getSet({
            dataSet: options.dataSetIds || [],
            dataElement: options.dataElementsIds || [],
            orgUnit: options.orgUnitIds,
            children: options.children,
            includeDeleted: false,
            startDate: options.startDate,
            endDate: options.endDate,
        });
        const res = await res$.getData();
        if (options.logDataElements && options.dataElementsIds) {
            await this.exportSqlAuditDataElements(options.dataElementsIds);
        }
        return res.dataValues;
    }

    async remove(dataValues: DataValue[]): Promise<void> {
        const res = await this.api.dataValues
            .postSet({ force: true, importStrategy: "DELETE" }, { dataValues })
            .getData();

        console.info("Remove Data values", JSON.stringify(res.importCount, null, 4));

        console.info("Permanently remove soft deleted data values...");
        await this.api.maintenance
            .runTasks([this.api.maintenance.tasks.softDeletedDataValueRemoval])
            .getData();
        console.info("Soft deleted data values finished.");
    }

    private async exportSqlAuditDataElements(dataElementsIds: string[]): Promise<void> {
        const sqlContent = `delete from datavalueaudit where dataelementid IN (select dataelementid from dataelement where uid IN (${dataElementsIds}));`;
        writeToDisk("audit_data_element.sql", sqlContent);
    }
}
