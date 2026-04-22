import moment, { Moment } from "moment";
import i18n from "../locales";

export function toISOString(date: Moment) {
    return date.format("YYYY-MM-DDTHH:mm:ss");
}

export function formatDateLong(inputDate: string | Date | Moment | undefined): string {
    if (!inputDate) {
        return "";
    } else {
        // Assume all dates are UTC (sufix Z), add if not found
        const inputDateUtc =
            typeof inputDate === "string" && !inputDate.endsWith("Z") ? inputDate + "Z" : inputDate;
        const date = moment(inputDateUtc);
        return date.format("YYYY-MM-DD HH:mm:ss");
    }
}

export function formatDateShort(inputDate: string | Date | Moment | undefined): string {
    if (!inputDate) {
        return "";
    } else {
        const date = moment(inputDate);
        return date.format("YYYY-MM-DD");
    }
}

export function getMonthsRange(
    startDate: Moment | undefined,
    endDate: Moment | undefined
): Moment[] {
    if (!startDate || !endDate) {
        return [];
    } else {
        const currentDate = startDate.clone();
        const outputDates: Moment[] = [];

        while (currentDate <= endDate) {
            outputDates.push(currentDate.clone());
            currentDate.add(1, "month");
        }
        return outputDates;
    }
}

export const monthFormat = "YYYYMM";

export function getPeriodIds(range: Moment[]): Array<{ id: string }> {
    return range.map(m => ({ id: m.format(monthFormat) }));
}

export function buildMonthYearFormatDate(dateIsoString: string): string {
    // examples: JAN 2021, NOV 2024
    return new Date(dateIsoString).toLocaleString("default", { month: "short", year: "numeric" });
}

export function getMonthNameFromNumber(monthNumber: string | number): string {
    return months.find(month => month.value === monthNumber.toString())?.text || "";
}

export const months = [
    { value: "1", text: i18n.t("January") },
    { value: "2", text: i18n.t("February") },
    { value: "3", text: i18n.t("March") },
    { value: "4", text: i18n.t("April") },
    { value: "5", text: i18n.t("May") },
    { value: "6", text: i18n.t("June") },
    { value: "7", text: i18n.t("July") },
    { value: "8", text: i18n.t("August") },
    { value: "9", text: i18n.t("September") },
    { value: "10", text: i18n.t("October") },
    { value: "11", text: i18n.t("November") },
    { value: "12", text: i18n.t("December") },
];
