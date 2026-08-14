import { CancelCallbackHandler } from '../bot/callbacks/CancelCallbackHandler.js';
import { PickCallbackHandler } from '../bot/callbacks/PickCallbackHandler.js';
import { MymoviesCommandHandler } from '../bot/commands/MymoviesCommandHandler.js';
import { SubscribeCommandHandler } from '../bot/commands/SubscribeCommandHandler.js';
import { DigestMessageFormatter } from '../bot/DigestMessageFormatter.js';
import { TelegramBotApp } from '../bot/TelegramBotApp.js';
import { createDb } from '../db/client.js';
import { MultiplexSource } from '../providers/MultiplexSource.js';
import { PlanetakinoSource } from '../providers/PlanetakinoSource.js';
import { TmdbEnricher } from '../providers/TmdbEnricher.js';
import { DigestStateRepository } from '../repositories/DigestStateRepository.js';
import { MovieRepository } from '../repositories/MovieRepository.js';
import { SubscriptionRepository } from '../repositories/SubscriptionRepository.js';
import { TrackedPickRepository } from '../repositories/TrackedPickRepository.js';
import { DigestService } from '../services/DigestService.js';
import { MovieAggregationService } from '../services/MovieAggregationService.js';
import { PickService } from '../services/PickService.js';
import { ReminderService } from '../services/ReminderService.js';
import { SubscriptionService } from '../services/SubscriptionService.js';

export interface App {
  telegramBotApp: TelegramBotApp;
  digestService: DigestService;
  reminderService: ReminderService;
}

// The composition root — the only place that touches `Env` bindings
// directly. Called fresh on every `fetch`/`scheduled` invocation (Workers
// has no long-lived instances between requests), so nothing here does I/O
// or holds state beyond the object graph itself.
export function buildApp(env: Env): App {
  const db = createDb(env);

  const movieRepo = new MovieRepository(db);
  const subscriptionRepo = new SubscriptionRepository(db);
  const trackedPickRepo = new TrackedPickRepository(db);
  const digestStateRepo = new DigestStateRepository(db);

  const aggregationService = new MovieAggregationService(
    [new PlanetakinoSource(), new MultiplexSource()],
    new TmdbEnricher(env.TMDB_API_KEY),
  );

  const subscriptionService = new SubscriptionService(subscriptionRepo);
  const pickService = new PickService(trackedPickRepo);

  const telegramEventHandlers = [
    new SubscribeCommandHandler(subscriptionService),
    new MymoviesCommandHandler(pickService),
    new PickCallbackHandler(pickService),
    new CancelCallbackHandler(pickService),
  ];

  const telegramBotApp = new TelegramBotApp(
    env.TELEGRAM_BOT_TOKEN,
    env.WEBHOOK_SECRET,
    telegramEventHandlers,
  );

  const digestService = new DigestService(
    movieRepo,
    subscriptionRepo,
    digestStateRepo,
    aggregationService,
    telegramBotApp.bot,
    new DigestMessageFormatter(),
  );

  const reminderService = new ReminderService(trackedPickRepo, telegramBotApp.bot);

  return { telegramBotApp, digestService, reminderService };
}
