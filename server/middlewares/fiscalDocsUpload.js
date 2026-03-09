const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadDir = path.join(__dirname, "..", "uploads", "fiscal_docs");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, _file, cb) => {
        const stamp = Date.now();
        const id = String(req.params.id || "client");
        cb(null, `constancia_${id}_${stamp}.pdf`);
    }
});

const fileFilter = (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
        cb(new Error("Solo se permite archivo PDF"));
        return;
    }

    cb(null, true);
};

const uploadFiscalDoc = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

module.exports = {
    uploadFiscalDoc
};
