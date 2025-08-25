import React from "react";

interface HeaderLogoBlockerProps {
    isActive: boolean;
    onCancelClick?: () => void;
    onActivated?: () => void;
}

export const HeaderLogoBlocker: React.FC<HeaderLogoBlockerProps> = ({
    onActivated,
    isActive,
    onCancelClick,
}) => {
    React.useEffect(() => {
        const element = document.querySelector<HTMLDivElement>('[data-test="headerbar-logo"]');

        if (!element) return;

        const cancelClick = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            if (onCancelClick) onCancelClick();
        };

        if (isActive) {
            element.addEventListener("click", cancelClick);
            if (onActivated) onActivated();
        }

        return () => {
            element.removeEventListener("click", cancelClick);
        };
    }, [isActive, onActivated, onCancelClick]);

    return null;
};
