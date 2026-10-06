import { D2Api, D2ModelSchemas, MetadataPayloadBase } from "@eyeseetea/d2-api/2.42";

export * from "@eyeseetea/d2-api/2.42";

export function getMockApi() {
    const api = new D2Api({ backend: "xhr" });
    const mock = api.getMockAdapter();
    return { api, mock };
}

export type D2Payload = Partial<MetadataPayloadBase<D2ModelSchemas>>;
