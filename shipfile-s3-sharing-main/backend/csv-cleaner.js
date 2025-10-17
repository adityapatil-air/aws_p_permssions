import express from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ 
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files allowed'), false);
        }
    }
});

// Enhanced typo dictionary
const typos = {
    'aditiya': 'aditya', 'rahool': 'rahul', 'sanaa': 'sana', 'recieve': 'receive',
    'seperate': 'separate', 'definately': 'definitely', 'occured': 'occurred',
    'neccessary': 'necessary', 'accomodate': 'accommodate', 'begining': 'beginning',
    'beleive': 'believe', 'calender': 'calendar', 'changable': 'changeable',
    'collegue': 'colleague', 'comming': 'coming', 'commited': 'committed',
    'concious': 'conscious', 'dilemna': 'dilemma', 'embarass': 'embarrass',
    'enviroment': 'environment', 'existance': 'existence', 'experiance': 'experience',
    'familar': 'familiar', 'goverment': 'government', 'grammer': 'grammar',
    'harrass': 'harass', 'independant': 'independent', 'intresting': 'interesting'
};

// Enhanced typo fixing with better accuracy
function fixTypos(data) {
    let changes = 0;
    data.forEach(row => {
        Object.keys(row).forEach(key => {
            if (typeof row[key] === 'string' && row[key].length > 0) {
                const original = row[key];
                let fixed = original;
                
                // Direct word replacement for better accuracy
                for (const [typo, correct] of Object.entries(typos)) {
                    const regex = new RegExp(`\\b${typo}\\b`, 'gi');
                    if (regex.test(fixed)) {
                        fixed = fixed.replace(regex, correct);
                        changes++;
                    }
                }
                
                row[key] = fixed;
            }
        });
    });
    return { data, changes };
}

// Standardize formats
function standardizeFormats(data) {
    let changes = 0;
    data.forEach(row => {
        Object.keys(row).forEach(key => {
            const keyLower = key.toLowerCase();
            
            // Enhanced email standardization
            if (keyLower.includes('email') || keyLower.includes('mail')) {
                if (row[key] && typeof row[key] === 'string') {
                    let email = row[key].toLowerCase().trim().replace(/\s+/g, '');
                    const original = email;
                    
                    // Fix missing @ symbol
                    if (!email.includes('@')) {
                        // Look for common patterns like "usergmail.com" -> "user@gmail.com"
                        email = email.replace(/(\w+)(gmail|yahoo|outlook|hotmail)(\.com)?/, '$1@$2.com');
                    }
                    
                    // Fix common domain issues
                    email = email.replace(/gmailcom/g, 'gmail.com');
                    email = email.replace(/gmail(?!\.com)/g, 'gmail.com');
                    email = email.replace(/yahoo(?!\.com)/g, 'yahoo.com');
                    email = email.replace(/outlook(?!\.com)/g, 'outlook.com');
                    email = email.replace(/hotmail(?!\.com)/g, 'hotmail.com');
                    
                    // Fix missing .com
                    if (email.includes('@') && !email.includes('.')) {
                        email = email.replace(/@(gmail|yahoo|outlook|hotmail)$/, '@$1.com');
                    }
                    
                    if (email !== original) {
                        row[key] = email;
                        changes++;
                    }
                }
            }
            
            // Phone standardization
            if (keyLower.includes('phone') || keyLower.includes('mobile')) {
                if (row[key]) {
                    const phone = row[key].toString().replace(/[^\d]/g, '');
                    if (phone.length >= 10) {
                        const cleanPhone = phone.slice(-10);
                        row[key] = `+91-${cleanPhone.slice(0,5)}-${cleanPhone.slice(5)}`;
                        changes++;
                    }
                }
            }
            
            // Enhanced date standardization
            if (keyLower.includes('date') || keyLower.includes('birth') || keyLower.includes('dob')) {
                if (row[key]) {
                    const original = row[key].toString().trim();
                    let standardized = null;
                    
                    // DD/MM/YYYY (Indian format) - prioritize this
                    const ddmmyyyyMatch = original.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
                    if (ddmmyyyyMatch) {
                        const [, day, month, year] = ddmmyyyyMatch;
                        // Validate day and month ranges
                        const d = parseInt(day);
                        const m = parseInt(month);
                        if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
                            standardized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                        }
                    }
                    
                    // YYYY/MM/DD or YYYY-MM-DD
                    const yyyymmddMatch = original.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
                    if (yyyymmddMatch && !standardized) {
                        const [, year, month, day] = yyyymmddMatch;
                        const m = parseInt(month);
                        const d = parseInt(day);
                        if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
                            standardized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                        }
                    }
                    
                    // MM-DD-YYYY (US format)
                    const mmddyyyyMatch = original.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
                    if (mmddyyyyMatch && !standardized) {
                        const [, month, day, year] = mmddyyyyMatch;
                        const m = parseInt(month);
                        const d = parseInt(day);
                        if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
                            standardized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                        }
                    }
                    
                    if (standardized && standardized !== original) {
                        row[key] = standardized;
                        changes++;
                    }
                }
            }
        });
    });
    return { data, changes };
}

// Enhanced duplicate removal with fuzzy matching
function removeDuplicates(data) {
    if (data.length === 0) return { data, removed: 0 };
    
    const unique = [];
    let removed = 0;
    
    for (let i = 0; i < data.length; i++) {
        const currentRow = data[i];
        let isDuplicate = false;
        
        // Check against existing unique rows
        for (const uniqueRow of unique) {
            let matchingFields = 0;
            let totalFields = 0;
            
            // Compare each field
            for (const key in currentRow) {
                if (uniqueRow.hasOwnProperty(key)) {
                    totalFields++;
                    const val1 = String(currentRow[key]).toLowerCase().trim();
                    const val2 = String(uniqueRow[key]).toLowerCase().trim();
                    
                    if (val1 === val2) {
                        matchingFields++;
                    }
                }
            }
            
            // If 80% or more fields match, consider it a duplicate
            if (totalFields > 0 && (matchingFields / totalFields) >= 0.8) {
                isDuplicate = true;
                removed++;
                break;
            }
        }
        
        if (!isDuplicate) {
            unique.push(currentRow);
        }
    }
    
    return { data: unique, removed };
}

// Handle null values
function handleNulls(data) {
    let changes = 0;
    data.forEach(row => {
        Object.keys(row).forEach(key => {
            if (!row[key] || row[key] === '' || row[key] === null || row[key] === undefined) {
                const keyLower = key.toLowerCase();
                if (keyLower.includes('email')) {
                    row[key] = 'unknown@example.com';
                } else if (keyLower.includes('phone')) {
                    row[key] = '+91-00000-00000';
                } else if (keyLower.includes('date')) {
                    row[key] = '1970-01-01';
                } else {
                    row[key] = 'Unknown';
                }
                changes++;
            }
        });
    });
    return { data, changes };
}

// Validate data
function validateData(data) {
    const issues = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\+\d{2}-\d{5}-\d{5}$/;
    
    data.forEach((row, index) => {
        Object.keys(row).forEach(key => {
            const keyLower = key.toLowerCase();
            
            if (keyLower.includes('email') && row[key] !== 'unknown@example.com') {
                if (!emailRegex.test(row[key])) {
                    issues.push(`Row ${index + 1}: Invalid email in ${key}`);
                }
            }
            
            if (keyLower.includes('phone') && row[key] !== '+91-00000-00000') {
                if (!phoneRegex.test(row[key])) {
                    issues.push(`Row ${index + 1}: Invalid phone in ${key}`);
                }
            }
        });
    });
    
    return issues;
}

// Normalize numeric columns
function normalizeData(data) {
    if (data.length === 0) return { data, changes: 0 };
    
    const numericColumns = [];
    const firstRow = data[0];
    
    // Identify numeric columns
    Object.keys(firstRow).forEach(key => {
        if (data.every(row => !isNaN(parseFloat(row[key])) && isFinite(row[key]))) {
            numericColumns.push(key);
        }
    });
    
    // Normalize each numeric column
    numericColumns.forEach(col => {
        const values = data.map(row => parseFloat(row[col]));
        const min = Math.min(...values);
        const max = Math.max(...values);
        
        if (max !== min) {
            data.forEach(row => {
                row[col] = ((parseFloat(row[col]) - min) / (max - min)).toFixed(2);
            });
        }
    });
    
    return { data, changes: numericColumns.length };
}

// Main cleaning endpoint
router.post('/clean', upload.single('csvFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No CSV file uploaded' });
        }
        
        const options = JSON.parse(req.body.options || '{}');
        const originalFileName = req.file.originalname;
        const results = [];
        const summary = {
            originalRows: 0,
            finalRows: 0,
            changes: {
                typosFixed: 0,
                formatsStandardized: 0,
                duplicatesRemoved: 0,
                nullsHandled: 0,
                columnsNormalized: 0
            },
            validationIssues: []
        };
        
        // Read CSV file
        await new Promise((resolve, reject) => {
            fs.createReadStream(req.file.path)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', resolve)
                .on('error', reject);
        });
        
        summary.originalRows = results.length;
        let data = results;
        
        // Apply cleaning operations
        if (options.fixTypos) {
            const result = fixTypos(data);
            data = result.data;
            summary.changes.typosFixed = result.changes;
        }
        
        if (options.standardizeFormats) {
            const result = standardizeFormats(data);
            data = result.data;
            summary.changes.formatsStandardized = result.changes;
        }
        
        if (options.removeDuplicates) {
            const result = removeDuplicates(data);
            data = result.data;
            summary.changes.duplicatesRemoved = result.removed;
        }
        
        if (options.handleNulls) {
            const result = handleNulls(data);
            data = result.data;
            summary.changes.nullsHandled = result.changes;
        }
        
        if (options.validateData) {
            summary.validationIssues = validateData(data);
        }
        
        if (options.normalizeData) {
            const result = normalizeData(data);
            data = result.data;
            summary.changes.columnsNormalized = result.changes;
        }
        
        summary.finalRows = data.length;
        
        // Generate cleaned CSV content
        let csvContent = '';
        if (data.length > 0) {
            const headers = Object.keys(data[0]);
            csvContent = headers.join(',') + '\n';
            csvContent += data.map(row => 
                headers.map(header => {
                    const value = row[header] || '';
                    return `"${String(value).replace(/"/g, '""')}"`;
                }).join(',')
            ).join('\n');
        }
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        
        res.json({
            success: true,
            summary,
            csvContent,
            originalFileName,
            preview: data.slice(0, 5)
        });
        
    } catch (error) {
        console.error('CSV cleaning error:', error);
        res.status(500).json({ error: 'Failed to clean CSV file' });
    }
});

export default router;