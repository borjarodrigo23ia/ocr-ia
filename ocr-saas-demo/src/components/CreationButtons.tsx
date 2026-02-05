'use client';

import { useState } from 'react';
import { Plus, Loader2, CheckCircle, AlertCircle, X, Edit } from 'lucide-react';
import { EditableExtractedData, VerificationResult } from '@/types';

interface CreationButtonsProps {
  editableData: EditableExtractedData;
  verification: VerificationResult;
  onUpdate: () => void;
}

interface CreationState {
  supplier: 'idle' | 'creating' | 'created' | 'error';
  products: Record<number, 'idle' | 'creating' | 'created' | 'error'>;
  supplierErrorMessage?: string;
  productErrorMessages: Record<number, string>;
}

export default function CreationButtons({
  editableData,
  verification,
  onUpdate
}: CreationButtonsProps) {
  const [creationState, setCreationState] = useState<CreationState>({
    supplier: 'idle',
    products: {},
    productErrorMessages: {}
  });

  const [supplierMessage, setSupplierMessage] = useState<string>('');
  const [productMessages, setProductMessages] = useState<Record<number, string>>({});
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showProductForms, setShowProductForms] = useState<Record<number, boolean>>({});

  // Generar referencia automática si no existe
  const generateRef = (name: string, type: 'supplier' | 'product') => {
    if (!name) return '';
    const prefix = type === 'supplier' ? 'PROV' : 'PROD';
    const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}_${cleanName.slice(0, 8)}_${timestamp}`;
  };

  const createSupplier = async () => {
    if (verification.supplier?.exists) {
      setSupplierMessage('El proveedor ya existe en Dolibarr');
      return;
    }

    // Generar referencia automáticamente si no existe
    if (!editableData.supplier.ref) {
      editableData.supplier.ref = generateRef(editableData.supplier.name, 'supplier');
    }

    setCreationState(prev => ({ ...prev, supplier: 'creating' }));
    setSupplierMessage('');

    try {
      const response = await fetch('/api/create-supplier', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ supplierData: editableData.supplier }),
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      setCreationState(prev => ({ ...prev, supplier: 'created' }));
      setSupplierMessage(result.message);
      onUpdate(); // Trigger re-verification

    } catch (error) {
      console.error('Error creating supplier:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      setCreationState(prev => ({ 
        ...prev, 
        supplier: 'error',
        supplierErrorMessage: errorMessage 
      }));
      setSupplierMessage(`Error: ${errorMessage}`);
    }
  };

  const createProduct = async (productIndex: number, supplierId?: string) => {
    const product = editableData.products[productIndex];
    const productVerification = verification.products?.[productIndex];

    if (productVerification?.exists) {
      setProductMessages(prev => ({ 
        ...prev, 
        [productIndex]: 'El producto ya existe en Dolibarr' 
      }));
      return;
    }

    // Generar referencia automáticamente si no existe
    if (!product.ref) {
      product.ref = generateRef(product.description, 'product');
    }

    setCreationState(prev => ({ 
      ...prev, 
      products: { ...prev.products, [productIndex]: 'creating' }
    }));
    setProductMessages(prev => ({ ...prev, [productIndex]: '' }));

    try {
      const response = await fetch('/api/create-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          productData: product,
          supplierId 
        }),
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      setCreationState(prev => ({ 
        ...prev, 
        products: { ...prev.products, [productIndex]: 'created' }
      }));
      setProductMessages(prev => ({ 
        ...prev, 
        [productIndex]: result.message 
      }));
      onUpdate(); // Trigger re-verification

    } catch (error) {
      console.error('Error creating product:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      setCreationState(prev => ({ 
        ...prev, 
        products: { ...prev.products, [productIndex]: 'error' },
        productErrorMessages: { ...prev.productErrorMessages, [productIndex]: errorMessage }
      }));
      setProductMessages(prev => ({ 
        ...prev, 
        [productIndex]: `Error: ${errorMessage}` 
      }));
    }
  };

  const getSupplierButtonContent = () => {
    switch (creationState.supplier) {
      case 'creating':
        return (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Creando...</span>
          </>
        );
      case 'created':
        return (
          <>
            <CheckCircle className="w-4 h-4" />
            <span>Creado</span>
          </>
        );
      case 'error':
        return (
          <>
            <AlertCircle className="w-4 h-4" />
            <span>Error</span>
          </>
        );
      default:
        return (
          <>
            <Plus className="w-4 h-4" />
            <span>Crear en Dolibarr</span>
          </>
        );
    }
  };

  const getProductButtonContent = (productIndex: number) => {
    const state = creationState.products[productIndex] || 'idle';
    
    switch (state) {
      case 'creating':
        return (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Creando...</span>
          </>
        );
      case 'created':
        return (
          <>
            <CheckCircle className="w-4 h-4" />
            <span>Creado</span>
          </>
        );
      case 'error':
        return (
          <>
            <AlertCircle className="w-4 h-4" />
            <span>Error</span>
          </>
        );
      default:
        return (
          <>
            <Plus className="w-4 h-4" />
            <span>Crear en Dolibarr</span>
          </>
        );
    }
  };

  const getButtonClass = (state: 'idle' | 'creating' | 'created' | 'error') => {
    const base = "flex items-center space-x-2 px-3 py-1 rounded-md text-sm transition-colors disabled:opacity-50";
    
    switch (state) {
      case 'creating':
        return `${base} bg-blue-500 text-white cursor-not-allowed`;
      case 'created':
        return `${base} bg-green-500 text-white cursor-not-allowed`;
      case 'error':
        return `${base} bg-red-500 text-white hover:bg-red-600`;
      default:
        return `${base} bg-orange-500 text-white hover:bg-orange-600`;
    }
  };

  return (
    <div className="space-y-4">
      {/* Supplier Creation */}
              {verification.supplier?.exists && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-orange-50 p-4 border-b border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-orange-800">🏢 Proveedor nuevo</h4>
              <p className="text-sm text-orange-600 mt-1">
                  Este proveedor no existe en Dolibarr. Revisa y completa los datos antes de crear.
              </p>
              {supplierMessage && (
                <p className="text-sm mt-2 text-gray-700">{supplierMessage}</p>
              )}
            </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowSupplierForm(!showSupplierForm)}
                  className="flex items-center space-x-2 px-3 py-1 rounded-md text-sm bg-gray-500 text-white hover:bg-gray-600 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  <span>{showSupplierForm ? 'Ocultar' : 'Revisar'}</span>
                </button>
            <button
              onClick={createSupplier}
              disabled={creationState.supplier === 'creating' || creationState.supplier === 'created'}
              className={getButtonClass(creationState.supplier)}
            >
              {getSupplierButtonContent()}
            </button>
          </div>
            </div>
          </div>
          
          {/* Supplier Form */}
          {showSupplierForm && (
            <div className="p-4 bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                  <input
                    type="text"
                    value={editableData.supplier.name || ''}
                    onChange={(e) => {
                      editableData.supplier.name = e.target.value;
                      if (!editableData.supplier.ref) {
                        editableData.supplier.ref = generateRef(e.target.value, 'supplier');
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Nombre del proveedor"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Referencia *</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={editableData.supplier.ref || generateRef(editableData.supplier.name, 'supplier')}
                      onChange={(e) => editableData.supplier.ref = e.target.value}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="REF_PROVEEDOR"
                    />
                    <button
                      onClick={() => editableData.supplier.ref = generateRef(editableData.supplier.name, 'supplier')}
                      className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors text-sm"
                      title="Generar referencia automática"
                    >
                      🔄
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={editableData.supplier.email || ''}
                    onChange={(e) => editableData.supplier.email = e.target.value}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="email@proveedor.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={editableData.supplier.phone || ''}
                    onChange={(e) => editableData.supplier.phone = e.target.value}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="+34 123 456 789"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                  <textarea
                    value={editableData.supplier.address || ''}
                    onChange={(e) => editableData.supplier.address = e.target.value}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Dirección completa del proveedor"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Products Creation */}
              {verification.products?.some(p => !p?.exists) && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-orange-50 p-4 border-b border-orange-200">
            <h4 className="font-medium text-orange-800">🛍️ Productos nuevos</h4>
            <p className="text-sm text-orange-600 mt-1">
              Los siguientes productos no existen en Dolibarr. Revisa y completa los datos antes de crear.
            </p>
          </div>
          
          <div className="p-4 space-y-4">
            {verification.products?.map((productVerification, index) => {
              if (productVerification?.exists) return null;
              
              const product = editableData.products[index];
              const state = creationState.products[index] || 'idle';
              const message = productMessages[index];
              const showForm = showProductForms[index] || false;
              
              return (
                <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 p-3">
                    <div className="flex items-center justify-between">
                  <div className="flex-1">
                        <p className="font-medium text-gray-800">Producto {index + 1}</p>
                        <p className="text-sm text-gray-600">{product.description || 'Sin descripción'}</p>
                        <p className="text-sm text-gray-500">Ref: {product.ref || 'Generando automáticamente...'}</p>
                    {message && (
                      <p className="text-sm mt-1 text-gray-700">{message}</p>
                    )}
                  </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setShowProductForms(prev => ({ ...prev, [index]: !showForm }))}
                          className="flex items-center space-x-2 px-3 py-1 rounded-md text-sm bg-gray-500 text-white hover:bg-gray-600 transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                          <span>{showForm ? 'Ocultar' : 'Revisar'}</span>
                        </button>
                  <button
                    onClick={() => createProduct(index)}
                    disabled={state === 'creating' || state === 'created'}
                    className={getButtonClass(state)}
                  >
                    {getProductButtonContent(index)}
                  </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Product Form */}
                  {showForm && (
                    <div className="p-4 bg-white">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción *</label>
                          <input
                            type="text"
                            value={product.description || ''}
                            onChange={(e) => {
                              product.description = e.target.value;
                              if (!product.ref) {
                                product.ref = generateRef(e.target.value, 'product');
                              }
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                            placeholder="Descripción del producto"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Referencia *</label>
                          <div className="flex space-x-2">
                            <input
                              type="text"
                              value={product.ref || generateRef(product.description, 'product')}
                              onChange={(e) => product.ref = e.target.value}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                              placeholder="REF_PRODUCTO"
                            />
                            <button
                              onClick={() => product.ref = generateRef(product.description, 'product')}
                              className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors text-sm"
                              title="Generar referencia automática"
                            >
                              🔄
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Precio unitario</label>
                          <input
                            type="text"
                            value={product.unitPrice ? product.unitPrice.toFixed(3).replace('.', ',') : ''}
                            onChange={(e) => {
                              const value = e.target.value.replace(',', '.');
                              product.unitPrice = parseFloat(value) || 0;
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                            placeholder="0,000"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All exists message */}
              {verification.supplier?.exists && verification.products?.every(p => p?.exists) && (
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <h4 className="font-medium text-green-800">✅ Todo listo</h4>
              <p className="text-sm text-green-600 mt-1">
                Todos los proveedores y productos ya existen en Dolibarr.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate invoice warning */}
      {verification.invoice?.isDuplicate && (
        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-red-800">🚨 Posible factura duplicada en esta entidad</h4>
              <p className="text-sm text-red-700 mt-1">
                Se detectó una factura que podría ser un duplicado en la entidad actual de Dolibarr:
              </p>
              {verification.invoice?.duplicateDetails && (
                <div className="bg-white p-3 rounded mt-3 border border-red-200">
                  <div className="space-y-1 text-sm">
                    <div><strong>Referencia existente:</strong> {verification.invoice.duplicateDetails.ref}</div>
                    <div><strong>Referencia del proveedor:</strong> {verification.invoice.duplicateDetails.ref_supplier}</div>
                    <div><strong>ID de factura:</strong> {verification.invoice.duplicateDetails.id}</div>
                  </div>
                </div>
              )}
              <div className="flex space-x-3 mt-4">
                <button
                  onClick={() => alert('Procesamiento cancelado. La factura no se enviará a Dolibarr.')}
                  className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                  <span>Rechazar procesamiento</span>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('¿Estás seguro de que quieres procesar esta factura aunque parezca un duplicado en esta entidad?')) {
                      // Allow processing by temporarily overriding canProcess
                      verification.canProcess = true;
                      verification.invoice.isDuplicate = false;
                      onUpdate();
                    }
                  }}
                  className="flex items-center space-x-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Confirmar y enviar a Dolibarr</span>
                </button>
              </div>
              <p className="text-xs text-red-600 mt-2">
                ⚠️ Procesar facturas duplicadas en la misma entidad puede causar problemas contables. Verifica cuidadosamente antes de continuar.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* General warnings */}
              {verification.warnings && verification.warnings.length > 0 && !verification.invoice?.isDuplicate && (
        <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-800">⚠️ Advertencias</h4>
              <ul className="text-sm text-amber-700 mt-2 space-y-1">
                {verification.warnings?.map((warning, index) => (
                  <li key={index}>• {warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 