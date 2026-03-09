const express = require("express");
const router = express.Router();

router.use("/auth", require("./auth"));
router.use("/", require("./catalogs"));
router.use("/users", require("./users"));
router.use("/prospects", require("./prospects"));
router.use("/cotizaciones", require("./cotizaciones"));
router.use("/service-orders", require("./serviceOrders"));
router.use("/tickets", require("./tickets"));

module.exports = router;