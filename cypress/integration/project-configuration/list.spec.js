import _ from "lodash";

describe("Project Configuration - List page", () => {
    beforeEach(() => {
        cy.login("admin");
        cy.loadPage();
        cy.contains("Project Configuration").click();
    });

    it("shows list of user projects", () => {
        cy.get(".data-table__rows > :nth-child(3) > :nth-child(4) span").should("not.be.empty");
    });

    it("opens details window when mouse clicked", () => {
        cy.get(".data-table__rows > :nth-child(3) > :nth-child(4) span").click();
        cy.contains("API link");
        cy.contains("Id");
    });

    it("opens context window when right button mouse is clicked", () => {
        cy.get(".data-table__rows > :nth-child(3) > :nth-child(4) span")
            .first()
            .trigger("contextmenu");

        cy.contains("Details");
        cy.contains("Go to Data Entry");
        cy.contains("Go to Dashboard");
        cy.contains("Add Target Values");
        cy.contains("Download Data");
        cy.contains("Generate / Configure MER");
        cy.contains("Edit");
        cy.contains("Delete");
    });

    it("shows list of user dataset sorted alphabetically", () => {
        cy.get(".data-table__rows > :nth-child(1) > :nth-child(2) span").then(text1 => {
            cy.get(".data-table__rows > :nth-child(2) > :nth-child(2) span").then(text2 => {
                assert.isTrue(text1.text() < text2.text());
            });
        });
    });

    it("shows list of user dataset sorted alphabetically by name desc", () => {
        cy.contains("Name").click();
        cy.get("[data-test='displayName-sorting-desc']");

        cy.get(".data-table__rows > * > :nth-child(2) span").then(spans$ => {
            const names = spans$.get().map(x => x.innerText);
            const sortedNames = _(names)
                .orderBy(name => name.toLowerCase())
                .reverse()
                .value();
            console.log({ names, sortedNames });
            assert.isTrue(_.isEqual(names, sortedNames));
        });
    });

    it("can filter datasets by name", () => {
        cy.get("[data-test='search']")
            .clear()
            .type("cypress test");

        cy.contains("No results found");
    });
});