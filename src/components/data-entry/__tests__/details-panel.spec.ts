import { setupAutoOpenDetailsPanel } from "../details-panel";

type ShimWindow = Window & { dhis2?: { shim?: { showDetailsBar?: () => void } } };

const entryFieldHtml = `<input id="deId-cocId-val" name="entryfield" class="entryfield" type="text">`;
const filterFieldHtml = `<input class="cf-filter" type="text">`;

function renderField(html: string): HTMLInputElement {
    document.body.innerHTML = html;
    const input = document.body.querySelector("input");
    if (!input) throw new Error("No input rendered");
    return input;
}

function focusAndFlush(input: HTMLInputElement): void {
    input.focus();
    jest.runAllTimers();
}

describe("setupAutoOpenDetailsPanel", () => {
    const showDetailsBar = jest.fn();

    beforeAll(() => {
        jest.useFakeTimers();
        (window as ShimWindow).dhis2 = { shim: { showDetailsBar } };
        setupAutoOpenDetailsPanel();
    });

    afterAll(() => {
        jest.useRealTimers();
        delete (window as ShimWindow).dhis2;
    });

    beforeEach(() => {
        showDetailsBar.mockClear();
        document.body.innerHTML = "";
    });

    describe("when an entry field gets the focus", () => {
        it("opens the details panel once the plugin has sent the highlighted field", () => {
            const input = renderField(entryFieldHtml);

            input.focus();
            expect(showDetailsBar).toHaveBeenCalledTimes(0);

            jest.runAllTimers();
            expect(showDetailsBar).toHaveBeenCalledTimes(1);
        });

        it("opens it again on every focus, so a panel closed by the user reopens", () => {
            const input = renderField(entryFieldHtml);

            focusAndFlush(input);
            input.blur();
            focusAndFlush(input);

            expect(showDetailsBar).toHaveBeenCalledTimes(2);
        });

        it("registers the listener only once when injected again", () => {
            setupAutoOpenDetailsPanel();
            const input = renderField(entryFieldHtml);

            focusAndFlush(input);

            expect(showDetailsBar).toHaveBeenCalledTimes(1);
        });
    });

    describe("when another input gets the focus", () => {
        it("leaves the details panel as it is", () => {
            const input = renderField(filterFieldHtml);

            focusAndFlush(input);

            expect(showDetailsBar).toHaveBeenCalledTimes(0);
        });
    });
});
