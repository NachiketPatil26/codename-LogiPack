import React from 'react';
import { FileImage, File as FilePdf, FileText, CheckCircle, AlertCircle, Boxes } from 'lucide-react';
import { Container, CargoItem, PackedResult } from '../types';
import { jsPDF } from 'jspdf';
import { captureCanvas } from '../utils/canvasExport';

interface ExportPanelProps {
  container: Container;
  packedResult: PackedResult;
  cargoItems: CargoItem[];
  onExport?: () => void;
  canvas: HTMLCanvasElement | null;
}

const ExportPanel: React.FC<ExportPanelProps> = ({
  container,
  packedResult,
  cargoItems,
  canvas
}) => {
  const handleExportImage = async () => {
    if (!canvas) return;

    const imageData = await captureCanvas(canvas);
    const link = document.createElement('a');
    link.download = `container-load-plan-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = imageData;
    link.click();
  };
  
  const handleExportPdf = async () => {
    if (!canvas) return;
    
    const imageData = await captureCanvas(canvas);
    const pdf = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    // Add title
    pdf.setFontSize(16);
    pdf.text('Container Load Plan', 14, 15);
    
    // Add date
    pdf.setFontSize(10);
    pdf.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 22);
    
    // Add container info
    pdf.setFontSize(12);
    pdf.text(`Container: ${container.name} (${container.length} × ${container.width} × ${container.height} cm)`, 14, 30);
    
    // Add statistics
    pdf.text(`Space Utilization: ${packedResult.containerFillPercentage.toFixed(1)}%`, 14, 38);
    pdf.text(`Weight Utilization: ${packedResult.weightCapacityPercentage.toFixed(1)}% (${packedResult.totalWeight} kg of ${container.maxWeight} kg)`, 14, 46);
    pdf.text(`Items Loaded: ${packedResult.packedItems.length} of ${cargoItems.length}`, 14, 54);
    
    // Add the captured image
    const imgWidth = pageWidth - 30;
    const imgHeight = 80;
    pdf.addImage(imageData, 'PNG', 15, 62, imgWidth, imgHeight);
    
    // Add packed items table
    pdf.text('Packed Items:', 14, 150);
    
    let yPos = 158;
    pdf.setFontSize(9);
    pdf.text('Name', 14, yPos);
    pdf.text('Dimensions (cm)', 60, yPos);
    pdf.text('Weight (kg)', 110, yPos);
    pdf.text('Position (x,y,z)', 150, yPos);
    pdf.text('Color', 200, yPos);
    
    yPos += 5;
    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, yPos, pageWidth - 14, yPos);
    
    yPos += 6;
    pdf.setFontSize(8);
    
    packedResult.packedItems.forEach((item) => {
      if (yPos > pageHeight - 20) {
        pdf.addPage();
        yPos = 20;
        
        // Add header to new page
        pdf.setFontSize(9);
        pdf.text('Name', 14, yPos);
        pdf.text('Dimensions (cm)', 60, yPos);
        pdf.text('Weight (kg)', 110, yPos);
        pdf.text('Position (x,y,z)', 150, yPos);
        pdf.text('Color', 200, yPos);
        
        yPos += 5;
        pdf.setDrawColor(200, 200, 200);
        pdf.line(14, yPos, pageWidth - 14, yPos);
        
        yPos += 6;
        pdf.setFontSize(8);
      }
      
      pdf.text(item.name, 14, yPos);
      pdf.text(`${item.length} × ${item.width} × ${item.height}`, 60, yPos);
      pdf.text(`${item.weight}`, 110, yPos);
      pdf.text(`(${item.position.x}, ${item.position.y}, ${item.position.z})`, 150, yPos);
      pdf.text(item.color || '#6366f1', 200, yPos);
      
      yPos += 6;
    });
    
    // Check if there are unpacked items
    if (packedResult.unpackedItems.length > 0) {
      if (yPos > pageHeight - 40) {
        pdf.addPage();
        yPos = 20;
      } else {
        yPos += 10;
      }
      
      pdf.setFontSize(12);
      pdf.text('Unpacked Items:', 14, yPos);
      
      yPos += 8;
      pdf.setFontSize(9);
      pdf.text('Name', 14, yPos);
      pdf.text('Dimensions (cm)', 60, yPos);
      pdf.text('Weight (kg)', 110, yPos);
      pdf.text('Color', 150, yPos);
      
      yPos += 5;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(14, yPos, pageWidth - 14, yPos);
      
      yPos += 6;
      pdf.setFontSize(8);
      
      packedResult.unpackedItems.forEach((item) => {
        if (yPos > pageHeight - 20) {
          pdf.addPage();
          yPos = 20;
          
          // Add header to new page
          pdf.setFontSize(9);
          pdf.text('Name', 14, yPos);
          pdf.text('Dimensions (cm)', 60, yPos);
          pdf.text('Weight (kg)', 110, yPos);
          pdf.text('Color', 150, yPos);
          
          yPos += 5;
          pdf.setDrawColor(200, 200, 200);
          pdf.line(14, yPos, pageWidth - 14, yPos);
          
          yPos += 6;
          pdf.setFontSize(8);
        }
        
        pdf.text(item.name, 14, yPos);
        pdf.text(`${item.length} × ${item.width} × ${item.height}`, 60, yPos);
        pdf.text(`${item.weight}`, 110, yPos);
        pdf.text(item.color || '#6366f1', 150, yPos);
        
        yPos += 6;
      });
    }
    
    // Save the PDF
    pdf.save(`container-load-plan-${new Date().toISOString().slice(0, 10)}.pdf`);
  };
  
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title flex items-center gap-2">
          <FileText className="text-accent" />
          Export Load Plan
        </h2>
      </div>
      
      <div className="card-content">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <button
            onClick={handleExportImage}
            className="flex items-center justify-center gap-3 p-4 border-2 border-border rounded-lg
                      hover:border-accent hover:bg-accent/5 transition-colors shadow-sm"
          >
            <FileImage size={24} className="text-accent" />
            <div className="text-left">
              <p className="font-medium">Export as Image</p>
              <p className="text-xs text-muted-foreground">Save current view as PNG</p>
            </div>
          </button>
          
          <button
            onClick={handleExportPdf}
            className="flex items-center justify-center gap-3 p-4 border-2 border-border rounded-lg
                      hover:border-accent hover:bg-accent/5 transition-colors shadow-sm"
          >
            <FilePdf size={24} className="text-accent" />
            <div className="text-left">
              <p className="font-medium">Export as PDF</p>
              <p className="text-xs text-muted-foreground">Complete report with details</p>
            </div>
          </button>
        </div>
        
        <div className="bg-muted rounded-lg p-4">
          <h3 className="text-sm font-medium flex items-center gap-1.5 mb-3">
            <Boxes size={16} className="text-accent" />
            Export Summary
          </h3>
          
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle size={16} className="text-success" />
              <span className="text-muted-foreground">Container:</span>
              <span className="font-medium">{container.name}</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle size={16} className="text-success" />
              <span className="text-muted-foreground">Space utilization:</span>
              <span className="font-medium">
                {(packedResult?.containerFillPercentage || 0).toFixed(1)}%
              </span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle size={16} className="text-success" />
              <span className="text-muted-foreground">Weight:</span>
              <span className="font-medium">
                {(packedResult?.totalWeight || 0).toFixed(1)} kg 
                ({(packedResult?.weightCapacityPercentage || 0).toFixed(1)}% of capacity)
              </span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle size={16} className="text-success" />
              <span className="text-muted-foreground">Packed items:</span>
              <span className="font-medium">{packedResult.packedItems.length} of {cargoItems.length}</span>
            </div>
            
            {packedResult.unpackedItems.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <AlertCircle size={16} className="text-destructive" />
                <span className="text-muted-foreground">Unpacked items:</span>
                <span className="font-medium text-destructive">{packedResult.unpackedItems.length}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportPanel;