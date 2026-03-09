const express = require("express");
const router = express.Router();

const controller = require("../controllers/clientsController");
const { authenticateToken } = require("../middlewares/authMiddleware");
const { uploadFiscalDoc } = require("../middlewares/fiscalDocsUpload");

router.get("/", authenticateToken, controller.getClients);

router.get("/:id", authenticateToken, controller.getClient);

router.delete("/:id", authenticateToken, controller.deleteClient);

router.put(
    "/:id/profile",
    authenticateToken,
    uploadFiscalDoc.single("tax_certificate_pdf"),
    controller.updateClientProfile
);

module.exports = router;