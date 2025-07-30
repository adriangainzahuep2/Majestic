// Metric matching and range calculation utilities
class MetricUtils {
    constructor() {
        this.metricsData = null;
        this.loadMetricsData();
    }

    async loadMetricsData() {
        try {
            // Try different possible paths for the metrics data
            const possiblePaths = [
                '/src/data/metrics.json',
                './src/data/metrics.json',
                '/api/metrics/reference', // Backend endpoint if available
                'src/data/metrics.json'
            ];
            
            let response = null;
            for (const path of possiblePaths) {
                try {
                    console.log(`Trying to load metrics from: ${path}`);
                    response = await fetch(path);
                    if (response.ok) {
                        console.log(`Successfully loaded metrics from: ${path}`);
                        break;
                    } else {
                        console.log(`Failed to load from ${path}: ${response.status} ${response.statusText}`);
                    }
                } catch (e) {
                    console.log(`Error loading from ${path}:`, e.message);
                    continue;
                }
            }
            
            if (response && response.ok) {
                this.metricsData = await response.json();
                console.log(`Loaded ${this.metricsData.length} metric references`);
            } else {
                throw new Error('Could not load metrics data from any path');
            }
        } catch (error) {
            console.error('Failed to load metrics data:', error);
            this.metricsData = [];
        }
    }

    // Find matching metric from our reference data
    findMetricMatch(metricName, systemName = null) {
        if (!this.metricsData) return null;

        // First try exact match
        let match = this.metricsData.find(m => 
            m.metric.toLowerCase() === metricName.toLowerCase() &&
            (!systemName || m.system.toLowerCase().includes(systemName.toLowerCase()))
        );

        if (match) return match;

        // Try partial matching
        match = this.metricsData.find(m => {
            const metricLower = m.metric.toLowerCase();
            const nameLower = metricName.toLowerCase();
            
            // Check if either contains the other
            const nameContainsMetric = nameLower.includes(metricLower);
            const metricContainsName = metricLower.includes(nameLower);
            
            // Also check system match if provided
            const systemMatch = !systemName || m.system.toLowerCase().includes(systemName.toLowerCase());
            
            return (nameContainsMetric || metricContainsName) && systemMatch;
        });

        return match;
    }

    // Calculate status based on value and normal range
    calculateStatus(value, normalRangeMin, normalRangeMax) {
        if (value === null || value === undefined || value === '') {
            return 'No data';
        }

        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
            return 'No data';
        }

        if (numValue < normalRangeMin) {
            return 'Low';
        } else if (numValue > normalRangeMax) {
            return 'High';
        } else {
            return 'Normal';
        }
    }

    // Generate micro range bar HTML
    generateMicroRangeBar(value, normalRangeMin, normalRangeMax) {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
            return '<div class="micro-range-bar"><div class="range-bar-empty">No data</div></div>';
        }

        // Calculate position within or outside the normal range
        const rangeWidth = normalRangeMax - normalRangeMin;
        let position = 0;
        let isInRange = true;

        if (numValue < normalRangeMin) {
            position = 0;
            isInRange = false;
        } else if (numValue > normalRangeMax) {
            position = 100;
            isInRange = false;
        } else {
            position = ((numValue - normalRangeMin) / rangeWidth) * 100;
        }

        return `
            <div class="micro-range-bar">
                <div class="range-bar-track">
                    <div class="range-bar-normal"></div>
                    <div class="range-bar-indicator ${isInRange ? 'in-range' : 'out-of-range'}" 
                         style="left: ${Math.max(0, Math.min(100, position))}%"></div>
                </div>
            </div>
        `;
    }

    // Generate tooltip content
    generateTooltipContent(metricData, metricName) {
        return `
            <div class="metric-info-tooltip">
                <p class="tooltip-metric-name">${metricName}</p>
                ${metricData.description ? `<p class="tooltip-description">${metricData.description}</p>` : ''}
                <p class="tooltip-range">Normal range: ${metricData.normalRangeMin}–${metricData.normalRangeMax}${metricData.units ? ` ${metricData.units}` : ''}</p>
                ${metricData.source ? `<p class="tooltip-source">Source: ${metricData.source}</p>` : ''}
            </div>
        `;
    }
}

// Create global instance
window.metricUtils = new MetricUtils();