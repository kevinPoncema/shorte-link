import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PlanSeeder } from './plans/seeders/plan.seeder';
import { SeederModule } from './seeder.module';

/**
 * Punto de entrada CLI para la ejecución del seeder de planes.
 *
 * Se ejecuta automáticamente al arrancar el contenedor Docker
 * o manualmente mediante `npm run seed` / `npm run seed:prod`.
 */
async function runSeed(): Promise<void> {
  const logger = new Logger('SeederCLI');
  logger.log('Inicializando contexto NestJS para ejecución de seeders...');

  let app;
  try {
    app = await NestFactory.createApplicationContext(SeederModule, {
      logger: ['log', 'warn', 'error'],
    });

    const planSeeder = app.get(PlanSeeder);
    await planSeeder.seed();

    logger.log('Todos los seeders se ejecutaron satisfactoriamente.');
    await app.close();
    process.exit(0);
  } catch (error: unknown) {
    logger.error(
      `Error fatal durante la ejecución de los seeders: ${(error as Error).message}`,
      (error as Error).stack,
    );
    if (app) {
      try {
        await app.close();
      } catch {
        // Ignorar error al cerrar contexto tras fallo
      }
    }
    process.exit(1);
  }
}

void runSeed();
