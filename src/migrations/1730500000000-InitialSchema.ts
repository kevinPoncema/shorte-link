import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración inicial formal para el esquema relacional en PostgreSQL.
 * Define las 7 tablas del Control Plane y sus índices de rendimiento:
 * - plans
 * - users
 * - links
 * - link_events
 * - subscriptions
 * - orders
 * - order_items
 */
export class InitialSchema1730500000000 implements MigrationInterface {
  name = 'InitialSchema1730500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 0. Extensión UUID
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // 1. Tabla: plans
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plans" (
        "id" character varying(50) NOT NULL,
        "name" character varying(100) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_plans_id" PRIMARY KEY ("id")
      );
    `);

    // 2. Tabla: users
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying(255) NOT NULL,
        "password" character varying NOT NULL,
        "plan_id" character varying(50),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_users_plan_id" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email");
    `);

    // 3. Tabla: links
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "links" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "short_code" character varying(16) NOT NULL,
        "name" character varying(150),
        "target_url" text NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "qr_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "user_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_links_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_links_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_links_short_code" ON "links" ("short_code");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_links_user_id" ON "links" ("user_id");
    `);

    // 4. Tabla: link_events
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "link_events" (
        "id" BIGSERIAL NOT NULL,
        "link_id" uuid NOT NULL,
        "ip_address" character varying(128) NOT NULL,
        "user_agent" text,
        "country" character varying(2),
        "os" character varying(64),
        "browser" character varying(64),
        "referer" text,
        "scanned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_link_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_link_events_link_id" FOREIGN KEY ("link_id") REFERENCES "links"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_link_events_link_id" ON "link_events" ("link_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_link_events_scanned" ON "link_events" ("link_id", "scanned_at" DESC);
    `);

    // 5. Tabla: subscriptions
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "provider_name" character varying(32) NOT NULL DEFAULT 'STRIPE',
        "provider_customer_id" character varying(255) NOT NULL,
        "provider_subscription_id" character varying(255),
        "provider_price_id" character varying(255),
        "status" character varying(32) NOT NULL DEFAULT 'incomplete',
        "current_period_start" TIMESTAMP WITH TIME ZONE,
        "current_period_end" TIMESTAMP WITH TIME ZONE,
        "cancel_at_period_end" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subscriptions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_subscriptions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_subscriptions_user_id" ON "subscriptions" ("user_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_subscriptions_provider_customer_id" ON "subscriptions" ("provider_customer_id");
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_subscriptions_provider_subscription_id" ON "subscriptions" ("provider_subscription_id");
    `);

    // 6. Tabla: orders
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "provider_payment_intent_id" character varying(255),
        "total_amount" numeric(10,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'USD',
        "payment_status" character varying(32) NOT NULL DEFAULT 'pending',
        "fulfillment_status" character varying(32) NOT NULL DEFAULT 'unfulfilled',
        "shipping_address" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_orders_user_id" ON "orders" ("user_id");
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_orders_provider_payment_intent_id" ON "orders" ("provider_payment_intent_id");
    `);

    // 7. Tabla: order_items
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "link_id" uuid,
        "item_type" character varying(64) NOT NULL,
        "quantity" integer NOT NULL,
        "unit_price" numeric(10,2) NOT NULL,
        "specifications" jsonb,
        CONSTRAINT "CHK_order_items_quantity" CHECK ("quantity" > 0),
        CONSTRAINT "PK_order_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_items_order_id" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_order_items_order_id" ON "order_items" ("order_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_order_items_link_id" ON "order_items" ("link_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "order_items";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "link_events";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "links";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plans";`);
  }
}
