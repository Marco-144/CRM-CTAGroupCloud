const express = require("express");
const router = express.Router();

const controller = require("../controllers/ticketsController");
const { authenticateToken } = require("../middlewares/authMiddleware");
const { uploadTicketAttachment } = require("../middlewares/ticketAttachmentsUpload");

router.get("/", authenticateToken, controller.getTickets);

router.get("/:id", authenticateToken, controller.getTicket);

router.post(
    "/:id/responses",
    authenticateToken,
    uploadTicketAttachment.single("attachment"),
    controller.createTicketResponse
);

router.post(
    "/",
    authenticateToken,
    uploadTicketAttachment.single("attachment"),
    controller.createTicket
);

router.put("/:id", authenticateToken, controller.updateTicket);

router.delete("/:id", authenticateToken, controller.deleteTicket);

module.exports = router;