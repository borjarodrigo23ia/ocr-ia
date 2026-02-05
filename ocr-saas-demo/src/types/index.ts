// Dolibarr API Types
export interface DolibarrSupplierInvoice {
  id?: string;
  ref?: string;
  socid: number;
  ref_supplier: string;
  date: string;
  date_echeance?: string;
  note_public?: string;
  note_private?: string;
  note?: string;
  cond_reglement_id?: number;
  mode_reglement_id?: number;
  multicurrency_code?: string;
  multicurrency_tx?: string;
  order_supplier?: number;
  type?: number;
  fk_account?: number;
  entity?: number; // For multicompany support
}

export interface DolibarrThirdParty {
  id?: string;
  code?: string; // ✅ REQUIRED FIELD - Supplier code
  name: string;
  name_alias?: string;
  client?: string;
  prospect?: string;
  fournisseur?: string;
  email?: string;
  phone?: string;
  address?: string;
  zip?: string;
  town?: string;
  country_id?: string;
  tva_assuj?: string;
  tva_intra?: string;
  status?: string;
  note_public?: string;
  note_private?: string;
  default_lang?: string;
  mode_reglement_supplier_id?: number;
  cond_reglement_supplier_id?: number;
  remise_supplier_percent?: number;
  fk_user_creat?: number;
  entity?: number; // For multicompany support
}

export interface DolibarrProduct {
  id?: string;
  ref: string;
  label: string;
  description?: string;
  type: string; // "0" for physical product, "1" for service
  price: string;
  tva_tx: string;
  status: string;
  status_buy?: string;
  tobuy?: string;
  tosell?: string;
  note_public?: string;
  note_private?: string;
  seuil_stock_alerte?: string;
  desiredstock?: string;
  barcode?: string;
  barcode_type?: string;
  default_lang?: string;
  fk_user_creat?: string;
  entity?: number; // For multicompany support
}

// Multicompany Types
export interface DolibarrEntity {
  id: string;
  label: string;
  description?: string;
  address?: string;
  zip?: string;
  town?: string;
  currency_code?: string;
  language_code?: string;
  country_id?: string;
  country_code?: string;
  visible: string;
  active: string;
}

export interface DolibarrInvoiceLine {
  desc: string;
  subprice: string;
  qty: string;
  tva_tx: string;
  remise_percent?: string;
  total_ht: string;
  total_tva: string;
  total_ttc: string;
  fk_product?: string;
}

// OCR Extracted Data Types
export interface ExtractedInvoiceData {
  supplier: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    zip?: string;
    vatNumber?: string;
    country?: string;
  };
  invoice: {
    number: string;
    date: string;
    dueDate?: string;
    totalHT: number;
    totalTTC: number;
    totalVAT: number;
  };
  products: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    vatRate: number;
    discountPercent?: number;
    discountAmount?: number;
    productCode?: string;
  }>;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ProcessingResult {
  supplierId: string;
  invoiceId: string;
  createdProducts: string[];
  updatedProducts: string[];
  errors: string[];
}

// Verification Types
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
    existingInvoice?: DolibarrSupplierInvoice;
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

export interface EditableExtractedData extends ExtractedInvoiceData {
  supplier: ExtractedInvoiceData['supplier'] & {
    ref?: string;
  };
  products: Array<ExtractedInvoiceData['products'][0] & {
    ref?: string;
    type?: 'product' | 'service';
    discountPercent?: number;
    discountAmount?: number;
  }>;
}

// File Upload Types
export interface UploadedFile {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'completed' | 'error';
  extractedData?: ExtractedInvoiceData;
  processingResult?: ProcessingResult;
  verification?: VerificationResult;
  editableData?: EditableExtractedData;
  error?: string;
  completedAt?: Date;
  processedAt?: Date;
}

// History Types
export interface HistoryFile {
  id: string;
  fileName: string;
  fileSize: number;
  processedAt: Date;
  completedAt: Date;
  extractedData: EditableExtractedData;
  processingResult: ProcessingResult;
  verification: VerificationResult;
} 