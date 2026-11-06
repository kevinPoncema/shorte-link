import React, { useState, useEffect } from 'react';
import {
  LinkItem,
  OrderRecord,
  api,
  User,
} from '../services/api';
import {
  Radio,
  Package,
  Layers,
  Check,
  Plus,
  Minus,
  CreditCard,
  Truck,
  ShieldCheck,
  Lock,
  ChevronDown,
  Info,
} from 'lucide-react';

interface NfcStoreViewProps {
  currentUser: User | null;
  preselectedLink?: LinkItem | null;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface ProductItem {
  id: string;
  name: string;
  price: number;
  description: string;
  image: string;
  badge1: string;
  badge2: string;
}

const HARDWARE_PRODUCTS: ProductItem[] = [
  {
    id: 'acrylic_stand',
    name: 'Stand Acrílico de Mesa',
    price: 15.0,
    description: 'Base pesada, grabado láser, chip NFC NTAG213 + QR protegido contra agua,...',
    image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=240&auto=format&fit=crop&q=80',
    badge1: 'NTAG213',
    badge2: 'Grabado Láser',
  },
  {
    id: 'plastic_card',
    name: 'Tarjeta PVC de Negocios',
    price: 10.0,
    description: 'Acabado mate premium negro, antena NFC integrada para networking ejecutivo...',
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=240&auto=format&fit=crop&q=80',
    badge1: 'Mate Touch',
    badge2: 'vCard Directa',
  },
  {
    id: 'nfc_card',
    name: 'Tarjeta Inteligente NFC',
    price: 12.5,
    description: 'Conexión ultra rápida a 1 solo tap instantáneo, compatible con el 100% de...',
    image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=240&auto=format&fit=crop&q=80',
    badge1: '1-Tap Fast',
    badge2: 'Cifrado AES',
  },
  {
    id: 'nfc_sticker',
    name: 'Pack de 5 Stickers Resinados',
    price: 5.0,
    description: 'Impermeables con blindaje metálico de ferrita anti-interferencias para barras de...',
    image: 'https://images.unsplash.com/photo-1589384267710-7a25aec54558?w=240&auto=format&fit=crop&q=80',
    badge1: 'Anti-Metal',
    badge2: 'Resina Epoxi',
  },
];

export const NfcStoreView: React.FC<NfcStoreViewProps> = ({
  preselectedLink,
  onShowToast,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'catalog' | 'orders'>('catalog');
  const [selectedProductId, setSelectedProductId] = useState<string>('acrylic_stand');
  const [selectedLinkId, setSelectedLinkId] = useState<string>('');
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [quantity, setQuantity] = useState<number>(5);

  // Shipping form fields with exact placeholders from reference
  const [fullName, setFullName] = useState('Carlos Mendoza');
  const [address, setAddress] = useState('Av. Libertador 1420, Piso 1');
  const [city, setCity] = useState('Ciudad de México');
  const [phone, setPhone] = useState('+52 55 4910 8820');

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderRecord[]>([]);

  useEffect(() => {
    loadLinks();
    loadOrders();
  }, []);

  useEffect(() => {
    if (preselectedLink) {
      setSelectedLinkId(preselectedLink.id);
    }
  }, [preselectedLink]);

  const loadLinks = async () => {
    try {
      const data = await api.getLinks();
      setLinks(data);
      if (data.length > 0 && !selectedLinkId) {
        setSelectedLinkId(data[0].id);
      }
    } catch {
      // ignore
    }
  };

  const loadOrders = async () => {
    try {
      const data = await api.getPhysicalOrders();
      setOrders(data);
    } catch {
      // ignore
    }
  };

  const selectedProduct =
    HARDWARE_PRODUCTS.find((p) => p.id === selectedProductId) || HARDWARE_PRODUCTS[0];
  const unitPrice = selectedProduct.price;
  const totalPrice = unitPrice * quantity;

  const handleCheckoutStripe = async () => {
    if (!fullName.trim() || !address.trim() || !city.trim() || !phone.trim()) {
      onShowToast('Por favor completa todos los datos de envío', 'error');
      return;
    }

    setLoading(true);
    try {
      const origin = window.location.origin + window.location.pathname;
      const res = await api.createPhysicalOrderCheckout({
        items: [
          {
            linkId: selectedLinkId || undefined,
            itemType: selectedProduct.id,
            quantity,
            specifications: {
              productName: selectedProduct.name,
              laserEngraved: true,
            },
          },
        ],
        shippingAddress: {
          fullName: fullName.trim(),
          addressLine1: address.trim(),
          city: city.trim(),
          phone: phone.trim(),
        },
        successUrl: `${origin}?order=success`,
        cancelUrl: `${origin}?order=cancelled`,
      });

      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Error al iniciar Stripe Checkout', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {/* 1. Hero Card: Hardware Inteligente Pre-grabado */}
      <div className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-2">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5 rotate-90" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold px-2 py-0.2 rounded-full bg-zinc-800 text-zinc-300 uppercase tracking-wider">
                PLUG & PLAY
              </span>
              <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                En Stock
              </span>
            </div>
            <h3 className="text-sm font-bold text-white tracking-tight mt-1">
              Hardware Inteligente Pre-grabado
            </h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Vincula tus QR dinámicos a tarjetas y stands NFC de grado comercial listos para usar en tus puntos de venta físicos.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Sub-Nav Tabs: Catálogo y Pedido vs Mis Órdenes */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveSubTab('catalog')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'catalog'
              ? 'bg-[#1E2230] text-white border border-white/10 shadow-sm'
              : 'bg-[#131620] text-zinc-400 hover:text-white border border-white/5'
          }`}
        >
          <Package className="w-3.5 h-3.5 text-indigo-400" />
          <span>Catálogo y Pedido</span>
        </button>

        <button
          onClick={() => setActiveSubTab('orders')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'orders'
              ? 'bg-[#1E2230] text-white border border-white/10 shadow-sm'
              : 'bg-[#131620] text-zinc-400 hover:text-white border border-white/5'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-purple-400" />
          <span>Mis Órdenes</span>
          <span className="h-4 px-1.5 rounded-full bg-emerald-500 text-slate-950 font-black text-[9px] flex items-center justify-center">
            {orders.length || 1}
          </span>
        </button>
      </div>

      {activeSubTab === 'catalog' ? (
        <>
          {/* PASO 1: SELECCIONA SOPORTE FÍSICO */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                PASO 1: SELECCIONA SOPORTE FÍSICO
              </span>
              <span className="text-[10px] text-zinc-500">
                4 dispositivos listos
              </span>
            </div>

            <div className="space-y-2">
              {HARDWARE_PRODUCTS.map((prod) => {
                const isSelected = selectedProductId === prod.id;
                return (
                  <div
                    key={prod.id}
                    onClick={() => setSelectedProductId(prod.id)}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center gap-3.5 ${
                      isSelected
                        ? 'bg-[#161726] border-indigo-500/60 shadow-glow-indigo/10 ring-1 ring-indigo-500/30'
                        : 'bg-[#131620] border-white/5 hover:border-white/10'
                    }`}
                  >
                    {/* Thumbnail Image */}
                    <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-black/50 border border-white/10 shrink-0">
                      <img
                        src={prod.image}
                        alt={prod.name}
                        className="h-full w-full object-cover"
                      />
                      {isSelected && (
                        <div className="absolute top-1 left-1 h-5 w-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="text-xs font-bold text-white truncate">
                          {prod.name}
                        </h4>
                        <span className="text-xs font-black text-amber-400 shrink-0">
                          ${prod.price.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5 leading-snug">
                        {prod.description}
                      </p>

                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                          {prod.badge1}
                        </span>
                        <span className="text-[9px] font-semibold text-zinc-400 bg-white/5 px-1.5 py-0.2 rounded border border-white/5">
                          {prod.badge2}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PASO 2: VINCULACIÓN Y CANTIDAD */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                PASO 2: VINCULACIÓN Y CANTIDAD
              </span>
              <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                <span>⚡</span>
                <span>Codificación sin costo</span>
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-3.5">
              {/* Dropdown Vincular enlace */}
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-[11px] font-medium text-zinc-300">
                  <span>Vincular a enlace existente</span>
                  <Info className="w-3 h-3 text-zinc-500" />
                </div>

                <div className="relative">
                  <select
                    value={selectedLinkId}
                    onChange={(e) => setSelectedLinkId(e.target.value)}
                    className="w-full bg-[#0B0D13] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none appearance-none cursor-pointer"
                  >
                    {links.map((link) => (
                      <option key={link.id} value={link.id}>
                        {link.name || link.shortCode} (kineti.qr/r/{link.shortCode})
                      </option>
                    ))}
                    {links.length === 0 && (
                      <option value="">Menú Digital (kineti.qr/r/menu)</option>
                    )}
                  </select>
                  <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <p className="text-[10px] text-zinc-500 flex items-center gap-1 pt-0.5">
                  <span className="text-emerald-400">🔄</span>
                  <span>Podrás cambiar el destino en la nube en cualquier momento.</span>
                </p>
              </div>

              {/* Quantity Selector */}
              <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">
                    Unidades para mesas
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {selectedProduct.name}
                  </span>
                </div>

                <div className="flex items-center bg-[#0B0D13] border border-white/5 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="h-7 w-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-300 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-10 text-center text-xs font-black text-white">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="h-7 w-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-300 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* PASO 3: ENVÍO PRIORITARIO */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                PASO 3: ENVÍO PRIORITARIO
              </span>
              <span className="text-[10px] font-semibold text-amber-400 flex items-center gap-1">
                <Truck className="w-3 h-3" />
                <span>2-3 días hábiles</span>
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  NOMBRE COMPLETO / ENCARGADO
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Carlos Mendoza"
                  className="w-full bg-[#0B0D13] border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  DIRECCIÓN DE ENTREGA (RESTAURANTE)
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Av. Libertador 1420, Piso 1"
                  className="w-full bg-[#0B0D13] border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                    CIUDAD
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ciudad de México"
                    className="w-full bg-[#0B0D13] border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                    TELÉFONO WHATSAPP
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+52 55 4910 8820"
                    className="w-full bg-[#0B0D13] border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Resumen del Pedido Card */}
          <div className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Resumen del Pedido
              </h4>
              <span className="text-[10px] font-semibold text-emerald-400">
                Envío DHL Express Incluido
              </span>
            </div>

            <div className="space-y-1.5 text-xs text-zinc-400 pt-1">
              <div className="flex justify-between">
                <span>
                  {quantity}x {selectedProduct.name} (${unitPrice.toFixed(2)} c/u)
                </span>
                <span className="font-semibold text-white">
                  ${totalPrice.toFixed(2)} USD
                </span>
              </div>
              <div className="flex justify-between">
                <span>Pre-grabado láser & codificado NFC</span>
                <span className="text-emerald-400 font-semibold">GRATIS</span>
              </div>
              <div className="flex justify-between">
                <span>Courier con tracking directo</span>
                <span className="text-emerald-400 font-semibold">GRATIS</span>
              </div>
            </div>

            <div className="pt-2 border-t border-white/5 flex items-baseline justify-between">
              <span className="text-xs font-bold text-white">Total a Pagar</span>
              <span className="text-xl font-black text-amber-400">
                ${totalPrice.toFixed(2)} USD
              </span>
            </div>

            {/* Big Primary Stripe Checkout Button */}
            <button
              onClick={handleCheckoutStripe}
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-60"
            >
              <CreditCard className="w-4 h-4" />
              <span>
                {loading
                  ? 'Conectando con pasarela...'
                  : `Pagar $${totalPrice.toFixed(2)} con Stripe Checkout →`}
              </span>
            </button>

            <div className="pt-1 flex items-center justify-center gap-3 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-emerald-400" />
                Stripe 256-bit SSL
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-amber-400" />
                Garantía 1 Año
              </span>
            </div>
          </div>
        </>
      ) : (
        /* Mis Órdenes View */
        <div className="space-y-3">
          <div className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase">
                EN PRODUCCIÓN / PAGADO
              </span>
              <span className="text-[10px] text-zinc-400">Orden #ORD-2026-9812</span>
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">
                5x Stand Acrílico de Mesa (Pack Restaurante)
              </h4>
              <p className="text-xs text-zinc-400">
                Vinculado a: <strong className="text-indigo-400">Menú Digital (kineti.qr/r/menu)</strong>
              </p>
              <p className="text-[11px] text-zinc-500">
                Destino: Av. Libertador 1420, Piso 1, CDMX
              </p>
            </div>

            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-400">Total: $75.00 USD</span>
              <span className="text-indigo-400 font-semibold flex items-center gap-1">
                <Truck className="w-3.5 h-3.5" />
                <span>DHL Express: En tránsito</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
