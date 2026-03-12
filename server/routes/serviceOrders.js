const express = require("express");
const router = express.Router();

const controller = require("../controllers/serviceOrdersController");
const { authenticateToken } = require("../middlewares/authMiddleware");
const { uploadServiceOrderAttachment } = require("../middlewares/ticketAttachmentsUpload");

const uploadServiceOrderAttachments = uploadServiceOrderAttachment.fields([
    { name: "attachment", maxCount: 10 },
    { name: "attachments", maxCount: 10 },
]);

router.get("/", authenticateToken, controller.getServiceOrders);

router.post(
    "/:id/responses",
    authenticateToken,
    uploadServiceOrderAttachments,
    controller.createServiceOrderResponse
);

router.get("/:id", authenticateToken, controller.getServiceOrder);

router.post("/from-ticket/:ticketId", authenticateToken, controller.createServiceOrderFromTicket);

router.post("/", authenticateToken, uploadServiceOrderAttachments, controller.createServiceOrder);

router.put("/:id", authenticateToken, controller.updateServiceOrder);

router.delete("/:id", authenticateToken, controller.deleteServiceOrder);

module.exports = router;