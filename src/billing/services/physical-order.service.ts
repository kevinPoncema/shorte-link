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

export interface HardwareCalculationResult {
  totalAmount: number;
  orderItems: Array<{
    linkId: string | null;
    itemType: string;
    quantity: number;
    unitPrice: number;
    specifications: Record<string, any> | null;
  }>;
  lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
}

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

  isPhysicalOrdersEnabled(): boolean {
    if (this.physicalOrdersFlagOverride !== null) {
      return this.physicalOrdersFlagOverride;
    }

    const rawFlag = this.configService.get<string | boolean>(
      'ENABLE_PHYSICAL_ORDERS',
    );
    return this.parseBooleanFlag(rawFlag, true);
  }

  setPhysicalOrdersEnabled(enabled: boolean): { physicalOrdersEnabled: boolean } {
    this.physicalOrdersFlagOverride = Boolean(enabled);
    this.logger.log(
      `Feature Flag de pedidos físicos actualizado dinámicamente a: ${this.physicalOrdersFlagOverride}`,
    );
    return { physicalOrdersEnabled: this.isPhysicalOrdersEnabled() };
  }

  getBaseHardwarePrices(): Record<string, number> {
    return {
      acrylic_stand: this.parseConfiguredPrice('PRICE_ACRYLIC_STAND', 15.0),
      plastic_card: this.parseConfiguredPrice('PRICE_PLASTIC_CARD', 10.0),
      nfc_card: this.parseConfiguredPrice('PRICE_NFC_CARD', 12.5),
      nfc_sticker: this.parseConfiguredPrice('PRICE_NFC_STICKER', 5.0),
    };
  }

  async findOrdersByUserId(userId: string): Promise<Order[]> {
    const normalizedUserId = userId.trim();
    return this.orderRepository.findByUserId(normalizedUserId);
  }

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
    this.assertCheckoutUrlsProvided(dto.successUrl, dto.cancelUrl);
    await this.validateLinkOwnershipForItems(user.sub, dto.items);

    const { totalAmount, orderItems, lineItems } =
      this.buildOrderAndLineItems(dto.items, true);

    const savedOrder = await this.persistOrder(
      user.sub,
      totalAmount,
      dto.shippingAddress,
      orderItems,
      'pending',
      'unfulfilled',
    );

    const customerId = await this.resolveStripeCustomerId(user.sub);

    return this.executeStripeOrderCheckout(
      user,
      savedOrder,
      customerId,
      lineItems,
      dto,
      fallbackUrlBuilder,
      shouldFallbackFn,
    );
  }

  async createDirectPhysicalOrder(
    user: JwtPayload,
    dto: Omit<CreatePhysicalOrderCheckoutDto, 'successUrl' | 'cancelUrl'>,
  ): Promise<Order> {
    this.assertPhysicalOrdersEnabled();
    await this.validateLinkOwnershipForItems(user.sub, dto.items);

    const { totalAmount, orderItems } =
      this.buildOrderAndLineItems(dto.items, false);

    const savedOrder = await this.persistOrder(
      user.sub,
      totalAmount,
      dto.shippingAddress,
      orderItems,
      'paid',
      'in_production',
    );

    this.logger.log(
      `Orden física ${savedOrder.id} emitida directamente y pasada a manufactura. Total: $${totalAmount}`,
    );

    return savedOrder;
  }

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

  assertPhysicalOrdersEnabled(): void {
    if (!this.isPhysicalOrdersEnabled()) {
      throw new ForbiddenException(
        'El módulo de pedidos físicos se encuentra temporalmente deshabilitado por el administrador.',
      );
    }
  }

  private assertCheckoutUrlsProvided(
    successUrl?: string,
    cancelUrl?: string,
  ): void {
    if (!successUrl || !cancelUrl) {
      throw new BadRequestException(
        'successUrl y cancelUrl son obligatorios para generar una sesión de Stripe Checkout.',
      );
    }
  }

  private parseConfiguredPrice(envVar: string, fallbackPrice: number): number {
    const rawValue = parseFloat(this.configService.get<string>(envVar, ''));
    return isNaN(rawValue) || rawValue <= 0 ? fallbackPrice : rawValue;
  }

  private buildOrderAndLineItems(
    items: CreatePhysicalOrderCheckoutDto['items'],
    includeLineItems: boolean,
  ): HardwareCalculationResult {
    const priceMap = this.getBaseHardwarePrices();
    let totalAmount = 0;
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    const orderItems = items.map((item) => {
      const unitPrice = priceMap[item.itemType];
      if (unitPrice === undefined) {
        throw new BadRequestException(
          `Tipo de insumo no soportado: '${item.itemType}'. Tipos permitidos: ${Object.keys(priceMap).join(', ')}`,
        );
      }

      totalAmount += unitPrice * item.quantity;

      if (includeLineItems) {
        lineItems.push(
          this.buildStripeLineItem(item.itemType, unitPrice, item.quantity, item.linkId),
        );
      }

      return {
        linkId: item.linkId ?? null,
        itemType: item.itemType,
        quantity: item.quantity,
        unitPrice,
        specifications: item.specifications ?? null,
      };
    });

    return { totalAmount, orderItems, lineItems };
  }

  private buildStripeLineItem(
    itemType: string,
    unitPrice: number,
    quantity: number,
    linkId?: string,
  ): Stripe.Checkout.SessionCreateParams.LineItem {
    return {
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(unitPrice * 100),
        product_data: {
          name: this.resolveHardwareItemDisplayName(itemType),
          metadata: {
            itemType,
            linkId: linkId || '',
          },
        },
      },
      quantity,
    };
  }

  private resolveHardwareItemDisplayName(itemType: string): string {
    switch (itemType) {
      case 'acrylic_stand':
        return 'Placa Acrílica con Código QR y chip NFC';
      case 'plastic_card':
      case 'nfc_card':
        return 'Tarjeta Plástica PVC con Código QR y chip NFC';
      case 'nfc_sticker':
        return 'Sticker Adhesivo con Código QR y chip NFC';
      default:
        return `Hardware QR: ${itemType}`;
    }
  }

  private async persistOrder(
    userId: string,
    totalAmount: number,
    shippingAddress: any,
    items: any[],
    paymentStatus: 'pending' | 'paid',
    fulfillmentStatus: 'unfulfilled' | 'in_production',
  ): Promise<Order> {
    const newOrder: Partial<Order> = {
      userId,
      totalAmount,
      currency: 'USD',
      paymentStatus,
      fulfillmentStatus,
      shippingAddress,
      items,
    };
    return this.orderRepository.createAndSave(newOrder);
  }

  private async resolveStripeCustomerId(userId: string): Promise<string | undefined> {
    const subscription = await this.subscriptionRepository.findByUserId(userId);
    return subscription?.providerCustomerId &&
      !subscription.providerCustomerId.startsWith('cus_sim_')
      ? subscription.providerCustomerId
      : undefined;
  }

  private async executeStripeOrderCheckout(
    user: JwtPayload,
    savedOrder: Order,
    customerId: string | undefined,
    lineItems: Stripe.Checkout.SessionCreateParams.LineItem[],
    dto: CreatePhysicalOrderCheckoutDto,
    fallbackUrlBuilder: (
      savedOrder: Order,
      dto: CreatePhysicalOrderCheckoutDto,
    ) => string,
    shouldFallbackFn: (err: any) => boolean,
  ): Promise<CheckoutResponseDto> {
    try {
      const session = await this.stripeService.createPaymentCheckoutSession({
        customerId,
        customerEmail: customerId ? undefined : user.email,
        orderId: savedOrder.id,
        userId: user.sub,
        lineItems,
        successUrl: dto.successUrl!,
        cancelUrl: dto.cancelUrl!,
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
        return this.handleSandboxFallback(savedOrder, dto, fallbackUrlBuilder);
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

  private async handleSandboxFallback(
    savedOrder: Order,
    dto: CreatePhysicalOrderCheckoutDto,
    fallbackUrlBuilder: (
      savedOrder: Order,
      dto: CreatePhysicalOrderCheckoutDto,
    ) => string,
  ): Promise<CheckoutResponseDto> {
    const simId = `cs_sandbox_order_${savedOrder.id}`;
    await this.orderRepository.update(savedOrder.id, {
      providerPaymentIntentId: simId,
    });
    return { checkoutUrl: fallbackUrlBuilder(savedOrder, dto) };
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
