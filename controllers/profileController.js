/**
 * Profile Controller
 * Manages user profile information and health data
 */

/**
 * Get user profile
 */
async function getProfile(req, res) {
  try {
    const userId = req.user.id;

    const result = await req.db.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = result.rows[0];

    // Get chronic conditions
    const conditionsResult = await req.db.query(
      'SELECT * FROM user_chronic_conditions WHERE user_id = $1',
      [userId]
    );

    // Get allergies
    const allergiesResult = await req.db.query(
      'SELECT * FROM user_allergies WHERE user_id = $1',
      [userId]
    );

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        preferredUnitSystem: user.preferred_unit_system || 'metric',
        sex: user.sex,
        dateOfBirth: user.date_of_birth,
        heightIn: user.height_in,
        weightLb: user.weight_lb,
        ethnicity: user.ethnicity,
        countryOfResidence: user.country_of_residence,
        smoker: user.smoker,
        packsPerWeek: user.packs_per_week,
        alcoholDrinksPerWeek: user.alcohol_drinks_per_week,
        pregnant: user.pregnant,
        pregnancyStartDate: user.pregnancy_start_date,
        cyclePhase: user.cycle_phase,
        profileCompleted: user.profile_completed || false,
        profileUpdatedAt: user.profile_updated_at,
        chronicConditions: conditionsResult.rows,
        allergies: allergiesResult.rows
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve profile',
      message: error.message
    });
  }
}

/**
 * Update user profile
 */
async function updateProfile(req, res) {
  try {
    const userId = req.user.id;
    const {
      preferredUnitSystem,
      sex,
      dateOfBirth,
      heightIn,
      weightLb,
      ethnicity,
      countryOfResidence,
      smoker,
      packsPerWeek,
      alcoholDrinksPerWeek,
      pregnant,
      pregnancyStartDate,
      cyclePhase
    } = req.body;

    const result = await req.db.query(`
      UPDATE users
      SET
        preferred_unit_system = COALESCE($1, preferred_unit_system),
        sex = COALESCE($2, sex),
        date_of_birth = COALESCE($3, date_of_birth),
        height_in = COALESCE($4, height_in),
        weight_lb = COALESCE($5, weight_lb),
        ethnicity = COALESCE($6, ethnicity),
        country_of_residence = COALESCE($7, country_of_residence),
        smoker = COALESCE($8, smoker),
        packs_per_week = COALESCE($9, packs_per_week),
        alcohol_drinks_per_week = COALESCE($10, alcohol_drinks_per_week),
        pregnant = COALESCE($11, pregnant),
        pregnancy_start_date = COALESCE($12, pregnancy_start_date),
        cycle_phase = COALESCE($13, cycle_phase),
        profile_completed = true,
        profile_updated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $14
      RETURNING *
    `, [
      preferredUnitSystem,
      sex,
      dateOfBirth,
      heightIn,
      weightLb,
      ethnicity,
      countryOfResidence,
      smoker,
      packsPerWeek,
      alcoholDrinksPerWeek,
      pregnant,
      pregnancyStartDate,
      cyclePhase,
      userId
    ]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      message: error.message
    });
  }
}

/**
 * Add chronic condition
 */
async function addChronicCondition(req, res) {
  try {
    const userId = req.user.id;
    const { conditionName, status } = req.body;

    if (!conditionName || !status) {
      return res.status(400).json({
        success: false,
        error: 'conditionName and status are required'
      });
    }

    const result = await req.db.query(`
      INSERT INTO user_chronic_conditions (
        user_id,
        condition_name,
        status
      ) VALUES ($1, $2, $3)
      RETURNING *
    `, [userId, conditionName, status]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Chronic condition added'
    });

  } catch (error) {
    console.error('Add chronic condition error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add chronic condition',
      message: error.message
    });
  }
}

/**
 * Remove chronic condition
 */
async function removeChronicCondition(req, res) {
  try {
    const userId = req.user.id;
    const { conditionId } = req.params;

    const result = await req.db.query(
      'DELETE FROM user_chronic_conditions WHERE id = $1 AND user_id = $2 RETURNING id',
      [conditionId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Condition not found'
      });
    }

    res.json({
      success: true,
      message: 'Chronic condition removed'
    });

  } catch (error) {
    console.error('Remove chronic condition error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove chronic condition',
      message: error.message
    });
  }
}

/**
 * Add allergy
 */
async function addAllergy(req, res) {
  try {
    const userId = req.user.id;
    const { allergyType, allergenName } = req.body;

    if (!allergyType || !allergenName) {
      return res.status(400).json({
        success: false,
        error: 'allergyType and allergenName are required'
      });
    }

    const result = await req.db.query(`
      INSERT INTO user_allergies (
        user_id,
        allergy_type,
        allergen_name
      ) VALUES ($1, $2, $3)
      RETURNING *
    `, [userId, allergyType, allergenName]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Allergy added'
    });

  } catch (error) {
    console.error('Add allergy error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add allergy',
      message: error.message
    });
  }
}

/**
 * Remove allergy
 */
async function removeAllergy(req, res) {
  try {
    const userId = req.user.id;
    const { allergyId } = req.params;

    const result = await req.db.query(
      'DELETE FROM user_allergies WHERE id = $1 AND user_id = $2 RETURNING id',
      [allergyId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Allergy not found'
      });
    }

    res.json({
      success: true,
      message: 'Allergy removed'
    });

  } catch (error) {
    console.error('Remove allergy error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove allergy',
      message: error.message
    });
  }
}

/**
 * Get profile completion status
 */
async function getProfileStatus(req, res) {
  try {
    const userId = req.user.id;

    const result = await req.db.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = result.rows[0];

    const requiredFields = [
      'sex',
      'date_of_birth',
      'height_in',
      'weight_lb'
    ];

    const completedFields = requiredFields.filter(field => user[field] !== null);
    const completionPercentage = Math.round((completedFields.length / requiredFields.length) * 100);

    res.json({
      success: true,
      data: {
        profileCompleted: user.profile_completed || false,
        completionPercentage: completionPercentage,
        requiredFields: requiredFields,
        completedFields: completedFields,
        missingFields: requiredFields.filter(field => user[field] === null)
      }
    });

  } catch (error) {
    console.error('Get profile status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve profile status',
      message: error.message
    });
  }
}

module.exports = {
  getProfile,
  updateProfile,
  addChronicCondition,
  removeChronicCondition,
  addAllergy,
  removeAllergy,
  getProfileStatus
};
