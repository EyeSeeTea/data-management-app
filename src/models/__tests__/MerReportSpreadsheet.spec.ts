import { getMockApi } from "d2-api";
import MerReport from "../MerReport";
import config from "./config";
import moment from "moment";
import { mockApiForMerReportEmpty } from "./mer-data";
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

let report: MerReport;

describe("create with no data", () => {
    beforeAll(async () => {
        mockApiForMerReportEmpty(mock);
        report = await MerReport.create(api, config, selector);
    });

    it("builds xlsx file", async () => {
        const { filename } = await new MerReportSpreadsheet(report).generate();
        expect(filename).toBe("MER-Sierra Leona-2019_12.xlsx");
    });
});