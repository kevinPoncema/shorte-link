import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { JwtPayload } from '../../core/auth/interfaces/jwt-payload.interface';
import { LinksService } from '../../core/links/services/links.service';
import { CheckoutResponseDto } from '../dto/checkout-response.dto';
import { CreatePhysicalOrderCheckoutDto } from '../dto/create-physical-order-checkout.dto';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from '../interfaces/order-repository.interface';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../interfaces/subscription-repository.interface';
import { Order } from '../models/order.entity';
import { StripeService } from './stripe.service';

/**
 * Servicio de dominio especializado en pedidos físicos de insumos de hardware (QR + NFC).
 * Desacopla la lógica de manufactura y venta física de `BillingService` aplicando SRP.
 */
@Injectable()
export class PhysicalOrderService {
  private readonly logger = new Logger(PhysicalOrderService.name);
  private physicalOrdersFlagOverride: boolean | null = null;

  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: IOrderRepository,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepository: ISubscriptionRepository,
    private readonly stripeService: StripeService,
    private readonly linksService: LinksService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Determina si el módulo de pedidos físicos está habilitado.
   */
  isPhysicalOrdersEnabled(): boolean {
    if (this.physicalOrdersFlagOverride !== null) {
      return this.physicalOrdersFlagOverride;
    }

    const rawFlag = this.configService.get<string | boolean>(
      'ENABLE_PHYSICAL_ORDERS',
    );
    return this.parseBooleanFlag(rawFlag, true);
  }

  /**
   * Conmuta en tiempo de ejecución el Feature Flag de pedidos físicos.
   */
  setPhysicalOrdersEnabled(enabled: boolean): { physicalOrdersEnabled: boolean } {
    this.physicalOrdersFlagOverride = Boolean(enabled);
    this.logger.log(
      `Feature Flag de pedidos físicos actualizado dinámicamente a: ${this.physicalOrdersFlagOverride}`,
    );
    return { physicalOrdersEnabled: this.isPhysicalOrdersEnabled() };
  }

  /**
   * Obtiene la tabla de precios unitarios configurados para cada tipo de hardware.
   */
  getBaseHardwarePrices(): Record<string, number> {
    const parsePrice = (envVar: string, fallback: number): number => {
      const val = parseFloat(this.configService.get<string>(envVar, ''));
      return isNaN(val) || val <= 0 ? fallback : val;
    };

    return {
      acrylic_stand: parsePrice('PRICE_ACRYLIC_STAND', 15.0),
      plastic_card: parsePrice('PRICE_PLASTIC_CARD', 10.0),
      nfc_card: parsePrice('PRICE_NFC_CARD', 12.5),
      nfc_sticker: parsePrice('PRICE_NFC_STICKER', 5.0),
    };
  }

  /**
   * Lista el historial de órdenes de hardware solicitadas por un usuario.
   */
  async findOrdersByUserId(userId: string): Promise<Order[]> {
    const normalizedUserId = userId.trim();
    return this.orderRepository.findByUserId(normalizedUserId);
  }

  /**
   * Crea una orden de compra física y genera la sesión de Stripe Checkout correspondiente.
   */
  async createPhysicalOrderCheckout(
    user: JwtPayload,
    dto: CreatePhysicalOrderCheckoutDto,
    fallbackUrlBuilder: (
      savedOrder: Order,
      dto: CreatePhysicalOrderCheckoutDto,
    ) => string,
    shouldFallbackFn: (err: any) => boolean,
  ): Promise<CheckoutResponseDto> {
    this.assertPhysicalOrdersEnabled();

    if (!dto.successUrl || !dto.cancelUrl) {
      throw new BadRequestException(
        'successUrl y cancelUrl son obligatorios para generar una sesión de Stripe Checkout.',
      );
    }

    await this.validateLinkOwnershipForItems(user.sub, dto.items);

    const priceMap = this.getBaseHardwarePrices();
    let totalAmount = 0;
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    const orderItems = dto.items.map((item) => {
      const unitPrice = priceMap[item.itemType];
      if (unitPrice === undefined) {
        throw new BadRequestException(
          `Tipo de insumo no soportado: '${item.itemType}'. Tipos permitidos: ${Object.keys(priceMap).join(', ')}`,
        );
      }

      totalAmount += unitPrice * item.quantity;

      const itemName =
        item.itemType === 'acrylic_stand'
          ? 'Placa Acrílica con Código QR y chip NFC'
          : item.itemType === 'plastic_card' || item.itemType === 'nfc_card'
            ? 'Tarjeta Plástica PVC con Código QR y chip NFC'
            : item.itemType === 'nfc_sticker'
              ? 'Sticker Adhesivo con Código QR y chip NFC'
              : `Hardware QR: ${item.itemType}`;

      lineItems.push({
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(unitPrice * 100),
          product_data: {
            name: itemName,
            metadata: {
              itemType: item.itemType,
              linkId: item.linkId || '',
            },
          },
        },
        quantity: item.quantity,
      });

      return {
        linkId: item.linkId ?? null,
        itemType: item.itemType,
        quantity: item.quantity,
        unitPrice,
        specifications: item.specifications ?? null,
      };
    });

    const newOrder: Partial<Order> = {
      userId: user.sub,
      totalAmount,
      currency: 'USD',
      paymentStatus: 'pending',
      fulfillmentStatus: 'unfulfilled',
      shippingAddress: dto.shippingAddress,
      items: orderItems as any,
    };

    const savedOrder = await this.orderRepository.createAndSave(newOrder);

    const subscription = await this.subscriptionRepository.findByUserId(user.sub);
    const customerId =
      subscription?.providerCustomerId &&
      !subscription.providerCustomerId.startsWith('cus_sim_')
        ? subscription.providerCustomerId
        : undefined;

    try {
      const session = await this.stripeService.createPaymentCheckoutSession({
        customerId,
        customerEmail: customerId ? undefined : user.email,
        orderId: savedOrder.id,
        userId: user.sub,
        lineItems,
        successUrl: dto.successUrl,
        cancelUrl: dto.cancelUrl,
      });

      await this.orderRepository.update(savedOrder.id, {
        providerPaymentIntentId: session.id,
      });

      if (!session.url) {
        throw new BadRequestException(
          'Stripe no devolvió una URL válida para la sesión de pago físico.',
        );
      }

      return { checkoutUrl: session.url };
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        throw err;
      }

      if (shouldFallbackFn(err)) {
        const simId = `cs_sandbox_order_${savedOrder.id}`;
        await this.orderRepository.update(savedOrder.id, {
          providerPaymentIntentId: simId,
        });

        const fallbackUrl = fallbackUrlBuilder(savedOrder, dto);
        return { checkoutUrl: fallbackUrl };
      }

      this.logger.error(
        `Error al crear sesión de pago físico en Stripe: ${err.message}`,
        err.stack,
      );
      throw new BadRequestException(
        `No fue posible generar la orden física: ${err.message}`,
      );
    }
  }

  /**
   * Emite directamente una orden física marcada como pagada y en producción.
   */
  async createDirectPhysicalOrder(
    user: JwtPayload,
    dto: Omit<CreatePhysicalOrderCheckoutDto, 'successUrl' | 'cancelUrl'>,
  ): Promise<Order> {
    this.assertPhysicalOrdersEnabled();
    await this.validateLinkOwnershipForItems(user.sub, dto.items);

    const priceMap = this.getBaseHardwarePrices();
    let totalAmount = 0;

    const orderItems = dto.items.map((item) => {
      const unitPrice = priceMap[item.itemType];
      if (unitPrice === undefined) {
        throw new BadRequestException(
          `Tipo de insumo no soportado: '${item.itemType}'`,
        );
      }
      totalAmount += unitPrice * item.quantity;
      return {
        linkId: item.linkId ?? null,
        itemType: item.itemType,
        quantity: item.quantity,
        unitPrice,
        specifications: item.specifications ?? null,
      };
    });

    const newOrder: Partial<Order> = {
      userId: user.sub,
      totalAmount,
      currency: 'USD',
      paymentStatus: 'paid',
      fulfillmentStatus: 'in_production',
      shippingAddress: dto.shippingAddress,
      items: orderItems as any,
    };

    const savedOrder = await this.orderRepository.createAndSave(newOrder);

    this.logger.log(
      `Orden física ${savedOrder.id} emitida directamente y pasada a manufactura. Total: $${totalAmount}`,
    );

    return savedOrder;
  }

  /**
   * Verifica propiedad de los enlaces antes de asociarlos a un ítem físico.
   */
  async validateLinkOwnershipForItems(
    userId: string,
    items: Array<{ linkId?: string }>,
  ): Promise<void> {
    for (const item of items) {
      if (item.linkId) {
        try {
          await this.linksService.findOneByUser(userId, item.linkId);
        } catch {
          throw new NotFoundException(
            `El enlace con ID '${item.linkId}' no existe o no pertenece a tu cuenta.`,
          );
        }
      }
    }
  }

  /**
   * Lanza ForbiddenException si los pedidos físicos están deshabilitados.
   */
  assertPhysicalOrdersEnabled(): void {
    if (!this.isPhysicalOrdersEnabled()) {
      throw new ForbiddenException(
        'El módulo de pedidos físicos se encuentra temporalmente deshabilitado por el administrador.',
      );
    }
  }

  private parseBooleanFlag(value: unknown, defaultValue = true): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'enabled', 'on'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'disabled', 'off'].includes(normalized)) {
        return false;
      }
    }
    return defaultValue;
  }
}
