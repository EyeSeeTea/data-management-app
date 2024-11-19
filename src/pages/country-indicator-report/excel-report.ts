import ExcelJS from "exceljs";
import _ from "lodash";
import { IndicatorReport } from "../../domain/entities/IndicatorReport";
import { UniqueBeneficiariesPeriod } from "../../domain/entities/UniqueBeneficiariesPeriod";
import { UniqueBeneficiariesSettings } from "../../domain/entities/UniqueBeneficiariesSettings";
import i18n from "../../locales";
import { buildMonthYearFormatDate } from "../../utils/date";
import { getCurrentPeriodForProject } from "./IndicatorReportTable";

type SpreadSheetOptions = {
    indicatorReport: IndicatorReport;
    countryName: string;
    settings: UniqueBeneficiariesSettings[];
    period: UniqueBeneficiariesPeriod;
    year: number;
};

export async function buildSpreadSheet(options: SpreadSheetOptions) {
    const { indicatorReport, countryName, year } = options;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(i18n.t("Country Projects & Indicators"));
    sheet.columns = generateColumns();
    generateRows(options, sheet);
    return generateFileInBuffer(workbook, countryName, indicatorReport, year);
}

async function generateFileInBuffer(
    workbook: ExcelJS.Workbook,
    countryName: string,
    indicatorReport: IndicatorReport,
    year: number
) {
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${countryName.toLowerCase()}_${indicatorReport.period.name.toLowerCase()}_${year}_report.xlsx`;
    return { buffer, filename };
}

function generateRows(options: SpreadSheetOptions, sheet: ExcelJS.Worksheet) {
    const { indicatorReport, settings, period } = options;
    const notAvailableText = i18n.t("N/A");
    indicatorReport.projects.forEach(project => {
        const projectDates = `${buildMonthYearFormatDate(
            project.project.openingDate
        )} - ${buildMonthYearFormatDate(project.project.closedDate)}`;
        const currentPeriod = getCurrentPeriodForProject(settings, project.id, period);

        const projectName = `${project.project.name} \r\n (${projectDates}) \r\n Period: ${
            currentPeriod?.name || notAvailableText
        }`;

        project.indicators.forEach((indicator, index) => {
            sheet.addRow({
                projectName: index === 0 ? projectName : null,
                indicatorCode: IndicatorReport.generateIndicatorFullName(indicator),
                value: indicator.periodNotAvailable ? notAvailableText : indicator.value,
                include: indicator.periodNotAvailable
                    ? notAvailableText
                    : indicator.include
                    ? i18n.t("Yes")
                    : i18n.t("No"),
                total: indicator.periodNotAvailable
                    ? notAvailableText
                    : _(project.indicators).sumBy(indicator =>
                          indicator.include ? indicator.value || 0 : 0
                      ),
            });
        });

        const startRow = sheet.rowCount - project.indicators.length + 1;
        const endRow = sheet.rowCount;
        if (project.indicators.length > 1) {
            sheet.mergeCells(`A${startRow}:A${endRow}`);
            sheet.getCell(`A${startRow}`).alignment = { wrapText: true };
            sheet.mergeCells(`E${startRow}:E${endRow}`);
        }
    });

    generateTotalFooter(indicatorReport, sheet);
}

function generateTotalFooter(indicatorReport: IndicatorReport, sheet: ExcelJS.Worksheet) {
    const allIndicators = indicatorReport.projects.flatMap(project => project.indicators);
    const totalCountryBeneficiaries = _(allIndicators).sumBy(indicator =>
        indicator.include ? indicator.value || 0 : 0
    );

    sheet.addRow({});
    sheet.addRow({
        value: i18n.t("Country Unique Beneficiaries"),
        include: totalCountryBeneficiaries,
    });

    const totalRows = sheet.rowCount;
    sheet.mergeCells(`D${totalRows}:E${totalRows}`);
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
