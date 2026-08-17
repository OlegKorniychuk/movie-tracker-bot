import { buildApp } from './composition/buildApp.js';

// Must match wrangler.jsonc's triggers.crons exactly.
const WEEKLY_DIGEST_GATE_CRON = '0 9 * * 1';
const DAILY_REMINDER_CRON = '0 9 * * *';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const app = buildApp(env);
    try {
      return await app.telegramBotApp.handleWebhook(request);
    } finally {
      app.logger.info('Invocation complete', { outgoingCalls: app.callCounter.value });
    }
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const app = buildApp(env);
    try {
      if (controller.cron === WEEKLY_DIGEST_GATE_CRON) {
        await app.digestService.run();
      } else if (controller.cron === DAILY_REMINDER_CRON) {
        await app.reminderService.run();
      } else {
        app.logger.warn('Unexpected cron trigger', { cron: controller.cron });
      }
    } finally {
      app.logger.info('Invocation complete', { outgoingCalls: app.callCounter.value });
    }
  },
} satisfies ExportedHandler<Env>;
