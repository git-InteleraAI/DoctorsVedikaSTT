export const getApiBaseUrl = () => {
    const envUrl = import.meta.env.VITE_NODE_API_URL;
    if (envUrl !== undefined && envUrl !== null && envUrl.trim() !== "") {
        return envUrl.replace(/\/+$/, "");
    }
    // Default to empty string for same-origin relative URLs (/api/v1/...) proxied by Nginx or Vite dev server
    return "";
};

export const getApiV1Url = () => {
    const base = getApiBaseUrl();
    return base ? `${base}/api/v1` : "/api/v1";
};
