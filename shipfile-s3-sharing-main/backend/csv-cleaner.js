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

// Fix typos function
function fixTypos(data) {
    let changes = 0;
    data.forEach(row => {
        Object.keys(row).forEach(key => {
            if (typeof row[key] === 'string' && row[key].length > 0) {
                const original = row[key];
                const words = original.split(' ');
                const fixedWords = words.map(word => {
                    const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
                    if (typos[cleanWord]) {
                        changes++;
                        return word.replace(new RegExp(cleanWord, 'i'), typos[cleanWord]);
                    }
                    return word;
                });
                row[key] = fixedWords.join(' ');
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
            
            // Email standardization
            if (keyLower.includes('email') || keyLower.includes('mail')) {
                if (row[key] && typeof row[key] === 'string') {
                    let email = row[key].toLowerCase().trim().replace(/\s+/g, '');
                    const original = email;
                    
                    // Fix common email issues
                    if (email.includes('gmailcom')) {
                        email = email.replace('gmailcom', 'gmail.com');
                    }
                    if (email.includes('gmail') && !email.includes('.com')) {
                        email = email.replace('gmail', 'gmail.com');
                    }
                    if (email.includes('yahoo') && !email.includes('.com')) {
                        email = email.replace('yahoo', 'yahoo.com');
                    }
                    if (email.includes('outlook') && !email.includes('.com')) {
                        email = email.replace('outlook', 'outlook.com');
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
            
            // Date standardization
            if (keyLower.includes('date') || keyLower.includes('birth') || keyLower.includes('dob')) {
                if (row[key]) {
                    const original = row[key];
                    let standardized = null;
                    
                    const dateStr = original.toString();
                    
                    // DD/MM/YYYY or MM/DD/YYYY
                    const dmyMatch = dateStr.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
                    if (dmyMatch) {
                        const [, part1, part2, year] = dmyMatch;
                        const day = part1.padStart(2, '0');
                        const month = part2.padStart(2, '0');
                        standardized = `${year}-${month}-${day}`;
                    }
                    
                    // YYYY/MM/DD
                    const ymdMatch = dateStr.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
                    if (ymdMatch) {
                        const [, year, month, day] = ymdMatch;
                        standardized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    }
                    
                    // DD-MM-YYYY
                    const dashMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
                    if (dashMatch) {
                        const [, day, month, year] = dashMatch;
                        standardized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
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

// Remove duplicates
function removeDuplicates(data) {
    const seen = new Set();
    const unique = data.filter(row => {
        const key = JSON.stringify(row);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
    return { data: unique, removed: data.length - unique.length };
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