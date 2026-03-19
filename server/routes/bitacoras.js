const express = require('express');
const router = express.Router();

const controller = require('../controllers/bitacorasController');
const { authenticateToken } = require("../middlewares/authMiddleware");


router.get('/', authenticateToken, controller.getAll);
router.get('/:id', authenticateToken, controller.getOne);
router.get('/:id/export/pdf', authenticateToken, controller.exportPdf);
router.post('/', authenticateToken, controller.create);
router.put('/:id', authenticateToken, controller.update);
router.delete('/:id', authenticateToken, controller.remove);

module.exports = router;