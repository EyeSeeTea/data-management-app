import React from "react";
import { useHistory } from "react-router-dom";

export type HttpStatusType = "idle" | "loading" | "error" | "success" | "finished";

export type HttpStatusProps = {
    status: HttpStatusType;
    message?: string;
};

export function useHttpStatus(initialStatus: HttpStatusType = "idle") {
    const [httpStatus, setHttpStatus] = React.useState<HttpStatusProps>({
        message: "",
        status: initialStatus,
    });
    return { httpStatus, updateStatus: setHttpStatus };
}
