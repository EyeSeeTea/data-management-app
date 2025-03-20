export type SaveOptions = { post: boolean };

export function getImportModeFromOptions(persist: boolean): "COMMIT" | "VALIDATE" {
    return persist ? "COMMIT" : "VALIDATE";
}

export function skipValidation(importMode: "COMMIT" | "VALIDATE"): boolean {
    return importMode === "VALIDATE";
}
