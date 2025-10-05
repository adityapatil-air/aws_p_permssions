import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { FileSpreadsheet, Database, Clock, Zap } from 'lucide-react';

interface ExcelConversionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConvertToCsv: () => void;
  onKeepExcel: () => void;
  fileName: string;
}

export function ExcelConversionDialog({
  isOpen,
  onClose,
  onConvertToCsv,
  onKeepExcel,
  fileName
}: ExcelConversionDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-center px-6 pt-6">
          <DialogTitle className="flex items-center justify-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            Excel File Detected
          </DialogTitle>
          <DialogDescription className="text-center mt-2">
            We detected you&apos;re uploading an Excel file: <strong>{fileName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h4 className="font-medium text-blue-900 mb-3 flex items-center gap-2">
              <Database className="h-4 w-4" />
              Convert to CSV for Better Analysis
            </h4>
            <ul className="text-sm text-blue-800 space-y-2">
              <li className="flex items-center gap-2">
                <Zap className="h-3 w-3" />
                Faster query performance
              </li>
              <li className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                Better compatibility with Athena
              </li>
              <li className="flex items-center gap-2">
                <Database className="h-3 w-3" />
                Reduced file size (~60% smaller)
              </li>
            </ul>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border">
            <h4 className="font-medium text-gray-900 mb-2">
              Keep as Excel
            </h4>
            <p className="text-sm text-gray-600">
              Upload the original Excel file. You can convert it later if needed for analysis.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-3 px-6 pb-6">
          <Button
            variant="outline"
            onClick={onKeepExcel}
            className="w-full sm:w-auto order-2 sm:order-1"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Keep Excel
          </Button>
          <Button
            onClick={onConvertToCsv}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 order-1 sm:order-2"
          >
            <Database className="h-4 w-4 mr-2" />
            Convert to CSV (Recommended)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}