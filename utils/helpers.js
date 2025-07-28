// Health Dashboard Utility Functions

/**
 * Date formatting utilities
 */
const DateUtils = {
    /**
     * Format date for display
     * @param {string|Date} date - Date to format
     * @param {string} format - Format type ('short', 'long', 'time', 'datetime')
     * @returns {string} Formatted date string
     */
    formatDate(date, format = 'short') {
        if (!date) return '-';
        
        const d = new Date(date);
        if (isNaN(d.getTime())) return 'Invalid Date';

        const options = {
            short: { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            },
            long: { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            },
            time: { 
                hour: '2-digit', 
                minute: '2-digit' 
            },
            datetime: { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit', 
                minute: '2-digit' 
            }
        };

        return d.toLocaleDateString('en-US', options[format] || options.short);
    },

    /**
     * Calculate days between dates
     * @param {string|Date} date1 - First date
     * @param {string|Date} date2 - Second date (defaults to today)
     * @returns {number} Number of days between dates
     */
    daysBetween(date1, date2 = new Date()) {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        const diffTime = Math.abs(d2 - d1);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    },

    /**
     * Check if date is within range
     * @param {string|Date} date - Date to check
     * @param {number} months - Number of months to check within
     * @returns {boolean} True if date is within range
     */
    isWithinMonths(date, months) {
        const d = new Date(date);
        const now = new Date();
        const monthsAgo = new Date();
        monthsAgo.setMonth(now.getMonth() - months);
        return d >= monthsAgo;
    },

    /**
     * Get relative time string
     * @param {string|Date} date - Date to compare
     * @returns {string} Relative time string (e.g., "2 days ago")
     */
    getRelativeTime(date) {
        const d = new Date(date);
        const now = new Date();
        const diffMs = now - d;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        const diffWeeks = Math.floor(diffDays / 7);
        const diffMonths = Math.floor(diffDays / 30);

        if (diffSecs < 60) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
        if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
        
        const diffYears = Math.floor(diffMonths / 12);
        return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;
    }
};

/**
 * Health data validation and formatting
 */
const HealthUtils = {
    /**
     * Validate metric value
     * @param {any} value - Value to validate
     * @param {string} metricName - Name of the metric
     * @returns {object} Validation result with isValid and error
     */
    validateMetricValue(value, metricName) {
        if (value === null || value === undefined || value === '') {
            return { isValid: false, error: 'Value is required' };
        }

        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
            return { isValid: false, error: 'Value must be a number' };
        }

        if (numValue < 0) {
            return { isValid: false, error: 'Value cannot be negative' };
        }

        // Specific validation rules for common metrics
        const validationRules = {
            'LDL': { min: 0, max: 500, unit: 'mg/dL' },
            'HDL': { min: 0, max: 200, unit: 'mg/dL' },
            'Total Cholesterol': { min: 0, max: 600, unit: 'mg/dL' },
            'Triglycerides': { min: 0, max: 1000, unit: 'mg/dL' },
            'HbA1c': { min: 0, max: 20, unit: '%' },
            'Glucose': { min: 0, max: 600, unit: 'mg/dL' },
            'Blood Pressure': { min: 50, max: 300, unit: 'mmHg' },
            'CRP': { min: 0, max: 50, unit: 'mg/L' },
            'TSH': { min: 0, max: 100, unit: 'mIU/L' }
        };

        const rule = validationRules[metricName];
        if (rule) {
            if (numValue < rule.min || numValue > rule.max) {
                return { 
                    isValid: false, 
                    error: `Value should be between ${rule.min} and ${rule.max} ${rule.unit}` 
                };
            }
        }

        return { isValid: true, value: numValue };
    },

    /**
     * Format metric value with unit
     * @param {number} value - Metric value
     * @param {string} unit - Unit of measurement
     * @param {number} decimals - Number of decimal places
     * @returns {string} Formatted value with unit
     */
    formatMetricValue(value, unit = '', decimals = 1) {
        if (value === null || value === undefined) return '-';
        
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return '-';

        const formatted = decimals > 0 ? 
            numValue.toFixed(decimals).replace(/\.?0+$/, '') : 
            Math.round(numValue).toString();
        
        return unit ? `${formatted} ${unit}` : formatted;
    },

    /**
     * Determine if metric value is an outlier
     * @param {number} value - Metric value
     * @param {string} referenceRange - Reference range string
     * @param {string} metricName - Name of the metric
     * @returns {boolean} True if value is an outlier
     */
    isOutlier(value, referenceRange, metricName) {
        if (!value || !referenceRange) return false;

        // Parse reference range (e.g., "100-200", "<100", ">50")
        const rangePatterns = [
            /^(\d+\.?\d*)\s*-\s*(\d+\.?\d*)$/,  // "100-200"
            /^<\s*(\d+\.?\d*)$/,                // "<100"
            /^>\s*(\d+\.?\d*)$/,                // ">50"
            /^(\d+\.?\d*)\s*\+$/                // "100+"
        ];

        for (const pattern of rangePatterns) {
            const match = referenceRange.match(pattern);
            if (match) {
                if (pattern === rangePatterns[0]) {
                    // Range format "min-max"
                    const min = parseFloat(match[1]);
                    const max = parseFloat(match[2]);
                    return value < min || value > max;
                } else if (pattern === rangePatterns[1]) {
                    // Less than format "<max"
                    const max = parseFloat(match[1]);
                    return value >= max;
                } else if (pattern === rangePatterns[2]) {
                    // Greater than format ">min"
                    const min = parseFloat(match[1]);
                    return value <= min;
                } else if (pattern === rangePatterns[3]) {
                    // Plus format "min+"
                    const min = parseFloat(match[1]);
                    return value < min;
                }
            }
        }

        return false;
    },

    /**
     * Get health system color based on metrics
     * @param {Array} keyMetrics - Array of key metrics for the system
     * @param {object} recencyThresholds - Recency thresholds by metric type
     * @returns {string} Color code ('green', 'yellow', 'red', 'gray')
     */
    getSystemColor(keyMetrics, recencyThresholds = {}) {
        if (!keyMetrics || keyMetrics.length === 0) {
            return 'gray'; // No data
        }

        let hasRecentData = false;
        let hasOutliers = false;
        let hasCriticalOutliers = false;

        const now = new Date();

        for (const metric of keyMetrics) {
            const testDate = new Date(metric.test_date);
            const monthsOld = (now - testDate) / (1000 * 60 * 60 * 24 * 30);

            // Check recency
            const threshold = recencyThresholds[metric.metric_name.toLowerCase()] || 12;
            if (monthsOld <= threshold) {
                hasRecentData = true;
            }

            // Check for outliers
            if (metric.is_outlier) {
                hasOutliers = true;
                
                // Determine if it's a critical outlier
                if (this.isCriticalOutlier(metric.metric_name, metric.metric_value, metric.reference_range)) {
                    hasCriticalOutliers = true;
                }
            }
        }

        // Color logic
        if (!hasRecentData) return 'gray';
        if (hasCriticalOutliers) return 'red';
        if (hasOutliers) return 'yellow';
        return 'green';
    },

    /**
     * Determine if an outlier is critical
     * @param {string} metricName - Name of the metric
     * @param {number} value - Metric value
     * @param {string} referenceRange - Reference range
     * @returns {boolean} True if outlier is critical
     */
    isCriticalOutlier(metricName, value, referenceRange) {
        // Define critical thresholds for important metrics
        const criticalThresholds = {
            'LDL': { high: 190 },           // Very high LDL
            'Total Cholesterol': { high: 300 },
            'HbA1c': { high: 9.0 },         // Poor diabetes control
            'Glucose': { high: 250, low: 50 },
            'CRP': { high: 10.0 },          // High inflammation
            'Creatinine': { high: 2.0 },    // Kidney dysfunction
            'Blood Pressure Systolic': { high: 180, low: 90 },
            'Blood Pressure Diastolic': { high: 110, low: 60 }
        };

        const threshold = criticalThresholds[metricName];
        if (!threshold) return false;

        return (threshold.high && value > threshold.high) || 
               (threshold.low && value < threshold.low);
    }
};

/**
 * File handling utilities
 */
const FileUtils = {
    /**
     * Validate file type
     * @param {File} file - File to validate
     * @returns {object} Validation result
     */
    validateFile(file) {
        const allowedTypes = [
            'application/pdf',
            'image/jpeg',
            'image/jpg', 
            'image/png',
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];

        const maxSize = 10 * 1024 * 1024; // 10MB

        if (!allowedTypes.includes(file.type)) {
            return {
                isValid: false,
                error: 'Unsupported file type. Please upload PDF, image, or CSV files.'
            };
        }

        if (file.size > maxSize) {
            return {
                isValid: false,
                error: 'File size too large. Maximum size is 10MB.'
            };
        }

        return { isValid: true };
    },

    /**
     * Format file size for display
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Get file icon class based on file type
     * @param {string} fileType - MIME type or file extension
     * @returns {string} Font Awesome icon class
     */
    getFileIcon(fileType) {
        const iconMap = {
            'application/pdf': 'fas fa-file-pdf text-danger',
            'image/jpeg': 'fas fa-file-image text-primary',
            'image/jpg': 'fas fa-file-image text-primary',
            'image/png': 'fas fa-file-image text-primary',
            'text/csv': 'fas fa-file-csv text-success',
            'application/vnd.ms-excel': 'fas fa-file-excel text-success',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'fas fa-file-excel text-success'
        };

        return iconMap[fileType] || 'fas fa-file text-secondary';
    }
};

/**
 * UI utility functions
 */
const UIUtils = {
    /**
     * Show loading state on element
     * @param {HTMLElement} element - Element to show loading on
     * @param {boolean} show - Whether to show or hide loading
     */
    setLoading(element, show = true) {
        if (show) {
            element.disabled = true;
            const originalText = element.textContent;
            element.dataset.originalText = originalText;
            element.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Loading...';
        } else {
            element.disabled = false;
            element.textContent = element.dataset.originalText || 'Submit';
        }
    },

    /**
     * Debounce function calls
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Animate counter from 0 to target value
     * @param {HTMLElement} element - Element to animate
     * @param {number} target - Target number
     * @param {number} duration - Animation duration in ms
     */
    animateCounter(element, target, duration = 1000) {
        const start = 0;
        const increment = target / (duration / 16);
        let current = start;

        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            element.textContent = Math.floor(current);
        }, 16);
    },

    /**
     * Copy text to clipboard
     * @param {string} text - Text to copy
     * @returns {Promise<boolean>} Success status
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(textArea);
            return success;
        }
    },

    /**
     * Generate unique ID
     * @param {string} prefix - Optional prefix
     * @returns {string} Unique ID
     */
    generateId(prefix = 'id') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
};

/**
 * API utility functions
 */
const APIUtils = {
    /**
     * Handle API errors consistently
     * @param {Error} error - Error object
     * @param {string} context - Context where error occurred
     * @returns {object} Formatted error response
     */
    handleError(error, context = 'API call') {
        console.error(`${context} error:`, error);
        
        let message = 'An unexpected error occurred';
        let code = 'UNKNOWN_ERROR';

        if (error.message) {
            message = error.message;
        }

        if (error.response) {
            // HTTP error response
            code = error.response.status;
            if (error.response.data && error.response.data.message) {
                message = error.response.data.message;
            }
        }

        return {
            success: false,
            error: {
                code,
                message,
                context
            }
        };
    },

    /**
     * Build query string from object
     * @param {object} params - Parameters object
     * @returns {string} Query string
     */
    buildQueryString(params) {
        const searchParams = new URLSearchParams();
        
        for (const [key, value] of Object.entries(params)) {
            if (value !== null && value !== undefined && value !== '') {
                searchParams.append(key, value);
            }
        }

        const queryString = searchParams.toString();
        return queryString ? `?${queryString}` : '';
    },

    /**
     * Retry failed requests with exponential backoff
     * @param {Function} fn - Function to retry
     * @param {number} maxRetries - Maximum number of retries
     * @param {number} baseDelay - Base delay in milliseconds
     * @returns {Promise} Promise that resolves with the result or rejects
     */
    async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
        let lastError;

        for (let i = 0; i <= maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (i === maxRetries) {
                    throw error;
                }

                // Exponential backoff
                const delay = baseDelay * Math.pow(2, i);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }
};

/**
 * Chart utilities for Plotly integration
 */
const ChartUtils = {
    /**
     * Generate chart configuration for health trends
     * @param {Array} data - Chart data points
     * @param {string} title - Chart title
     * @param {string} yAxisLabel - Y-axis label
     * @param {string} color - Chart color
     * @returns {object} Plotly configuration
     */
    getTrendChartConfig(data, title, yAxisLabel, color = '#007bff') {
        return {
            data: [{
                x: data.map(point => point.date),
                y: data.map(point => point.value),
                type: 'scatter',
                mode: 'lines+markers',
                name: title,
                line: { 
                    color: color,
                    width: 3
                },
                marker: { 
                    size: 6,
                    color: color
                }
            }],
            layout: {
                title: false,
                xaxis: { 
                    title: 'Date',
                    type: 'date',
                    showgrid: true,
                    gridcolor: '#f0f0f0'
                },
                yaxis: { 
                    title: yAxisLabel,
                    showgrid: true,
                    gridcolor: '#f0f0f0'
                },
                margin: { t: 20, r: 20, b: 40, l: 60 },
                showlegend: false,
                plot_bgcolor: 'white',
                paper_bgcolor: 'white'
            },
            config: {
                responsive: true,
                displayModeBar: false
            }
        };
    },

    /**
     * Get color based on metric value and reference range
     * @param {number} value - Metric value
     * @param {string} referenceRange - Reference range
     * @returns {string} Color code
     */
    getMetricColor(value, referenceRange) {
        if (HealthUtils.isOutlier(value, referenceRange)) {
            return HealthUtils.isCriticalOutlier('', value, referenceRange) ? '#dc3545' : '#ffc107';
        }
        return '#28a745';
    }
};

// Export utilities for use in main application
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DateUtils,
        HealthUtils,
        FileUtils,
        UIUtils,
        APIUtils,
        ChartUtils
    };
} else {
    // Browser environment - attach to window
    window.HealthDashboardUtils = {
        DateUtils,
        HealthUtils,
        FileUtils,
        UIUtils,
        APIUtils,
        ChartUtils
    };
}
