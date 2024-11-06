import ExcelJS from "exceljs";
import _ from "lodash";
import { IndicatorReport } from "../../domain/entities/IndicatorReport";
import i18n from "../../locales";

export async function buildSpreadSheet(indicatorReport: IndicatorReport, countryName: string) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(i18n.t("Country Projects & Indicators"));
    sheet.columns = generateColumns();
    generateRows(indicatorReport, sheet);
    return generateFileInBuffer(workbook, countryName, indicatorReport);
}

async function generateFileInBuffer(
    workbook: ExcelJS.Workbook,
    countryName: string,
    indicatorReport: IndicatorReport
) {
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${countryName.toLowerCase()}_${indicatorReport.period.name.toLowerCase()}_report.xlsx`;
    return { buffer, filename };
}

function generateRows(indicatorReport: IndicatorReport, sheet: ExcelJS.Worksheet) {
    indicatorReport.projects.forEach(project => {
        const projectName = project.project.name;

        project.indicators.forEach((indicator, index) => {
            sheet.addRow({
                projectName: index === 0 ? projectName : null,
                indicatorCode: indicator.indicatorCode,
                value: indicator.value,
                include: indicator.include ? i18n.t("Yes") : i18n.t("No"),
                total: _(project.indicators).sumBy(indicator =>
                    indicator.include ? indicator.value || 0 : 0
                ),
            });
        });

        const startRow = sheet.rowCount - project.indicators.length + 1;
        const endRow = sheet.rowCount;
        if (project.indicators.length > 1) {
            sheet.mergeCells(`A${startRow}:A${endRow}`);
            sheet.mergeCells(`E${startRow}:E${endRow}`);
        }
    });
}

function generateColumns(): Partial<ExcelJS.Column>[] {
    return [
        { header: i18n.t("Project"), key: "projectName" },
        { header: i18n.t("Selected Activity Indicators"), key: "indicatorCode" },
        { header: i18n.t("Unique Beneficiaries"), key: "value" },
        { header: i18n.t("Include?"), key: "include" },
        { header: i18n.t("Total Unique Served"), key: "total" },
    ];
}
