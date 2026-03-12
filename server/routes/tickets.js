const express = require("express");
const router = express.Router();

const controller = require("../controllers/ticketsController");
const { authenticateToken } = require("../middlewares/authMiddleware");
const { uploadTicketAttachment } = require("../middlewares/ticketAttachmentsUpload");

const uploadTicketAttachments = uploadTicketAttachment.fields([
    { name: "attachment", maxCount: 10 },
    { name: "attachments", maxCount: 10 },
]);

router.get("/", authenticateToken, controller.getTickets);

router.get("/:id", authenticateToken, controller.getTicket);

router.post(
    "/:id/responses",
    authenticateToken,
    uploadTicketAttachments,
    controller.createTicketResponse
);

router.post(
    "/",
    authenticateToken,
    uploadTicketAttachments,
    controller.createTicket
);

router.put("/:id", authenticateToken, controller.updateTicket);

router.delete("/:id", authenticateToken, controller.deleteTicket);

module.exports = router;