const fs = require("fs");
const path = require("path");
const multer = require("multer");

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

const allowedMime = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
]);

function fileFilter(_req, file, cb) {
    if (!allowedMime.has(String(file.mimetype || "").toLowerCase())) {
        cb(new Error("Solo se permiten imagenes o PDF"));
        return;
    }

    cb(null, true);
}

function createAttachmentUploader({ folderName, prefix }) {
    const uploadDir = path.join(__dirname, "..", "uploads", folderName);
    ensureDir(uploadDir);

    const storage = multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
            const userId = Number(req.auth?.sub || 0) || Date.now();
            const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
            cb(null, `${prefix}_${userId}_${stamp}${ext}`);
        },
    });

    return multer({
        storage,
        fileFilter,
        limits: { fileSize: 8 * 1024 * 1024 },
    });
}

const uploadTicketAttachment = createAttachmentUploader({
    folderName: "ticket_attachments",
    prefix: "ticket",
});

const uploadServiceOrderAttachment = createAttachmentUploader({
    folderName: "service_order_attachments",
    prefix: "service_order",
});

module.exports = {
    createAttachmentUploader,
    uploadTicketAttachment,
    uploadServiceOrderAttachment,
};
