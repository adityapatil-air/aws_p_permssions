import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Alert, AlertDescription } from './ui/alert';
import { Progress } from './ui/progress';

interface CleaningOptions {
  fixTypos: boolean;
  standardizeFormats: boolean;
  removeDuplicates: boolean;
  handleNulls: boolean;
  validateData: boolean;
  normalizeData: boolean;
}

interface CleaningSummary {
  originalRows: number;
  finalRows: number;
  changes: {
    typosFixed: number;
    formatsStandardized: number;
    duplicatesRemoved: number;
    nullsHandled: number;
    columnsNormalized: number;
  };
  validationIssues: string[];
}

const CSVCleaner: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<CleaningOptions>({
    fixTypos: true,
    standardizeFormats: true,
    removeDuplicates: true,
    handleNulls: true,
    validateData: true,
    normalizeData: false
  });
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<CleaningSummary | null>(null);
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
      setError(null);
      setSummary(null);
      setCsvContent(null);
      setPreview(null);
    } else {
      setError('Please select a valid CSV file');
    }
  };

  const handleOptionChange = (option: keyof CleaningOptions) => {
    setOptions(prev => ({
      ...prev,
      [option]: !prev[option]
    }));
  };

  const cleanData = async () => {
    if (!file) {
      setError('Please select a CSV file');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('csvFile', file);
      formData.append('options', JSON.stringify(options));

      const response = await fetch('/api/csv-cleaner/clean', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        setSummary(result.summary);
        setCsvContent(result.csvContent);
        setOriginalFileName(result.originalFileName);
        setPreview(result.preview);
      } else {
        setError(result.error || 'Failed to clean CSV');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = () => {
    if (csvContent) {
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cleaned_${originalFileName || 'data.csv'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }
  };

  const replaceOriginal = () => {
    if (!csvContent || !originalFileName) return;
    
    try {
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Save as cleaned_originalname.csv
      const baseName = originalFileName.replace('.csv', '');
      link.download = `cleaned_${baseName}.csv`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      alert('✅ Cleaned file downloaded as cleaned_' + baseName + '.csv');
    } catch (err) {
      setError('Failed to replace original file');
    }
  };

  const saveToFolder = () => {
    if (!csvContent || !originalFileName) return;
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Extract directory and filename
    const baseName = originalFileName.replace(/\.csv$/i, '');
    link.download = `${baseName}_cleaned.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    alert('✅ File saved as ' + baseName + '_cleaned.csv');
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            🧹 CSV Data Cleaner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* File Upload */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Upload CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {file && (
              <p className="text-sm text-green-600">
                ✅ Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          {/* Cleaning Options */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Cleaning Options</h3>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(options).map(([key, value]) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox
                    id={key}
                    checked={value}
                    onCheckedChange={() => handleOptionChange(key as keyof CleaningOptions)}
                  />
                  <label htmlFor={key} className="text-sm font-medium cursor-pointer">
                    {key === 'fixTypos' && '🔤 Fix Typos'}
                    {key === 'standardizeFormats' && '📧 Standardize Formats'}
                    {key === 'removeDuplicates' && '🗑️ Remove Duplicates'}
                    {key === 'handleNulls' && '❌ Handle Null Values'}
                    {key === 'validateData' && '✅ Validate Data'}
                    {key === 'normalizeData' && '📊 Normalize Numbers'}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Clean Button */}
          <Button
            onClick={cleanData}
            disabled={!file || loading}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Cleaning Data...
              </>
            ) : (
              '🚀 Clean Data'
            )}
          </Button>

          {/* Progress */}
          {loading && (
            <div className="space-y-2">
              <Progress value={50} className="w-full" />
              <p className="text-sm text-center text-gray-600">Processing your CSV file...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Results */}
          {summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">🎉 Cleaning Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Original Rows:</strong> {summary.originalRows}
                  </div>
                  <div>
                    <strong>Final Rows:</strong> {summary.finalRows}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">Changes Made:</h4>
                  <ul className="text-sm space-y-1">
                    {summary.changes.typosFixed > 0 && (
                      <li>✅ Fixed {summary.changes.typosFixed} typos</li>
                    )}
                    {summary.changes.formatsStandardized > 0 && (
                      <li>✅ Standardized {summary.changes.formatsStandardized} formats</li>
                    )}
                    {summary.changes.duplicatesRemoved > 0 && (
                      <li>✅ Removed {summary.changes.duplicatesRemoved} duplicates</li>
                    )}
                    {summary.changes.nullsHandled > 0 && (
                      <li>✅ Handled {summary.changes.nullsHandled} null values</li>
                    )}
                    {summary.changes.columnsNormalized > 0 && (
                      <li>✅ Normalized {summary.changes.columnsNormalized} columns</li>
                    )}
                  </ul>
                </div>

                {summary.validationIssues.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-orange-600">Validation Issues:</h4>
                    <ul className="text-sm space-y-1 text-orange-600">
                      {summary.validationIssues.slice(0, 5).map((issue, index) => (
                        <li key={index}>⚠️ {issue}</li>
                      ))}
                      {summary.validationIssues.length > 5 && (
                        <li>... and {summary.validationIssues.length - 5} more issues</li>
                      )}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <Button onClick={replaceOriginal} variant="destructive" size="sm">
                    🔄 Replace Original
                  </Button>
                  <Button onClick={saveToFolder} variant="outline" size="sm">
                    📁 Save to Folder
                  </Button>
                  <Button onClick={downloadFile} variant="default" size="sm">
                    📥 Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview */}
          {preview && preview.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">👀 Data Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-50">
                        {Object.keys(preview[0]).map((header) => (
                          <th key={header} className="border border-gray-300 px-2 py-1 text-left">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, index) => (
                        <tr key={index}>
                          {Object.values(row).map((value: any, cellIndex) => (
                            <td key={cellIndex} className="border border-gray-300 px-2 py-1">
                              {String(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CSVCleaner;