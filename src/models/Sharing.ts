import _ from "lodash";

export type D2Access = string;

export interface D2EntityAccess {
    access: D2Access;
    displayName: string;
    id: string;
}

export type D2SharingMap = Record<string, D2EntityAccess>;

export interface D2Sharing {
    public: D2Access;
    external: boolean;
    users: D2SharingMap;
    userGroups: D2SharingMap;
}

export type D2SharingUpdate = Partial<{
    userAccesses: D2EntityAccess[];
    userGroupAccesses: D2EntityAccess[];
}>;

export interface Sharing {
    userAccesses: EntityAccess[];
    userGroupAccesses: EntityAccess[];
}

export interface EntityAccess {
    id: string;
    name: string;
}

export interface Access {
    meta: { read: boolean; write: boolean };
    data?: { read: boolean; write: boolean };
}

export const fullAccess: Access = {
    meta: { read: true, write: true },
    data: { read: true, write: true },
};

export const fullMetadataAccess: Access = {
    meta: { read: true, write: true },
};

export const emptySharing: Sharing = {
    userAccesses: [],
    userGroupAccesses: [],
};

export function getD2SharingMap(entitySharings: EntityAccess[], access: Access): D2SharingMap {
    const result: D2SharingMap = {};
    entitySharings.forEach(entitySharing => {
        result[entitySharing.id] = {
            id: entitySharing.id,
            displayName: entitySharing.name,
            access: getD2Access(access),
        };
    });
    return result;
}

export function getD2Access(d2Access: Access): D2Access {
    const parts = [
        d2Access.meta.read ? "r" : "-",
        d2Access.meta.write ? "w" : "-",
        d2Access.data && d2Access.data.read ? "r" : "-",
        d2Access.data && d2Access.data.write ? "w" : "-",
    ];
    return parts.join("") + "----";
}

export function getEntitiesAccess(d2EntitySharings: D2EntityAccess[]): EntityAccess[] {
    return d2EntitySharings.map(d2EntitySharing => ({
        id: d2EntitySharing.id,
        name: d2EntitySharing.displayName,
    }));
}

export function getEntitiesAccessFromMap(d2SharingMap: D2SharingMap): EntityAccess[] {
    return Object.values(d2SharingMap).map(ref => ({
        id: ref.id,
        name: ref.displayName,
    }));
}

export function getSharing(object: { sharing?: Partial<D2Sharing> }): Sharing {
    const sharing = object.sharing || {};
    const userAccesses = getEntitiesAccessFromMap(sharing.users || {});
    const userGroupAccesses = getEntitiesAccessFromMap(sharing.userGroups || {});
    return { userAccesses, userGroupAccesses };
}

export function getAccessFromD2Access(d2Access: D2Access): Access {
    const [metaRead, metaWrite, dataRead, dataWrite] = d2Access.slice(0, 4).split("");
    return {
        meta: { read: metaRead === "r", write: metaWrite === "w" },
        data: { read: dataRead === "r", write: dataWrite === "w" },
    };
}

export function mergeSharing(sharing1: Sharing, sharing2: Sharing): Sharing {
    const userAccesses = _(sharing1.userAccesses)
        .concat(sharing2.userAccesses)
        .uniqBy(sharing => sharing.id)
        .value();

    const userGroupAccesses = _(sharing1.userGroupAccesses)
        .concat(sharing2.userGroupAccesses)
        .uniqBy(sharing => sharing.id)
        .value();

    return { userAccesses, userGroupAccesses };
}
