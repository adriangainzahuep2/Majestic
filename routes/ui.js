const express = require('express');
const router = express.Router();
const uiController = require('../controllers/uiController');
const authMiddleware = require('../middleware/auth');

router.get('/dashboard', authMiddleware, uiController.getDashboard);

module.exports = router;
