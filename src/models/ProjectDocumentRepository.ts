import { promiseMap } from "../migrations/utils";
import { D2Api } from "../types/d2-api";
import { getUid } from "../utils/dhis2";
import { Id, ProjectDocument } from "./ProjectDocument";
import { EntityAccess } from "./Sharing";

export class ProjectDocumentRepository {
    private api: D2Api;
    constructor(api: D2Api) {
        this.api = api;
    }

    async getByIds(ids: Id[]): Promise<ProjectDocument[]> {
        const d2Response = await this.api.models.documents
            .get({
                fields: {
                    id: true,
                    url: true,
                    name: true,
                },
                filter: {
                    id: {
                        in: ids,
                    },
                },
            })
            .getData();

        const documents = d2Response.objects.map(d2Document => {
            return ProjectDocument.create({
                blob: undefined,
                id: d2Document.id,
                name: d2Document.name,
                url: d2Document.url,
                href: `${this.api.apiPath}/documents/${d2Document.id}/data`,
                sizeInBytes: 0,
                sharing: undefined,
                markAsDeleted: false,
            });
        });

        const projectDocuments = await promiseMap(documents, async projectDocument => {
            const file = await this.api
                .request<D2FileResource>({
                    method: "get",
                    url: `/fileResources/${projectDocument.url}`,
                })
                .getData();

            return ProjectDocument.create({
                ...projectDocument,
                blob: undefined,
                sizeInBytes: Number(file.contentLength),
            });
        });
        return projectDocuments;
    }

    async saveAll(documents: ProjectDocument[]): Promise<ProjectDocument[]> {
        const docsToDelete = documents.filter(document => document.markAsDeleted);
        const docsToSave = documents.filter(document => !document.markAsDeleted);

        const documentsToDelete = await promiseMap(docsToDelete, async projectDocument => {
            if (!projectDocument.id) return projectDocument;
            await this.postDocuments({ id: projectDocument.id }, "DELETE");
            return projectDocument;
        });

        const documentsSaved = await promiseMap(docsToSave, async projectDocument => {
            if (!projectDocument.blob) return projectDocument;

            const fileResponse = await this.api.files
                .saveFileResource({ data: projectDocument.blob, name: projectDocument.name })
                .getData();

            const newDocumentId = projectDocument.id || getUid("project-documents", fileResponse);

            await this.postDocuments(
                {
                    id: newDocumentId,
                    url: fileResponse,
                    name: projectDocument.name,
                    userAccesses: projectDocument.sharing?.userAccesses,
                    userGroupAccesses: projectDocument.sharing?.userGroupAccesses,
                },
                "CREATE_AND_UPDATE"
            );
            return { ...projectDocument, id: newDocumentId, url: fileResponse };
        });

        return [...documentsSaved, ...documentsToDelete];
    }

    private async postDocuments(
        projectDocument: D2Document,
        strategy: "DELETE" | "CREATE_AND_UPDATE"
    ) {
        const response = await this.api.metadata
            .post({ documents: [projectDocument] }, { importStrategy: strategy })
            .getData();
        if (response.status === "ERROR") {
            console.log(JSON.stringify(response.typeReports, null, 4));
            throw Error(`Error uploading document: ${response.status}`);
        }
    }
}

type D2FileResource = {
    contentLength: string;
};

type D2Document = {
    id: string;
    url?: string;
    name?: string;
    userAccesses?: EntityAccess[];
    userGroupAccesses?: EntityAccess[];
};
