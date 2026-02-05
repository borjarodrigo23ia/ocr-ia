'use client';

import { useState } from 'react';
import { CheckCircle, FileText, Calendar, Eye, Trash2, ChevronDown, ChevronUp, X, FileCheck } from 'lucide-react';
import { HistoryFile } from '@/types';

interface HistoryTableProps {
  historyFiles: HistoryFile[];
  onClearHistory: () => void;
}

export default function HistoryTable({ historyFiles, onClearHistory }: HistoryTableProps) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Helper function to safely format numbers (European format with commas)
  const formatPrice = (value: any): string => {
    if (value === null || value === undefined) return '0,00';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? '0,00' : num.toFixed(2).replace('.', ',');
  };

  // Helper function to calculate total discount amount in euros
  const calculateTotalDiscountAmount = (product: any): number => {
    const subtotal = product.quantity * product.unitPrice;
    const percentageDiscount = subtotal * (product.discountPercent || 0) / 100;
    const fixedDiscount = product.discountAmount || 0;
    return percentageDiscount + fixedDiscount;
  };

  if (historyFiles.length === 0) {
    return (
      <div className="bg-white/50 backdrop-blur-sm border border-slate-200/50 rounded-2xl p-12 text-center">
        <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <FileText className="w-10 h-10 text-slate-300" />
        </div>
        <h3 className="text-xl font-semibold text-slate-600 mb-3">No hay facturas procesadas</h3>
        <p className="text-slate-500 max-w-md mx-auto leading-relaxed">
          Las facturas procesadas correctamente aparecerán aquí en el historial
        </p>
      </div>
    );
  }

  const sortedFiles = [...historyFiles].sort((a, b) => {
    let comparison = 0;
    
    if (sortBy === 'date') {
      comparison = new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
    } else {
      comparison = a.fileName.localeCompare(b.fileName);
    }
    
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Nuevo diseño: lista de cards minimalistas, una por fila
  return (
    <div className="py-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Historial de Facturas Procesadas</h2>
        <button
          onClick={onClearHistory}
          className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-sm font-medium transition-all duration-200"
        >
          Limpiar historial
        </button>
      </div>
      <div className="flex flex-col gap-4">
        {sortedFiles.map((historyFile) => (
          <div
            key={historyFile.id}
            className="bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 px-5 py-4 flex items-center gap-4 relative group focus-within:ring-2 focus-within:ring-blue-200"
            tabIndex={0}
            aria-label={`Factura ${historyFile.fileName}`}
          >
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
              <FileCheck className="w-6 h-6 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 truncate" title={historyFile.fileName}>{historyFile.fileName}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-slate-500">€{formatPrice(historyFile.extractedData.invoice.totalTTC)}</span>
                <span className="text-xs text-slate-400">{formatDate(historyFile.completedAt)}</span>
              </div>
            </div>
            <button
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-all duration-200"
              title="Ver detalles"
              onClick={() => setExpandedFile(expandedFile === historyFile.id ? null : historyFile.id)}
              aria-expanded={expandedFile === historyFile.id}
            >
              {expandedFile === historyFile.id ? 'Ocultar' : 'Ver'}
            </button>
            <button
              className="ml-2 px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-medium transition-all duration-200"
              title="Eliminar del historial"
              onClick={() => onClearHistory()}
            >
              <X className="w-4 h-4" />
            </button>
            {/* Detalles expandibles */}
            {expandedFile === historyFile.id && (
              <div className="absolute left-0 top-full mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-xl p-6 z-10 flex flex-col md:flex-row gap-6 min-w-0 max-w-none">
                <button
                  className="absolute top-2 right-2 text-slate-400 hover:text-slate-700"
                  onClick={() => setExpandedFile(null)}
                  aria-label="Cerrar detalles"
                >
                  <X className="w-5 h-5" />
                </button>
                {/* Columna izquierda: info clave */}
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                  <h3 className="text-base font-bold text-slate-800 mb-2">Factura procesada</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-700 mb-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-400">Archivo</span>
                      <span className="font-medium truncate" title={historyFile.fileName}>{historyFile.fileName}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-400">Fecha</span>
                      <span>{formatDate(historyFile.completedAt)}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-400">Proveedor</span>
                      <span className="font-medium truncate" title={historyFile.extractedData.supplier.name}>{historyFile.extractedData.supplier.name}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-400">Referencia</span>
                      <span className="font-mono text-xs">{historyFile.extractedData.supplier.ref}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-400">Total</span>
                      <span className="font-semibold text-green-700">€{formatPrice(historyFile.extractedData.invoice.totalTTC)}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-400">Nº Factura</span>
                      <span className="font-mono text-xs">{historyFile.extractedData.invoice.number}</span>
                    </div>
                  </div>
                </div>
                {/* Columna derecha: productos */}
                <div className="flex-1 flex flex-col gap-2 min-w-0 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                  <span className="font-semibold text-xs text-slate-700 mb-1 block">Productos</span>
                  <ul className="text-xs text-slate-700 mt-1 space-y-2">
                    {historyFile.extractedData.products.map((product, idx) => {
                      const totalDiscountAmount = calculateTotalDiscountAmount(product);
                      const hasDiscount = totalDiscountAmount > 0;
                      return (
                        <li key={idx} className="flex flex-col md:flex-row md:items-center md:gap-2">
                          <span className="truncate font-medium">{product.description}</span>
                          {product.ref && <span className="text-slate-400 font-mono text-[10px]">({product.ref})</span>}
                          <span className="text-slate-500">x{product.quantity}</span>
                          <span className="text-slate-500">€{formatPrice(product.unitPrice)}</span>
                          {hasDiscount && (
                            <span className="text-orange-600 text-[10px] font-medium">
                              Dto: €{formatPrice(totalDiscountAmount)}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 