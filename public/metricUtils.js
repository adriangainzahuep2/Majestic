// Metric matching and range calculation utilities
class MetricUtils {
    constructor() {
        this.metricsData = null;
        this.synonymsData = null;
        this.loadMetricsData();
        this.loadSynonymsData();
    }

    async loadMetricsData() {
        try {
            // Try different possible paths for the metrics data
            const possiblePaths = [
                '/data/metrics.json', // Static file in public/data/
                './data/metrics.json',
                '/api/metrics/reference', // Backend endpoint if available
                'data/metrics.json'
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

    async loadSynonymsData() {
        try {
            const response = await fetch('/data/metric-synonyms.json');
            if (response.ok) {
                this.synonymsData = await response.json();
                console.log('Loaded metric synonyms data');
            } else {
                console.warn('Could not load synonyms data');
                this.synonymsData = { synonyms: {}, units_synonyms: {} };
            }
        } catch (error) {
            console.error('Failed to load synonyms data:', error);
            this.synonymsData = { synonyms: {}, units_synonyms: {} };
        }
    }

    // Normalize metric name using synonyms lookup
    normalizeMetricName(inputName) {
        if (!this.synonymsData) return inputName;
        
        const inputLower = inputName.toLowerCase().trim();
        
        // Check each canonical metric and its synonyms
        for (const [canonicalName, synonyms] of Object.entries(this.synonymsData.synonyms)) {
            // Check if input matches canonical name
            if (canonicalName.toLowerCase() === inputLower) {
                return canonicalName;
            }
            
            // Check if input matches any synonym
            if (synonyms.some(synonym => synonym.toLowerCase() === inputLower)) {
                return canonicalName;
            }
        }
        
        return inputName; // Return original if no match found
    }

    // Normalize units using synonyms lookup
    normalizeUnits(inputUnit) {
        if (!this.synonymsData || !inputUnit) return inputUnit;
        
        const inputLower = inputUnit.toLowerCase().trim();
        
        // Check each canonical unit and its synonyms
        for (const [canonicalUnit, synonyms] of Object.entries(this.synonymsData.units_synonyms)) {
            // Check if input matches canonical unit
            if (canonicalUnit.toLowerCase() === inputLower) {
                return canonicalUnit;
            }
            
            // Check if input matches any synonym
            if (synonyms.some(synonym => synonym.toLowerCase() === inputLower)) {
                return canonicalUnit;
            }
        }
        
        return inputUnit; // Return original if no match found
    }

    // Enhanced find matching metric with synonym support
    findMetricMatch(metricName, systemName = null, customMetrics = []) {
        // First normalize the metric name using synonyms
        const normalizedName = this.normalizeMetricName(metricName);
        
        // Try with normalized name first
        let result = this._findMetricMatchInternal(normalizedName, systemName, customMetrics);
        
        // If no match with normalized name, try with original name
        if (!result && normalizedName !== metricName) {
            result = this._findMetricMatchInternal(metricName, systemName, customMetrics);
        }
        
        return result;
    }

    // Internal method for actual matching logic
    _findMetricMatchInternal(metricName, systemName = null, customMetrics = []) {
        // First check custom metrics (higher priority for user's own custom metrics)
        if (customMetrics && customMetrics.length > 0) {
            const customMatch = customMetrics.find(cm => 
                cm.metric_name && cm.metric_name.toLowerCase() === metricName.toLowerCase()
            );
            if (customMatch && customMatch.normal_range_min !== null && customMatch.normal_range_max !== null) {
                return {
                    metric: customMatch.metric_name,
                    normalRangeMin: parseFloat(customMatch.normal_range_min),
                    normalRangeMax: parseFloat(customMatch.normal_range_max),
                    units: customMatch.units,
                    system: systemName,
                    source: 'Custom Metric',
                    isCustom: true
                };
            }
        }

        if (!this.metricsData) return null;

        // Then try official metrics - exact match
        let match = this.metricsData.find(m => 
            m.metric.toLowerCase() === metricName.toLowerCase() &&
            (!systemName || m.system.toLowerCase().includes(systemName.toLowerCase()))
        );

        if (match) return match;

        // Try partial matching for official metrics
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

    // Get potential matches with similarity scores for LLM suggestions
    getPotentialMatches(metricName, threshold = 0.3) {
        if (!this.metricsData) return [];
        
        const matches = [];
        const inputLower = metricName.toLowerCase();
        
        // Check all metrics for partial matches
        for (const metric of this.metricsData) {
            const metricLower = metric.metric.toLowerCase();
            
            // Calculate simple similarity score
            const similarity = this.calculateSimilarity(inputLower, metricLower);
            
            if (similarity >= threshold) {
                matches.push({
                    metric: metric.metric,
                    system: metric.system,
                    units: metric.units,
                    similarity: similarity,
                    normalRangeMin: metric.normalRangeMin,
                    normalRangeMax: metric.normalRangeMax
                });
            }
        }
        
        // Also check synonyms for potential matches
        if (this.synonymsData) {
            for (const [canonicalName, synonyms] of Object.entries(this.synonymsData.synonyms)) {
                for (const synonym of synonyms) {
                    const similarity = this.calculateSimilarity(inputLower, synonym.toLowerCase());
                    if (similarity >= threshold) {
                        // Find the metric data for this canonical name
                        const metricData = this.metricsData.find(m => 
                            m.metric.toLowerCase() === canonicalName.toLowerCase()
                        );
                        if (metricData) {
                            matches.push({
                                metric: canonicalName,
                                system: metricData.system,
                                units: metricData.units,
                                similarity: similarity,
                                normalRangeMin: metricData.normalRangeMin,
                                normalRangeMax: metricData.normalRangeMax,
                                matchedSynonym: synonym
                            });
                        }
                    }
                }
            }
        }
        
        // Sort by similarity score (descending) and remove duplicates
        return matches
            .sort((a, b) => b.similarity - a.similarity)
            .filter((match, index, self) => 
                index === self.findIndex(m => m.metric === match.metric)
            )
            .slice(0, 5); // Return top 5 matches
    }

    // Simple string similarity calculation (Jaccard similarity)
    calculateSimilarity(str1, str2) {
        const set1 = new Set(str1.split(''));
        const set2 = new Set(str2.split(''));
        
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        return intersection.size / union.size;
    }

    // Calculate status based on value and normal range (with custom range support)
    async calculateStatus(metricName, value, normalRangeMin, normalRangeMax, testDate = null) {
        if (value === null || value === undefined || value === '') {
            return 'No data';
        }
        
        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
            return 'Invalid';
        }
        
        // Try to get custom reference range for this metric
        let rangeMin = normalRangeMin;
        let rangeMax = normalRangeMax;
        let rangeSource = 'standard';
        
        try {
            const customRange = await this.getCustomReferenceRange(metricName, testDate);
            if (customRange) {
                rangeMin = parseFloat(customRange.min_value);
                rangeMax = parseFloat(customRange.max_value);
                rangeSource = 'custom';
            }
        } catch (error) {
            console.warn('Failed to get custom reference range:', error);
            // Fall back to standard range
        }
        
        if (rangeMin === null || rangeMax === null || isNaN(rangeMin) || isNaN(rangeMax)) {
            return 'No reference';
        }
        
        let status;
        if (numValue < rangeMin) {
            status = 'Low';
        } else if (numValue > rangeMax) {
            status = 'High';
        } else {
            status = 'Normal';
        }
        
        return {
            status: status,
            rangeSource: rangeSource,
            rangeMin: rangeMin,
            rangeMax: rangeMax
        };
    }

    // Legacy method for backward compatibility
    calculateStatusSync(value, normalRangeMin, normalRangeMax) {
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

    // Get custom reference range for a specific metric and date
    async getCustomReferenceRange(metricName, testDate = null) {
        try {
            const effectiveDate = testDate || new Date().toISOString().split('T')[0];
            
            // This would need to call the API when used in frontend context
            if (typeof window !== 'undefined' && window.healthDashboard) {
                const response = await window.healthDashboard.apiCall(
                    `/custom-reference-ranges/metric/${encodeURIComponent(metricName)}?testDate=${effectiveDate}`, 
                    'GET'
                );
                return response.custom_range;
            }
            
            return null;
        } catch (error) {
            console.warn('Failed to fetch custom reference range:', error);
            return null;
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