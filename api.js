const express = require('express');
const router = express.Router();

// Import routes
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/uploads');
const metricsRoutes = require('./routes/metrics');
const dashboardRoutes = require('./routes/dashboard');
const profileRoutes = require('./routes/profile');
const ingestFileRoutes = require('./routes/ingestFile');
const imagingStudiesRoutes = require('./routes/imagingStudies');
const metricSuggestionsRoutes = require('./routes/metricSuggestions');
const customReferenceRangesRoutes = require('./routes/customReferenceRanges');
const adminRoutes = require('./routes/admin');
const debugRoutes = require('./routes/debug');
const mobileRoutes = require('./routes/mobile');

// Import middleware
const authMiddleware = require('./middleware/auth');

// Mount routes
router.use('/auth', authRoutes);
router.use('/mobile', authMiddleware, mobileRoutes);
router.use('/ui', authMiddleware, require('./routes/ui'));
router.use('/uploads', authMiddleware, uploadRoutes);
router.use('/metrics', authMiddleware, metricsRoutes);
router.use('/dashboard', authMiddleware, dashboardRoutes);
router.use('/profile', authMiddleware, profileRoutes);
router.use('/ingestFile', authMiddleware, ingestFileRoutes);
router.use('/imaging-studies', authMiddleware, imagingStudiesRoutes);
router.use('/metric-suggestions', authMiddleware, metricSuggestionsRoutes);
router.use('/custom-reference-ranges', authMiddleware, customReferenceRangesRoutes);
router.use('/admin', adminRoutes);
router.use('/debug', debugRoutes);

module.exports = router;
