import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  X,
  CreditCard,
  Wifi,
  PackageCheck,
  Truck,
  ShieldCheck,
  AlertCircle,
  Plus,
  Minus,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import {
  api,
  API_BASE_URL,
  CreatePhysicalOrderPayload,
  LinkItem,
  OrderRecord,
} from '../services/api';

interface PhysicalOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  link: LinkItem | null;
  onOrderSuccess?: (order: OrderRecord) => void;
}

interface ProductType {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  description: string;
  material: string;
  dimensions: string;
  badge?: string;
}

const PRODUCTS: ProductType[] = [
  {
    id: 'acrylic_stand',
    name: 'Placa Acrílica con QR + NFC',
    subtitle: 'Soporte de mostrador rígido con peana',
    price: 15.0,
    description:
      'Placa acrílica de 3mm de alto impacto con peana desmontable. Código QR grabado con protección UV y chip NFC NTAG213 integrado en la base para lectura por proximidad (tap).',
    material: 'Acrílico fundido grado óptico + Chip NFC NTAG213',
    dimensions: '10 cm x 15 cm (Grosor 3mm)',
    badge: 'Más Vendido para Negocios',
  },
  {
    id: 'plastic_card',
    name: 'Tarjeta Plástica PVC Inteligente',
    subtitle: 'Formato billetera (Tamaño tarjeta de crédito)',
    price: 10.0,
    description:
      'Tarjeta rígida de PVC laminado mate (85.6 x 54 mm) con antena NFC embebida y código QR dinámico impreso por termotransferencia. Perfecta para llevar en la cartera o compartir al instante.',
    material: 'PVC termo-sellado impermeable + Chip NFC NTAG215',
    dimensions: '8.5 cm x 5.4 cm (Grosor 0.76mm)',
    badge: 'Portátil y Elegante',
  },
  {
    id: 'nfc_sticker',
    name: 'Sticker Resinado Anti-Metal',
    subtitle: 'Adhesivo epoxi 3D para superficies rígidas',
    price: 5.0,
    description:
      'Sticker circular con gota de resina protectora impermeable y lámina aislante de ferrita anti-metal para adherir en mesas, vitrinas o electrodomésticos sin pérdida de señal NFC.',
    material: 'Vinilo con resina epoxi + Capa ferrite anti-metal',
    dimensions: 'Diámetro 4.5 cm (Relieve 2mm)',
  },
];

export const PhysicalOrderModal: React.FC<PhysicalOrderModalProps> = ({
  isOpen,
  onClose,
  link,
  onOrderSuccess,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<string>('acrylic_stand');
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedColor, setSelectedColor] = useState<string>('matte_black');
  const [customText, setCustomText] = useState<string>('Acerca tu móvil o escanea el QR');

  // Formulario de dirección de envío
  const [fullName, setFullName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Estados de acción y error
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<OrderRecord | null>(null);

  if (!isOpen || !link) return null;

  const shortUrl = `${API_BASE_URL}/${link.shortCode}`;
  const selectedProduct =
    PRODUCTS.find((p) => p.id === selectedProductId) || PRODUCTS[0];
  const unitPrice = selectedProduct.price;
  const totalAmount = unitPrice * quantity;

  const handleQuantityChange = (newQty: number) => {
    if (newQty >= 1 && newQty <= 100) {
      setQuantity(newQty);
    }
  };

  const validateShippingForm = (): boolean => {
    if (!fullName.trim() || !addressLine1.trim() || !city.trim() || !phone.trim()) {
      setError('Por favor completa todos los campos obligatorios de la dirección de entrega.');
      return false;
    }
    return true;
  };

  const buildPayload = (): CreatePhysicalOrderPayload => {
    const currentUrl = window.location.origin + window.location.pathname;
    return {
      items: [
        {
          linkId: link.id,
          itemType: selectedProduct.id,
          quantity,
          specifications: {
            color: selectedColor,
            customText,
            linkShortCode: link.shortCode,
            linkName: link.name || 'Enlace QR',
          },
        },
      ],
      shippingAddress: {
        fullName: fullName.trim(),
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() || undefined,
        city: city.trim(),
        state: state.trim() || undefined,
        phone: phone.trim(),
        notes: notes.trim() || undefined,
      },
      successUrl: `${currentUrl}?order=success`,
      cancelUrl: `${currentUrl}?order=cancelled`,
    };
  };

  // 1. Emitir y pagar vía Stripe Checkout
  const handlePayWithStripe = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validateShippingForm()) return;

    setActionLoading('stripe');
    try {
      const payload = buildPayload();
      const res = await api.createPhysicalOrderCheckout(payload);
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      }
    } catch (err: any) {
      setError(err?.message || 'Error al iniciar Stripe Checkout para la orden física');
      setActionLoading(null);
    }
  };

  // 2. Emitir orden física directa (Modo directo / Pruebas / Liquidación local)
  const handleDirectOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validateShippingForm()) return;

    setActionLoading('direct');
    try {
      const payload = buildPayload();
      const order = await api.createDirectPhysicalOrder(payload);
      setCompletedOrder(order);
      if (onOrderSuccess) {
        onOrderSuccess(order);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al emitir la orden física');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClose = () => {
    setCompletedOrder(null);
    setError(null);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="physical-order-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between bg-gradient-to-r from-slate-50 to-purple-50/40">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm shadow-purple-200">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h2 id="physical-order-title" className="text-lg font-bold text-slate-900">
                Pedir Placa o Tarjeta NFC Física
              </h2>
              <p className="text-xs text-slate-500">
                Impresión física de alta durabilidad en plástico con chip NFC para:{' '}
                <strong className="text-purple-700">{link.name || shortUrl}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Cerrar modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Pantalla de confirmación de orden emitida */}
          {completedOrder ? (
            <div className="py-8 text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">
                ¡Orden Física Emitida Exitosamente!
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Tu solicitud de insumos físicos ha sido confirmada y pasada a la cola de manufactura.
              </p>

              <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-left space-y-2">
                <div className="flex justify-between border-b border-slate-200/80 pb-2">
                  <span className="text-slate-500">ID de la Orden:</span>
                  <code className="font-mono font-semibold text-slate-800">{completedOrder.id}</code>
                </div>
                <div className="flex justify-between border-b border-slate-200/80 pb-2">
                  <span className="text-slate-500">Producto:</span>
                  <span className="font-semibold text-slate-800">{selectedProduct.name}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/80 pb-2">
                  <span className="text-slate-500">Unidades:</span>
                  <span className="font-semibold text-slate-800">{quantity} unidad(es)</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/80 pb-2">
                  <span className="text-slate-500">Total Facturado:</span>
                  <span className="font-bold text-purple-700">${Number(completedOrder.totalAmount).toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/80 pb-2">
                  <span className="text-slate-500">Estado de Manufactura:</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                    {completedOrder.fulfillmentStatus}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Dirección de Entrega:</span>
                  <span className="font-medium text-slate-800 text-right">
                    {completedOrder.shippingAddress?.addressLine1}, {completedOrder.shippingAddress?.city}
                  </span>
                </div>
              </div>

              <div className="pt-4 flex justify-center gap-3">
                <button
                  onClick={handleClose}
                  className="rounded-xl bg-purple-600 px-6 py-2.5 text-xs font-semibold text-white hover:bg-purple-700 shadow-sm"
                >
                  Entendido, Volver al Dashboard
                </button>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <span>{error}</span>
                </div>
              )}

              {/* Sección 1: Selección de Producto con Mockups Visuales */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                  1. Selecciona el Tipo de Insumo Físico
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {PRODUCTS.map((prod) => {
                    const isSelected = prod.id === selectedProductId;
                    return (
                      <div
                        key={prod.id}
                        onClick={() => setSelectedProductId(prod.id)}
                        className={`cursor-pointer rounded-2xl border p-4 transition-all relative flex flex-col justify-between ${
                          isSelected
                            ? 'border-purple-600 ring-2 ring-purple-600/15 bg-purple-50/20 shadow-md'
                            : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
                        }`}
                      >
                        <div>
                          {prod.badge && (
                            <span className="inline-block rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-700 mb-2">
                              {prod.badge}
                            </span>
                          )}
                          <h4 className="text-sm font-bold text-slate-900">{prod.name}</h4>
                          <p className="text-[11px] text-slate-500 mt-0.5">{prod.subtitle}</p>

                          {/* Mockup visual ilustrativo */}
                          <div className="my-3 flex items-center justify-center p-3 rounded-xl bg-slate-100/70 border border-slate-200/60">
                            {prod.id === 'acrylic_stand' && (
                              <div className="relative w-28 h-32 rounded-lg bg-gradient-to-b from-slate-900 to-slate-800 text-white p-2 shadow-lg flex flex-col items-center justify-between border-b-4 border-purple-500">
                                <div className="flex items-center justify-between w-full px-1">
                                  <Wifi className="h-3 w-3 text-purple-400 rotate-90" />
                                  <span className="text-[8px] font-mono text-slate-400">NFC</span>
                                </div>
                                <div className="bg-white p-1 rounded-sm shadow-xs">
                                  <QRCodeSVG value={shortUrl} size={48} level="M" />
                                </div>
                                <span className="text-[8px] font-bold tracking-tight text-purple-200">
                                  {link.shortCode}
                                </span>
                              </div>
                            )}

                            {prod.id === 'plastic_card' && (
                              <div className="relative w-36 h-22 rounded-xl bg-gradient-to-tr from-slate-950 via-slate-900 to-indigo-950 text-white p-2.5 shadow-md flex items-center justify-between border border-slate-700">
                                <div className="flex flex-col justify-between h-full">
                                  <div className="flex items-center gap-1">
                                    <Wifi className="h-3.5 w-3.5 text-purple-400 rotate-90" />
                                    <span className="text-[9px] font-bold tracking-wider text-purple-300">
                                      NFC CARD
                                    </span>
                                  </div>
                                  <div className="text-[8px] font-mono text-slate-300 truncate max-w-[65px]">
                                    {link.name || link.shortCode}
                                  </div>
                                </div>
                                <div className="bg-white p-1 rounded shadow-xs">
                                  <QRCodeSVG value={shortUrl} size={42} level="M" />
                                </div>
                              </div>
                            )}

                            {prod.id === 'nfc_sticker' && (
                              <div className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-purple-700 via-indigo-600 to-purple-800 text-white p-2 shadow-md flex flex-col items-center justify-center border-2 border-white/60">
                                <div className="bg-white p-1 rounded-full shadow-xs">
                                  <QRCodeSVG value={shortUrl} size={38} level="M" />
                                </div>
                                <div className="flex items-center gap-0.5 mt-0.5">
                                  <Wifi className="h-2.5 w-2.5 text-purple-200 rotate-90" />
                                  <span className="text-[7px] font-bold">NFC TAG</span>
                                </div>
                              </div>
                            )}
                          </div>

                          <p className="text-[11px] text-slate-600 line-clamp-3">{prod.description}</p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-base font-extrabold text-purple-700">
                            ${prod.price.toFixed(2)} USD
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              isSelected ? 'text-purple-600' : 'text-slate-400'
                            }`}
                          >
                            {isSelected ? '✓ Seleccionado' : 'Elegir'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sección 2: Personalización y Cantidad */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-slate-100">
                {/* Cantidad y Color */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-2">
                      2. Cantidad de Unidades
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center rounded-xl border border-slate-300 bg-white shadow-xs">
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(quantity - 1)}
                          disabled={quantity <= 1}
                          className="p-2 text-slate-500 hover:text-slate-800 disabled:opacity-40"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={quantity}
                          onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                          className="w-14 text-center text-sm font-bold text-slate-900 border-0 focus:ring-0 p-0"
                        />
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(quantity + 1)}
                          disabled={quantity >= 100}
                          className="p-2 text-slate-500 hover:text-slate-800 disabled:opacity-40"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex gap-1.5">
                        {[1, 2, 5, 10, 25].map((qty) => (
                          <button
                            key={qty}
                            type="button"
                            onClick={() => setQuantity(qty)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                              quantity === qty
                                ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {qty}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-2">
                      Color de Base del Producto
                    </label>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {[
                        { id: 'matte_black', label: 'Negro Mate' },
                        { id: 'pure_white', label: 'Blanco Glaciar' },
                        { id: 'crystal_clear', label: 'Cristal Transparente' },
                      ].map((col) => (
                        <button
                          key={col.id}
                          type="button"
                          onClick={() => setSelectedColor(col.id)}
                          className={`p-2 rounded-xl border text-center font-medium transition-all ${
                            selectedColor === col.id
                              ? 'border-purple-600 bg-purple-50/70 text-purple-900 font-bold ring-1 ring-purple-600'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          {col.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Texto a Grabar / Imprimir Bajo el QR
                    </label>
                    <input
                      type="text"
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      placeholder="Ej. Acerca tu móvil o escanea el QR"
                      maxLength={40}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                </div>

                {/* Previsualización del Pedido y Resumen */}
                <div className="rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50/50 via-white to-slate-50 p-4 flex flex-col justify-between shadow-xs">
                  <div>
                    <h4 className="text-xs font-bold text-purple-900 flex items-center gap-1.5 uppercase tracking-wider mb-3">
                      <Layers className="h-4 w-4 text-purple-600" />
                      Resumen del Insumo Físico
                    </h4>
                    <div className="space-y-2 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span>Producto:</span>
                        <strong className="text-slate-800">{selectedProduct.name}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Enlace QR vinculado:</span>
                        <span className="font-mono text-purple-700 font-semibold">{link.shortCode}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Chip de Radiofrecuencia:</span>
                        <span className="text-slate-800 font-medium">NFC Contactless 13.56MHz</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Dimensiones:</span>
                        <span className="text-slate-600">{selectedProduct.dimensions}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-purple-200/60 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Precio unitario:</span>
                      <span>${unitPrice.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Cantidad:</span>
                      <span>x {quantity}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span className="flex items-center gap-1">
                        <Truck className="h-3 w-3" /> Envío Estándar:
                      </span>
                      <span>Gratis</span>
                    </div>
                    <div className="flex justify-between text-base font-extrabold text-slate-900 pt-2 border-t border-purple-200">
                      <span>Total a Cobrar:</span>
                      <span className="text-purple-700">${totalAmount.toFixed(2)} USD</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sección 3: Dirección de Entrega y Envío */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  3. Datos de Envío y Destinatario
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Nombre Completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ej. Juan Pérez"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Teléfono de Contacto *
                    </label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+504 9999-9999"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Dirección de Entrega (Calle, Edificio, Número) *
                    </label>
                    <input
                      type="text"
                      required
                      value={addressLine1}
                      onChange={(e) => setAddressLine1(e.target.value)}
                      placeholder="Ej. Barrio Guamilito, 5ta Calle, 8va Avenida"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Apartamento, Suite, Edificio (Opcional)
                    </label>
                    <input
                      type="text"
                      value={addressLine2}
                      onChange={(e) => setAddressLine2(e.target.value)}
                      placeholder="Ej. Nivel 3, Local #4"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Ciudad *
                    </label>
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ej. San Pedro Sula"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Estado / Departamento (Opcional)
                    </label>
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="Ej. Cortés"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Instrucciones de Entrega (Opcional)
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ej. Dejar en recepción con vigilancia"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer y Botones de Acción */}
        {!completedOrder && (
          <div className="border-t border-slate-100 px-6 py-4 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-slate-500 text-xs">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Garantía de lectura NFC y grabado UV de 1 año.</span>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              {/* Botón 1: Modo Directo / Pruebas */}
              <button
                type="button"
                onClick={handleDirectOrder}
                disabled={actionLoading !== null}
                data-testid="direct-order-btn"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl border border-purple-300 bg-purple-50/70 px-4 py-2.5 text-xs font-semibold text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-60"
                title="Emitir orden física directamente sin pasarela externa (Modo desarrollo)"
              >
                <PackageCheck className="h-4 w-4" />
                <span>{actionLoading === 'direct' ? 'Emitiendo...' : 'Emitir Orden Directa (Dev)'}</span>
              </button>

              {/* Botón 2: Stripe Checkout */}
              <button
                type="button"
                onClick={handlePayWithStripe}
                disabled={actionLoading !== null}
                data-testid="stripe-order-btn"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-purple-700 shadow-sm shadow-purple-200 transition-colors disabled:opacity-60"
              >
                <CreditCard className="h-4 w-4" />
                <span>
                  {actionLoading === 'stripe'
                    ? 'Abriendo Stripe...'
                    : `Pagar $${totalAmount.toFixed(2)} USD con Stripe`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
