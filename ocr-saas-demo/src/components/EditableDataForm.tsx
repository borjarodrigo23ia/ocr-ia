'use client';

import { useState } from 'react';
import { EditableExtractedData, VerificationResult } from '@/types';
import { CheckCircle, AlertCircle, Edit3, Save, X, Plus } from 'lucide-react';

interface EditableDataFormProps {
  extractedData: EditableExtractedData;
  verification: VerificationResult;
  onSave: (editedData: EditableExtractedData) => void;
  onCancel: () => void;
}

export default function EditableDataForm({
  extractedData,
  verification,
  onSave,
  onCancel
}: EditableDataFormProps) {
  const [editedData, setEditedData] = useState<EditableExtractedData>(extractedData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 1);

  // Helper function to format numbers in European format (comma as decimal separator)
  const formatEuropeanPrice = (value: number): string => {
    return value.toFixed(2).replace('.', ',');
  };

  const calculateProductTotal = (quantity: number, unitPrice: number, discountPercent: number = 0, discountAmount: number = 0): number => {
    const subtotal = quantity * unitPrice;
    const percentageDiscount = subtotal * (discountPercent / 100);
    const totalDiscount = percentageDiscount + discountAmount;
    return Math.max(0, subtotal - totalDiscount);
  };

  const updateSupplier = (field: keyof EditableExtractedData['supplier'], value: string) => {
    setEditedData(prev => ({
      ...prev,
      supplier: {
        ...prev.supplier,
        [field]: value
      }
    }));
    
    // Clear error when user starts typing
    if (errors[`supplier.${field}`]) {
      setErrors(prev => ({ ...prev, [`supplier.${field}`]: '' }));
    }
  };

  const updateProduct = (index: number, field: keyof EditableExtractedData['products'][0], value: string | number) => {
    setEditedData(prev => ({
      ...prev,
      products: prev.products.map((product, i) => {
        if (i === index) {
          const updatedProduct = { ...product, [field]: value };
          
          // Recalculate total when quantity, unitPrice, or discount changes
          if (field === 'quantity' || field === 'unitPrice' || field === 'discountPercent' || field === 'discountAmount') {
            updatedProduct.totalPrice = calculateProductTotal(
              field === 'quantity' ? value as number : product.quantity,
              field === 'unitPrice' ? value as number : product.unitPrice,
              field === 'discountPercent' ? value as number : (product.discountPercent || 0),
              field === 'discountAmount' ? value as number : ((product as any).discountAmount || 0)
            );
          }
          
          return updatedProduct;
        }
        return product;
      })
    }));
    
    // Clear error when user starts typing
    if (errors[`product.${index}.${field}`]) {
      setErrors(prev => ({ ...prev, [`product.${index}.${field}`]: '' }));
    }
  };

  const addProduct = () => {
    const newProduct = {
      description: '',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      vatRate: 21,
      discountPercent: 0,
      discountAmount: 0,
      productCode: '',
      ref: '',
      type: 'product' as const
    };
    
    setEditedData(prev => ({
      ...prev,
      products: [...prev.products, newProduct]
    }));
  };

  const removeProduct = (index: number) => {
    setEditedData(prev => ({
      ...prev,
      products: prev.products.filter((_, i) => i !== index)
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validate supplier
    if (!editedData.supplier.name.trim()) {
      newErrors['supplier.name'] = 'El nombre del proveedor es obligatorio';
    }
    if (!editedData.supplier.ref?.trim()) {
      newErrors['supplier.ref'] = 'La referencia del proveedor es obligatoria';
    }

    // Validate invoice
    if (!editedData.invoice.number.trim()) {
      newErrors['invoice.number'] = 'El número de factura es obligatorio';
    }
    if (!editedData.invoice.date) {
      newErrors['invoice.date'] = 'La fecha de factura es obligatoria';
    }

    // Validate products
    editedData.products.forEach((product, index) => {
      if (!product.description.trim()) {
        newErrors[`product.${index}.description`] = 'La descripción es obligatoria';
      }
      if (!product.ref?.trim()) {
        newErrors[`product.${index}.ref`] = 'La referencia del producto es obligatoria';
      }
      if (product.quantity <= 0) {
        newErrors[`product.${index}.quantity`] = 'La cantidad debe ser mayor a 0';
      }
      if (product.unitPrice < 0) {
        newErrors[`product.${index}.unitPrice`] = 'El precio no puede ser negativo';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateForm()) {
      // Recalculate totals before saving
      const updatedData = {
        ...editedData,
        products: editedData.products.map(product => ({
          ...product,
          totalPrice: calculateProductTotal(
            product.quantity, 
            product.unitPrice, 
            product.discountPercent || 0,
            (product as any).discountAmount || 0
          )
        }))
      };
      
      // Recalculate invoice totals
      const totalHT = updatedData.products.reduce((sum, product) => sum + product.totalPrice, 0);
      const totalVAT = updatedData.products.reduce((sum, product) => 
        sum + (product.totalPrice * product.vatRate / 100), 0
      );
      
      updatedData.invoice.totalHT = totalHT;
      updatedData.invoice.totalVAT = totalVAT;
      updatedData.invoice.totalTTC = totalHT + totalVAT;
      
      onSave(updatedData);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">
          📝 Editar Datos Extraídos
        </h3>
      </div>

      {/* Supplier Section */}
      <div className="bg-white p-6 rounded-lg border">
        <div className="flex items-center space-x-3 mb-4">
          <div className="flex items-center space-x-2">
            <h4 className="font-medium text-gray-700">🏢 Información del Proveedor</h4>
            {verification.supplier?.exists ? (
              <div className="flex items-center space-x-1 text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">Existe en Dolibarr</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1 text-orange-600">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">Se creará nuevo</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre *
            </label>
            <input
              type="text"
              value={editedData.supplier.name}
              onChange={(e) => updateSupplier('name', e.target.value)}
              className={`w-full p-2 border rounded-md ${
                errors['supplier.name'] ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors['supplier.name'] && (
              <p className="text-red-500 text-sm mt-1">{errors['supplier.name']}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Referencia *
            </label>
            <input
              type="text"
              value={editedData.supplier.ref || ''}
              onChange={(e) => updateSupplier('ref', e.target.value)}
              placeholder="Ref. automática"
              className={`w-full p-2 border rounded-md ${
                errors['supplier.ref'] ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors['supplier.ref'] && (
              <p className="text-red-500 text-sm mt-1">{errors['supplier.ref']}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={editedData.supplier.email || ''}
              onChange={(e) => updateSupplier('email', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono
            </label>
            <input
              type="text"
              value={editedData.supplier.phone || ''}
              onChange={(e) => updateSupplier('phone', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dirección
            </label>
            <textarea
              value={editedData.supplier.address || ''}
              onChange={(e) => updateSupplier('address', e.target.value)}
              rows={2}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ciudad
            </label>
            <input
              type="text"
              value={editedData.supplier.city || ''}
              onChange={(e) => updateSupplier('city', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Código Postal
            </label>
            <input
              type="text"
              value={editedData.supplier.zip || ''}
              onChange={(e) => updateSupplier('zip', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              NIF/CIF
            </label>
            <input
              type="text"
              value={editedData.supplier.vatNumber || ''}
              onChange={(e) => updateSupplier('vatNumber', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              País
            </label>
            <input
              type="text"
              value={editedData.supplier.country || ''}
              onChange={(e) => updateSupplier('country', e.target.value)}
              placeholder="España, Francia, etc."
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>
      </div>

      {/* Products Section */}
      <div className="bg-white p-6 rounded-lg border">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium text-gray-700">🛍️ Productos</h4>
          <button
            onClick={addProduct}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Añadir Producto</span>
          </button>
        </div>

        <div className="space-y-4">
          {editedData.products.map((product, index) => {
            const productVerification = verification.products?.[index];
            
            return (
              <div key={index} className="border rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <h5 className="font-medium">Producto {index + 1}</h5>
                    {productVerification?.exists ? (
                      <div className="flex items-center space-x-1 text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm">Existe en Dolibarr</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1 text-orange-600">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm">Se creará nuevo</span>
                      </div>
                    )}
                  </div>
                  {editedData.products.length > 1 && (
                    <button
                      onClick={() => removeProduct(index)}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descripción *
                    </label>
                    <input
                      type="text"
                      value={product.description}
                      onChange={(e) => updateProduct(index, 'description', e.target.value)}
                      className={`w-full p-2 border rounded-md ${
                        errors[`product.${index}.description`] ? 'border-red-300' : 'border-gray-300'
                      }`}
                    />
                    {errors[`product.${index}.description`] && (
                      <p className="text-red-500 text-sm mt-1">{errors[`product.${index}.description`]}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Referencia *
                    </label>
                    <input
                      type="text"
                      value={product.ref || ''}
                      onChange={(e) => updateProduct(index, 'ref', e.target.value)}
                      placeholder="Ref. automática"
                      className={`w-full p-2 border rounded-md ${
                        errors[`product.${index}.ref`] ? 'border-red-300' : 'border-gray-300'
                      }`}
                    />
                    {errors[`product.${index}.ref`] && (
                      <p className="text-red-500 text-sm mt-1">{errors[`product.${index}.ref`]}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tipo
                    </label>
                    <select
                      value={product.type || 'product'}
                      onChange={(e) => updateProduct(index, 'type', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-md"
                    >
                      <option value="product">Producto físico</option>
                      <option value="service">Servicio</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cantidad *
                    </label>
                    <input
                      type="text"
                      value={product.quantity.toString().replace('.', ',')}
                      onChange={(e) => {
                        const value = e.target.value.replace(',', '.');
                        updateProduct(index, 'quantity', parseFloat(value) || 0);
                      }}
                      className={`w-full p-2 border rounded-md ${
                        errors[`product.${index}.quantity`] ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="0,00"
                    />
                    {errors[`product.${index}.quantity`] && (
                      <p className="text-red-500 text-sm mt-1">{errors[`product.${index}.quantity`]}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Precio Unitario (€) *
                    </label>
                    <input
                      type="text"
                      value={product.unitPrice.toString().replace('.', ',')}
                      onChange={(e) => {
                        const value = e.target.value.replace(',', '.');
                        updateProduct(index, 'unitPrice', parseFloat(value) || 0);
                      }}
                      className={`w-full p-2 border rounded-md ${
                        errors[`product.${index}.unitPrice`] ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="0,00"
                    />
                    {errors[`product.${index}.unitPrice`] && (
                      <p className="text-red-500 text-sm mt-1">{errors[`product.${index}.unitPrice`]}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      IVA (%)
                    </label>
                    <select
                      value={product.vatRate}
                      onChange={(e) => updateProduct(index, 'vatRate', parseFloat(e.target.value))}
                      className="w-full p-2 border border-gray-300 rounded-md"
                    >
                      <option value={0}>0% (Exento)</option>
                      <option value={4}>4% (Superreducido)</option>
                      <option value={10}>10% (Reducido)</option>
                      <option value={21}>21% (General)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descuento (%)
                      <span className="text-xs text-gray-500 ml-1">ej: 10,5</span>
                    </label>
                    <input
                      type="text"
                      value={(product.discountPercent || 0).toString().replace('.', ',')}
                      onChange={(e) => {
                        const value = e.target.value.replace(',', '.');
                        const numValue = parseFloat(value) || 0;
                        updateProduct(index, 'discountPercent', Math.min(100, Math.max(0, numValue)));
                      }}
                      className="w-full p-2 border border-gray-300 rounded-md"
                      placeholder="0,00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descuento (€)
                      <span className="text-xs text-gray-500 ml-1">ej: 31,77</span>
                    </label>
                    <input
                      type="text"
                      value={((product as any).discountAmount || 0).toString().replace('.', ',')}
                      onChange={(e) => {
                        const value = e.target.value.replace(',', '.');
                        const numValue = parseFloat(value) || 0;
                        updateProduct(index, 'discountAmount', Math.max(0, numValue));
                      }}
                      className="w-full p-2 border border-gray-300 rounded-md"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span className="font-medium">€{formatEuropeanPrice(product.quantity * product.unitPrice)}</span>
                  </div>
                  {((product.discountPercent || 0) > 0 || ((product as any).discountAmount || 0) > 0) && (
                    <div className="flex justify-between text-sm text-orange-600">
                      <span>Descuento total:</span>
                      <span className="font-medium">
                        -€{formatEuropeanPrice(
                          (product.quantity * product.unitPrice * (product.discountPercent || 0)) / 100 + 
                          ((product as any).discountAmount || 0)
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span>Total sin IVA:</span>
                    <span className="font-medium">€{formatEuropeanPrice(calculateProductTotal(product.quantity, product.unitPrice, product.discountPercent || 0, (product as any).discountAmount || 0))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>IVA ({product.vatRate}%):</span>
                    <span className="font-medium">€{formatEuropeanPrice((calculateProductTotal(product.quantity, product.unitPrice, product.discountPercent || 0, (product as any).discountAmount || 0) * product.vatRate / 100))}</span>
                  </div>
                  <div className="flex justify-between text-base font-semibold border-t pt-2 mt-2">
                    <span>Total con IVA:</span>
                    <span>€{formatEuropeanPrice((calculateProductTotal(product.quantity, product.unitPrice, product.discountPercent || 0, (product as any).discountAmount || 0) * (1 + product.vatRate / 100)))}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Invoice Totals */}
        <div className="mt-6 pt-4 border-t border-gray-300">
          <h5 className="font-medium mb-3">📊 Totales de la Factura</h5>
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Total sin IVA:</span>
                <span className="font-medium">
                  €{formatEuropeanPrice(editedData.products.reduce((sum, p) => sum + calculateProductTotal(p.quantity, p.unitPrice, p.discountPercent || 0, (p as any).discountAmount || 0), 0))}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total IVA:</span>
                <span className="font-medium">
                  €{formatEuropeanPrice(editedData.products.reduce((sum, p) => sum + (calculateProductTotal(p.quantity, p.unitPrice, p.discountPercent || 0, (p as any).discountAmount || 0) * p.vatRate / 100), 0))}
                </span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total con IVA:</span>
                <span>
                  €{formatEuropeanPrice(editedData.products.reduce((sum, p) => sum + (calculateProductTotal(p.quantity, p.unitPrice, p.discountPercent || 0, (p as any).discountAmount || 0) * (1 + p.vatRate / 100)), 0))}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Botones de acción al pie del formulario */}
        <div className="flex justify-center gap-4 mt-8">
          <button
            onClick={handleSave}
            className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Guardar</span>
          </button>
          <button
            onClick={onCancel}
            className="flex items-center space-x-2 bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
            <span>Cancelar</span>
          </button>
        </div>
      </div>
    </div>
  );
} 