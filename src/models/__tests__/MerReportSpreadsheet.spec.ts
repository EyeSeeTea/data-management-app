import fs from "fs";
import ExcelJS from "exceljs";
import { getMockApi } from "../../types/d2-api";
import MerReport from "../MerReport";
import config from "./config";
import moment from "moment";
import { mockApiForMerReportEmpty, mockApiForMerReportWithData } from "./mer-data";
import MerReportSpreadsheet from "../MerReportSpreadsheet";

const { api, mock } = getMockApi();

const selector = {
    date: moment(new Date(2019, 12 - 1, 1)),
    organisationUnit: {
        path: "/J0hschZVMBt/PJb0RtEnqlf",
        id: "PJb0RtEnqlf",
        displayName: "Sierra Leona",
    },
};

const sector = {
    id: "ieyBABjYyHO",
    displayName: "Agriculture",
    shortName: "Agriculture",
    code: "AGRICULTURE",
};

const narrativeSheetName = "Sierra Leona-Narrative 12-2019";

/* Set MER_XLSX_OUT to a path to keep the generated workbook and open it in Excel. */
const outputPath = process.env.MER_XLSX_OUT;

async function getNarrativeSheet(): Promise<ExcelJS.Worksheet> {
    const reportBase = await MerReport.create(api, config, selector);
    const report = reportBase
        .set("sectors", [sector])
        .set("executiveSummariesSelected", [sector.id]);
    const { buffer } = await new MerReportSpreadsheet(report).generate();
    if (outputPath) fs.writeFileSync(outputPath, Buffer.from(buffer as ArrayBuffer));

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as ArrayBuffer);
    return workbook.getWorksheet(narrativeSheetName);
}

function getBorderStyles(sheet: ExcelJS.Worksheet, address: string): string[] {
    const { border } = sheet.getCell(address);
    return [border?.top, border?.right, border?.bottom, border?.left].map(
        side => side?.style || ""
    );
}

const allSidesThin = ["thin", "thin", "thin", "thin"];
const noSides = ["", "", "", ""];

describe("MerReportSpreadsheet", () => {
    describe("with no data", () => {
        beforeAll(() => mockApiForMerReportEmpty(mock));

        it("builds xlsx file", async () => {
            const report = await MerReport.create(api, config, selector);
            const { filename } = await new MerReportSpreadsheet(report).generate();
            expect(filename).toBe("MER-Sierra Leona-2019_12.xlsx");
        });
    });

    describe("narrative sheet", () => {
        let sheet: ExcelJS.Worksheet;

        beforeAll(async () => {
            mockApiForMerReportWithData(mock);
            sheet = await getNarrativeSheet();
        });

        it("centers every line of the header block", () => {
            ["A1", "A2", "A3", "A4", "A5"].forEach(address => {
                expect(sheet.getCell(address).alignment.horizontal).toEqual("center");
            });
        });

        it("draws a border around each block of content", () => {
            /* Executive summary: the name of the sector and its text are two separate boxes. */
            expect(getBorderStyles(sheet, "A8")).toEqual(allSidesThin);
            expect(getBorderStyles(sheet, "B8")).toEqual(allSidesThin);
            expect(getBorderStyles(sheet, "F8")).toEqual(allSidesThin);

            /* Additional comments, ministry summary and projected activities: one box of A to F. */
            ["A11", "A14", "A28"].forEach(address => {
                expect(getBorderStyles(sheet, address)).toEqual(allSidesThin);
                expect(getBorderStyles(sheet, address.replace("A", "F"))).toEqual(allSidesThin);
            });

            /* Staff summary: a grid of B to E, with the empty first column left out of it. */
            ["B18", "C18", "E18", "B25", "E25"].forEach(address => {
                expect(getBorderStyles(sheet, address)).toEqual(allSidesThin);
            });
            expect(getBorderStyles(sheet, "A18")).toEqual(noSides);
        });

        it("leaves the titles of the sections without a border", () => {
            ["A7", "A10", "A13", "A16", "A27"].forEach(address => {
                expect(getBorderStyles(sheet, address)).toEqual(noSides);
            });
        });
    });
});
