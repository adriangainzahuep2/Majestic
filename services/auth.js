const { pool } = require('../database/schema');
const jwt = require('jsonwebtoken');

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'health-app-secret-key';
  }

  async findOrCreateUser(googleUserData) {
    const { id: googleId, email, name, picture } = googleUserData;
    
    try {
      // Check if user exists
      let userResult = await pool.query(
        'SELECT * FROM users WHERE google_id = $1 OR email = $2',
        [googleId, email]
      );

      if (userResult.rows.length > 0) {
        // Update existing user
        const user = userResult.rows[0];
        await pool.query(`
          UPDATE users 
          SET name = $1, avatar_url = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [name, picture, user.id]);

        return { ...user, name, avatar_url: picture };
      } else {
        // Create new user
        const newUserResult = await pool.query(`
          INSERT INTO users (google_id, email, name, avatar_url)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [googleId, email, name, picture]);

        return newUserResult.rows[0];
      }
    } catch (error) {
      console.error('Error finding or creating user:', error);
      throw new Error('Failed to authenticate user');
    }
  }

  generateToken(user) {
    return jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        name: user.name,
        is_demo: !!user.is_demo
      },
      this.jwtSecret,
      { expiresIn: '7d' }
    );
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  async getUserById(userId) {
    try {
      const result = await pool.query(
        'SELECT id, email, name, avatar_url, created_at FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error getting user by ID:', error);
      throw error;
    }
  }

  async updateUserProfile(userId, updates) {
    try {
      const allowedUpdates = ['name', 'avatar_url'];
      const setClause = [];
      const values = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(key)) {
          setClause.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      }

      if (setClause.length === 0) {
        throw new Error('No valid fields to update');
      }

      values.push(userId);
      const query = `
        UPDATE users 
        SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramCount}
        RETURNING id, email, name, avatar_url, created_at
      `;

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  }

  async deleteUser(userId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Delete user data (cascading deletes will handle related data)
      await client.query('DELETE FROM users WHERE id = $1', [userId]);

      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error deleting user:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new AuthService();
