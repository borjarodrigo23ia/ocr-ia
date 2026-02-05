import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Doligestion OCR - Procesamiento Automático de Facturas',
  description: 'Aplicación para procesar facturas automáticamente usando OCR con IA y integrando con Dolibarr ERP',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-gray-50 min-h-screen">
        <div className="min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
} 