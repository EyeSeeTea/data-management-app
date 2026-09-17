import { getMockApi } from "../../types/d2-api";
import { DataSetCustomForm } from "../DataSetCustomForm";

const { api, mock } = getMockApi();

const dataSetId = "dataSetId01";
const cashId = "qK4YkTO0rZL";
const peopleId = "SOKYxNdunLQ";
const defaultCocId = "HllvX50cXC0";
const maleCocId = "cocMale0001";
const femaleCocId = "cocFemale01";

/* A data element of this instance really is named like this: the dollar sign is what made the data
   entry endpoint answer "400 Illegal group reference", so it is part of the contract that the form keeps it. */
const cashName = "[B120103] $ amount of unconditional restrictive cash distributed";
const peopleName = "[P010101] # of people assisted";

const defaultCategoryCombo = {
    id: "categoryCombo0",
    name: "default",
    categories: [],
    categoryOptionCombos: [{ id: defaultCocId, name: "default", categoryOptions: [] }],
};

const genderCategoryCombo = {
    id: "categoryCombo1",
    name: "Gender",
    categories: [
        {
            id: "categoryGend",
            name: "Gender",
            categoryOptions: [
                { id: "optionMale1", name: "Male" },
                { id: "optionFemal", name: "Female" },
            ],
        },
    ],
    categoryOptionCombos: [
        { id: maleCocId, name: "Male", categoryOptions: [{ id: "optionMale1" }] },
        { id: femaleCocId, name: "Female", categoryOptions: [{ id: "optionFemal" }] },
    ],
};

const dataSet = {
    id: dataSetId,
    name: "Test project Actual",
    sections: [
        {
            id: "section00001",
            name: "Livelihoods",
            dataElements: [
                {
                    id: cashId,
                    name: cashName,
                    formName: cashName,
                    categoryCombo: defaultCategoryCombo,
                },
                {
                    id: peopleId,
                    name: peopleName,
                    formName: peopleName,
                    categoryCombo: genderCategoryCombo,
                },
            ],
        },
    ],
};

function generateForm(): Promise<string> {
    mock.onGet("/metadata").replyOnce(200, { dataSets: [dataSet] });
    return new DataSetCustomForm(api).generate(dataSetId);
}

function cellHtml(options: {
    deId: string;
    deName: string;
    cocId: string;
    cocName: string;
    tabIndex: number;
}) {
    const { deId, deName, cocId, cocName, tabIndex } = options;
    return (
        `<td class="cf-cell"><input id="${deId}-${cocId}-val" name="entryfield" class="entryfield"` +
        ` type="text" tabindex="${tabIndex}" title="${deName}">` +
        `<span id="${deId}-dataelement" style="display:none">${deName}</span>` +
        `<span id="${cocId}-optioncombo" style="display:none">${cocName}</span></td>`
    );
}

describe("DataSetCustomForm", () => {
    describe("generate", () => {
        it("closes no tag with '/>', so DHIS2 returns the form without processing it", async () => {
            const html = await generateForm();

            /* DefaultDataEntryFormService matches `<input.*?/>` and inserts every match it finds with
               Matcher.appendReplacement, which reads `$` as a group reference and fails on the names
               of these data elements. Without a single "/>" in the form, it finds nothing. */
            expect(html.match(/\/>/g)).toBeNull();
        });

        it("renders each cell with the attributes and spans that DHIS2 would have appended", async () => {
            const html = await generateForm();

            expect(html).toContain(
                cellHtml({
                    deId: cashId,
                    deName: cashName,
                    cocId: defaultCocId,
                    cocName: "default",
                    tabIndex: 1,
                })
            );
            expect(html).toContain(
                cellHtml({
                    deId: peopleId,
                    deName: peopleName,
                    cocId: femaleCocId,
                    cocName: "Female",
                    tabIndex: 3,
                })
            );
        });

        it("numbers the tab indexes of the cells in reading order", async () => {
            const html = await generateForm();
            const tabIndexes = Array.from(html.matchAll(/tabindex="(\d+)"/g)).map(
                match => match[1]
            );

            expect(tabIndexes).toEqual(["1", "2", "3"]);
        });
    });
});
