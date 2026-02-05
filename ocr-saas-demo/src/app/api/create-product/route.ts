import { NextRequest, NextResponse } from 'next/server';
import { dolibarrClient } from '@/lib/dolibarr';
import { EditableExtractedData } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productData, supplierId } = body as { 
      productData: EditableExtractedData['products'][0],
      supplierId?: string 
    };

    if (!productData) {
      return NextResponse.json(
        { error: 'No se encontraron datos del producto' },
        { status: 400 }
      );
    }

    console.log('🛍️ Creando producto en Dolibarr...');

    // Check if product already exists by reference
    let existingProduct = null;
    if (productData.ref) {
      existingProduct = await dolibarrClient.getProductByRef(productData.ref);
    }
    
    // If not found by ref, try by description
    if (!existingProduct) {
      existingProduct = await dolibarrClient.getProductByDescription(productData.description);
    }

    if (existingProduct) {
      // If supplier is provided, add purchase price
      if (supplierId) {
        await dolibarrClient.addPurchasePrice(
          existingProduct.id!,
          supplierId,
          productData.unitPrice,
          productData.vatRate,
          productData.ref || existingProduct.ref
        );
      }

      return NextResponse.json({
        success: true,
        productId: existingProduct.id,
        message: 'Producto ya existe en Dolibarr',
        isNew: false
      });
    }

    // Validate required fields
    if (!productData.ref) {
      return NextResponse.json(
        { error: 'La referencia del producto es obligatoria' },
        { status: 400 }
      );
    }

    // Create new product
    const productPayload = {
      ref: productData.ref,
      label: productData.description.substring(0, 100), // Limit length
      description: productData.description,
      type: productData.type === 'service' ? "1" : "0", // "0" for physical product, "1" for service
      price: productData.unitPrice.toString(),
      tva_tx: productData.vatRate.toString(),
      status: "1",
      status_buy: "1",
      tobuy: "1",
      tosell: "1",
      note_public: `Producto creado vía OCR-ONNA. Ref original: ${productData.productCode || 'N/A'}`,
      seuil_stock_alerte: "5",
      desiredstock: "20",
      default_lang: "es_ES",
    };

    const newProductId = await dolibarrClient.createProduct(productPayload);

    // Add purchase price for supplier if provided
    if (supplierId) {
      await dolibarrClient.addPurchasePrice(
        newProductId,
        supplierId,
        productData.unitPrice,
        productData.vatRate,
        productData.ref
      );
    }

    // Update stock (increase by quantity)
    await dolibarrClient.updateProductStock(newProductId, productData.quantity);

    console.log('✅ Producto creado exitosamente:', newProductId);

    return NextResponse.json({
      success: true,
      productId: newProductId,
      message: 'Producto creado exitosamente en Dolibarr',
      isNew: true
    });

  } catch (error) {
    console.error('❌ Error creando producto:', error);
    return NextResponse.json(
      { 
        error: 'Error creando producto en Dolibarr', 
        details: error instanceof Error ? error.message : 'Error desconocido' 
      },
      { status: 500 }
    );
  }
} 