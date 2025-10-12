import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

class CSVProcessor {
  constructor(csvContent) {
    this.originalData = csvContent;
    this.processedData = null;
    this.headers = null;
    this.rows = null;
  }

  // Parse CSV content
  parseCSV() {
    try {
      const records = parse(this.originalData, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
      
      this.rows = records;
      this.headers = Object.keys(records[0] || {});
      return true;
    } catch (error) {
      console.error('CSV parsing error:', error);
      return false;
    }
  }

  // Fix typos and standardize text
  fixTyposAndStandardize() {
    if (!this.rows) return 0;

    const commonTypos = {
      'teh': 'the', 'adn': 'and', 'recieve': 'receive', 'seperate': 'separate',
      'occured': 'occurred', 'definately': 'definitely', 'accomodate': 'accommodate',
      'begining': 'beginning', 'beleive': 'believe', 'calender': 'calendar',
      'cemetary': 'cemetery', 'changable': 'changeable', 'collegue': 'colleague',
      'comming': 'coming', 'commitee': 'committee', 'concious': 'conscious',
      'embarass': 'embarrass', 'existance': 'existence', 'foriegn': 'foreign',
      'goverment': 'government', 'grammer': 'grammar', 'independant': 'independent',
      'judgement': 'judgment', 'knowlege': 'knowledge', 'maintainance': 'maintenance',
      'neccessary': 'necessary', 'occassion': 'occasion', 'priviledge': 'privilege',
      'publically': 'publicly', 'reccomend': 'recommend', 'refered': 'referred',
      'relevent': 'relevant', 'seperation': 'separation', 'sucessful': 'successful',
      'tommorow': 'tomorrow', 'truely': 'truly'
    };

    let fixCount = 0;
    this.rows = this.rows.map(row => {
      const newRow = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'string') {
          let cleanValue = value;
          
          // Fix common typos
          Object.entries(commonTypos).forEach(([typo, correct]) => {
            const regex = new RegExp(`\\b${typo}\\b`, 'gi');
            const matches = cleanValue.match(regex);
            if (matches) fixCount += matches.length;
            cleanValue = cleanValue.replace(regex, correct);
          });
          
          newRow[key] = cleanValue;
        } else {
          newRow[key] = value;
        }
      }
      return newRow;
    });
    return fixCount;
  }

  // Standardize data formats
  standardizeData() {
    if (!this.rows) return 0;

    let standardizeCount = 0;
    this.rows = this.rows.map(row => {
      const newRow = {};
      for (const [key, value] of Object.entries(row)) {
        let standardizedValue = value;
        const originalValue = value;
        
        if (typeof value === 'string' && value.trim()) {
          // Phone number standardization
          if (key.toLowerCase().includes('phone') || /\d{3}[-.]?\d{3}[-.]?\d{4}/.test(value)) {
            const cleaned = value.replace(/\D/g, '');
            if (cleaned.length === 10) {
              standardizedValue = `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
            }
          }
          // Email standardization
          else if (key.toLowerCase().includes('email') || /@/.test(value)) {
            standardizedValue = value.toLowerCase().trim();
          }
          // Date standardization
          else if (key.toLowerCase().includes('date') || /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(value)) {
            try {
              const date = new Date(value);
              if (!isNaN(date.getTime())) {
                standardizedValue = date.toISOString().split('T')[0];
              }
            } catch (e) {}
          }
          // Boolean standardization
          else {
            const lowerValue = value.toLowerCase().trim();
            if (['yes', 'y', 'true', '1', 'on'].includes(lowerValue)) {
              standardizedValue = 'true';
            } else if (['no', 'n', 'false', '0', 'off'].includes(lowerValue)) {
              standardizedValue = 'false';
            }
          }
          
          if (standardizedValue !== originalValue) standardizeCount++;
        }
        
        newRow[key] = standardizedValue;
      }
      return newRow;
    });
    return standardizeCount;
  }

  // Remove duplicate rows
  removeDuplicates() {
    if (!this.rows) return 0;

    const originalLength = this.rows.length;
    const seen = new Set();
    this.rows = this.rows.filter(row => {
      const rowString = JSON.stringify(row);
      if (seen.has(rowString)) {
        return false;
      }
      seen.add(rowString);
      return true;
    });
    return originalLength - this.rows.length;
  }

  // Validate data types and flag issues
  validateData() {
    if (!this.rows) return { issues: [], summary: {} };

    const issues = [];
    const columnTypes = {};
    
    // Analyze each column
    this.headers.forEach(header => {
      const values = this.rows.map(row => row[header]).filter(v => v !== null && v !== undefined && v !== '');
      
      let numericCount = 0;
      let dateCount = 0;
      let booleanCount = 0;
      
      values.forEach((value, index) => {
        if (typeof value === 'string') {
          // Check if numeric
          if (!isNaN(parseFloat(value)) && isFinite(value)) {
            numericCount++;
          }
          // Check if date
          else if (!isNaN(Date.parse(value))) {
            dateCount++;
          }
          // Check if boolean
          else if (['true', 'false', 'yes', 'no', '1', '0'].includes(value.toLowerCase())) {
            booleanCount++;
          }
        }
      });
      
      const totalValues = values.length;
      if (totalValues > 0) {
        if (numericCount / totalValues > 0.8) {
          columnTypes[header] = 'numeric';
        } else if (dateCount / totalValues > 0.8) {
          columnTypes[header] = 'date';
        } else if (booleanCount / totalValues > 0.8) {
          columnTypes[header] = 'boolean';
        } else {
          columnTypes[header] = 'text';
        }
      }
    });

    return { issues, columnTypes };
  }

  // Handle null values
  handleNullValues(method = 'none') {
    if (!this.rows || method === 'none') return 0;

    let nullCount = 0;
    if (method === 'remove') {
      const originalLength = this.rows.length;
      this.rows = this.rows.filter(row => {
        const hasAllNulls = Object.values(row).every(value => 
          value === null || value === undefined || value === '' || value === 'null' || value === 'NULL'
        );
        return !hasAllNulls;
      });
      return originalLength - this.rows.length;
    }

    // Calculate statistics for numeric columns
    const columnStats = {};
    this.headers.forEach(header => {
      const numericValues = this.rows
        .map(row => parseFloat(row[header]))
        .filter(val => !isNaN(val));
      
      if (numericValues.length > 0) {
        const sorted = numericValues.sort((a, b) => a - b);
        columnStats[header] = {
          mean: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
          median: sorted[Math.floor(sorted.length / 2)],
          mode: this.calculateMode(numericValues)
        };
      }
    });

    // Apply null handling
    this.rows = this.rows.map(row => {
      const newRow = {};
      for (const [key, value] of Object.entries(row)) {
        if (value === null || value === undefined || value === '' || value === 'null' || value === 'NULL') {
          nullCount++;
          if (columnStats[key]) {
            // Numeric column
            switch (method) {
              case 'mean':
                newRow[key] = columnStats[key].mean.toFixed(2);
                break;
              case 'median':
                newRow[key] = columnStats[key].median;
                break;
              case 'mode':
                newRow[key] = columnStats[key].mode;
                break;
              default:
                newRow[key] = 'N/A';
            }
          } else {
            newRow[key] = 'N/A';
          }
        } else {
          newRow[key] = value;
        }
      }
      return newRow;
    });
    return nullCount;
  }

  // Normalize numeric columns
  normalizeColumns() {
    if (!this.rows) return 0;

    const numericColumns = {};
    let normalizeCount = 0;
    
    // Identify numeric columns and calculate min/max
    this.headers.forEach(header => {
      const numericValues = this.rows
        .map(row => parseFloat(row[header]))
        .filter(val => !isNaN(val));
      
      if (numericValues.length > 0) {
        numericColumns[header] = {
          min: Math.min(...numericValues),
          max: Math.max(...numericValues)
        };
      }
    });

    // Normalize numeric columns (0-1 scale)
    this.rows = this.rows.map(row => {
      const newRow = {};
      for (const [key, value] of Object.entries(row)) {
        if (numericColumns[key]) {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            const { min, max } = numericColumns[key];
            const normalized = max === min ? 0 : (numValue - min) / (max - min);
            newRow[key] = normalized.toFixed(4);
            normalizeCount++;
          } else {
            newRow[key] = value;
          }
        } else {
          newRow[key] = value;
        }
      }
      return newRow;
    });
    return normalizeCount;
  }

  // Helper function to calculate mode
  calculateMode(values) {
    const frequency = {};
    let maxFreq = 0;
    let mode = null;

    values.forEach(value => {
      frequency[value] = (frequency[value] || 0) + 1;
      if (frequency[value] > maxFreq) {
        maxFreq = frequency[value];
        mode = value;
      }
    });

    return mode;
  }

  // Process CSV with selected options
  process(options) {
    if (!this.parseCSV()) {
      throw new Error('Failed to parse CSV file');
    }

    const results = {
      originalRows: this.rows.length,
      processedRows: 0,
      appliedOperations: []
    };

    if (options.fixTypos) {
      const fixCount = this.fixTyposAndStandardize();
      results.appliedOperations.push(`Fixed ${fixCount} typos`);
    }

    if (options.standardization) {
      const standardizeCount = this.standardizeData();
      results.appliedOperations.push(`Standardized ${standardizeCount} formats`);
    }

    if (options.duplicateRemoval) {
      const removedCount = this.removeDuplicates();
      results.appliedOperations.push(`Removed ${removedCount} duplicates`);
    }

    if (options.dataValidation) {
      const validation = this.validateData();
      results.validation = validation;
      results.appliedOperations.push('Validated data types');
    }

    if (options.nullHandling && options.nullHandling !== 'none') {
      const nullCount = this.handleNullValues(options.nullHandling);
      results.appliedOperations.push(`Handled ${nullCount} null values`);
    }

    if (options.columnNormalization) {
      const normalizeCount = this.normalizeColumns();
      results.appliedOperations.push(`Normalized ${normalizeCount} columns`);
    }

    results.processedRows = this.rows.length;
    
    // Convert back to CSV
    this.processedData = stringify(this.rows, { 
      header: true,
      columns: this.headers
    });

    return results;
  }

  // Get processed CSV content
  getProcessedCSV() {
    return this.processedData;
  }
}

export { CSVProcessor };