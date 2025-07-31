const healthSystemsService = require('./healthSystems');
const openaiService = require('./openai');
const queueService = require('./queue');

class InsightsRefreshService {
    constructor() {
        this.batchTimeout = 60000; // 60 seconds
        this.pendingRefreshes = new Map(); // userId -> { systems: Set, needsGlobal: boolean, timeoutId }
    }

    /**
     * Determine if a metric is a key metric that affects dashboard tile colors
     */
    isKeyMetric(systemId, metricName) {
        return healthSystemsService.isKeyMetric(systemId, metricName);
    }

    /**
     * Queue refresh operations for a user's metric changes
     * @param {string} userId - User ID
     * @param {number} systemId - Health system ID
     * @param {string} metricName - Name of the changed metric
     * @param {string} changeType - 'edit', 'upload', 'email' (excludes 'apple_health')
     */
    async queueRefresh(userId, systemId, metricName, changeType = 'edit') {
        // Skip Apple Health sync updates
        if (changeType === 'apple_health') {
            return;
        }

        // 1. TRIGGER CONFIRMATION LOGGING
        console.log(`[RECOMPUTE TRIGGERED] userId=${userId} systemId=${systemId} metric=${metricName} changeType=${changeType}`);

        const isKey = this.isKeyMetric(systemId, metricName);
        
        // Get or create pending refresh for this user
        let pending = this.pendingRefreshes.get(userId);
        if (!pending) {
            pending = {
                systems: new Set(),
                needsGlobal: false,
                timeoutId: null
            };
            this.pendingRefreshes.set(userId, pending);
        }

        // Add system to refresh list
        pending.systems.add(systemId);

        // Mark for global refresh if key metric changed or it's an upload/email
        if (isKey || changeType === 'upload' || changeType === 'email') {
            pending.needsGlobal = true;
        }

        // Clear existing timeout and set new one for batching
        if (pending.timeoutId) {
            clearTimeout(pending.timeoutId);
        }

        pending.timeoutId = setTimeout(() => {
            this.executeRefresh(userId);
        }, this.batchTimeout);

        console.log(`[REFRESH QUEUED] userId=${userId} systemId=${systemId} metric=${metricName} changeType=${changeType} isKey=${isKey} batchTimeout=${this.batchTimeout}ms`);
    }

    /**
     * Execute the batched refresh operations
     * @param {string} userId - User ID
     */
    async executeRefresh(userId) {
        const pending = this.pendingRefreshes.get(userId);
        if (!pending) return;

        // Remove from pending map
        this.pendingRefreshes.delete(userId);

        console.log(`[BATCH REFRESH EXECUTING] userId=${userId} systems=[${Array.from(pending.systems)}] global=${pending.needsGlobal}`);

        try {
            // Queue system-specific insight jobs
            for (const systemId of pending.systems) {
                console.log(`[QUEUING SYSTEM INSIGHTS JOB] userId=${userId} systemId=${systemId}`);
                await queueService.addJob('generate-system-insights', {
                    userId,
                    systemId,
                    priority: 'high'
                });
            }

            // Queue global refresh jobs if needed
            if (pending.needsGlobal) {
                console.log(`[QUEUING GLOBAL JOBS] userId=${userId} keyFindings=true dailyPlan=true`);
                await queueService.addJob('generate-key-findings', {
                    userId,
                    priority: 'high'
                });

                await queueService.addJob('generate-daily-plan', {
                    userId,
                    priority: 'high'
                });
            }

            console.log(`[REFRESH JOBS QUEUED] userId=${userId} totalSystems=${pending.systems.size} globalJobs=${pending.needsGlobal}`);

        } catch (error) {
            console.error('[REFRESH ERROR]', error);
        }
    }

    /**
     * Invalidate cached AI outputs in database
     * @param {object} db - Database connection
     * @param {string} userId - User ID
     * @param {number} systemId - Health system ID (optional, for system-specific)
     * @param {boolean} includeGlobal - Whether to invalidate global outputs
     */
    async invalidateCache(db, userId, systemId = null, includeGlobal = false) {
        try {
            const conditions = ['user_id = $1'];
            const params = [userId];
            let paramCount = 2;

            if (systemId) {
                // Invalidate system-specific insights
                conditions.push(`(output_type = 'system_insights' AND prompt LIKE $${paramCount})`);
                params.push(`%system_id:${systemId}%`);
                paramCount++;
            }

            if (includeGlobal) {
                // Invalidate global outputs
                conditions.push(`output_type IN ('key_findings', 'daily_plan')`);
            }

            if (conditions.length > 1) {
                const query = `
                    UPDATE ai_outputs_log 
                    SET is_current = false, updated_at = CURRENT_TIMESTAMP
                    WHERE ${conditions[0]} AND (${conditions.slice(1).join(' OR ')})
                `;
                
                await db.query(query, params);
                console.log(`Invalidated AI cache for user ${userId}, system ${systemId}, global: ${includeGlobal}`);
            }

        } catch (error) {
            console.error('Error invalidating cache:', error);
        }
    }

    /**
     * Process refresh after upload completion
     * @param {object} db - Database connection
     * @param {string} userId - User ID
     * @param {Array} affectedSystems - Array of system IDs affected by upload
     */
    async processUploadRefresh(db, userId, affectedSystems) {
        try {
            // Invalidate cache for all affected systems + global
            await this.invalidateCache(db, userId, null, true);
            
            // Queue refresh for each affected system
            for (const systemId of affectedSystems) {
                await this.queueRefresh(userId, systemId, 'upload_metric', 'upload');
            }
            
            console.log(`Upload refresh triggered for user ${userId}, systems: [${affectedSystems}]`);
            
        } catch (error) {
            console.error('Error processing upload refresh:', error);
        }
    }

    /**
     * Process refresh after manual metric edit
     * @param {object} db - Database connection
     * @param {string} userId - User ID
     * @param {number} systemId - System ID
     * @param {string} metricName - Metric name
     */
    async processEditRefresh(db, userId, systemId, metricName) {
        try {
            const isKey = this.isKeyMetric(systemId, metricName);
            console.log(`[PROCESS EDIT REFRESH] userId=${userId} systemId=${systemId} metricName=${metricName} isKey=${isKey}`);
            
            // Invalidate cache
            await this.invalidateCache(db, userId, systemId, isKey);
            console.log(`[CACHE INVALIDATED] userId=${userId} systemId=${systemId} isKey=${isKey}`);
            
            // Queue refresh
            await this.queueRefresh(userId, systemId, metricName, 'edit');
            
            console.log(`[EDIT REFRESH COMPLETE] userId=${userId} systemId=${systemId} metricName=${metricName} isKey=${isKey}`);
            
        } catch (error) {
            console.error('[EDIT REFRESH ERROR]', error);
        }
    }

    /**
     * Process refresh after metric edit via API
     * @param {object} db - Database connection
     * @param {string} userId - User ID
     * @param {number} metricId - Metric ID that was changed
     * @param {object} metricData - Updated metric data
     */
    async processMetricEdit(db, userId, metricId, metricData) {
        try {
            console.log(`[PROCESS METRIC EDIT] userId=${userId} metricId=${metricId} metricName=${metricData.metric_name} value=${metricData.metric_value}`);
            
            // Get system information for the metric
            const systemResult = await db.query(`
                SELECT m.system_id, hs.name as system_name
                FROM metrics m
                JOIN health_systems hs ON m.system_id = hs.id
                WHERE m.id = $1 AND m.user_id = $2
            `, [metricId, userId]);

            if (systemResult.rows.length === 0) {
                console.warn(`[METRIC NOT FOUND] metricId=${metricId} userId=${userId}`);
                return;
            }

            const { system_id: systemId, system_name: systemName } = systemResult.rows[0];
            console.log(`[METRIC SYSTEM IDENTIFIED] metricId=${metricId} systemId=${systemId} systemName=${systemName}`);
            
            // Process the refresh
            await this.processEditRefresh(db, userId, systemId, metricData.metric_name);

            console.log(`Processed metric edit for user ${userId}, metric ${metricId}, system ${systemName}`);

        } catch (error) {
            console.error('Error processing metric edit:', error);
            throw error;
        }
    }
}

module.exports = new InsightsRefreshService();