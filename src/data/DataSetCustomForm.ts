import Project, { DataSetType } from "../models/Project";
import { D2Api, Id } from "../types/d2-api";
import { getUid } from "../utils/dhis2";

type CategoryOption = { id: Id; name: string };
type Category = { id: Id; name: string; categoryOptions: CategoryOption[] };
type CategoryOptionCombo = { id: Id; name: string; categoryOptions: { id: Id }[] };
type CategoryCombo = {
    id: Id;
    name: string;
    categories: Category[];
    categoryOptionCombos: CategoryOptionCombo[];
};
type DataElement = {
    id: Id;
    name: string;
    formName?: string;
    categoryCombo: CategoryCombo;
};
type Section = { id: Id; name: string; dataElements: DataElement[] };
type DataSet = { id: Id; name: string; sections: Section[] };

type Group = { categoryCombo: CategoryCombo; elements: DataElement[] };

export class DataSetCustomForm {
    constructor(private api: D2Api) {}

    async generate(dataSetId: Id): Promise<string> {
        const dataSet = await this.fetchDataSet(dataSetId);
        if (!dataSet) return "";
        return this.buildHtml(dataSet);
    }

    async saveCustomForm(
        dataSetId: Id,
        project: Project,
        dataSetType: DataSetType
    ): Promise<Id | undefined> {
        const dataEntryForm = await this.generate(dataSetId);
        if (!dataEntryForm) return undefined;

        const customFormId = getUid("dataEntryForm", dataSetId);
        const labelType = dataSetType === "actual" ? "Actual" : "Target";

        const dataSetMetadata = await this.api.models.dataSets
            .getById(dataSetId, { fields: { $owner: true } })
            .getData();

        const metadata = {
            dataEntryForms: [
                {
                    id: customFormId,
                    /* DHIS2 requires the name of a data entry form to be unique, and two projects
                       may share the same name (only the code is validated as unique), so include the
                       project id, as the short name of the data set does. */
                    name: `${project.name} [${project.code}] ${labelType}`,
                    style: "NORMAL" as const,
                    htmlCode: dataEntryForm,
                },
            ],
            dataSets: [{ ...dataSetMetadata, dataEntryForm: { id: customFormId } }],
        };

        await this.api.metadata.post(metadata).getData();

        return customFormId;
    }

    private async fetchDataSet(id: Id): Promise<DataSet | undefined> {
        const res = await this.api.metadata
            .get({
                dataSets: {
                    fields: {
                        id: true,
                        name: true,
                        sections: {
                            id: true,
                            name: true,
                            dataElements: {
                                id: true,
                                name: true,
                                formName: true,
                                categoryCombo: {
                                    id: true,
                                    name: true,
                                    categories: {
                                        id: true,
                                        name: true,
                                        categoryOptions: { id: true, name: true },
                                    },
                                    categoryOptionCombos: {
                                        id: true,
                                        name: true,
                                        categoryOptions: { id: true },
                                    },
                                },
                            },
                        },
                    },
                    filter: { id: { eq: id } },
                },
            })
            .getData()
            .catch(() => undefined);
        const ds = res?.dataSets[0];
        if (!ds) return undefined;
        return ds as unknown as DataSet;
    }

    private buildHtml(ds: DataSet): string {
        const sections = ds.sections;
        const tabs = sections
            .map(
                (s, i) =>
                    `<button type="button" class="cf-tab${
                        i === 0 ? " selected" : ""
                    }" data-section="${s.id}">${escapeHtml(s.name)}</button>`
            )
            .join("");
        const panels = sections.map((s, i) => this.renderSection(s, i === 0)).join("");
        return [
            `<style>${this.styles()}</style>`,
            `<div class="cf-wrapper">`,
            `  <div class="cf-tabs">${tabs}</div>`,
            `  <div class="cf-panels">${panels}</div>`,
            `</div>`,
            `<script>${this.script()}</script>`,
        ].join("\n");
    }

    private renderSection(section: Section, active: boolean): string {
        const groups = groupByCategoryCombo(section.dataElements);
        const tbodies = groups.map(g => this.renderGroup(g)).join("");
        /* The section title and the filter are rendered outside of the table: as full-width rows
           they made the server-side data set report (used by the data approval screen) read the
           table as a single column and discard every data element row. */
        return `<div class="cf-panel${active ? " active" : ""}" data-section="${section.id}">
  <div class="cf-section-header">${escapeHtml(section.name)}</div>
  <div class="cf-filter-cell"><input type="text" class="cf-filter" placeholder="Type here to filter rows in this section"/></div>
  <table class="cf-table">
    ${tbodies}
  </table>
</div>`;
    }

    private renderGroup(group: Group): string {
        const { categoryCombo: cc, elements } = group;
        const isDefault = cc.name === "default";
        if (isDefault) {
            const coc = cc.categoryOptionCombos[0];
            const rows = elements
                .map(
                    de =>
                        `<tr class="cf-data-row"><td class="cf-de-name">${escapeHtml(
                            formNameOf(de)
                        )}</td><td class="cf-cell"><input id="${de.id}-${
                            coc.id
                        }-val" name="entryfield" title="${escapeHtml(de.name)}"/></td></tr>`
                )
                .join("");
            return `<tbody class="cf-group">
  <tr><th class="cf-cat-corner"></th><th class="cf-cat-header">Value</th></tr>
  ${rows}
</tbody>`;
        }
        const cats = cc.categories;
        const headerRows = this.renderCategoryHeaders(cats);
        const colCocs = this.orderedCocs(cc);
        const rows = elements
            .map(de => {
                const cells = colCocs
                    .map(
                        coc =>
                            `<td class="cf-cell"><input id="${de.id}-${
                                coc.id
                            }-val" name="entryfield" title="${escapeHtml(de.name)}"/></td>`
                    )
                    .join("");
                return `<tr class="cf-data-row"><td class="cf-de-name">${escapeHtml(
                    formNameOf(de)
                )}</td>${cells}</tr>`;
            })
            .join("");
        return `<tbody class="cf-group">
  ${headerRows}
  ${rows}
</tbody>`;
    }

    private renderCategoryHeaders(cats: Category[]): string {
        const counts = cats.map(c => c.categoryOptions.length);
        return cats
            .map((cat, i) => {
                const colspan = counts.slice(i + 1).reduce((a, b) => a * b, 1);
                const repeats = counts.slice(0, i).reduce((a, b) => a * b, 1);
                const cells: string[] = [];
                for (let r = 0; r < repeats; r++) {
                    for (const opt of cat.categoryOptions) {
                        cells.push(
                            `<th class="cf-cat-header" colspan="${colspan}">${escapeHtml(
                                opt.name
                            )}</th>`
                        );
                    }
                }
                return `<tr><th class="cf-cat-name">${escapeHtml(cat.name)}</th>${cells.join(
                    ""
                )}</tr>`;
            })
            .join("");
    }

    private orderedCocs(cc: CategoryCombo): CategoryOptionCombo[] {
        const cartesian = cc.categories.reduce<string[][]>(
            (acc, cat) => acc.flatMap(prev => cat.categoryOptions.map(opt => [...prev, opt.id])),
            [[]]
        );
        const cocByKey = new Map<string, CategoryOptionCombo>();
        for (const coc of cc.categoryOptionCombos) {
            const key = coc.categoryOptions
                .map(o => o.id)
                .sort()
                .join(",");
            cocByKey.set(key, coc);
        }
        return cartesian.map(ids => {
            const key = [...ids].sort().join(",");
            const coc = cocByKey.get(key);
            if (!coc)
                throw new Error(
                    `CategoryOptionCombo not found in categoryCombo ${cc.id} for options: ${key}`
                );
            return coc;
        });
    }

    private styles(): string {
        return `
.cf-wrapper, .cf-wrapper * { font-family: Roboto, sans-serif; box-sizing: border-box; }
.cf-wrapper { color: #212934; }
.cf-tabs { display: flex; border-bottom: 1px solid #d5dae0; margin-bottom: 8px; flex-wrap: wrap; }
.cf-tabs .cf-tab { background: none; border: none; padding: 12px 16px; cursor: pointer; font-size: 14px; color: #4a5768; border-bottom: 3px solid transparent; font-family: Roboto, sans-serif; }
.cf-tabs .cf-tab.selected { color: #2c6693; border-bottom-color: #2c6693; font-weight: 500; }
.cf-panel { display: none; }
.cf-panel.active { display: block; }
.cf-table { min-width: 100%; border-collapse: collapse; table-layout: fixed; }
.cf-section-header { display: block; background-color: #404b5a; color: #fff; text-align: left; padding: 10px 14px; font-weight: 500; font-size: 14px; }
.cf-filter-cell { display: block; padding: 8px; background: #fff; border: 1px solid #e8edf2; border-bottom: 0; }
.cf-filter { width: 100%; padding: 6px 10px; border: 1px solid #d5dae0; border-radius: 3px; font-size: 13px; font-family: Roboto, sans-serif; }
.cf-cat-header, .cf-cat-name, .cf-cat-corner { background-color: #f3f5f7; color: #000; font-weight: 500; padding: 8px 10px; border: 1px solid #e8edf2; font-size: 13px; }
.cf-cat-header { text-align: center; }
.cf-cat-name { text-align: left; }
.cf-de-name { background-color: #fff; padding: 8px 10px; border: 1px solid #e8edf2; font-size: 13px; }
.cf-cell { background-color: #fff; padding: 0; border: 1px solid #e8edf2; }
.cf-cell .field-wrapper { display: block !important; width: 100%; }
.cf-cell input { width: 100%; box-sizing: border-box; border: none; padding: 8px 10px; font-size: 13px; text-align: right; outline: none; background: transparent; font-family: Roboto, sans-serif; }
.cf-cell input:focus { background: #e8f0fa; }
`;
    }

    private script(): string {
        return `
(function() {
  document.querySelectorAll('.cf-wrapper').forEach(function(wrapper) {
    var tabs = wrapper.querySelectorAll('.cf-tab');
    var panels = wrapper.querySelectorAll('.cf-panel');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        var id = tab.getAttribute('data-section');
        tabs.forEach(function(t) { t.classList.remove('selected'); });
        tab.classList.add('selected');
        panels.forEach(function(p) {
          p.classList.toggle('active', p.getAttribute('data-section') === id);
        });
      });
    });
    wrapper.querySelectorAll('.cf-filter').forEach(function(input) {
      input.addEventListener('input', function() {
        var term = input.value.toLowerCase();
        var panel = input.closest('.cf-panel');
        if (!panel) return;
        panel.querySelectorAll('tr.cf-data-row').forEach(function(row) {
          var nameCell = row.querySelector('.cf-de-name');
          if (!nameCell) return;
          var match = nameCell.textContent.toLowerCase().indexOf(term) !== -1;
          row.style.display = match ? '' : 'none';
        });
      });
    });
  });
})();
`;
    }
}

function formNameOf(de: DataElement): string {
    return de.formName || de.name;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function groupByCategoryCombo(des: DataElement[]): Group[] {
    const groups: Group[] = [];
    const idx = new Map<Id, number>();
    for (const de of des) {
        const ccId = de.categoryCombo.id;
        const at = idx.get(ccId);
        if (at !== undefined) {
            groups[at].elements.push(de);
        } else {
            idx.set(ccId, groups.length);
            groups.push({ categoryCombo: de.categoryCombo, elements: [de] });
        }
    }
    return groups;
}
