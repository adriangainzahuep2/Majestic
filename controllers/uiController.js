/**
 * UI Controller
 * Provides data for the Apple Watch-like UI
 */

async function getDashboard(req, res) {
  try {
    const userId = req.user.id;
    // This would fetch the data needed for the dashboard UI
    res.json({
      success: true,
      data: {
        // ...dashboard data...
      },
    });
  } catch (error) {
    console.error('Get dashboard for UI error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve dashboard data',
      message: error.message,
    });
  }
}

module.exports = {
  getDashboard,
};
