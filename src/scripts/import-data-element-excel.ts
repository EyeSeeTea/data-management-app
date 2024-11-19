import parse from "parse-typed-args";

import { getApp } from "./common";
import { getConfig } from "../models/Config";
import { DataValueExportJsonRepository } from "../data/repositories/DataValueExportJsonRepository";
import { ExportDataElementJsonRepository } from "../data/repositories/ExportDataElementJsonRepository";
import { ImportDataElementSpreadSheetRepository } from "../data/repositories/ImportDataElementSpreadSheetRepository";
import { OrgUnitD2Repository } from "../data/repositories/OrgUnitD2Repository";
import { ImportDataElementsUseCase } from "../domain/usecases/ImportDataElementsUseCase";
import { DataElementD2Repository } from "../data/repositories/DataElementD2Repository";
import { DataValueD2Repository } from "../data/repositories/DataValueD2Repository";

async function main() {
    const parser = parse({
        opts: {
            url: {},
            excelPath: {},
            post: { switch: true },
            export: { switch: true },
            deleteDataValues: { switch: true },
        },
    });

    const { opts } = parser(process.argv);

    if (!opts.url) return;
    if (!opts.excelPath) return;

    const { api } = await getApp({ baseUrl: opts.url });
    console.info("Loading config. metadata...");
    const config = await getConfig(api);

    const dataValueRepository = new DataValueD2Repository(api);
    const dataElementRepository = new DataElementD2Repository(api, config);
    const importRepository = new ImportDataElementSpreadSheetRepository(api, config);
    const exportDataElementJsonRepository = new ExportDataElementJsonRepository(api, config);
    const dataValueExportRepository = new DataValueExportJsonRepository();
    const orgUnitRepository = new OrgUnitD2Repository(api);

    const importDataElementUseCase = new ImportDataElementsUseCase(
        importRepository,
        dataElementRepository,
        exportDataElementJsonRepository,
        dataValueRepository,
        dataValueExportRepository,
        orgUnitRepository
    );

    await importDataElementUseCase.execute({
        excelPath: opts.excelPath,
        post: opts.post ?? false,
        export: opts.export ?? false,
        deleteDataValues: opts.deleteDataValues ?? false,
    });
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
