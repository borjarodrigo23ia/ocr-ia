import {
  DolibarrThirdParty,
  DolibarrProduct,
  DolibarrSupplierInvoice,
  DolibarrInvoiceLine,
  DolibarrEntity,
  ApiResponse,
} from '@/types';

class DolibarrClient {
  private baseUrl: string;
  private apiKey: string;
  private currentEntity: string | null = null;

  constructor() {
    this.baseUrl = process.env.DOLIBARR_BASE_URL || '';
    this.apiKey = process.env.DOLIBARR_API_KEY || '';

    if (!this.baseUrl || !this.apiKey) {
      throw new Error('Dolibarr configuration is missing in environment variables');
    }
  }

  // Set current entity for multicompany
  setCurrentEntity(entityId: string | null): void {
    this.currentEntity = entityId;
    console.log('🏢 ENTIDAD - Entidad seleccionada:', entityId);
  }

  getCurrentEntity(): string | null {
    return this.currentEntity;
  }

  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    data?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    console.log('🔍 DEBUGGING - Dolibarr API Request:', {
      url,
      method,
      endpoint,
      hasData: !!data,
      dataKeys: data ? Object.keys(data) : undefined,
      currentEntity: this.currentEntity
    });

    if (data) {
      console.log('🔍 DEBUGGING - Request data:', JSON.stringify(data, null, 2));
    }
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'DOLAPIKEY': this.apiKey,
      'Accept': 'application/json',
    };

    // Add entity header for multicompany support
    if (this.currentEntity && this.currentEntity !== '1') {
      headers['DOLENTITY'] = this.currentEntity;
      console.log('🏢 ENTIDAD - Añadiendo header DOLENTITY:', this.currentEntity);
    }

    console.log('🔍 DEBUGGING - Request headers:', {
      'Content-Type': headers['Content-Type'],
      'DOLAPIKEY': headers['DOLAPIKEY'] ? '***' + headers['DOLAPIKEY'].slice(-4) : 'NOT_SET',
      'Accept': headers['Accept'],
      'DOLENTITY': headers['DOLENTITY'] || 'NO_ENTITY'
    });

    const config: RequestInit = {
      method,
      headers,
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      config.body = JSON.stringify(data);
    }

    try {
      console.log('🔍 DEBUGGING - Making fetch request...');
      const response = await fetch(url, config);
      
      console.log('🔍 DEBUGGING - Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔍 DEBUGGING - API Error Response:', {
          status: response.status,
          statusText: response.statusText,
          errorText
        });
        throw new Error(`Dolibarr API Error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('🔍 DEBUGGING - API Success Response:', {
        resultType: typeof result,
        resultKeys: typeof result === 'object' ? Object.keys(result) : undefined,
        result: JSON.stringify(result, null, 2)
      });
      
      return result;
    } catch (error) {
      console.error(`🔍 DEBUGGING - Error in Dolibarr API call to ${endpoint}:`, error);
      console.error('🔍 DEBUGGING - Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      });
      throw error;
    }
  }

  // Multicompany Methods
  async getEntities(): Promise<DolibarrEntity[]> {
    try {
      console.log('🏢 ENTIDAD - Obteniendo lista de entidades...');
      
      // Try to get entities from multicompany endpoint
      try {
        const entities = await this.makeRequest<DolibarrEntity[]>('/multicompany');
        
        // Filter only active and visible entities
        const activeEntities = entities.filter(entity => 
          entity.active === '1' && entity.visible === '1'
        );
        
        console.log('✅ ENTIDAD - Entidades obtenidas:', {
          total: entities.length,
          active: activeEntities.length,
          entities: activeEntities.map(e => ({ id: e.id, label: e.label }))
        });
        
        return activeEntities;
      } catch (multicompanyError) {
        console.log('⚠️ ENTIDAD - Endpoint /multicompany no disponible, asumiendo entidad única');
        console.log('🔍 ENTIDAD - Error del endpoint multicompany:', multicompanyError instanceof Error ? multicompanyError.message : 'Error desconocido');
        
        // If multicompany is not available, return a default entity
        const defaultEntity: DolibarrEntity = {
          id: '1',
          label: 'Entidad Principal',
          active: '1',
          visible: '1',
          entity: '1'
        };
        
        console.log('✅ ENTIDAD - Usando entidad por defecto:', {
          id: defaultEntity.id,
          label: defaultEntity.label
        });
        
        return [defaultEntity];
      }
    } catch (error) {
      console.error('❌ ERROR - Error obteniendo entidades:', error);
      throw new Error(`Error obteniendo entidades: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  async getEntityById(entityId: string): Promise<DolibarrEntity | null> {
    try {
      console.log('🏢 ENTIDAD - Obteniendo entidad por ID:', entityId);
      
      try {
        const entity = await this.makeRequest<DolibarrEntity>(`/multicompany/${entityId}`);
        console.log('✅ ENTIDAD - Entidad obtenida:', {
          id: entity.id,
          label: entity.label
        });
        return entity;
      } catch (multicompanyError) {
        console.log('⚠️ ENTIDAD - Endpoint /multicompany no disponible para obtener entidad por ID');
        console.log('🔍 ENTIDAD - Error del endpoint multicompany:', multicompanyError instanceof Error ? multicompanyError.message : 'Error desconocido');
        
        // If multicompany is not available, return default entity for ID '1'
        if (entityId === '1') {
          const defaultEntity: DolibarrEntity = {
            id: '1',
            label: 'Entidad Principal',
            active: '1',
            visible: '1',
            entity: '1'
          };
          
          console.log('✅ ENTIDAD - Usando entidad por defecto para ID 1:', {
            id: defaultEntity.id,
            label: defaultEntity.label
          });
          
          return defaultEntity;
        }
        
        return null;
      }
    } catch (error) {
      console.error('❌ ERROR - Error obteniendo entidad:', error);
      return null;
    }
  }

  // Thirdparties (Suppliers) Methods
  async getThirdParties(params?: {
    mode?: number;
    sqlfilters?: string;
    limit?: number;
  }): Promise<DolibarrThirdParty[]> {
    let endpoint = '/thirdparties';
    
    if (params) {
      const searchParams = new URLSearchParams();
      if (params.mode) searchParams.append('mode', params.mode.toString());
      if (params.sqlfilters) searchParams.append('sqlfilters', params.sqlfilters);
      if (params.limit) searchParams.append('limit', params.limit.toString());
      
      if (searchParams.toString()) {
        endpoint += `?${searchParams.toString()}`;
      }
    }

    return this.makeRequest<DolibarrThirdParty[]>(endpoint);
  }

  async getThirdPartyByName(name: string): Promise<DolibarrThirdParty | null> {
    try {
      console.log('🔍 BÚSQUEDA PROVEEDOR - Buscando proveedor:', name);
      
      // Get ALL suppliers from current entity (more reliable than SQL filters)
      console.log('🔍 BÚSQUEDA PROVEEDOR - Obteniendo todos los proveedores...');
      const allSuppliers = await this.getThirdParties({
        mode: 4, // Only suppliers
        limit: 1000 // Get a large number to ensure we don't miss any
      });
      
      console.log('🔍 BÚSQUEDA PROVEEDOR - Total proveedores obtenidos:', allSuppliers.length);
      
      if (allSuppliers.length === 0) {
        console.log('❌ BÚSQUEDA PROVEEDOR - No hay proveedores en la entidad actual');
        return null;
      }
      
      // Normalize search name
      const searchName = name.trim().toLowerCase();
      console.log('🔍 BÚSQUEDA PROVEEDOR - Nombre normalizado para búsqueda:', searchName);
      
      // Log all supplier names for debugging
      console.log('🔍 BÚSQUEDA PROVEEDOR - Proveedores disponibles:');
      allSuppliers.forEach((supplier, index) => {
        console.log(`  ${index + 1}. "${supplier.name}" (ID: ${supplier.id})`);
      });
      
      // Search strategies in order of preference
      const searchStrategies = [
        {
          name: 'Coincidencia exacta',
          matcher: (supplierName: string) => supplierName.toLowerCase().trim() === searchName
        },
        {
          name: 'Coincidencia exacta sin espacios',
          matcher: (supplierName: string) => 
            supplierName.toLowerCase().trim().replace(/\s+/g, '') === searchName.replace(/\s+/g, '')
        },
        {
          name: 'Contiene el nombre completo',
          matcher: (supplierName: string) => supplierName.toLowerCase().includes(searchName)
        },
        {
          name: 'El nombre contiene al proveedor',
          matcher: (supplierName: string) => searchName.includes(supplierName.toLowerCase().trim())
        },
        {
          name: 'Similitud alta (>90%)',
          matcher: (supplierName: string) => 
            this.calculateStringSimilarity(searchName, supplierName.toLowerCase().trim()) > 0.9
        },
        {
          name: 'Similitud media (>80%)',
          matcher: (supplierName: string) => 
            this.calculateStringSimilarity(searchName, supplierName.toLowerCase().trim()) > 0.8
        },
        {
          name: 'Sin sufijos comunes (S.L., S.A., etc.)',
          matcher: (supplierName: string) => {
            const cleanedSearch = searchName.replace(/\s+(s\.?l\.?|s\.?a\.?|ltd\.?|inc\.?|corp\.?|gmbh|b\.?v\.?)$/i, '');
            const cleanedSupplier = supplierName.toLowerCase().trim().replace(/\s+(s\.?l\.?|s\.?a\.?|ltd\.?|inc\.?|corp\.?|gmbh|b\.?v\.?)$/i, '');
            return cleanedSupplier === cleanedSearch || cleanedSupplier.includes(cleanedSearch) || cleanedSearch.includes(cleanedSupplier);
          }
        }
      ];
      
      // Try each search strategy
      for (const strategy of searchStrategies) {
        console.log(`🔍 BÚSQUEDA PROVEEDOR - Probando estrategia: ${strategy.name}`);
        
        for (const supplier of allSuppliers) {
          if (!supplier.name) continue;
          
          if (strategy.matcher(supplier.name)) {
            console.log(`✅ BÚSQUEDA PROVEEDOR - ENCONTRADO con "${strategy.name}":`, {
              searched: name,
              found: supplier.name,
              id: supplier.id,
              strategy: strategy.name
            });
            return supplier;
          }
        }
        
        console.log(`⚠️ BÚSQUEDA PROVEEDOR - Sin resultados con estrategia: ${strategy.name}`);
      }
      
      console.log('❌ BÚSQUEDA PROVEEDOR - No se encontró proveedor con ninguna estrategia');
      console.log('🔍 BÚSQUEDA PROVEEDOR - Resumen de búsqueda:', {
        searchedName: name,
        normalizedName: searchName,
        totalSuppliersChecked: allSuppliers.length,
        supplierNames: allSuppliers.map(s => s.name).slice(0, 10) // First 10 for debugging
      });
      
      return null;
    } catch (error) {
      console.error('❌ ERROR - Error searching supplier by name:', error);
      return null;
    }
  }

  // Third Party Methods
  async createThirdParty(thirdParty: DolibarrThirdParty): Promise<string> {
    console.log('🔍 DEBUGGING - Creating third party with data:', JSON.stringify(thirdParty, null, 2));
    
    // Generate a unique code for the supplier if not provided
    const supplierCode = thirdParty.code || this.generateSupplierCode(thirdParty.name);
    
    const requestData = {
      code: supplierCode, // ✅ REQUIRED FIELD - Supplier code
      code_fournisseur: supplierCode, // ✅ ALTERNATIVE FIELD - Supplier code for suppliers
      name: thirdParty.name,
      name_alias: thirdParty.name_alias || thirdParty.name,
      client: thirdParty.client || "0",
      prospect: thirdParty.prospect || "0", 
      fournisseur: thirdParty.fournisseur || "1",
      email: thirdParty.email || "",
      phone: thirdParty.phone || "",
      address: thirdParty.address || "",
      zip: thirdParty.zip || "",
      town: thirdParty.town || "",
      country_id: thirdParty.country_id || "1",
      tva_assuj: thirdParty.tva_assuj || "1",
      tva_intra: thirdParty.tva_intra || "",
      status: thirdParty.status || "1",
      note_public: thirdParty.note_public || "Proveedor creado automáticamente via OCR",
      default_lang: thirdParty.default_lang || "es_ES",
      mode_reglement_supplier_id: thirdParty.mode_reglement_supplier_id || 2,
      cond_reglement_supplier_id: thirdParty.cond_reglement_supplier_id || 1,
      fk_user_creat: thirdParty.fk_user_creat || 1,
    };

    console.log('🔍 DEBUGGING - Third party request data:', JSON.stringify(requestData, null, 2));

    const response = await this.makeRequest<string>('/thirdparties', 'POST', requestData);
    return response;
  }

  // Products Methods
  async getProducts(params?: {
    sqlfilters?: string;
    limit?: number;
  }): Promise<DolibarrProduct[]> {
    let endpoint = '/products';
    
    if (params) {
      const searchParams = new URLSearchParams();
      if (params.sqlfilters) searchParams.append('sqlfilters', params.sqlfilters);
      if (params.limit) searchParams.append('limit', params.limit.toString());
      
      if (searchParams.toString()) {
        endpoint += `?${searchParams.toString()}`;
      }
    }

    return this.makeRequest<DolibarrProduct[]>(endpoint);
  }

  async getProductByRef(ref: string): Promise<DolibarrProduct | null> {
    try {
      console.log('🔍 BÚSQUEDA PRODUCTO REF - Buscando producto por referencia:', ref);
      
      // Try direct API call first (most efficient)
    try {
      const product = await this.makeRequest<DolibarrProduct>(`/products/ref/${ref}`);
        if (product) {
          console.log('✅ BÚSQUEDA PRODUCTO REF - Encontrado por API directa:', product.ref);
          return product;
        }
      } catch (error) {
        console.log('⚠️ BÚSQUEDA PRODUCTO REF - No encontrado por API directa, probando búsquedas alternativas');
      }
      
      // Get ALL products and search client-side (more reliable)
      console.log('🔍 BÚSQUEDA PRODUCTO REF - Obteniendo todos los productos...');
      const allProducts = await this.getProducts({
        limit: 1000
      });
      
      console.log('🔍 BÚSQUEDA PRODUCTO REF - Total productos obtenidos:', allProducts.length);
      
      if (allProducts.length === 0) {
        console.log('❌ BÚSQUEDA PRODUCTO REF - No hay productos en la entidad actual');
        return null;
      }
      
      // Normalize search ref
      const searchRef = ref.trim().toLowerCase();
      console.log('🔍 BÚSQUEDA PRODUCTO REF - Referencia normalizada:', searchRef);
      
      // Log product refs for debugging
      console.log('🔍 BÚSQUEDA PRODUCTO REF - Referencias disponibles:');
      allProducts.slice(0, 15).forEach((product, index) => {
        console.log(`  ${index + 1}. "${product.ref}" (Label: "${product.label}")`);
      });
      
      // Search strategies for references
      const searchStrategies = [
        {
          name: 'Referencia exacta',
          matcher: (product: DolibarrProduct) => 
            product.ref?.toLowerCase().trim() === searchRef
          },
          {
            name: 'Referencia exacta sin espacios',
            matcher: (product: DolibarrProduct) => 
              product.ref?.toLowerCase().trim().replace(/[\s-_]/g, '') === searchRef.replace(/[\s-_]/g, '')
          },
          {
            name: 'Referencia contiene búsqueda',
            matcher: (product: DolibarrProduct) => 
              product.ref?.toLowerCase().includes(searchRef) || false
          },
          {
            name: 'Búsqueda contiene referencia',
            matcher: (product: DolibarrProduct) => 
              searchRef.includes(product.ref?.toLowerCase().trim() || '')
          },
          {
            name: 'Similitud muy alta (>90%)',
            matcher: (product: DolibarrProduct) => 
              product.ref ? this.calculateStringSimilarity(searchRef, product.ref.toLowerCase().trim()) > 0.9 : false
          }
        ];
        
        // Try each search strategy
        for (const strategy of searchStrategies) {
          console.log(`🔍 BÚSQUEDA PRODUCTO REF - Probando estrategia: ${strategy.name}`);
          
          for (const product of allProducts) {
            if (!product.ref) continue;
            
            if (strategy.matcher(product)) {
              console.log(`✅ BÚSQUEDA PRODUCTO REF - ENCONTRADO con "${strategy.name}":`, {
                searched: ref,
                found: product.ref,
                label: product.label,
                id: product.id,
                strategy: strategy.name
              });
      return product;
            }
          }
          
          console.log(`⚠️ BÚSQUEDA PRODUCTO REF - Sin resultados con estrategia: ${strategy.name}`);
        }
        
        console.log('❌ BÚSQUEDA PRODUCTO REF - No se encontró producto con ninguna estrategia');
        return null;
    } catch (error) {
        console.error('❌ ERROR - Error searching product by ref:', error);
      return null;
    }
  }

  async getProductByDescription(description: string): Promise<DolibarrProduct | null> {
    try {
      console.log('🔍 BÚSQUEDA PRODUCTO - Buscando producto por descripción:', description);
      
      // Get ALL products from current entity (more reliable than SQL filters)
      console.log('🔍 BÚSQUEDA PRODUCTO - Obteniendo todos los productos...');
      const allProducts = await this.getProducts({
        limit: 1000 // Get a large number to ensure we don't miss any
      });
      
      console.log('🔍 BÚSQUEDA PRODUCTO - Total productos obtenidos:', allProducts.length);
      
      if (allProducts.length === 0) {
        console.log('❌ BÚSQUEDA PRODUCTO - No hay productos en la entidad actual');
        return null;
      }
      
      // Normalize search description
      const searchDesc = description.trim().toLowerCase();
      console.log('🔍 BÚSQUEDA PRODUCTO - Descripción normalizada:', searchDesc);
      
      // Log first 10 products for debugging
      console.log('🔍 BÚSQUEDA PRODUCTO - Primeros productos disponibles:');
      allProducts.slice(0, 10).forEach((product, index) => {
        console.log(`  ${index + 1}. Label: "${product.label}" | Desc: "${product.description}" | Ref: "${product.ref}" (ID: ${product.id})`);
      });
      
      // Search strategies in order of preference
      const searchStrategies = [
        {
          name: 'Label exacto',
          matcher: (product: DolibarrProduct) => 
            product.label?.toLowerCase().trim() === searchDesc
          },
          {
            name: 'Descripción exacta',
            matcher: (product: DolibarrProduct) => 
              product.description?.toLowerCase().trim() === searchDesc
          },
          {
            name: 'Label exacto sin espacios',
            matcher: (product: DolibarrProduct) => 
              product.label?.toLowerCase().trim().replace(/\s+/g, '') === searchDesc.replace(/\s+/g, '')
          },
          {
            name: 'Descripción exacta sin espacios',
            matcher: (product: DolibarrProduct) => 
              product.description?.toLowerCase().trim().replace(/\s+/g, '') === searchDesc.replace(/\s+/g, '')
          },
          {
            name: 'Label contiene descripción',
            matcher: (product: DolibarrProduct) => 
              product.label?.toLowerCase().includes(searchDesc) || false
          },
          {
            name: 'Descripción contiene búsqueda',
            matcher: (product: DolibarrProduct) => 
              product.description?.toLowerCase().includes(searchDesc) || false
          },
          {
            name: 'Búsqueda contiene label',
            matcher: (product: DolibarrProduct) => 
              searchDesc.includes(product.label?.toLowerCase().trim() || '')
          },
          {
            name: 'Similitud alta en label (>85%)',
            matcher: (product: DolibarrProduct) => 
              product.label ? this.calculateStringSimilarity(searchDesc, product.label.toLowerCase().trim()) > 0.85 : false
          },
          {
            name: 'Similitud alta en descripción (>85%)',
            matcher: (product: DolibarrProduct) => 
              product.description ? this.calculateStringSimilarity(searchDesc, product.description.toLowerCase().trim()) > 0.85 : false
          },
          {
            name: 'Palabras clave principales',
            matcher: (product: DolibarrProduct) => {
              const keywords = this.extractKeywords(searchDesc);
              if (keywords.length === 0) return false;
              
              const productText = `${product.label || ''} ${product.description || ''}`.toLowerCase();
              return keywords.every(keyword => productText.includes(keyword));
            }
          }
        ];
        
        // Try each search strategy
        for (const strategy of searchStrategies) {
          console.log(`🔍 BÚSQUEDA PRODUCTO - Probando estrategia: ${strategy.name}`);
          
          for (const product of allProducts) {
            if (strategy.matcher(product)) {
              console.log(`✅ BÚSQUEDA PRODUCTO - ENCONTRADO con "${strategy.name}":`, {
                searched: description,
                foundLabel: product.label,
                foundDesc: product.description,
                ref: product.ref,
                id: product.id,
                strategy: strategy.name
              });
              return product;
            }
          }
          
          console.log(`⚠️ BÚSQUEDA PRODUCTO - Sin resultados con estrategia: ${strategy.name}`);
        }
        
        console.log('❌ BÚSQUEDA PRODUCTO - No se encontró producto con ninguna estrategia');
        return null;
    } catch (error) {
        console.error('❌ ERROR - Error searching product by description:', error);
      return null;
    }
  }

  async createProduct(product: Omit<DolibarrProduct, 'id'>): Promise<string> {
    console.log('🔍 DEBUGGING - Creating product with data:', JSON.stringify(product, null, 2));
    
    const requestData = {
      ref: product.ref,
      label: product.label,
      description: product.description || product.label,
      type: product.type || "0",
      price: product.price || "0",
      tva_tx: product.tva_tx || "0",
      status: product.status || "1",
      status_buy: product.status_buy || "1",
      tobuy: product.tobuy || "1",
      tosell: product.tosell || "1",
      note_public: product.note_public || "Producto creado automáticamente via OCR",
      seuil_stock_alerte: product.seuil_stock_alerte || "5",
      desiredstock: product.desiredstock || "20",
      default_lang: product.default_lang || "es_ES",
    };

    console.log('🔍 DEBUGGING - Product request data:', JSON.stringify(requestData, null, 2));
    
    const response = await this.makeRequest<string>('/products', 'POST', requestData);
    
    return response;
  }

  // Supplier Invoices Methods
  async createSupplierInvoice(invoice: DolibarrSupplierInvoice): Promise<string> {
    console.log('🔍 DEBUGGING - DolibarrClient.createSupplierInvoice called with:', {
      invoice,
      socidType: typeof invoice.socid,
      socidValue: invoice.socid
    });

    const requestData = {
      socid: invoice.socid,
      ref: invoice.ref || "auto",
      ref_supplier: invoice.ref_supplier,
      date: invoice.date,
      date_echeance: invoice.date_echeance || "",
      note_public: invoice.note_public || "Factura creada automáticamente via OCR",
      note_private: invoice.note_private || "",
      cond_reglement_id: invoice.cond_reglement_id || 1,
      mode_reglement_id: invoice.mode_reglement_id || 2,
      type: invoice.type || 0,
      order_supplier: invoice.order_supplier || 0,
      multicurrency_code: invoice.multicurrency_code || "EUR",
      multicurrency_tx: invoice.multicurrency_tx || "1.00000000",
      fk_account: invoice.fk_account || 0,
    };

    console.log('🔍 DEBUGGING - Full request to Dolibarr API:', JSON.stringify(requestData, null, 2));
    
    const response = await this.makeRequest<string>('/supplierinvoices', 'POST', requestData);
    
    return response;
  }

  async addInvoiceLine(invoiceId: string, line: DolibarrInvoiceLine): Promise<string> {
    console.log('🔍 DEBUGGING - Adding invoice line:', {
      invoiceId,
      line: JSON.stringify(line, null, 2)
    });
    
    const requestData = {
      desc: line.desc,
      qty: line.qty,
      subprice: line.subprice,
      pu_ht: line.subprice, // ✅ Precio unitario sin IVA (mismo que subprice)
      pu_ttc: this.calculatePriceWithVAT(parseFloat(line.subprice), parseFloat(line.tva_tx)).toFixed(3), // ✅ AÑADIDO: Precio unitario con IVA
      tva_tx: line.tva_tx,
      remise_percent: line.remise_percent || "0.000",
      total_ht: line.total_ht,
      total_tva: line.total_tva,
      total_ttc: line.total_ttc,
      fk_product: line.fk_product || undefined,
      product_type: "0", // ✅ Tipo de producto (0 = físico)
      info_bits: "0", // ✅ Bits de información
      rang: "1", // ✅ Orden de la línea
    };

    console.log('🔍 DEBUGGING - Invoice line request data:', JSON.stringify(requestData, null, 2));
    
    const response = await this.makeRequest<string>(
      `/supplierinvoices/${invoiceId}/lines`,
      'POST',
      requestData
    );
    
    return response;
  }

  async validateSupplierInvoice(invoiceId: string): Promise<void> {
    await this.makeRequest(`/supplierinvoices/${invoiceId}/validate`, 'POST', {
      notrigger: 0,
    });
  }

  // Stock Methods (if needed)
  async updateProductStock(productId: string, quantity: number, warehouseId?: string): Promise<void> {
    // This would require implementing stock movement endpoints
    // For now, we'll just log the action
    console.log(`Stock update needed for product ${productId}: +${quantity}`);
  }

  // Purchase Prices Methods
  async addPurchasePrice(productId: string, supplierId: string, price: number, vatRate: number, productRef?: string): Promise<void> {
    try {
      console.log('🔍 DEBUGGING - Adding purchase price:', {
        productId,
        supplierId,
        price,
        vatRate,
        productRef
      });
      
      // Generate supplier reference if not provided
      const supplierRef = productRef || `SUP-${productId}-${supplierId}`;
      
      const requestData = {
        qty: 1,
        buyprice: this.formatNumberForDolibarr(price),
        price_base_type: "HT",
        fourn_id: parseInt(supplierId),
        availability: 1,
        ref_fourn: supplierRef,
        tva_tx: this.formatNumberForDolibarr(vatRate),
      };

      console.log('🔍 DEBUGGING - Purchase price request data:', JSON.stringify(requestData, null, 2));
      
      await this.makeRequest(`/products/${productId}/purchase_prices`, 'POST', requestData);
    } catch (error) {
      console.error('🔍 DEBUGGING - Error adding purchase price:', error);
      // Don't throw, as this is not critical for the main flow
    }
  }

  // Helper function to format numbers for Dolibarr API (American format with dots)
  private formatNumberForDolibarr(value: number): string {
    if (value === null || value === undefined || isNaN(value)) {
      console.log('⚠️ FORMATO DOLIBARR CLIENT - Valor inválido, usando 0.000:', value);
      return '0.000';
    }
    
    const formatted = value.toFixed(3); // Mantener puntos para la API
    console.log(`🔍 FORMATO DOLIBARR CLIENT - ${value} → "${formatted}" (formato API)`);
    return formatted;
  }

  // Invoice verification methods
  async getSupplierInvoiceByRef(ref: string): Promise<DolibarrSupplierInvoice | null> {
    try {
      console.log('🔍 FACTURA - Buscando factura por referencia:', ref);
      const invoice = await this.makeRequest<DolibarrSupplierInvoice>(`/supplierinvoices/ref/${ref}`);
      console.log('✅ FACTURA - Factura encontrada por referencia:', {
        id: invoice.id,
        ref: invoice.ref,
        ref_supplier: invoice.ref_supplier
      });
      return invoice;
    } catch (error) {
      console.log('ℹ️ FACTURA - No se encontró factura con referencia:', ref);
      return null;
    }
  }

  async searchSupplierInvoices(params: {
    socid?: number;
    ref_supplier?: string;
    sqlfilters?: string;
    limit?: number;
  }): Promise<DolibarrSupplierInvoice[]> {
    try {
      let endpoint = '/supplierinvoices';
      
      const searchParams = new URLSearchParams();
      if (params.socid) searchParams.append('socid', params.socid.toString());
      if (params.ref_supplier) searchParams.append('ref_supplier', params.ref_supplier);
      if (params.sqlfilters) searchParams.append('sqlfilters', params.sqlfilters);
      if (params.limit) searchParams.append('limit', params.limit.toString());
      
      if (searchParams.toString()) {
        endpoint += `?${searchParams.toString()}`;
      }

      console.log('🔍 FACTURA - Buscando facturas con parámetros:', params);
      const invoices = await this.makeRequest<DolibarrSupplierInvoice[]>(endpoint);
      console.log(`✅ FACTURA - Encontradas ${invoices.length} facturas`);
      
      return invoices;
    } catch (error) {
      console.error('❌ ERROR - Error buscando facturas:', error);
      return [];
    }
  }

  async checkInvoiceExists(supplierRef: string, invoiceNumber: string, supplierId?: number, entityId?: string | null): Promise<DolibarrSupplierInvoice | null> {
    try {
      console.log('🔍 FACTURA - Verificando si existe factura:', {
        supplierRef,
        invoiceNumber,
        supplierId,
        entityId
      });

      // If entityId is provided, add it to search filters
      const entityFilter = entityId && entityId !== '1' ? `(t.entity:=:'${entityId}')` : '';

      // Try different search strategies
      const searchStrategies = [
        // Search by supplier reference with entity filter
        () => this.searchSupplierInvoices({
          ref_supplier: supplierRef,
          sqlfilters: entityFilter,
          limit: 10
        }),
        // Search by invoice number in supplier reference with entity filter
        () => this.searchSupplierInvoices({
          sqlfilters: entityFilter ? 
            `(t.ref_supplier:like:'%${invoiceNumber}%') and ${entityFilter}` : 
            `(t.ref_supplier:like:'%${invoiceNumber}%')`,
          limit: 10
        }),
        // Search by supplier ID if provided with entity filter
        ...(supplierId ? [() => this.searchSupplierInvoices({
          socid: supplierId,
          sqlfilters: entityFilter ? 
            `(t.ref_supplier:like:'%${invoiceNumber}%') and ${entityFilter}` : 
            `(t.ref_supplier:like:'%${invoiceNumber}%')`,
          limit: 10
        })] : [])
      ];

      for (const strategy of searchStrategies) {
        const invoices = await strategy();
        
        // Look for exact matches
        const exactMatch = invoices.find(invoice => 
          invoice.ref_supplier === supplierRef ||
          invoice.ref_supplier?.includes(invoiceNumber)
        );
        
        if (exactMatch) {
          console.log('⚠️ FACTURA - Factura duplicada encontrada en entidad:', {
            entity: entityId,
            id: exactMatch.id,
            ref: exactMatch.ref,
            ref_supplier: exactMatch.ref_supplier,
            socid: exactMatch.socid,
            invoice_entity: exactMatch.entity
          });
          return exactMatch;
        }
      }

      console.log('✅ FACTURA - No se encontraron facturas duplicadas en entidad:', entityId);
      return null;
    } catch (error) {
      console.error('❌ ERROR - Error verificando existencia de factura:', error);
      return null;
    }
  }

  // Helper function to calculate string similarity
  private calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.calculateLevenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  // Helper function to calculate Levenshtein distance
  private calculateLevenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  // Helper function to extract meaningful keywords
  private extractKeywords(text: string): string[] {
    const stopWords = ['el', 'la', 'los', 'las', 'de', 'del', 'y', 'o', 'con', 'sin', 'para', 'por', 'en', 'a', 'un', 'una', 'es', 'son', 'the', 'and', 'or', 'of', 'in', 'to', 'for', 'with'];
    return text
      .split(/\s+/)
      .map(word => word.toLowerCase().trim())
      .filter(word => word.length > 2 && !stopWords.includes(word))
      .slice(0, 5); // Take first 5 significant words
  }

  // Helper function to calculate price including VAT
  private calculatePriceWithVAT(price: number, vatRate: number): number {
    if (vatRate === 0) return price;
    return price * (1 + vatRate / 100);
  }

  // Helper function to generate supplier code
  private generateSupplierCode(supplierName: string): string {
    // Generate a shorter, more Dolibarr-compatible code
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2); // Last 2 digits of year
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const randomNum = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    
    // Clean the supplier name and create a short prefix
    const cleanName = supplierName
      .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
      .trim()
      .split(' ')
      .slice(0, 2) // Take first 2 words
      .map(word => word.substring(0, 3).toUpperCase()) // First 3 chars of each word
      .join('')
      .substring(0, 6); // Max 6 characters
    
    // Use format similar to Dolibarr: SU + year + month + random number
    const prefix = cleanName || 'SUP';
    return `SU${year}${month}-${randomNum}`;
  }
}

export const dolibarrClient = new DolibarrClient(); 