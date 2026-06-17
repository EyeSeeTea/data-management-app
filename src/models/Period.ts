import moment from "moment";
import _ from "lodash";
import { Maybe } from "../types/utils";
import { getMonthsRange } from "../utils/date";

export type Period = string;
export type PeriodStrategy = "monthly" | "yearly" | "monthly_interleaved_by_month";

export const monthPeriod = "YYYYMM";
export const yearPeriod = "YYYY";

export function getPeriodsFromRange(start: Maybe<Date>, end: Maybe<Date>): Period[] {
    if (!start || !end) return [];
    const months = getMonthsRange(moment(start), moment(end));
    return months.map(date => date.format(monthPeriod));
}

export function filterPeriods(periods: Period[], options: { toDate?: boolean } = {}): Period[] {
    const now = moment();
    return !options.toDate ? periods : periods.filter(period => moment(period, monthPeriod) <= now);
}

export function getVisualizationPeriods(
    periods: Period[],
    options: { toDate?: boolean; periodStrategy?: PeriodStrategy } = {}
): Period[] {
    const { toDate, periodStrategy = "monthly" } = options;

    const transformedPeriods =
        periodStrategy === "yearly"
            ? _.uniq(periods.map(period => moment(period, monthPeriod).format(yearPeriod))).sort()
            : periodStrategy === "monthly_interleaved_by_month"
            ? _(periods)
                  .groupBy(period => moment(period, monthPeriod).format("MM"))
                  .toPairs()
                  .sortBy(([month]) => month)
                  .flatMap(([_month, monthPeriods]) => _.sortBy(monthPeriods))
                  .value()
            : periods;

    if (!toDate) return transformedPeriods;

    const now = moment();

    return transformedPeriods.filter(period =>
        periodStrategy === "yearly"
            ? moment(period, yearPeriod).year() <= now.year()
            : moment(period, monthPeriod) <= now
    );
}
