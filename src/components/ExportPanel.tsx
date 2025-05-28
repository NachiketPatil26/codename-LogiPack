import React from 'react';
import { FileImage, File as FilePdf, FileText, CheckCircle, AlertCircle, Boxes } from 'lucide-react';
import { Container, CargoItem, PackedResult } from '../types';
import { jsPDF } from 'jspdf';
import { captureCanvas } from '../utils/canvasExport';
import { renderAllOrthographicViews } from '../utils/orthographicViews';

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
    if (!packedResult?.packedItems) {
      console.error('No packed items available for export');
      return;
    }

    try {
      console.log('Generating orthographic views for export');
      
      // Generate orthographic views (top, front, side)
      const orthographicViews = renderAllOrthographicViews(
        container,
        packedResult.packedItems,
        800, // width
        600  // height
      );
      
      // Create a combined image with all views
      const combinedCanvas = document.createElement('canvas');
      combinedCanvas.width = 800 * 2; // Two views side by side
      combinedCanvas.height = 600 * 2; // Two views stacked vertically
      const ctx = combinedCanvas.getContext('2d');
      
      if (!ctx) {
        console.error('Could not get 2D context for combined canvas');
        return;
      }
      
      // Set white background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);
      
      // Load and draw all views
      const drawImage = (src: string, x: number, y: number, label: string) => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, x, y, 800, 600);
            
            // Add label
            ctx.font = 'bold 24px Arial';
            ctx.fillStyle = '#000000';
            ctx.fillText(label, x + 10, y + 30);
            
            resolve();
          };
          img.src = src;
        });
      };
      
      // Draw all views with labels
      await Promise.all([
        drawImage(orthographicViews.top, 0, 0, 'Top View'),
        drawImage(orthographicViews.front, 800, 0, 'Front View'),
        drawImage(orthographicViews.side, 0, 600, 'Side View')
      ]);
      
      // Add perspective view if canvas is available
      if (canvas) {
        const perspectiveView = await captureCanvas(canvas);
        await drawImage(perspectiveView, 800, 600, 'Perspective View');
      }
      
      // Add title and metadata
      ctx.font = 'bold 32px Arial';
      ctx.fillStyle = '#000000';
      ctx.fillText('Container Load Plan - Orthographic Views', 20, combinedCanvas.height - 40);
      
      ctx.font = '16px Arial';
      ctx.fillText(`Container: ${container.name} (${container.length}×${container.width}×${container.height} cm)`, 20, combinedCanvas.height - 15);
      ctx.fillText(`Space Utilization: ${packedResult.containerFillPercentage.toFixed(1)}%`, 500, combinedCanvas.height - 15);
      
      // Create and trigger download
      const link = document.createElement('a');
      link.download = `container-load-plan-orthographic-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = combinedCanvas.toDataURL('image/png', 1.0);
      link.click();
    } catch (error) {
      console.error('Error exporting orthographic views:', error);
    }
  };
  
  const handleExportPdf = async () => {
    if (!packedResult?.packedItems) {
      console.error('No packed items available for PDF export');
      return;
    }
    
    try {
      console.log('Generating orthographic views for PDF export');
      
      // Generate orthographic views (top, front, side)
      const orthographicViews = renderAllOrthographicViews(
        container,
        packedResult.packedItems,
        800, // width
        600  // height
      );
      
      // Create PDF document
      const pdf = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      // Add title with styling
      pdf.setFontSize(22);
      pdf.setTextColor(33, 33, 33);
      pdf.text('Container Load Plan - Technical Views', 14, 15);
      
      // Add date
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 22);
      
      // Add container info with styling
      pdf.setFontSize(12);
      pdf.setTextColor(33, 33, 33);
      pdf.text(`Container: ${container.name} (${container.length} × ${container.width} × ${container.height} cm)`, 14, 30);
      
      // Add statistics with styling
      pdf.setTextColor(50, 50, 50);
      pdf.text(`Space Utilization: ${packedResult.containerFillPercentage.toFixed(1)}%`, 14, 38);
      pdf.text(`Weight Utilization: ${packedResult.weightCapacityPercentage.toFixed(1)}% (${packedResult.totalWeight} kg of ${container.maxWeight} kg)`, 14, 46);
      pdf.text(`Items Loaded: ${packedResult.packedItems.length} of ${cargoItems.length}`, 14, 54);
      
      // Calculate dimensions for orthographic views
      const viewWidth = (pageWidth - 30) / 2; // Two views side by side
      const viewHeight = viewWidth * 0.75; // Maintain aspect ratio
      
      // Add orthographic views section title
      pdf.setFontSize(14);
      pdf.setTextColor(33, 33, 33);
      pdf.text('Orthographic Views', 14, 62);
      
      // Add borders and labels for each view
      const addViewWithLabel = (imageData: string, x: number, y: number, label: string) => {
        // Add border
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.5);
        pdf.rect(x, y, viewWidth, viewHeight);
        
        // Add the image
        pdf.addImage(imageData, 'PNG', x, y, viewWidth, viewHeight);
        
        // Add label
        pdf.setFontSize(10);
        pdf.setTextColor(33, 33, 33);
        pdf.text(label, x + 2, y + 5);
      };
      
      // Add the orthographic views
      const startY = 65;
      addViewWithLabel(orthographicViews.top, 14, startY, 'Top View');
      addViewWithLabel(orthographicViews.front, 14 + viewWidth + 2, startY, 'Front View');
      addViewWithLabel(orthographicViews.side, 14, startY + viewHeight + 2, 'Side View');
      
      // Add perspective view if canvas is available
      if (canvas) {
        const perspectiveView = await captureCanvas(canvas);
        addViewWithLabel(perspectiveView, 14 + viewWidth + 2, startY + viewHeight + 2, 'Perspective View');
      }
      
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
      pdf.save(`container-load-plan-orthographic-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    }
  };
  
  // Ensure we have valid data before rendering
  if (!packedResult || !container || !cargoItems) {
    return (
      <div className="bg-card rounded-lg border p-6 shadow-sm">
        <div className="flex flex-col gap-6">
          <h3 className="text-lg font-medium">Export Results</h3>
          <p className="text-muted-foreground">No data available to export</p>
        </div>
      </div>
    );
  }
  
  // Safely get lengths with fallbacks
  const packedItemsCount = packedResult.packedItems?.length || 0;
  const unpackedItemsCount = packedResult.unpackedItems?.length || 0;
  const totalItems = cargoItems?.length || 0;

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
              <span className="font-medium">{container?.name || 'N/A'}</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle size={16} className="text-success" />
              <span className="text-muted-foreground">Space utilization:</span>
              <span className="font-medium">{packedResult.containerFillPercentage?.toFixed(1)}%</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle size={16} className="text-success" />
              <span className="text-muted-foreground">Weight:</span>
              <span className="font-medium">{packedResult.totalWeight?.toFixed(1)} kg ({packedResult.weightCapacityPercentage?.toFixed(1)}% of capacity)</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle size={16} className="text-success" />
              <span className="text-muted-foreground">Packed items:</span>
              <span className="font-medium">{packedItemsCount} of {totalItems}</span>
            </div>
            
            {unpackedItemsCount > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <AlertCircle size={16} className="text-destructive" />
                <span className="text-muted-foreground">Unpacked items:</span>
                <span className="font-medium text-destructive">{unpackedItemsCount}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportPanel;