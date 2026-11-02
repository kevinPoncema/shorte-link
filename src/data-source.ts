import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { OrderItem } from './billing/models/order-item.entity';
import { Order } from './billing/models/order.entity';
import { Subscription } from './billing/models/subscription.entity';
import { LinkEvent } from './core/models/link-event.entity';
import { Link } from './core/models/link.entity';
import { User } from './core/models/user.entity';
import { Plan } from './plans/models/plan.entity';

// Cargar variables de entorno desde .env
config();

/**
 * Fuente de datos TypeORM para ejecución de migraciones CLI y sincronización formal de esquemas.
 */
const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'qr_shortener',
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  entities: [Plan, User, Link, LinkEvent, Subscription, Order, OrderItem],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  subscribers: [],
});

export default AppDataSource;
