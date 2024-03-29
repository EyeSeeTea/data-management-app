export type Maybe<T> = T | null | undefined;

export type Either<Data, Error> = { type: "success"; data: Data } | { type: "error"; error: Error };

/* Like Partial<T>, but recursive on object values */
export type RecursivePartial<T> = {
    [P in keyof T]?: T[P] extends (infer U)[]
        ? RecursivePartial<U>[]
        : T[P] extends object
        ? RecursivePartial<T[P]>
        : T[P];
};

/*
Extract properties from an object of a certain type:

    type Person = {name: string, age: number, address: string},
    type StringFields = GetPropertiesByType<Person, string>
    // "name" | "address"

*/
export type GetPropertiesByType<T, FieldType> = {
    [Key in keyof T]: T[Key] extends FieldType ? Key : never;
}[keyof T];

/* Get inner type of array */
export type GetItemType<T extends any[]> = T[number];

export type RequiredProps<T> = {
    [P in keyof T]-?: NonNullable<T[P]>;
};

/* Function helpers */

export function isValueInUnionType<S, T extends S>(value: S, values: readonly T[]): value is T {
    return (values as readonly S[]).indexOf(value) >= 0;
}

export function fromPairs<Key extends string, Value>(
    pairs: Array<[Key, Value]>
): Record<Key, Value> {
    const empty = {} as Record<Key, Value>;
    return pairs.reduce((acc, [key, value]) => ({ ...acc, [key]: value }), empty);
}

export function getKeys<T extends object>(obj: T): Array<keyof T> {
    return Object.keys(obj) as Array<keyof T>;
}
