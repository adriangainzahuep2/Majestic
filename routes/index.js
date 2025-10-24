// This file provides all route configurations
// Each route should be created in separate files in the routes/ directory

// routes/metrics.js
const metricsRouter = require('express').Router();
const metricsController = require('../controllers/metricsController');

metricsRouter.get('/', metricsController.getAllMetrics);
metricsRouter.get('/system/:systemId', metricsController.getMetricsBySystem);
metricsRouter.get('/history/:metricName', metricsController.getMetricHistory);
metricsRouter.get('/key', metricsController.getKeyMetrics);
metricsRouter.get('/outliers', metricsController.getOutliers);
metricsRouter.put('/:metricId', metricsController.updateMetric);
metricsRouter.delete('/:metricId', metricsController.deleteMetric);

// routes/customMetrics.js
const customMetricsRouter = require('express').Router();
const customMetricsController = require('../controllers/customMetricsController');

customMetricsRouter.post('/', customMetricsController.createCustomMetric);
customMetricsRouter.get('/', customMetricsController.getCustomMetrics);
customMetricsRouter.put('/:metricId', customMetricsController.updateCustomMetric);
customMetricsRouter.delete('/:metricId', customMetricsController.deleteCustomMetric);
customMetricsRouter.post('/bulk-import', customMetricsController.bulkImportCustomMetrics);
customMetricsRouter.post('/fix-numeric', customMetricsController.fixNumericRanges);

// routes/uploads.js
const uploadsRouter = require('express').Router();
const uploadsController = require('../controllers/uploadsController');

uploadsRouter.post('/', uploadsController.uploadFile);
uploadsRouter.get('/', uploadsController.getUploadHistory);
uploadsRouter.get('/:uploadId', uploadsController.getUploadDetails);
uploadsRouter.delete('/:uploadId', uploadsController.deleteUpload);
uploadsRouter.post('/:uploadId/retry', uploadsController.retryUpload);

// routes/metricSuggestions.js
const metricSuggestionsRouter = require('express').Router();
const metricSuggestionsController = require('../controllers/metricSuggestionsController');

metricSuggestionsRouter.post('/process', metricSuggestionsController.processUnmatchedMetrics);
metricSuggestionsRouter.get('/pending', metricSuggestionsController.getPendingSuggestions);
metricSuggestionsRouter.post('/:suggestionId/approve', metricSuggestionsController.approveSuggestions);
metricSuggestionsRouter.delete('/:suggestionId/reject', metricSuggestionsController.rejectSuggestions);

// routes/dashboard.js
const dashboardRouter = require('express').Router();
const dashboardController = require('../controllers/dashboardController');

dashboardRouter.get('/overview', dashboardController.getDashboardOverview);
dashboardRouter.get('/system/:systemId', dashboardController.getSystemDetails);
dashboardRouter.get('/key-findings', dashboardController.getKeyFindings);
dashboardRouter.get('/daily-plan', dashboardController.getDailyPlan);
dashboardRouter.get('/trends', dashboardController.getMetricsTrends);

// routes/profile.js
const profileRouter = require('express').Router();
const profileController = require('../controllers/profileController');

profileRouter.get('/', profileController.getProfile);
profileRouter.put('/', profileController.updateProfile);
profileRouter.post('/conditions', profileController.addChronicCondition);
profileRouter.delete('/conditions/:conditionId', profileController.removeChronicCondition);
profileRouter.post('/allergies', profileController.addAllergy);
profileRouter.delete('/allergies/:allergyId', profileController.removeAllergy);
profileRouter.get('/status', profileController.getProfileStatus);

// routes/admin.js
const adminRouter = require('express').Router();
const adminController = require('../controllers/adminController');
const multer = require('multer');

const upload = multer({ dest: 'uploads/temp/' });

adminRouter.post('/spreadsheet', upload.single('file'), adminController.uploadMasterSpreadsheet);
adminRouter.get('/versions', adminController.getVersionHistory);
adminRouter.post('/rollback/:versionId', adminController.rollbackToVersion);
adminRouter.get('/stats', adminController.getMasterStats);

// routes/debug.js (for development only)
const debugRouter = require('express').Router();

debugRouter.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

module.exports = {
  metricsRouter,
  customMetricsRouter,
  uploadsRouter,
  metricSuggestionsRouter,
  dashboardRouter,
  profileRouter,
  adminRouter,
  debugRouter
};
