import { getFillViewportHeight, PageMetrics } from "../use-fill-viewport-height";

const viewportHeight = 800;
const elementTop = 200;
const minHeight = 480;

function metrics(overrides: Partial<PageMetrics>): PageMetrics {
    return {
        viewportHeight,
        documentHeight: viewportHeight,
        elementTop,
        elementHeight: 150,
        ...overrides,
    };
}

describe("getFillViewportHeight", () => {
    describe("when the page overflows the window", () => {
        it("measures the space below the element and fits the element in the rest of the window", () => {
            const page = metrics({ elementHeight: 800, documentHeight: 1016 });

            expect(getFillViewportHeight(page, 0, 0)).toEqual({ height: 584, spaceBelow: 16 });
        });
    });

    describe("when the page does not overflow the window", () => {
        it("keeps the last space measured, as the gap below is just empty viewport", () => {
            const page = metrics({ elementHeight: 150, documentHeight: viewportHeight });

            expect(getFillViewportHeight(page, 16, 0)).toEqual({ height: 584, spaceBelow: 16 });
        });

        it("converges on the first measure, before any space below is known", () => {
            const first = getFillViewportHeight(metrics({}), 0, 0);
            const overflowed = metrics({ elementHeight: first.height, documentHeight: 816 });
            const second = getFillViewportHeight(overflowed, first.spaceBelow, 0);
            const fitted = metrics({
                elementHeight: second.height,
                documentHeight: viewportHeight,
            });

            expect(first).toEqual({ height: 600, spaceBelow: 0 });
            expect(second).toEqual({ height: 584, spaceBelow: 16 });
            expect(getFillViewportHeight(fitted, second.spaceBelow, 0)).toEqual(second);
        });
    });

    describe("when the window is too short", () => {
        it("does not go below the minimum height", () => {
            const page = metrics({ viewportHeight: 600, documentHeight: 600 });

            expect(getFillViewportHeight(page, 16, minHeight)).toEqual({
                height: minHeight,
                spaceBelow: 16,
            });
        });
    });
});
