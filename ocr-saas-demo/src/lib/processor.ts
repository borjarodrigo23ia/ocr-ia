import { dolibarrClient } from './dolibarr';
import { extractDataFromPDF, extractDataFromImage } from './gemini';
import { ExtractedInvoiceData, ProcessingResult, DolibarrSupplierInvoice, DolibarrEntity } from '@/types';

export interface VerificationResult {
  supplier: {
    exists: boolean;
    id?: string;
    needsCreation: boolean;
    data: ExtractedInvoiceData['supplier'];
  };
  products: Array<{
    exists: boolean;
    id?: string;
    needsCreation: boolean;
    data: ExtractedInvoiceData['products'][0];
  }>;
  invoice: {
    isDuplicate: boolean;
    existingInvoice?: any; // Dolibarr invoice object if duplicate
    duplicateDetails?: {
      ref: string;
      ref_supplier: string;
      id: string;
      socid: number;
    };
  };
  canProcess: boolean;
  missingItems: {
    suppliers: string[];
    products: string[];
  };
  warnings: string[];
}

export class InvoiceProcessor {
  async processFile(file: File): Promise<ProcessingResult> {
    try {
      // Extract data using Gemini AI
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      let extractedData: ExtractedInvoiceData;

      if (file.type === 'application/pdf') {
        extractedData = await extractDataFromPDF(fileBuffer);
      } else if (file.type.startsWith('image/')) {
        extractedData = await extractDataFromImage(fileBuffer, file.type);
      } else {
        throw new Error('Tipo de archivo no soportado');
      }

      // Process the extracted data
      return await this.processExtractedData(extractedData);
    } catch (error) {
      console.error('❌ ERROR - Error procesando archivo:', {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        error: error instanceof Error ? error.message : 'Error desconocido',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new Error(`Error procesando archivo: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  // Función para validar y sanear datos extraídos antes del procesamiento
  private validateAndSanitizeExtractedData(data: ExtractedInvoiceData): ExtractedInvoiceData {
    console.log('🔍 VALIDACIÓN - Validando y saneando datos extraídos...');

    // Validar y sanear proveedor
    if (!data.supplier || !data.supplier.name || data.supplier.name.trim() === '') {
      throw new Error('El nombre del proveedor es obligatorio y no puede estar vacío');
    }

    data.supplier.name = data.supplier.name.trim();
    data.supplier.email = data.supplier.email || '';
    data.supplier.phone = data.supplier.phone || '';
    data.supplier.address = data.supplier.address || '';
    data.supplier.city = data.supplier.city || '';
    data.supplier.zip = data.supplier.zip || '';
    data.supplier.vatNumber = data.supplier.vatNumber || '';
    data.supplier.country = (data.supplier as any).country || '';

    // Validar y sanear factura
    if (!data.invoice) {
      throw new Error('Los datos de la factura son obligatorios');
    }

    // Validar y sanear número de factura
    if (!data.invoice.number || data.invoice.number.trim() === '' || data.invoice.number === 'null') {
      const timestamp = Date.now();
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      data.invoice.number = `AUTO-${dateStr}-${randomSuffix}`;
      console.log('⚠️ VALIDACIÓN - Número de factura generado automáticamente:', data.invoice.number);
    }

    // Validar y sanear fecha
    if (!data.invoice.date || data.invoice.date.trim() === '' || data.invoice.date === 'null') {
      data.invoice.date = new Date().toISOString().split('T')[0];
      console.log('⚠️ VALIDACIÓN - Fecha de factura establecida a hoy:', data.invoice.date);
    } else {
      // Validar formato de fecha
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(data.invoice.date)) {
        try {
          const parsedDate = new Date(data.invoice.date);
          if (isNaN(parsedDate.getTime())) {
            throw new Error('Fecha inválida');
          }
          data.invoice.date = parsedDate.toISOString().split('T')[0];
          console.log('⚠️ VALIDACIÓN - Fecha reformateada:', data.invoice.date);
        } catch (error) {
          data.invoice.date = new Date().toISOString().split('T')[0];
          console.log('⚠️ VALIDACIÓN - Fecha inválida, establecida a hoy:', data.invoice.date);
        }
      }
    }

    // Sanear campos opcionales de factura
    data.invoice.dueDate = data.invoice.dueDate || undefined;
    data.invoice.totalHT = this.sanitizeNumber(data.invoice.totalHT, 0);
    data.invoice.totalTTC = this.sanitizeNumber(data.invoice.totalTTC, 0);
    data.invoice.totalVAT = this.sanitizeNumber(data.invoice.totalVAT, 0);

    // Validar y sanear productos
    if (!data.products || !Array.isArray(data.products) || data.products.length === 0) {
      throw new Error('Debe haber al menos un producto en la factura');
    }

    data.products = data.products.map((product, index) => {
      console.log(`🔍 VALIDACIÓN - Validando producto ${index + 1}:`, product.description);

      if (!product.description || product.description.trim() === '') {
        throw new Error(`El producto ${index + 1} debe tener una descripción válida`);
      }

      // Validar que tenemos una descripción real
      if (!product.description || product.description.trim() === '' || product.description === 'null') {
        throw new Error(`El producto ${index + 1} debe tener una descripción válida`);
      }

      // Verificar que no sea una descripción genérica
      const genericDescriptions = [
        'producto', 'servicio', 'artículo', 'item', 'producto según factura',
        'servicio según factura', 'producto/servicio según factura'
      ];

      const descLower = product.description.toLowerCase().trim();
      if (genericDescriptions.some(generic => descLower === generic || descLower.includes(generic))) {
        console.log(`⚠️ VALIDACIÓN - Descripción genérica detectada para producto ${index + 1}:`, product.description);
        throw new Error(`El producto ${index + 1} tiene una descripción genérica. Se requiere descripción específica del producto.`);
      }

      console.log(`✅ VALIDACIÓN - Descripción válida para producto ${index + 1}:`, product.description);

      const sanitizedProduct = {
        description: product.description.trim(),
        quantity: this.sanitizeNumber(product.quantity, 1),
        unitPrice: this.sanitizeNumber(product.unitPrice, 0),
        totalPrice: this.sanitizeNumber(product.totalPrice, 0),
        vatRate: this.sanitizeNumber(product.vatRate, 21),
        discountPercent: this.sanitizeNumber(product.discountPercent, 0),
        discountAmount: this.sanitizeNumber((product as any).discountAmount, 0),
        productCode: product.productCode?.trim() || undefined
      };

      // Recalcular totalPrice si es necesario
      if (sanitizedProduct.totalPrice === 0 && sanitizedProduct.quantity > 0 && sanitizedProduct.unitPrice > 0) {
        const baseTotal = sanitizedProduct.quantity * sanitizedProduct.unitPrice;
        let totalDiscountAmount = 0;

        // Aplicar descuento por porcentaje
        if (sanitizedProduct.discountPercent > 0) {
          totalDiscountAmount += (baseTotal * sanitizedProduct.discountPercent) / 100;
        }

        // Aplicar descuento por importe fijo
        if (sanitizedProduct.discountAmount > 0) {
          totalDiscountAmount += sanitizedProduct.discountAmount;
        }

        sanitizedProduct.totalPrice = Math.max(0, baseTotal - totalDiscountAmount);
        console.log(`⚠️ VALIDACIÓN - Total recalculado para producto ${index + 1}:`, {
          baseTotal,
          discountPercent: sanitizedProduct.discountPercent,
          discountAmount: sanitizedProduct.discountAmount,
          totalDiscountAmount,
          finalTotal: sanitizedProduct.totalPrice
        });
      }

      // ✅ VALIDACIÓN MEJORADA: Detectar casos problemáticos
      if (sanitizedProduct.unitPrice === 0 && sanitizedProduct.totalPrice === 0) {
        console.log(`⚠️ VALIDACIÓN - Producto ${index + 1} tiene precio 0:`, {
          description: sanitizedProduct.description,
          unitPrice: sanitizedProduct.unitPrice,
          totalPrice: sanitizedProduct.totalPrice,
          originalUnitPrice: product.unitPrice,
          originalTotalPrice: product.totalPrice
        });
      }

      // Validar que los precios sean razonables
      if (sanitizedProduct.unitPrice < 0) {
        throw new Error(`El precio unitario del producto "${sanitizedProduct.description}" no puede ser negativo`);
      }

      if (sanitizedProduct.quantity <= 0) {
        throw new Error(`La cantidad del producto "${sanitizedProduct.description}" debe ser mayor a 0`);
      }

      if (sanitizedProduct.vatRate < 0 || sanitizedProduct.vatRate > 100) {
        console.log(`⚠️ VALIDACIÓN - IVA inválido para producto ${index + 1}, establecido a 21%`);
        sanitizedProduct.vatRate = 21;
      }

      return sanitizedProduct;
    });

    console.log('✅ VALIDACIÓN - Datos validados y saneados correctamente');
    return data;
  }

  // Función auxiliar para sanear números
  private sanitizeNumber(value: any, defaultValue: number): number {
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }

    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace(',', '.'));
      return isNaN(parsed) ? defaultValue : parsed;
    }

    if (typeof value === 'number') {
      return isNaN(value) ? defaultValue : value;
    }

    return defaultValue;
  }

  // Función para formatear números para Dolibarr API (formato americano con puntos)
  private formatForDolibarr(value: number): string {
    if (value === null || value === undefined || isNaN(value)) {
      console.log('⚠️ FORMATO DOLIBARR - Valor inválido, usando 0.000:', value);
      return '0.000';
    }

    // ✅ CAMBIO: Dolibarr API usa formato americano (puntos), no europeo (comas)
    if (value < 0) {
      console.log('⚠️ FORMATO DOLIBARR - Valor negativo detectado:', value);
    }

    const formatted = value.toFixed(3); // Mantener puntos para la API
    console.log(`🔍 FORMATO DOLIBARR - ${value} → "${formatted}" (formato API)`);
    return formatted;
  }

  // Nueva función para verificar qué elementos necesitan ser creados
  async verifyDataBeforeProcessing(extractedData: ExtractedInvoiceData): Promise<VerificationResult> {
    console.log('🔍 VERIFICACIÓN - Iniciando verificación de datos antes del procesamiento');

    // Get current entity to scope all searches
    const currentEntity = dolibarrClient.getCurrentEntity();
    console.log('🏢 VERIFICACIÓN - Verificando en entidad:', currentEntity);

    const result: VerificationResult = {
      supplier: {
        exists: false,
        needsCreation: false,
        data: extractedData.supplier
      },
      products: [],
      invoice: {
        isDuplicate: false
      },
      canProcess: true,
      missingItems: {
        suppliers: [],
        products: []
      },
      warnings: []
    };

    try {
      // Verificar que el proveedor no sea una de las entidades del sistema multicompany
      console.log('🏢 VERIFICACIÓN - Validando que el proveedor no sea una entidad del sistema...');
      const entities = await dolibarrClient.getEntities();
      const supplierName = extractedData.supplier.name.toLowerCase().trim();

      const conflictingEntity = entities.find((entity: DolibarrEntity) =>
        entity.label?.toLowerCase().trim() === supplierName ||
        entity.label?.toLowerCase().includes(supplierName) ||
        supplierName.includes(entity.label?.toLowerCase().trim() || '')
      );

      if (conflictingEntity) {
        console.error('❌ VERIFICACIÓN - El proveedor coincide con una entidad del sistema:', {
          supplierName: extractedData.supplier.name,
          conflictingEntity: { id: conflictingEntity.id, label: conflictingEntity.label }
        });
        result.warnings.push(`ATENCIÓN: El proveedor "${extractedData.supplier.name}" parece ser una de las entidades del sistema ("${conflictingEntity.label}"). Esto podría indicar un error en el OCR o que el documento no es una factura de proveedor válida.`);
        result.canProcess = false;
        return result;
      }

      console.log('✅ VERIFICACIÓN - El proveedor no coincide con ninguna entidad del sistema');

      // Verificar proveedor
      console.log('🔍 VERIFICACIÓN - Verificando proveedor:', extractedData.supplier.name);

      const existingSupplier = await dolibarrClient.getThirdPartyByName(extractedData.supplier.name);

      if (existingSupplier) {
        console.log('✅ VERIFICACIÓN - Proveedor encontrado:', {
          id: existingSupplier.id,
          name: existingSupplier.name,
          entity: existingSupplier.entity || 'entidad desconocida'
        });
        result.supplier.exists = true;
        result.supplier.id = existingSupplier.id!;
      } else {
        console.log('⚠️ VERIFICACIÓN - Proveedor NO encontrado en entidad actual, necesita creación:', extractedData.supplier.name);
        result.supplier.needsCreation = true;
        result.missingItems.suppliers.push(extractedData.supplier.name);
        result.canProcess = false;
      }

      // Verificar productos
      console.log('🔍 VERIFICACIÓN - Verificando productos en entidad:', currentEntity);
      for (let i = 0; i < extractedData.products.length; i++) {
        const product = extractedData.products[i];
        console.log(`🔍 VERIFICACIÓN - Verificando producto ${i + 1}/${extractedData.products.length}:`, {
          description: product.description,
          productCode: product.productCode,
          entity: currentEntity
        });

        let existingProduct = null;

        // Buscar por código de producto primero
        if (product.productCode) {
          existingProduct = await dolibarrClient.getProductByRef(product.productCode);
          if (existingProduct) {
            console.log('✅ VERIFICACIÓN - Producto encontrado por código:', {
              id: existingProduct.id,
              ref: existingProduct.ref,
              label: existingProduct.label,
              entity: existingProduct.entity || 'entidad desconocida'
            });
          }
        }

        // Si no se encontró por código, buscar por descripción
        if (!existingProduct) {
          existingProduct = await dolibarrClient.getProductByDescription(product.description);
          if (existingProduct) {
            console.log('✅ VERIFICACIÓN - Producto encontrado por descripción:', {
              id: existingProduct.id,
              ref: existingProduct.ref,
              label: existingProduct.label,
              entity: existingProduct.entity || 'entidad desconocida'
            });
          }
        }

        if (existingProduct) {
          result.products.push({
            exists: true,
            id: existingProduct.id!,
            needsCreation: false,
            data: product
          });
        } else {
          console.log('⚠️ VERIFICACIÓN - Producto NO encontrado en entidad actual, necesita creación:', {
            description: product.description,
            productCode: product.productCode,
            entity: currentEntity
          });
          result.products.push({
            exists: false,
            needsCreation: true,
            data: product
          });
          result.missingItems.products.push(product.description);
          result.canProcess = false;
        }
      }

      // Verificar si la factura ya existe (nuevo)
      console.log('🔍 VERIFICACIÓN - Verificando facturas duplicadas...');
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      const supplierRef = `SUP-${extractedData.invoice.number}-${timestamp}-${randomSuffix}`;

      console.log('🏢 VERIFICACIÓN - Verificando duplicados en entidad:', currentEntity);

      const existingInvoice = await dolibarrClient.checkInvoiceExists(
        supplierRef,
        extractedData.invoice.number,
        existingSupplier ? parseInt(existingSupplier.id!) : undefined,
        currentEntity // Pass current entity to scope the search
      );

      if (existingInvoice) {
        console.log('⚠️ VERIFICACIÓN - Factura duplicada detectada en la entidad actual:', {
          entity: currentEntity,
          existingRef: existingInvoice.ref,
          existingRefSupplier: existingInvoice.ref_supplier,
          newInvoiceNumber: extractedData.invoice.number
        });

        result.invoice.isDuplicate = true;
        result.invoice.existingInvoice = existingInvoice;
        result.invoice.duplicateDetails = {
          ref: existingInvoice.ref || '',
          ref_supplier: existingInvoice.ref_supplier || '',
          id: existingInvoice.id || '',
          socid: existingInvoice.socid || 0
        };
        result.warnings.push(`Posible factura duplicada encontrada en esta entidad: ${existingInvoice.ref_supplier}`);
        result.canProcess = false; // Require user confirmation for duplicates
      } else {
        console.log('✅ VERIFICACIÓN - No se encontraron facturas duplicadas en la entidad actual:', currentEntity);
      }

      console.log('🔍 VERIFICACIÓN - Resultado de verificación:', {
        canProcess: result.canProcess,
        missingSuppliers: result.missingItems.suppliers.length,
        missingProducts: result.missingItems.products.length,
        isDuplicate: result.invoice.isDuplicate,
        warningsCount: result.warnings.length
      });

      return result;
    } catch (error) {
      console.error('❌ ERROR - Error durante la verificación:', {
        error: error instanceof Error ? error.message : 'Error desconocido',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new Error(`Error verificando datos: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  async processExtractedData(extractedData: ExtractedInvoiceData): Promise<ProcessingResult> {
    console.log('🔍 PROCESAMIENTO - Iniciando procesamiento de datos extraídos');
    console.log('🔍 PROCESAMIENTO - Datos recibidos:', {
      supplier: extractedData.supplier?.name,
      productsCount: extractedData.products?.length,
      invoiceNumber: extractedData.invoice?.number,
      invoiceDate: extractedData.invoice?.date
    });

    const errors: string[] = [];
    const createdProducts: string[] = [];
    const updatedProducts: string[] = [];

    try {
      // Validar y sanear datos antes del procesamiento
      console.log('🔍 PROCESAMIENTO - Paso 0: Validando y saneando datos...');
      extractedData = this.validateAndSanitizeExtractedData(extractedData);
      console.log('✅ PROCESAMIENTO - Datos validados y saneados correctamente');

      console.log('🔍 PROCESAMIENTO - Paso 1: Procesando proveedor...');
      // Process supplier
      const supplierId = await this.processSupplier(extractedData.supplier);
      console.log('✅ PROCESAMIENTO - Proveedor procesado exitosamente, ID:', supplierId);

      console.log('🔍 PROCESAMIENTO - Paso 2: Procesando productos...');
      // Process products
      for (let i = 0; i < extractedData.products.length; i++) {
        const productData = extractedData.products[i];
        console.log(`🔍 PROCESAMIENTO - Procesando producto ${i + 1}/${extractedData.products.length}:`, {
          description: productData.description,
          productCode: productData.productCode,
          unitPrice: productData.unitPrice,
          quantity: productData.quantity
        });

        try {
          const productId = await this.processProduct(productData, supplierId);
          console.log(`✅ PROCESAMIENTO - Producto ${i + 1} procesado exitosamente, ID:`, productId);
          if (productId) {
            createdProducts.push(productId);
          }
        } catch (error) {
          console.error(`❌ ERROR - Error procesando producto ${i + 1}:`, {
            product: productData.description,
            error: error instanceof Error ? error.message : 'Error desconocido',
            stack: error instanceof Error ? error.stack : undefined
          });
          errors.push(`Error procesando producto "${productData.description}": ${error instanceof Error ? error.message : 'Error desconocido'}`);
        }
      }

      console.log('🔍 PROCESAMIENTO - Paso 3: Creando factura de proveedor...');
      // Create supplier invoice
      const invoiceId = await this.createSupplierInvoice(
        extractedData,
        supplierId,
        createdProducts
      );
      console.log('✅ PROCESAMIENTO - Factura de proveedor creada exitosamente, ID:', invoiceId);

      const result = {
        supplierId,
        invoiceId,
        createdProducts,
        updatedProducts,
        errors,
      };

      console.log('✅ PROCESAMIENTO - Proceso completado exitosamente:', {
        supplierId,
        invoiceId,
        createdProductsCount: createdProducts.length,
        errorsCount: errors.length
      });
      return result;
    } catch (error) {
      console.error('❌ ERROR - Error en processExtractedData:', {
        error: error instanceof Error ? error.message : 'Error desconocido',
        stack: error instanceof Error ? error.stack : undefined,
        extractedData: {
          supplier: extractedData?.supplier?.name,
          productsCount: extractedData?.products?.length,
          invoiceNumber: extractedData?.invoice?.number
        }
      });

      // Distinguir entre errores de validación y errores de procesamiento
      if (error instanceof Error) {
        if (error.message.includes('obligatorio') ||
          error.message.includes('debe ser') ||
          error.message.includes('no puede ser') ||
          error.message.includes('no válido')) {
          // Error de validación - más específico
          throw new Error(`Error de validación: ${error.message}`);
        } else if (error.message.includes('Dolibarr API Error')) {
          // Error de API Dolibarr - más específico
          throw new Error(`Error en Dolibarr: ${error.message}`);
        }
      }

      errors.push(`Error general: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      throw new Error(`Error procesando datos extraídos: ${errors.join(', ')}`);
    }
  }

  private async processSupplier(supplierData: ExtractedInvoiceData['supplier']): Promise<string> {
    try {
      console.log('🔍 PROVEEDOR - Procesando proveedor:', {
        name: supplierData.name,
        email: supplierData.email,
        phone: supplierData.phone,
        address: supplierData.address,
        city: supplierData.city,
        vatNumber: supplierData.vatNumber
      });

      console.log('🔍 PROVEEDOR - Buscando proveedor existente por nombre...');
      // Try to find existing supplier by name
      const existingSupplier = await dolibarrClient.getThirdPartyByName(supplierData.name);

      if (existingSupplier) {
        console.log('✅ PROVEEDOR - Proveedor encontrado:', {
          id: existingSupplier.id,
          name: existingSupplier.name
        });
        return existingSupplier.id!;
      }

      console.log('⚠️ PROVEEDOR - No se encontró proveedor existente, creando nuevo...');

      // Create new supplier with correct types
      const supplierRef = (supplierData as any).ref || this.generateSupplierRef(supplierData.name);
      const supplierPayload = {
        name: supplierData.name,
        name_alias: supplierData.name,
        client: "0",
        prospect: "0",
        fournisseur: "1",
        email: supplierData.email || '',
        phone: supplierData.phone || '',
        address: supplierData.address || '',
        zip: supplierData.zip || '',
        town: supplierData.city || '',
        country_id: "1", // Spain
        tva_assuj: "1",
        tva_intra: supplierData.vatNumber || '',
        status: "1",
        note_public: `Proveedor creado automáticamente via OCR. Ref: ${supplierRef}`,
        default_lang: "es_ES",
        mode_reglement_supplier_id: 2, // Bank transfer
        cond_reglement_supplier_id: 1, // Due upon receipt
        fk_user_creat: 1,
      };

      console.log('🔍 PROVEEDOR - Datos del proveedor para creación:', JSON.stringify(supplierPayload, null, 2));

      const newSupplierId = await dolibarrClient.createThirdParty(supplierPayload);

      console.log('✅ PROVEEDOR - Nuevo proveedor creado exitosamente:', {
        id: newSupplierId,
        name: supplierData.name
      });

      return newSupplierId;
    } catch (error) {
      console.error('❌ ERROR - Error procesando proveedor:', {
        supplierName: supplierData.name,
        error: error instanceof Error ? error.message : 'Error desconocido',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new Error(`Error procesando proveedor "${supplierData.name}": ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  private async processProduct(
    productData: ExtractedInvoiceData['products'][0],
    supplierId: string
  ): Promise<string | null> {
    try {
      console.log('🔍 PRODUCTO - Procesando producto:', {
        description: productData.description,
        productCode: productData.productCode,
        unitPrice: productData.unitPrice,
        quantity: productData.quantity,
        vatRate: productData.vatRate,
        supplierId: supplierId
      });

      // Try to find existing product by product code or description
      let existingProduct = null;

      if (productData.productCode) {
        console.log('🔍 PRODUCTO - Buscando producto por código:', productData.productCode);
        existingProduct = await dolibarrClient.getProductByRef(productData.productCode);
        if (existingProduct) {
          console.log('✅ PRODUCTO - Producto encontrado por código:', {
            id: existingProduct.id,
            ref: existingProduct.ref,
            label: existingProduct.label
          });
        }
      }

      if (!existingProduct) {
        console.log('🔍 PRODUCTO - Buscando producto por descripción:', productData.description);
        existingProduct = await dolibarrClient.getProductByDescription(productData.description);
        if (existingProduct) {
          console.log('✅ PRODUCTO - Producto encontrado por descripción:', {
            id: existingProduct.id,
            ref: existingProduct.ref,
            label: existingProduct.label
          });
        }
      }

      let productId: string;

      if (existingProduct) {
        console.log('✅ PRODUCTO - Usando producto existente:', {
          id: existingProduct.id,
          ref: existingProduct.ref,
          label: existingProduct.label
        });
        productId = existingProduct.id!;
        // Update purchase price for this supplier
        console.log('🔍 PRODUCTO - Añadiendo precio de compra para producto existente...');
        await dolibarrClient.addPurchasePrice(
          productId,
          supplierId,
          productData.unitPrice,
          productData.vatRate,
          productData.productCode || existingProduct.ref
        );
      } else {
        console.log('⚠️ PRODUCTO - Creando nuevo producto...');
        // Create new product - use existing ref if available (from editable data)
        const ref = (productData as any).ref || productData.productCode || this.generateProductRef(productData.description);

        const productPayload = {
          ref,
          label: this.cleanDescription(productData.description),
          description: productData.description,
          type: "0", // Physical product by default
          price: this.formatForDolibarr(productData.unitPrice),
          tva_tx: this.formatForDolibarr(productData.vatRate),
          status: "1", // Active for sale
          status_buy: "1", // Active for purchase
          tobuy: "1", // Can be purchased
          tosell: "1", // Can be sold
          note_public: `Producto creado automáticamente desde factura de proveedor`,
          seuil_stock_alerte: "5", // Low stock alert threshold
          desiredstock: "20", // Desired stock level
          default_lang: "es_ES",
          // Ensure the product is not marked as "out of purchase"
          canvas: "", // No specific template
          accountancy_code_sell: "", // Default selling account
          accountancy_code_buy: "", // Default buying account
        };

        console.log('🔍 PRODUCTO - Datos del producto para creación:', JSON.stringify(productPayload, null, 2));

        productId = await dolibarrClient.createProduct(productPayload);
        console.log('✅ PRODUCTO - Nuevo producto creado exitosamente, ID:', productId);

        // Add purchase price for this supplier
        console.log('🔍 PRODUCTO - Añadiendo precio de compra para nuevo producto...');
        await dolibarrClient.addPurchasePrice(
          productId,
          supplierId,
          productData.unitPrice,
          productData.vatRate,
          ref
        );
      }

      // Update stock (increase by quantity)
      console.log('🔍 PRODUCTO - Actualizando stock del producto...');
      await dolibarrClient.updateProductStock(productId, productData.quantity);

      console.log('✅ PRODUCTO - Procesamiento de producto completado exitosamente, ID:', productId);
      return productId;
    } catch (error) {
      console.error('❌ ERROR - Error procesando producto:', {
        productDescription: productData.description,
        productCode: productData.productCode,
        error: error instanceof Error ? error.message : 'Error desconocido',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new Error(`Error procesando producto "${productData.description}": ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  private async createSupplierInvoice(
    extractedData: ExtractedInvoiceData,
    supplierId: string,
    productIds: string[]
  ): Promise<string> {
    try {
      console.log('🔍 FACTURA - Creando factura de proveedor con:', {
        supplierId,
        productIdsCount: productIds.length,
        invoiceNumber: extractedData.invoice.number,
        invoiceDate: extractedData.invoice.date,
        productsCount: extractedData.products.length
      });

      // Validar supplier ID
      if (!supplierId || supplierId === '') {
        console.error('❌ ERROR - ID del proveedor no válido:', supplierId);
        throw new Error('ID del proveedor no válido');
      }

      const supplierIdNumber = parseInt(supplierId);
      if (isNaN(supplierIdNumber)) {
        console.error('❌ ERROR - ID del proveedor no es un número válido:', supplierId);
        throw new Error(`ID del proveedor no es un número válido: "${supplierId}"`);
      }

      // Validar datos de factura obligatorios
      if (!extractedData.invoice.number || extractedData.invoice.number.trim() === '') {
        throw new Error('El número de factura es obligatorio');
      }

      if (!extractedData.invoice.date || extractedData.invoice.date.trim() === '') {
        throw new Error('La fecha de factura es obligatoria');
      }

      console.log('🔍 FACTURA - Validaciones básicas pasadas');

      // Generate unique reference
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      const uniqueSupplierRef = `SUP-${extractedData.invoice.number}-${timestamp}-${randomSuffix}`;

      // Ensure date is in correct format (YYYY-MM-DD)
      let formattedDate = extractedData.invoice.date;
      if (formattedDate && !formattedDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Try to parse and format the date
        const dateObj = new Date(formattedDate);
        if (!isNaN(dateObj.getTime())) {
          formattedDate = dateObj.toISOString().split('T')[0];
        } else {
          // Use current date if parsing fails
          formattedDate = new Date().toISOString().split('T')[0];
        }
      }

      const invoiceData: DolibarrSupplierInvoice = {
        // Let Dolibarr generate the ref automatically
        socid: supplierIdNumber,
        ref_supplier: uniqueSupplierRef,
        date: formattedDate,
        note_public: "Factura creada automáticamente via OCR",
        type: 0, // Standard invoice
      };

      console.log('🔍 FACTURA - Datos de la factura antes de enviar:', JSON.stringify(invoiceData, null, 2));

      const invoiceId = await dolibarrClient.createSupplierInvoice(invoiceData);
      console.log('✅ FACTURA - Factura creada exitosamente, ID:', invoiceId);

      // Add invoice lines
      console.log('🔍 FACTURA - Añadiendo líneas de factura...');
      for (let i = 0; i < extractedData.products.length; i++) {
        const product = extractedData.products[i];
        console.log(`🔍 FACTURA - Añadiendo línea ${i + 1}/${extractedData.products.length}:`, {
          description: product.description,
          quantity: product.quantity,
          unitPrice: product.unitPrice,
          vatRate: product.vatRate
        });

        // Validar datos del producto antes de crear la línea
        if (!product.description || product.description.trim() === '') {
          throw new Error(`La descripción del producto ${i + 1} es obligatoria`);
        }

        if (product.quantity <= 0) {
          throw new Error(`La cantidad del producto "${product.description}" debe ser mayor a 0`);
        }

        if (product.unitPrice < 0) {
          throw new Error(`El precio unitario del producto "${product.description}" no puede ser negativo`);
        }

        // ✅ VALIDACIÓN ADICIONAL: Verificar que el precio no sea 0 cuando debería tener valor
        if (product.unitPrice === 0) {
          console.log('⚠️ FACTURA - Precio unitario es 0, verificando si es correcto:', {
            product: product.description,
            unitPrice: product.unitPrice,
            totalPrice: product.totalPrice
          });
        }

        const discountPercent = product.discountPercent || 0;
        const discountAmount = (product as any).discountAmount || 0;

        // ✅ CÁLCULO MEJORADO: Recalcular totales para asegurar coherencia
        let totalHT = product.totalPrice;

        // Si totalPrice es 0 pero tenemos cantidad y precio unitario, recalcular
        if (totalHT === 0 && product.quantity > 0 && product.unitPrice > 0) {
          const baseTotal = product.quantity * product.unitPrice;
          let totalDiscountAmount = 0;

          // Aplicar descuento por porcentaje
          if (discountPercent > 0) {
            totalDiscountAmount += (baseTotal * discountPercent) / 100;
          }

          // Aplicar descuento por importe fijo
          if (discountAmount > 0) {
            totalDiscountAmount += discountAmount;
          }

          totalHT = Math.max(0, baseTotal - totalDiscountAmount);
          console.log(`⚠️ FACTURA - Total recalculado para línea ${i + 1}:`, {
            baseTotal,
            discountPercent,
            discountAmount,
            totalDiscountAmount,
            totalHT
          });
        }

        const totalVAT = (totalHT * product.vatRate) / 100;
        const totalTTC = totalHT + totalVAT;

        console.log(`🔍 FACTURA - Línea ${i + 1} - Valores originales:`, {
          quantity: product.quantity,
          unitPrice: product.unitPrice,
          vatRate: product.vatRate,
          discountPercent: discountPercent,
          totalHT: totalHT,
          totalVAT: totalVAT,
          totalTTC: totalTTC
        });

        // ✅ VALIDACIÓN FINAL: Asegurar que los totales no sean 0 incorrectamente
        if (totalHT === 0 && product.unitPrice > 0) {
          console.error('❌ ERROR - Total calculado es 0 pero el precio unitario es > 0:', {
            product: product.description,
            unitPrice: product.unitPrice,
            quantity: product.quantity,
            discountPercent: discountPercent
          });
          throw new Error(`Error en el cálculo del total para el producto "${product.description}": el total no puede ser 0 cuando hay precio unitario`);
        }

        // Para Dolibarr, solo podemos usar remise_percent. Si hay descuento fijo, convertirlo a porcentaje
        let finalDiscountPercent = discountPercent;
        if (discountAmount > 0 && product.quantity > 0 && product.unitPrice > 0) {
          const baseTotal = product.quantity * product.unitPrice;
          const equivalentPercent = (discountAmount / baseTotal) * 100;
          finalDiscountPercent = Math.min(100, discountPercent + equivalentPercent);
          console.log(`🔍 FACTURA - Convertido descuento fijo a porcentaje para línea ${i + 1}:`, {
            discountAmount,
            baseTotal,
            equivalentPercent,
            finalDiscountPercent
          });
        }

        const lineData = {
          desc: product.description.trim(),
          qty: product.quantity.toString(), // Quantity is always integer
          subprice: this.formatForDolibarr(product.unitPrice),
          tva_tx: this.formatForDolibarr(product.vatRate),
          remise_percent: this.formatForDolibarr(finalDiscountPercent),
          total_ht: this.formatForDolibarr(totalHT),
          total_tva: this.formatForDolibarr(totalVAT),
          total_ttc: this.formatForDolibarr(totalTTC),
          fk_product: productIds[i] || undefined,
        };

        console.log('🔍 FACTURA - Datos de la línea formateados para Dolibarr:', JSON.stringify(lineData, null, 2));

        const lineId = await dolibarrClient.addInvoiceLine(invoiceId, lineData);
        console.log(`✅ FACTURA - Línea ${i + 1} añadida exitosamente, ID:`, lineId);
      }

      console.log('✅ FACTURA - Todas las líneas de factura añadidas exitosamente');

      // Validate the invoice
      console.log('🔍 FACTURA - Validando factura...');
      await dolibarrClient.validateSupplierInvoice(invoiceId);
      console.log('✅ FACTURA - Factura validada exitosamente');

      return invoiceId;
    } catch (error) {
      console.error('❌ ERROR - Error creando factura de proveedor:', {
        supplierId,
        invoiceNumber: extractedData.invoice.number,
        error: error instanceof Error ? error.message : 'Error desconocido',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new Error(`Error creando factura de proveedor: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  private generateProductRef(description: string, index?: number): string {
    // Clean description and create a meaningful reference
    const cleanDesc = this.cleanDescription(description);
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');

    // Extract meaningful words from description (avoid common words)
    const commonWords = ['de', 'del', 'la', 'el', 'en', 'con', 'para', 'por', 'un', 'una', 'y', 'o'];
    const words = cleanDesc.split(' ')
      .filter(word => word.length > 2 && !commonWords.includes(word.toLowerCase()))
      .slice(0, 3);

    if (words.length > 0) {
      const prefix = words.map(word => word.substring(0, 4).toUpperCase()).join('-');
      const indexSuffix = index !== undefined ? `-${String(index + 1).padStart(2, '0')}` : '';
      return `${prefix}-${dateStr}${indexSuffix}`;
    } else {
      // Fallback for very short descriptions
      const shortDesc = cleanDesc.replace(/\s+/g, '').substring(0, 8).toUpperCase();
      const randomSuffix = Math.random().toString(36).substring(2, 4).toUpperCase();
      return `PROD-${shortDesc || 'ITEM'}-${dateStr}-${randomSuffix}`;
    }
  }

  private generateSupplierRef(name: string): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const cleanName = name
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .split(' ')
      .slice(0, 3)
      .map(word => word.substring(0, 3).toUpperCase())
      .join('');

    return `SUP-${cleanName || 'GEN'}-${timestamp}-${randomSuffix}`;
  }

  private cleanDescription(description: string): string {
    // Clean description for product label (remove extra formatting and improve readability)
    return description
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\sÀ-ſ.,()/-]/gi, '') // Remove special characters but keep accented chars and basic punctuation
      .trim()
      .substring(0, 100) // Limit length
      .replace(/^\w/, c => c.toUpperCase()); // Capitalize first letter
  }
}

export const invoiceProcessor = new InvoiceProcessor(); 