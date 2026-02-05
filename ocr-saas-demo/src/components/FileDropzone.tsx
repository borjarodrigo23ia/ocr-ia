'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Image, Loader2, CheckCircle, AlertCircle, Send, Edit3, X, Trash2, Building2, Sparkles, CopyCheck, ChevronUp, ChevronDown, FileCheck, CircleCheck } from 'lucide-react';
import { ExtractedInvoiceData, VerificationResult, EditableExtractedData, HistoryFile } from '@/types';
import EditableDataForm from './EditableDataForm';
import CreationButtons from './CreationButtons';
import HistoryTable from './HistoryTable';
import useLocalStorage from '@/hooks/useLocalStorage';

interface ProcessedFile {
  file: File;
  status: 'pending' | 'extracting' | 'extracted' | 'verifying' | 'verified' | 'editing' | 'processing' | 'completed' | 'error';
  extractedData?: ExtractedInvoiceData;
  verification?: VerificationResult;
  editableData?: EditableExtractedData;
  result?: any;
  error?: string;
  completedAt?: Date;
  processedAt?: Date;
  isExpanded?: boolean; // Añadir estado de expandido
  isSelected?: boolean; // Añadir estado de selección
}

export default function FileDropzone() {
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const processingQueueRef = useRef<ProcessedFile[]>([]);

  const [historyFiles, setHistoryFiles] = useLocalStorage<HistoryFile[]>('invoice-history', []);
  const [isClient, setIsClient] = useState(false);

  // Ensure client-side rendering for hydration safety
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Helper function to safely format numbers for display (European format with commas)
  const formatPrice = (value: any): string => {
    if (value === null || value === undefined) return '0,00';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? '0,00' : num.toFixed(2).replace('.', ',');
  };

  // Helper function to format numbers for Dolibarr (with commas)
  const formatForDolibarr = (value: any): string => {
    if (value === null || value === undefined) return '0,000';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0,000';
    return num.toFixed(3).replace('.', ',');
  };

  // Helper function to calculate total discount amount in euros
  const calculateTotalDiscountAmount = (product: any): number => {
    const subtotal = product.quantity * product.unitPrice;
    const percentageDiscount = subtotal * (product.discountPercent || 0) / 100;
    const fixedDiscount = product.discountAmount || 0;
    return percentageDiscount + fixedDiscount;
  };

  // Convert data to Dolibarr format (decimal commas)
  const convertToDolibarrFormat = (data: any): any => {
    const converted = JSON.parse(JSON.stringify(data)); // Deep clone
    
    // Convert invoice amounts
    if (converted.invoice) {
      if (converted.invoice.totalHT) converted.invoice.totalHT = formatForDolibarr(converted.invoice.totalHT);
      if (converted.invoice.totalTTC) converted.invoice.totalTTC = formatForDolibarr(converted.invoice.totalTTC);
      if (converted.invoice.totalVAT) converted.invoice.totalVAT = formatForDolibarr(converted.invoice.totalVAT);
    }
    
    // Convert product amounts
    if (converted.products && Array.isArray(converted.products)) {
      converted.products = converted.products.map((product: any) => ({
        ...product,
        unitPrice: formatForDolibarr(product.unitPrice),
        totalPrice: formatForDolibarr(product.totalPrice),
        quantity: product.quantity || 1
      }));
    }
    
    return converted;
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Verificar si hay archivos duplicados
    const duplicateFiles = acceptedFiles.filter(file => checkForDuplicates(file.name));
    if (duplicateFiles.length > 0) {
      const duplicateNames = duplicateFiles.map(f => f.name).join(', ');
      if (!window.confirm(`⚠️ ADVERTENCIA: Los siguientes archivos ya fueron procesados anteriormente:\n\n${duplicateNames}\n\n¿Deseas procesarlos nuevamente? Esto podría crear facturas duplicadas.`)) {
        return;
      }
    }

    const newFiles = acceptedFiles.map(file => ({
      file,
      status: 'pending' as const,
      isExpanded: true, // Por defecto expandido cuando se procesa
      isSelected: false, // Por defecto no seleccionado
    }));
    setFiles(prev => [...prev, ...newFiles]);
    
    // Start extraction process
    extractDataFromFiles(newFiles);
  }, [historyFiles]);


  const extractDataFromFiles = async (filesToProcess: ProcessedFile[]) => {
    setIsExtracting(true);
    
    for (const fileData of filesToProcess) {
      try {
        setFiles(prev => prev.map(f => 
          f.file === fileData.file 
            ? { ...f, status: 'extracting' }
            : f
        ));

        const formData = new FormData();
        formData.append('file', fileData.file);

        const response = await fetch('/api/extract', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const extractedData = await response.json();

        console.log('🔍 DEBUGGING - API response:', extractedData);
        console.log('🔍 DEBUGGING - extractedData type:', typeof extractedData);
        console.log('🔍 DEBUGGING - extractedData.supplier:', extractedData?.supplier);

        setFiles(prev => prev.map(f => 
          f.file === fileData.file 
            ? { ...f, status: 'extracted', extractedData }
            : f
        ));

        // Automatically verify after extraction
        verifyExtractedData(fileData.file, extractedData);

      } catch (error) {
        console.error('Error extracting data:', error);
        setFiles(prev => prev.map(f => 
          f.file === fileData.file 
            ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Error desconocido' }
            : f
        ));
      }
    }
    
    setIsExtracting(false);
  };

  const verifyExtractedData = async (file: File, extractedData: ExtractedInvoiceData) => {
    try {
      setFiles(prev => prev.map(f => 
        f.file === file 
          ? { ...f, status: 'verifying' }
          : f
      ));

      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ extractedData, fileName: file.name }),
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const verificationResult = await response.json();

      // Validar que la respuesta de verificación tenga la estructura esperada
      if (!verificationResult.verification) {
        throw new Error('Respuesta de verificación inválida');
      }

      const verification = verificationResult.verification;

      // Convert to editable format with suggested references
      const editableData: EditableExtractedData = {
        ...extractedData,
        supplier: {
          ...extractedData.supplier,
          ref: generateSupplierRef(extractedData.supplier.name)
        },
        products: extractedData.products.map((product, index) => {
          return {
            ...product,
            ref: product.productCode || generateProductRef(product.description, index),
            type: 'product' as const
          };
        }),
        invoice: {
          ...extractedData.invoice,
          number: extractedData.invoice.number || generateInvoiceRef(extractedData.supplier.name, extractedData.invoice.number)
        }
      };

      setFiles(prev => prev.map(f => 
        f.file === file 
          ? { ...f, status: 'verified', verification: verificationResult, editableData }
          : f
      ));

    } catch (error) {
      console.error('Error verifying data:', error);
      setFiles(prev => prev.map(f => 
        f.file === file 
          ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Error verificando datos' }
          : f
      ));
    }
  };

  // Generar referencia automática para proveedor
  const generateSupplierRef = (name: string): string => {
    if (!name) return '';
    const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const timestamp = Date.now().toString().slice(-6);
    return `PROV_${cleanName.slice(0, 8)}_${timestamp}`;
  };

  // Generar referencia automática para producto
  const generateProductRef = (description: string, index: number): string => {
    if (!description) return '';
    const cleanDesc = description.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const timestamp = Date.now().toString().slice(-6);
    return `PROD_${cleanDesc.slice(0, 8)}_${timestamp}_${index + 1}`;
  };

  // Generar referencia automática para factura
  const generateInvoiceRef = (supplierName: string, invoiceNumber?: string): string => {
    const cleanSupplier = supplierName?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) || 'INV';
    const cleanNumber = invoiceNumber?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) || '';
    const timestamp = Date.now().toString().slice(-6);
    return `${cleanSupplier}_${cleanNumber}_${timestamp}`;
  };

  // Detectar facturas duplicadas en el historial
  const checkForDuplicates = (fileName: string): boolean => {
    return historyFiles.some(file => 
      file.fileName.toLowerCase() === fileName.toLowerCase()
    );
  };

  // Toggle expansión de resumen
  const toggleFileExpansion = (fileIndex: number) => {
    setFiles(prev => prev.map((file, idx) => 
      idx === fileIndex 
        ? { ...file, isExpanded: !file.isExpanded }
        : file
    ));
  };

  // Toggle selección de archivo
  const toggleFileSelection = (fileIndex: number) => {
    setFiles(prev => prev.map((file, idx) => 
      idx === fileIndex 
        ? { ...file, isSelected: !file.isSelected }
        : file
    ));
  };

  // Seleccionar/deseleccionar todos los archivos verificados
  const toggleSelectAll = () => {
    const verifiedFiles = files.filter(f => f.status === 'verified');
    const allSelected = verifiedFiles.every(f => f.isSelected);
    
    setFiles(prev => prev.map(file => 
      file.status === 'verified' 
        ? { ...file, isSelected: !allSelected }
        : file
    ));
  };

  // Procesar archivos seleccionados en lote
  const processSelectedFiles = async () => {
    const selectedFiles = files.filter(f => f.isSelected && f.status === 'verified');
    if (selectedFiles.length === 0) {
      alert('No hay archivos seleccionados para procesar.');
      return;
    }
    
    // Procesar todos los archivos seleccionados directamente
    for (const fileData of selectedFiles) {
      await confirmAndProcess(fileData, true); // Skip confirmations and process with creation
    }
  };

  const editData = (fileData: ProcessedFile) => {
    setFiles(prev => prev.map(f => 
      f.file === fileData.file 
        ? { ...f, status: 'editing' }
        : f
    ));
  };

  const saveEditedData = (fileData: ProcessedFile, editedData: EditableExtractedData) => {
    setFiles(prev => prev.map(f => 
      f.file === fileData.file 
        ? { ...f, status: 'verified', editableData: editedData }
        : f
    ));
  };

  const cancelEdit = (fileData: ProcessedFile) => {
    setFiles(prev => prev.map(f => 
      f.file === fileData.file 
        ? { ...f, status: 'verified' }
        : f
    ));
  };

  const moveToHistory = (fileData: ProcessedFile, result: any) => {
    if (!fileData.editableData || !fileData.verification) return;

    const historyItem: HistoryFile = {
      id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fileName: fileData.file.name,
      fileSize: fileData.file.size,
      processedAt: new Date(),
      completedAt: new Date(),
      extractedData: fileData.editableData,
      processingResult: result,
      verification: fileData.verification
    };

    setHistoryFiles((prev: HistoryFile[] | undefined) => [historyItem, ...(prev || [])]);
    
    // Remove from active files after a short delay to show completion
    setTimeout(() => {
      setFiles(prev => prev.filter(f => f.file !== fileData.file));
    }, 2000);
  };

  const removeFile = (fileData: ProcessedFile) => {
    setFiles(prev => prev.filter(f => f.file !== fileData.file));
  };

  // Filter files to only show processing ones (not completed)
  const processingFiles = files;

  // Procesamiento individual
  const confirmAndProcess = async (fileData: ProcessedFile, skipConfirm = false) => {
    if (!fileData.editableData && !fileData.extractedData) return;

    try {
      setFiles(prev => prev.map(f => 
        f.file === fileData.file 
          ? { ...f, status: 'processing' }
          : f
      ));

      // Use editable data if available, otherwise fallback to extracted data
      const dataToProcess = fileData.editableData || fileData.extractedData;

      const response = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          extractedData: dataToProcess,
          fileName: fileData.file.name,
          forceDuplicate: fileData.verification?.invoice?.isDuplicate || false, // Flag to indicate force processing
        }),
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      setFiles(prev => prev.map(f => 
        f.file === fileData.file 
          ? { ...f, status: 'completed', result, completedAt: new Date() }
          : f
      ));

      // Move completed file to history
      moveToHistory(fileData, result);

    } catch (error) {
      console.error('Error processing file:', error);
      setFiles(prev => prev.map(f => 
        f.file === fileData.file 
          ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Error desconocido' }
          : f
      ));
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  const getStatusIcon = (status: ProcessedFile['status']) => {
    switch (status) {
      case 'pending':
        return <FileText className="w-5 h-5 text-gray-400" />;
      case 'extracting':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'extracted':
        return <CheckCircle className="w-5 h-5 text-yellow-500" />;
      case 'verifying':
        return <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />;
      case 'verified':
        return <CircleCheck className="w-5 h-5 text-green-500" />;
      case 'editing':
        return <Edit3 className="w-5 h-5 text-blue-500" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />;
      case 'completed':
        return <CircleCheck className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getStatusText = (status: ProcessedFile['status']) => {
    switch (status) {
      case 'pending':
        return 'Pendiente';
      case 'extracting':
        return 'Extrayendo datos...';
      case 'extracted':
        return 'Datos extraídos';
      case 'verifying':
        return 'Verificando en Dolibarr...';
      case 'verified':
        return 'Verificado - Listo para procesar';
      case 'editing':
        return 'Editando datos...';
      case 'processing':
        return 'Enviando a Dolibarr...';
      case 'completed':
        return 'Completado';
      case 'error':
        return 'Error';
    }
  };

  const selectedCount = files.filter(f => f.isSelected && f.status === 'verified').length;
  const verifiedCount = files.filter(f => f.status === 'verified').length;

  return (
    <div className="space-y-8">

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`group relative border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-300 cursor-pointer
          border-[#061830] bg-white
          ${isDragActive 
            ? 'bg-gray-100 scale-105 shadow-[0_0_12px_2px_#06183044]' 
            : 'hover:bg-[#06183022] hover:scale-[1.02] hover:shadow-[0_0_12px_2px_#06183044] hover:shadow-md'
          }`}
      >
        <input {...getInputProps()} />
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-0 pointer-events-none"></div>
        <div className="relative z-10">
          <div className={`w-10 h-10 mx-auto mb-3 rounded-2xl flex items-center justify-center transition-all duration-300
            ${isDragActive 
              ? 'bg-gray-200 scale-110' 
              : 'bg-gray-50 group-hover:bg-[#061830] group-hover:scale-105'
            }`}
          >
            <Upload className={`w-5 h-5 transition-all duration-300
              ${isDragActive 
                ? 'text-black scale-110' 
                : 'text-gray-500 group-hover:text-white animate-[bounceSlow_1.6s_ease-in-out_infinite]'
              }`} 
            />
          </div>
          <h3 className={`text-base font-semibold mb-2 transition-colors
            ${isDragActive 
              ? 'text-black' 
              : 'text-gray-800 group-hover:text-black'
            }`}
          >
          {isDragActive
            ? 'Suelta los archivos aquí...'
            : 'Arrastra y suelta facturas aquí'}
          </h3>
          <p className={`text-xs mb-3 transition-colors
            ${isDragActive 
              ? 'text-black' 
              : 'text-gray-500 group-hover:text-black'
            }`}
          >
          Soporta PDF, JPG, PNG hasta 50MB
        </p>
          </div>
      </div>


          {/* Files List */}
          {isClient && processingFiles.length > 0 ? (
            <div className="space-y-6">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-800">
                  Archivos en procesamiento
              </h3>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                  {isClient ? processingFiles.length : 0}
                </span>
              </div>
          
              {processingFiles.map((fileData, index) => (
                <div key={index} className="bg-white/70 backdrop-blur-sm border border-slate-200/50 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300">
                  {/* File Header */}
                  <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                      {getStatusIcon(fileData.status)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-lg">{fileData.file.name}</p>
                        <div className="flex items-center space-x-4 mt-1">
                          <span className="text-sm text-gray-500">
                          {(fileData.file.size / (1024 * 1024)).toFixed(2)} MB
                          </span>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            fileData.status === 'completed' ? 'bg-green-100 text-green-700' :
                            fileData.status === 'error' ? 'bg-red-100 text-red-700' :
                            fileData.status === 'processing' ? 'bg-orange-100 text-orange-700' :
                            fileData.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-blue-100 text-blue-700'
                          } ${fileData.status === 'verified' ? 'bg-green-100 text-green-600' : ''} ${
                            fileData.status === 'extracting' ? 'bg-purple-100 text-purple-700' : ''
                          }`}>
                            {getStatusText(fileData.status)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {/* Checkbox para archivos verificados */}
                      {fileData.status === 'verified' && (
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={fileData.isSelected || false}
                            onChange={() => toggleFileSelection(index)}
                            className="w-4 h-4 text-[#061830] border-gray-300 rounded focus:ring-[#061830] focus:ring-2"
                          />
                          <span className="text-sm text-gray-600">Seleccionar</span>
                        </label>
                      )}
                      
                      {/* Botón de colapsar/expandir para archivos verificados */}
                      {(fileData.status === 'verified' || fileData.status === 'completed') && (
                        <button
                          onClick={() => toggleFileExpansion(index)}
                          className="p-2 text-gray-400 hover:text-[#061830] hover:bg-blue-50 rounded-lg transition-all duration-300"
                          title={fileData.isExpanded ? "Ocultar resumen" : "Mostrar resumen"}
                        >
                          {fileData.isExpanded ? (
                            <ChevronUp className="w-5 h-5" />
                          ) : (
                            <ChevronDown className="w-5 h-5" />
                          )}
                        </button>
                      )}

                      {fileData.error && (
                      <div className="text-right">
                          <p className="text-sm text-red-600 bg-red-50 px-3 py-1 rounded-lg">{fileData.error}</p>
                      </div>
                      )}
                      {/* Remove button for pending files */}
                      {(fileData.status === 'pending' || fileData.status === 'error' || fileData.status === 'extracted' || fileData.status === 'verified') && (
                        <button
                          onClick={() => removeFile(fileData)}
                          className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-all duration-300 hover:scale-105"
                          title="Eliminar de la lista"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Editing Form */}
                  {fileData.status === 'editing' && fileData.editableData && fileData.verification && (
                    <div className="p-6 bg-blue-50">
                      <EditableDataForm
                        extractedData={fileData.editableData}
                        verification={fileData.verification}
                        onSave={(editedData) => saveEditedData(fileData, editedData)}
                        onCancel={() => cancelEdit(fileData)}
                      />
                    </div>
                  )}

                  {/* Resumen compacto cuando está colapsado */}
                  {(fileData.status === 'verified' || fileData.status === 'completed') && fileData.editableData && !fileData.isExpanded && (
                    <div className="p-4 bg-gray-50 border-t border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <span><strong>Proveedor:</strong> {fileData.editableData.supplier.name}</span>
                          <span><strong>Fecha:</strong> {fileData.editableData.invoice.date}</span>
                          <span><strong>Total:</strong> {formatPrice(fileData.editableData.invoice.totalTTC)}€</span>
                        </div>
                        {fileData.status === 'verified' && (
                          <button
                            onClick={() => confirmAndProcess(fileData)}
                            className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition-all duration-300"
                          >
                            <Sparkles className="w-4 h-4" />
                            <span>Procesar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Verification Summary */}
                  {(fileData.status === 'verified' || fileData.status === 'extracted') && fileData.editableData && fileData.verification && fileData.isExpanded && (
                    <div className="p-6 bg-gray-50">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold text-gray-800">Resumen de datos verificados</h4>
                        {fileData.status === 'verified' && (
                          <button
                            onClick={() => editData(fileData)}
                            className="group flex items-center space-x-2 bg-[#061830] hover:bg-[#0A2A50] text-white px-4 py-2 rounded-lg text-sm transition-all duration-300 hover:scale-105 hover:shadow-md"
                          >
                            <Edit3 className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" />
                            <span className="font-medium">Editar</span>
                          </button>
                        )}
                      </div>
                      
                      <div className="grid md:grid-cols-2 gap-6">
                        {/* Supplier Info */}
                        <div className="bg-white p-4 rounded-lg border">
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="font-medium text-gray-700">Información del Proveedor</h5>
                            {fileData.verification?.supplier?.exists ? (
                              <div className="flex items-center space-x-1 text-green-600">
                                <CircleCheck className="w-4 h-4" />
                                <span className="text-xs">Existe</span>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-1 text-orange-600">
                                <AlertCircle className="w-4 h-4" />
                                <span className="text-xs">Nuevo</span>
                              </div>
                            )}
                          </div>
                          <div className="space-y-2 text-sm">
                            <div><span className="font-medium">Nombre:</span> {fileData.editableData.supplier.name}</div>
                            <div><span className="font-medium">Referencia:</span> {fileData.editableData.supplier.ref}</div>
                            {fileData.editableData.supplier.email && (
                              <div><span className="font-medium">Email:</span> {fileData.editableData.supplier.email}</div>
                            )}
                            {fileData.editableData.supplier.phone && (
                              <div><span className="font-medium">Teléfono:</span> {fileData.editableData.supplier.phone}</div>
                            )}
                            {fileData.editableData.supplier.address && (
                              <div><span className="font-medium">Dirección:</span> {fileData.editableData.supplier.address}</div>
                            )}
                            {fileData.editableData.supplier.vatNumber && (
                              <div><span className="font-medium">NIF/CIF:</span> {fileData.editableData.supplier.vatNumber}</div>
                            )}
                          </div>
                        </div>

                        {/* Invoice Info */}
                        <div className="bg-white p-4 rounded-lg border">
                          <h5 className="font-medium text-gray-700 mb-3 flex items-center">
                            📄 Información de la Factura
                          </h5>
                          <div className="space-y-2 text-sm">
                            <div><span className="font-medium">Número:</span> {fileData.editableData.invoice.number}</div>
                            <div><span className="font-medium">Fecha:</span> {fileData.editableData.invoice.date}</div>
                            {fileData.editableData.invoice.dueDate && (
                              <div><span className="font-medium">Vencimiento:</span> {fileData.editableData.invoice.dueDate}</div>
                            )}
                            <div className="text-lg font-semibold text-green-600">
                              <span className="font-medium text-gray-700">Total:</span> €{formatPrice(fileData.editableData.invoice.totalTTC)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Products */}
                      <div className="mt-6 bg-white p-4 rounded-lg border">
                        <h5 className="font-medium text-gray-700 mb-3 flex items-center">
                          🛍️ Productos ({fileData.editableData.products.length})
                        </h5>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-gray-50">
                                <th className="text-left p-2">Estado</th>
                                <th className="text-left p-2">Descripción</th>
                                <th className="text-left p-2">Referencia</th>
                                <th className="text-right p-2">Cant.</th>
                                <th className="text-right p-2">Precio Unit.</th>
                                <th className="text-right p-2">Desc. %</th>
                                <th className="text-right p-2">Desc. €</th>
                                <th className="text-right p-2">IVA %</th>
                                <th className="text-right p-2">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {fileData.editableData.products.map((product, idx) => {
                                const productVerification = fileData.verification?.products?.[idx];
                                return (
                                  <tr key={idx} className="border-b">
                                    <td className="p-2">
                                      {productVerification?.exists ? (
                                        <div className="flex items-center space-x-1 text-green-600">
                                          <CircleCheck className="w-3 h-3" />
                                          <span className="text-xs">Existe</span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center space-x-1 text-orange-600">
                                          <AlertCircle className="w-3 h-3" />
                                          <span className="text-xs">Nuevo</span>
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-2">{product.description}</td>
                                    <td className="p-2 text-gray-600">{product.ref || '-'}</td>
                                    <td className="p-2 text-right">{product.quantity}</td>
                                    <td className="p-2 text-right">€{formatPrice(product.unitPrice)}</td>
                                    <td className="p-2 text-right">{(product as any).discountPercent || 0}%</td>
                                    <td className="p-2 text-right text-orange-600 font-medium">
                                      {(() => {
                                        const totalDiscountAmount = calculateTotalDiscountAmount(product);
                                        return totalDiscountAmount > 0 
                                          ? `€${formatPrice(totalDiscountAmount)}` 
                                          : '-';
                                      })()}
                                    </td>
                                    <td className="p-2 text-right">{product.vatRate || 0}%</td>
                                    <td className="p-2 text-right font-medium">€{formatPrice(product.totalPrice)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Creation Buttons */}
                      {fileData.status === 'verified' && fileData.editableData && fileData.verification && (
                        <div className="mt-6">
                          <CreationButtons
                            editableData={fileData.editableData}
                            verification={fileData.verification}
                            onUpdate={() => verifyExtractedData(fileData.file, fileData.editableData!)}
                          />
                        </div>
                      )}

                      {/* Confirm Button */}
                      {fileData.status === 'verified' && (
                        <div className="mt-6 flex justify-end">
                          <button
                            onClick={() => confirmAndProcess(fileData)}
                            className="group flex items-center space-x-3 bg-gradient-to-r from-[#a78bfa] to-[#7c3aed] hover:from-[#7c3aed] hover:to-[#a78bfa] text-white px-8 py-3 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg shadow-purple-200"
                          >
                            <Sparkles className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                            <span className="font-medium">Procesar</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Processing Result */}
                  {fileData.status === 'completed' && fileData.result && (
                    <div className="p-6 bg-green-50">
                      <h4 className="font-semibold text-green-800 mb-3">✅ Procesado correctamente</h4>
                      <div className="text-sm text-green-700 space-y-1">
                        <div>Proveedor ID: {fileData.result.supplierId}</div>
                        <div>Factura ID: {fileData.result.invoiceId}</div>
                        <div>Productos procesados: {fileData.result.createdProducts?.length || 0}</div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Controles de selección múltiple */}
              {verifiedCount > 0 && (
                <div className="bg-white/70 backdrop-blur-sm border border-slate-200/50 rounded-2xl p-6 mt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={verifiedCount > 0 && selectedCount === verifiedCount}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 text-[#061830] border-gray-300 rounded focus:ring-[#061830] focus:ring-2"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          Seleccionar todas ({verifiedCount} facturas verificadas)
                        </span>
                      </label>
                      {selectedCount > 0 && (
                        <span className="px-3 py-1 bg-[#061830] text-white rounded-full text-sm font-medium">
                          {selectedCount} seleccionadas
                        </span>
                      )}
                    </div>
                    
                    {selectedCount > 0 && (
                      <button
                        onClick={processSelectedFiles}
                        className="group flex items-center space-x-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-8 py-3 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg shadow-green-200"
                      >
                        <Sparkles className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                        <span className="font-medium">
                          Procesar {selectedCount} factura{selectedCount > 1 ? 's' : ''} seleccionada{selectedCount > 1 ? 's' : ''}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-xl p-12 flex flex-col items-center justify-center text-justify">
              <div className="w-12 h-12 flex items-center justify-center rounded-full border border-slate-200 mb-4 bg-[#061830]">
                <span className="flex space-x-1">
                  <span className="block w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
                  <span className="block w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                  <span className="block w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                </span>
              </div>
              <h3 className="text-xl font-semibold text-slate-700 mb-2 text-center">No hay facturas en procesamiento</h3>
              <p className="text-slate-400 text-base max-w-sm leading-snug text-center mx-auto">
                Arrastra o selecciona archivos PDF, JPG o PNG para procesar con IA.
              </p>
            </div>
      )}
    </div>
  );
} 