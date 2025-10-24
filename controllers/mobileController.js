/**
 * Mobile Controller
 * Handles requests from the mobile app
 */

async function getData(req, res) {
  try {
    const userId = req.user.id;

    // Get all data for the user
    const metricsResult = await req.db.query('SELECT * FROM metrics WHERE user_id = $1', [userId]);
    const uploadsResult = await req.db.query('SELECT * FROM uploads WHERE user_id = $1', [userId]);
    const profileResult = await req.db.query('SELECT * FROM users WHERE id = $1', [userId]);

    res.json({
      success: true,
      data: {
        metrics: metricsResult.rows,
        uploads: uploadsResult.rows,
        profile: profileResult.rows[0],
      },
    });
  } catch (error) {
    console.error('Get data for mobile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve data for mobile',
      message: error.message,
    });
  }
}

module.exports = {
  getData,
};
