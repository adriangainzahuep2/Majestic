const express = require('express');
const router = express.Router();
const mobileController = require('../controllers/mobileController');
const authMiddleware = require('../middleware/auth');

router.get('/data', authMiddleware, mobileController.getData);

module.exports = router;
