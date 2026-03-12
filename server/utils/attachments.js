function getUploadedFiles(req) {
    if (Array.isArray(req.files)) {
        return req.files;
    }

    if (req.files && typeof req.files === "object") {
        return Object.values(req.files).flat();
    }

    if (req.file) {
        return [req.file];
    }

    return [];
}

function buildUploadedPaths(req, folderName) {
    return getUploadedFiles(req)
        .map((file) => {
            const filename = String(file?.filename || "").trim();
            return filename ? `server/uploads/${folderName}/${filename}` : "";
        })
        .filter(Boolean);
}

function parseStoredAttachments(value) {
    if (value === null || value === undefined) {
        return [];
    }

    if (Array.isArray(value)) {
        return value.flatMap((item) => parseStoredAttachments(item));
    }

    const text = String(value).trim();
    if (!text) {
        return [];
    }

    if (text.startsWith("[") && text.endsWith("]")) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
                return parsed.flatMap((item) => parseStoredAttachments(item));
            }
        } catch {
            return [text];
        }
    }

    return [text];
}

function mergeStoredAttachments(...values) {
    const unique = new Set();

    for (const value of values) {
        for (const item of parseStoredAttachments(value)) {
            const clean = String(item || "").trim();
            if (clean) {
                unique.add(clean);
            }
        }
    }

    return Array.from(unique);
}

module.exports = {
    getUploadedFiles,
    buildUploadedPaths,
    parseStoredAttachments,
    mergeStoredAttachments,
};